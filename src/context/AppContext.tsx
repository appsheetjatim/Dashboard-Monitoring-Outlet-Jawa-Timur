import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import {
  UserPIC,
  UserMDS,
  DistAssignment,
  KabAssignment,
  OutletPerformance,
  OutletMapping,
  CallPlanItem,
  LogActivityRecord,
} from '../types';
import { calculateOutletPerformance } from '../services/outletClassification';
import {
  signInWithGoogle,
  signOutGoogle,
  initGoogleAuth,
  fetchAllGoogleSheetsData,
  saveMappingsToSheet,
  appendMappingToSheet,
  updateMappingInSheet,
  saveCallPlansToSheet,
  updateCallPlanInSheet,
  GoogleAuthExpiredError,
  updateUserPicPasswordInSheet,
  appendLogActivityToSheet,
} from '../services/googleSheets';

interface AppContextType {
  currentUser: UserPIC | null;
  googleUser: User | null;
  googleToken: string | null;
  isConnectingGoogle: boolean;
  isLoading: boolean;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  hasEverSynced: boolean;
  lastSyncTime: string;
  errorMessage: string | null;

  // Data
  rawPerformance: OutletPerformance[];
  performance: OutletPerformance[];
  userPics: UserPIC[];
  userMds: UserMDS[];
  distAssignments: DistAssignment[];
  kabAssignments: KabAssignment[];
  mappings: OutletMapping[];
  callPlans: CallPlanItem[];
  logs: LogActivityRecord[];

  // Filtered views based on login role
  accessibleDistributors: string[];
  accessibleDepo: string[];
  accessibleKabupaten: string[];
  accessibleMds: UserMDS[];

  // Actions
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  connectGoogle: () => Promise<void>;
  disconnectGoogle: () => Promise<void>;
  syncWithGoogleSheets: () => Promise<void>;
  updateUserPassword: (newPassword: string) => Promise<boolean>;

  // Mapping mutations
  createMapping: (item: Omit<OutletMapping, 'mappingId' | 'mappingDate' | 'lastUpdated'>) => Promise<string>;
  updateMapping: (mappingId: string, updates: Partial<OutletMapping>) => Promise<boolean>;
  bulkImportMappings: (items: Array<Omit<OutletMapping, 'mappingId' | 'mappingDate' | 'lastUpdated'>>) => Promise<{ successCount: number; errors: string[] }>;

  // Call Plan mutations
  updateCallPlan: (callPlanId: string, updates: Partial<CallPlanItem>) => Promise<boolean>;
  bulkAssignCallPlan: (
    items: Array<{ mapping: OutletMapping; week1: boolean; week2: boolean; week3: boolean; week4: boolean }>,
    mdsName: string,
    visitDay: CallPlanItem['visitDay']
  ) => Promise<number>;
  bulkImportCallPlans: (items: Array<Omit<CallPlanItem, 'callPlanId'>>) => Promise<{ successCount: number; errors: string[] }>;
}

const AppContext = createContext<AppContextType | null>(null);

// Reads and parses a JSON array from localStorage, falling back to an empty
// array on ANY failure — missing key, corrupted/invalid JSON (e.g. left over
// from an older version of this app with a different data shape), or a
// quota/access error. Without this guard, a single bad cache entry throws
// during the very first render of AppProvider and crashes the whole app with
// no way to recover except manually clearing browser storage.
function safeParseArray<T>(key: string): T[] {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn(`Failed to parse cached "${key}", resetting it:`, e);
    localStorage.removeItem(key);
    return [];
  }
}

// Writes a value to localStorage, silently skipping (instead of crashing the
// whole app) if it fails — most commonly QuotaExceededError, since
// localStorage typically caps out around 5-10MB per origin and a dataset
// like raw Performance (tens of thousands of rows) can exceed that on its
// own. When that happens, the affected dataset just won't survive a browser
// restart and will need a fresh sync next time — annoying, but not a crash.
function safeSetCache(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`Failed to cache "${key}" (likely storage quota exceeded), skipping:`, e);
  }
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Core Data States — load from localStorage cache (real data from a
  // previous sync) or EMPTY. Never fall back to demo/seed data: an empty
  // array is the honest signal "not connected to the database yet", and the
  // top-level app gate (App.tsx) uses that signal to block access until a
  // real sync succeeds.
  const [userPics, setUserPics] = useState<UserPIC[]>(() => safeParseArray<UserPIC>('pic_users_cache'));

  const [userMds, setUserMds] = useState<UserMDS[]>(() => safeParseArray<UserMDS>('mds_users_cache'));

  const [distAssignments, setDistAssignments] = useState<DistAssignment[]>(() =>
    safeParseArray<DistAssignment>('dist_assignments_cache')
  );

  const [kabAssignments, setKabAssignments] = useState<KabAssignment[]>(() =>
    safeParseArray<KabAssignment>('kab_assignments_cache')
  );

  // Performance is deliberately NOT cached to localStorage — with tens of
  // thousands of rows it serializes to 30-50MB+, far beyond the ~5-10MB
  // quota most browsers give a single origin, so every attempt to store it
  // would just fail anyway (silently, thanks to safeSetCache, but still
  // wasted work). It always starts empty and needs a fresh sync each new
  // browser session — Gate 1 in App.tsx already handles that gracefully.
  // Also clean up any stale copy from before this change, freeing up quota
  // headroom for the caches that DO need to persist reliably.
  useEffect(() => {
    localStorage.removeItem('performance_raw_cache');
  }, []);
  const [rawPerformance, setRawPerformance] = useState<OutletPerformance[]>([]);

  const [mappings, setMappings] = useState<OutletMapping[]>(() => safeParseArray<OutletMapping>('mappings_cache'));

  const [callPlans, setCallPlans] = useState<CallPlanItem[]>(() => safeParseArray<CallPlanItem>('call_plans_cache'));

  const [logs, setLogs] = useState<LogActivityRecord[]>(() => safeParseArray<LogActivityRecord>('logs_cache'));

  // The single authoritative signal for "has a genuine full sync ever
  // completed?" — set ONLY inside syncWithGoogleSheetsInternal, and ONLY
  // when the core datasets (performance + userPics) actually came back with
  // data. This is what the top-level app gate in App.tsx relies on, instead
  // of guessing from individual array lengths (which can be misleading if a
  // sync partially failed and left some caches populated but not others).
  const [hasEverSynced, setHasEverSynced] = useState<boolean>(() => {
    return localStorage.getItem('has_synced_once') === 'true';
  });

  // Session State — defaults to null (NOT an auto-logged-in demo account).
  // A previously saved session is restored only if BOTH a genuine full sync
  // has happened before AND that userId still exists in the cached (real)
  // User PIC data; otherwise the session is discarded and the person has to
  // log in again — e.g. if their account was removed, or if the cache is
  // partial/stale (some data cached, but never a complete successful sync).
  const [currentUser, setCurrentUser] = useState<UserPIC | null>(() => {
    if (!hasEverSynced) return null;
    const saved = localStorage.getItem('pic_session');
    if (!saved) return null;
    try {
      const parsedSession: UserPIC = JSON.parse(saved);
      const stillExists = userPics.find(
        (u) => u.userId.toLowerCase() === parsedSession.userId?.toLowerCase()
      );
      return stillExists || null;
    } catch (e) {
      return null;
    }
  });

  // Google OAuth state
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<string>(() => {
    return new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);


  // Calculate dynamically derived Performance metrics & Pareto per Depo & Ring
  const performance = useMemo(() => {
    return calculateOutletPerformance(rawPerformance, mappings);
  }, [rawPerformance, mappings]);

  // Persist local state caches
  // (rawPerformance is intentionally excluded — see its declaration above)
  useEffect(() => {
    safeSetCache('mds_users_cache', userMds);
  }, [userMds]);

  useEffect(() => {
    safeSetCache('dist_assignments_cache', distAssignments);
  }, [distAssignments]);

  useEffect(() => {
    safeSetCache('kab_assignments_cache', kabAssignments);
  }, [kabAssignments]);

  useEffect(() => {
    safeSetCache('mappings_cache', mappings);
  }, [mappings]);

  useEffect(() => {
    safeSetCache('call_plans_cache', callPlans);
  }, [callPlans]);

  useEffect(() => {
    safeSetCache('logs_cache', logs);
  }, [logs]);

  useEffect(() => {
    safeSetCache('pic_users_cache', userPics);
  }, [userPics]);

  useEffect(() => {
    if (currentUser) {
      safeSetCache('pic_session', currentUser);
    } else {
      localStorage.removeItem('pic_session');
    }
  }, [currentUser]);

  // Firebase auth state listener
  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (user, token) => {
        setGoogleUser(user);
        setGoogleToken(token);
      },
      () => {
        setGoogleUser(null);
        setGoogleToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Filtered distributor scopes based on logged-in user
  const accessibleDistributors = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'Manager') {
      return Array.from(new Set(rawPerformance.map((p) => p.dist)));
    }
    const myAssignments = distAssignments.filter((d) => d.namaPic.toLowerCase() === currentUser.namaPic.toLowerCase());
    return Array.from(new Set(myAssignments.map((d) => d.dist)));
  }, [currentUser, distAssignments, rawPerformance]);

  const accessibleDepo = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'Manager') {
      return Array.from(new Set(rawPerformance.map((p) => p.depo)));
    }
    const myAssignments = distAssignments.filter((d) => d.namaPic.toLowerCase() === currentUser.namaPic.toLowerCase());
    return Array.from(new Set(myAssignments.map((d) => d.depo)));
  }, [currentUser, distAssignments, rawPerformance]);

  // Scopes ONLY the Kecamatan shading layer on Peta Sebaran Outlet — a
  // separate dimension from accessibleDepo above, since Depo doesn't map
  // cleanly to Kabupaten/Kota (a Depo can span multiple Kabupaten). Manager
  // always sees every Kabupaten in Jawa Timur, same as every other access
  // list in this app.
  const accessibleKabupaten = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'Manager') {
      return Array.from(new Set(rawPerformance.map((p) => p.kabupaten)));
    }
    const myAssignments = kabAssignments.filter((k) => k.namaPic.toLowerCase() === currentUser.namaPic.toLowerCase());
    return Array.from(new Set(myAssignments.map((k) => k.kabupaten)));
  }, [currentUser, kabAssignments, rawPerformance]);

  const accessibleMds = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'Manager') {
      return userMds;
    }
    return userMds.filter((m) => m.namaPic.toLowerCase() === currentUser.namaPic.toLowerCase());
  }, [currentUser, userMds]);

  // Auth actions
  const login = async (email: string, password: string) => {
    const found = userPics.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase()
    );
    if (!found) {
      return { success: false, message: 'Email not found in PIC records.' };
    }
    if (found.password && found.password !== password.trim()) {
      return { success: false, message: 'Incorrect password.' };
    }
    setCurrentUser(found);
    return { success: true };
  };

  const logout = () => {
    setCurrentUser(null);
  };

  const connectGoogle = async () => {
    setIsConnectingGoogle(true);
    setErrorMessage(null);
    try {
      const res = await signInWithGoogle();
      if (res) {
        setGoogleUser(res.user);
        setGoogleToken(res.accessToken);
        await syncWithGoogleSheetsInternal(res.accessToken);
      }
    } catch (err: any) {
      console.error('Failed to sign in with Google:', err);
      setErrorMessage(err.message || 'Gagal menyambungkan ke Google Sheets.');
    } finally {
      setIsConnectingGoogle(false);
    }
  };

  const disconnectGoogle = async () => {
    await signOutGoogle();
    setGoogleUser(null);
    setGoogleToken(null);
  };

  // Centralized handling for any Sheets save/fetch failure. When the token
  // has specifically expired, this resets the stored Google session (so the
  // "Sambungkan Google" button in the header is immediately ready to click
  // again) and passes the clear session-expired message straight through —
  // otherwise it wraps the error with context about what the person was
  // trying to do, since the raw Google API message alone isn't very useful.
  const handleSheetsError = (e: any, fallbackAction: string): never => {
    if (e instanceof GoogleAuthExpiredError) {
      setGoogleToken(null);
      setGoogleUser(null);
      throw e;
    }
    throw new Error(
      `${fallbackAction}, tapi GAGAL disimpan ke Google Sheets (${e.message || 'error tidak diketahui'}). Coba sync ulang untuk memastikan.`
    );
  };

  const syncWithGoogleSheetsInternal = async (token: string) => {
    setSyncStatus('syncing');
    setErrorMessage(null);
    try {
      const sheetsData = await fetchAllGoogleSheetsData(token);
      // Trust and apply whatever came back successfully — including a
      // genuinely empty array, which means the person deleted everything in
      // that sheet on purpose and the app should reflect that. Only `null`
      // (a real fetch failure for that specific tab) is skipped, so we don't
      // wipe good cached data just because one tab's request hiccuped.
      if (sheetsData.performance !== null) {
        setRawPerformance(sheetsData.performance);
      }
      if (sheetsData.userPics !== null) {
        setUserPics(sheetsData.userPics);
      }
      if (sheetsData.userMds !== null) {
        setUserMds(sheetsData.userMds);
      }
      if (sheetsData.distAssignments !== null) {
        setDistAssignments(sheetsData.distAssignments);
      }
      if (sheetsData.kabAssignments !== null) {
        setKabAssignments(sheetsData.kabAssignments);
      }
      if (sheetsData.mappings !== null) {
        setMappings(sheetsData.mappings);
      }
      if (sheetsData.callPlans !== null) {
        setCallPlans(sheetsData.callPlans);
      }
      if (sheetsData.logs !== null) {
        setLogs(sheetsData.logs);
      }

      // Mark a genuine full sync only when the CORE datasets actually came
      // back (not null) — this is what gates the whole app shell (see
      // hasEverSynced below), so it must not be set from a partial/failed
      // sync where e.g. only userPics loaded but performance didn't.
      if (sheetsData.performance !== null && sheetsData.userPics !== null) {
        setHasEverSynced(true);
        try {
          localStorage.setItem('has_synced_once', 'true');
        } catch (e) {
          console.warn('Failed to persist has_synced_once flag:', e);
        }
      }

      setSyncStatus('synced');
      setLastSyncTime(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err: any) {
      console.error('Sync error:', err);
      setSyncStatus('error');
      setErrorMessage(err.message || 'Gagal menyinkronkan data dengan Google Sheets.');
      if (err instanceof GoogleAuthExpiredError) {
        setGoogleToken(null);
        setGoogleUser(null);
      }
    }
  };

  const syncWithGoogleSheets = async () => {
    if (!googleToken) {
      await connectGoogle();
      return;
    }
    await syncWithGoogleSheetsInternal(googleToken);
  };

  // Log recording helper
  const addLogRecord = async (
    jenisAksi: 'Create' | 'Update' | 'Delete',
    sheetTarget: 'Mapping' | 'Call Plan' | 'User PIC',
    idRecord: string,
    detailPerubahan: string
  ) => {
    const newLog: LogActivityRecord = {
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      namaPic: currentUser?.namaPic || 'System',
      jenisAksi,
      sheetTarget,
      idRecord,
      detailPerubahan,
    };

    setLogs((prev) => [newLog, ...prev]);

    if (googleToken) {
      try {
        await appendLogActivityToSheet(newLog, googleToken);
      } catch (e) {
        console.warn('Could not sync log to Google Sheets immediately:', e);
      }
    }
  };

  // Update password in PIC sheet
  const updateUserPassword = async (newPassword: string): Promise<boolean> => {
    if (!currentUser) return false;
    const oldPassword = currentUser.password || '';
    const updatedUsers = userPics.map((u) =>
      u.userId === currentUser.userId ? { ...u, password: newPassword } : u
    );
    setUserPics(updatedUsers);
    setCurrentUser({ ...currentUser, password: newPassword });

    await addLogRecord(
      'Update',
      'User PIC',
      currentUser.userId,
      `Password diubah oleh ${currentUser.namaPic}`
    );

    if (googleToken) {
      try {
        await updateUserPicPasswordInSheet(currentUser.userId, newPassword, updatedUsers, googleToken);
      } catch (err) {
        console.error('Failed to update password in sheets:', err);
      }
    }
    return true;
  };

  // Mapping mutations
  const createMapping = async (
    item: Omit<OutletMapping, 'mappingId' | 'mappingDate' | 'lastUpdated'>
  ): Promise<string> => {
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const mappingId = `MAP-${Date.now()}`;
    const newMapping: OutletMapping = {
      ...item,
      mappingId,
      mappingDate: now,
      lastUpdated: now,
    };

    const nextMappings = [newMapping, ...mappings];
    setMappings(nextMappings);

    const detail = `Record baru: Nama Customer BSP = ${item.namaCustomerBsp || '-'}, Klasifikasi = ${item.klasifikasiOutlet}, MDS = ${item.namaMds || '-'}`;
    await addLogRecord('Create', 'Mapping', mappingId, detail);

    if (googleToken) {
      try {
        await appendMappingToSheet(newMapping, googleToken);
      } catch (e: any) {
        console.warn('Sheets append failed:', e);
        handleSheetsError(e, 'Mapping ditambahkan di tampilan');
      }
    }
    return mappingId;
  };

  const updateMapping = async (mappingId: string, updates: Partial<OutletMapping>): Promise<boolean> => {
    const existing = mappings.find((m) => m.mappingId === mappingId);
    if (!existing) return false;

    const diffs: string[] = [];
    (Object.keys(updates) as (keyof OutletMapping)[]).forEach((key) => {
      if (key !== 'lastUpdated' && updates[key] !== undefined && updates[key] !== existing[key]) {
        diffs.push(`${String(key)}: ${existing[key]} → ${updates[key]}`);
      }
    });

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const updated: OutletMapping = {
      ...existing,
      ...updates,
      lastUpdated: now,
    };

    const nextMappings = mappings.map((m) => (m.mappingId === mappingId ? updated : m));
    setMappings(nextMappings);

    if (diffs.length > 0) {
      await addLogRecord('Update', 'Mapping', mappingId, diffs.join('; '));
    }

    if (googleToken) {
      try {
        await updateMappingInSheet(updated, googleToken);
      } catch (e: any) {
        console.warn('Sheets update failed:', e);
        handleSheetsError(e, 'Mapping diperbarui di tampilan');
      }
    }
    return true;
  };

  const bulkImportMappings = async (
    items: Array<Omit<OutletMapping, 'mappingId' | 'mappingDate' | 'lastUpdated'>>
  ) => {
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const newItems: OutletMapping[] = items.map((item, idx) => ({
      ...item,
      mappingId: `MAP-${Date.now() + idx}`,
      mappingDate: now,
      lastUpdated: now,
    }));

    const nextMappings = [...newItems, ...mappings];
    setMappings(nextMappings);

    await addLogRecord(
      'Create',
      'Mapping',
      `BULK-${Date.now()}`,
      `Bulk import berhasil: ${newItems.length} record mapping baru ditambahkan.`
    );

    if (googleToken) {
      try {
        await saveMappingsToSheet(nextMappings, googleToken);
      } catch (e: any) {
        console.warn('Sheets bulk save failed:', e);
        handleSheetsError(e, `${newItems.length} mapping ditambahkan di tampilan`);
      }
    }
    return { successCount: newItems.length, errors: [] };
  };

  // Call Plan mutations
  const updateCallPlan = async (callPlanId: string, updates: Partial<CallPlanItem>): Promise<boolean> => {
    const existing = callPlans.find((c) => c.callPlanId === callPlanId);
    if (!existing) return false;

    const diffs: string[] = [];
    (Object.keys(updates) as (keyof CallPlanItem)[]).forEach((key) => {
      if (updates[key] !== undefined && updates[key] !== existing[key]) {
        diffs.push(`${String(key)}: ${existing[key]} → ${updates[key]}`);
      }
    });

    const updated: CallPlanItem = { ...existing, ...updates };
    const nextPlans = callPlans.map((c) => (c.callPlanId === callPlanId ? updated : c));
    setCallPlans(nextPlans);

    if (diffs.length > 0) {
      await addLogRecord('Update', 'Call Plan', callPlanId, diffs.join('; '));
    }

    if (googleToken) {
      try {
        await updateCallPlanInSheet(updated, googleToken);
      } catch (e: any) {
        console.warn('Sheets call plan update failed:', e);
        handleSheetsError(e, 'Jadwal diperbarui di tampilan');
      }
    }
    return true;
  };

  // Call Plan Wizard finalize step: creates one CallPlanItem per selected
  // Mapping outlet, each with its OWN Week 1-4 (frequency computed per item).
  // Uses Mapping data (not raw Performance) so customerSoGroupAreaCode always
  // matches the real cross-distributor mapping code used elsewhere in the app.
  const bulkAssignCallPlan = async (
    items: Array<{ mapping: OutletMapping; week1: boolean; week2: boolean; week3: boolean; week4: boolean }>,
    mdsName: string,
    visitDay: CallPlanItem['visitDay']
  ): Promise<number> => {
    const newItems: CallPlanItem[] = items.map((it, idx) => ({
      callPlanId: `CP-${Date.now() + idx}`,
      namaPic: currentUser?.namaPic || '',
      namaMds: mdsName,
      customerSoGroupAreaCode: it.mapping.customerSoGroupAreaCode,
      customerSoGroupArea: it.mapping.customerSoGroupArea,
      klasifikasiOutlet: it.mapping.klasifikasiOutlet,
      kabupaten: it.mapping.kabupaten,
      kecamatan: it.mapping.kecamatan,
      alamat: it.mapping.alamat,
      visitDay,
      week1: it.week1,
      week2: it.week2,
      week3: it.week3,
      week4: it.week4,
      frequency: [it.week1, it.week2, it.week3, it.week4].filter(Boolean).length,
    }));

    const nextPlans = [...newItems, ...callPlans];
    setCallPlans(nextPlans);

    await addLogRecord(
      'Create',
      'Call Plan',
      `WIZARD-${Date.now()}`,
      `Call Plan Wizard: ${newItems.length} outlet ditugaskan ke ${mdsName} pada hari ${visitDay}`
    );

    if (googleToken) {
      try {
        await saveCallPlansToSheet(nextPlans, googleToken);
      } catch (e: any) {
        console.warn('Sheets call plan bulk save failed:', e);
        handleSheetsError(e, `${newItems.length} jadwal ditambahkan di tampilan`);
      }
    }
    return newItems.length;
  };

  const bulkImportCallPlans = async (items: Array<Omit<CallPlanItem, 'callPlanId'>>) => {
    const newItems: CallPlanItem[] = items.map((item, idx) => ({
      ...item,
      callPlanId: `CP-${Date.now() + idx}`,
    }));

    const nextPlans = [...newItems, ...callPlans];
    setCallPlans(nextPlans);

    await addLogRecord(
      'Create',
      'Call Plan',
      `BULK-IMPORT-${Date.now()}`,
      `Bulk Upload Call Plan: ${newItems.length} jadwal kunjungan baru berhasil diupload.`
    );

    if (googleToken) {
      try {
        await saveCallPlansToSheet(nextPlans, googleToken);
      } catch (e: any) {
        console.warn('Sheets bulk call plan upload failed:', e);
        handleSheetsError(e, `${newItems.length} jadwal ditambahkan di tampilan`);
      }
    }
    return { successCount: newItems.length, errors: [] };
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        googleUser,
        googleToken,
        isConnectingGoogle,
        isLoading,
        syncStatus,
        hasEverSynced,
        lastSyncTime,
        errorMessage,

        rawPerformance,
        performance,
        userPics,
        userMds,
        distAssignments,
        kabAssignments,
        mappings,
        callPlans,
        logs,

        accessibleDistributors,
        accessibleDepo,
        accessibleKabupaten,
        accessibleMds,

        login,
        logout,
        connectGoogle,
        disconnectGoogle,
        syncWithGoogleSheets,
        updateUserPassword,

        createMapping,
        updateMapping,
        bulkImportMappings,

        updateCallPlan,
        bulkAssignCallPlan,
        bulkImportCallPlans,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};