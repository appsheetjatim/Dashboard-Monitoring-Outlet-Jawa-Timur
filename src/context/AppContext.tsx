import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import {
  UserPIC,
  UserMDS,
  DistAssignment,
  OutletPerformance,
  OutletMapping,
  CallPlanItem,
  LogActivityRecord,
} from '../types';
import {
  INITIAL_USER_PICS,
  INITIAL_USER_MDS,
  INITIAL_DIST_ASSIGNMENTS,
  INITIAL_PERFORMANCE_RAW,
  INITIAL_MAPPINGS,
  INITIAL_CALL_PLANS,
  INITIAL_LOG_ACTIVITIES,
} from '../data/seedData';
import { calculateOutletPerformance } from '../services/outletClassification';
import {
  signInWithGoogle,
  signOutGoogle,
  initGoogleAuth,
  fetchAllGoogleSheetsData,
  saveMappingsToSheet,
  saveCallPlansToSheet,
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
  lastSyncTime: string;
  errorMessage: string | null;

  // Data
  rawPerformance: OutletPerformance[];
  performance: OutletPerformance[];
  userPics: UserPIC[];
  userMds: UserMDS[];
  distAssignments: DistAssignment[];
  mappings: OutletMapping[];
  callPlans: CallPlanItem[];
  logs: LogActivityRecord[];

  // Filtered views based on login role
  accessibleDistributors: string[];
  accessibleDepo: string[];
  accessibleMds: UserMDS[];

  // Actions
  login: (userId: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  switchUser: (userId: string) => void;
  connectGoogle: () => Promise<void>;
  disconnectGoogle: () => Promise<void>;
  syncWithGoogleSheets: () => Promise<void>;
  updateUserPassword: (newPassword: string) => Promise<boolean>;

  // Mapping mutations
  createMapping: (item: Omit<OutletMapping, 'mappingId' | 'mappingDate' | 'lastUpdated'>) => Promise<string>;
  updateMapping: (mappingId: string, updates: Partial<OutletMapping>) => Promise<boolean>;
  deleteMapping: (mappingId: string) => Promise<boolean>;
  bulkImportMappings: (items: Array<Omit<OutletMapping, 'mappingId' | 'mappingDate' | 'lastUpdated'>>) => Promise<{ successCount: number; errors: string[] }>;

  // Call Plan mutations
  createCallPlan: (item: Omit<CallPlanItem, 'callPlanId'>) => Promise<string>;
  updateCallPlan: (callPlanId: string, updates: Partial<CallPlanItem>) => Promise<boolean>;
  deleteCallPlan: (callPlanId: string) => Promise<boolean>;
  bulkAssignCallPlan: (
    items: Array<{ mapping: OutletMapping; week1: boolean; week2: boolean; week3: boolean; week4: boolean }>,
    mdsName: string,
    visitDay: CallPlanItem['visitDay']
  ) => Promise<number>;
  bulkImportCallPlans: (items: Array<Omit<CallPlanItem, 'callPlanId'>>) => Promise<{ successCount: number; errors: string[] }>;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Session State
  const [currentUser, setCurrentUser] = useState<UserPIC | null>(() => {
    const saved = localStorage.getItem('pic_session');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return INITIAL_USER_PICS[1]; // Default Budi Santoso (Supervisor)
      }
    }
    return INITIAL_USER_PICS[1]; // Default login for instant preview
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

  // Core Data States (load from localStorage or seed fallback)
  const [userPics, setUserPics] = useState<UserPIC[]>(() => {
    const saved = localStorage.getItem('pic_users_cache');
    return saved ? JSON.parse(saved) : INITIAL_USER_PICS;
  });

  const [userMds, setUserMds] = useState<UserMDS[]>(() => {
    const saved = localStorage.getItem('mds_users_cache');
    return saved ? JSON.parse(saved) : INITIAL_USER_MDS;
  });

  const [distAssignments, setDistAssignments] = useState<DistAssignment[]>(() => {
    const saved = localStorage.getItem('dist_assignments_cache');
    return saved ? JSON.parse(saved) : INITIAL_DIST_ASSIGNMENTS;
  });

  const [rawPerformance, setRawPerformance] = useState<OutletPerformance[]>(() => {
    const saved = localStorage.getItem('performance_raw_cache');
    return saved ? JSON.parse(saved) : INITIAL_PERFORMANCE_RAW;
  });

  const [mappings, setMappings] = useState<OutletMapping[]>(() => {
    const saved = localStorage.getItem('mappings_cache');
    return saved ? JSON.parse(saved) : INITIAL_MAPPINGS;
  });

  const [callPlans, setCallPlans] = useState<CallPlanItem[]>(() => {
    const saved = localStorage.getItem('call_plans_cache');
    return saved ? JSON.parse(saved) : INITIAL_CALL_PLANS;
  });

  const [logs, setLogs] = useState<LogActivityRecord[]>(() => {
    const saved = localStorage.getItem('logs_cache');
    return saved ? JSON.parse(saved) : INITIAL_LOG_ACTIVITIES;
  });

  // Calculate dynamically derived Performance metrics & Pareto per Depo & Ring
  const performance = useMemo(() => {
    return calculateOutletPerformance(rawPerformance, mappings);
  }, [rawPerformance, mappings]);

  // Persist local state caches
  useEffect(() => {
    localStorage.setItem('mappings_cache', JSON.stringify(mappings));
  }, [mappings]);

  useEffect(() => {
    localStorage.setItem('call_plans_cache', JSON.stringify(callPlans));
  }, [callPlans]);

  useEffect(() => {
    localStorage.setItem('logs_cache', JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    localStorage.setItem('pic_users_cache', JSON.stringify(userPics));
  }, [userPics]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('pic_session', JSON.stringify(currentUser));
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

  const accessibleMds = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'Manager') {
      return userMds;
    }
    return userMds.filter((m) => m.namaPic.toLowerCase() === currentUser.namaPic.toLowerCase());
  }, [currentUser, userMds]);

  // Auth actions
  const login = async (userId: string, password: string) => {
    const found = userPics.find(
      (u) => u.userId.toLowerCase() === userId.trim().toLowerCase()
    );
    if (!found) {
      return { success: false, message: 'User ID tidak ditemukan dalam data PIC.' };
    }
    if (found.password && found.password !== password.trim()) {
      return { success: false, message: 'Password yang Anda masukkan salah.' };
    }
    setCurrentUser(found);
    return { success: true };
  };

  const logout = () => {
    setCurrentUser(null);
  };

  const switchUser = (userId: string) => {
    const found = userPics.find((u) => u.userId === userId);
    if (found) {
      setCurrentUser(found);
    }
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

  const syncWithGoogleSheetsInternal = async (token: string) => {
    setSyncStatus('syncing');
    setErrorMessage(null);
    try {
      const sheetsData = await fetchAllGoogleSheetsData(token);
      if (sheetsData.performance && sheetsData.performance.length > 0) {
        setRawPerformance(sheetsData.performance);
      }
      if (sheetsData.userPics && sheetsData.userPics.length > 0) {
        setUserPics(sheetsData.userPics);
      }
      if (sheetsData.userMds && sheetsData.userMds.length > 0) {
        setUserMds(sheetsData.userMds);
      }
      if (sheetsData.distAssignments && sheetsData.distAssignments.length > 0) {
        setDistAssignments(sheetsData.distAssignments);
      }
      if (sheetsData.mappings && sheetsData.mappings.length > 0) {
        setMappings(sheetsData.mappings);
      }
      if (sheetsData.callPlans && sheetsData.callPlans.length > 0) {
        setCallPlans(sheetsData.callPlans);
      }
      if (sheetsData.logs && sheetsData.logs.length > 0) {
        setLogs(sheetsData.logs);
      }

      setSyncStatus('synced');
      setLastSyncTime(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err: any) {
      console.error('Sync error:', err);
      setSyncStatus('error');
      setErrorMessage(err.message || 'Gagal menyinkronkan data dengan Google Sheets.');
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
        await saveMappingsToSheet(nextMappings, googleToken);
      } catch (e) {
        console.warn('Sheets save failed:', e);
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
        await saveMappingsToSheet(nextMappings, googleToken);
      } catch (e) {
        console.warn('Sheets update failed:', e);
      }
    }
    return true;
  };

  const deleteMapping = async (mappingId: string): Promise<boolean> => {
    const existing = mappings.find((m) => m.mappingId === mappingId);
    if (!existing) return false;

    const nextMappings = mappings.filter((m) => m.mappingId !== mappingId);
    setMappings(nextMappings);

    const detail = `Record dihapus: ${existing.customerSoGroupArea} (${existing.customerSoGroupAreaCode}), BSP: ${existing.bspCode1 || '-'}`;
    await addLogRecord('Delete', 'Mapping', mappingId, detail);

    if (googleToken) {
      try {
        await saveMappingsToSheet(nextMappings, googleToken);
      } catch (e) {
        console.warn('Sheets delete failed:', e);
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
      } catch (e) {
        console.warn('Sheets bulk save failed:', e);
      }
    }
    return { successCount: newItems.length, errors: [] };
  };

  // Call Plan mutations
  const createCallPlan = async (item: Omit<CallPlanItem, 'callPlanId'>): Promise<string> => {
    const callPlanId = `CP-${Date.now()}`;
    const newPlan: CallPlanItem = {
      ...item,
      callPlanId,
    };
    const nextPlans = [newPlan, ...callPlans];
    setCallPlans(nextPlans);

    const detail = `Record baru: MDS = ${item.namaMds}, Outlet = ${item.customerSoGroupArea}, Hari = ${item.visitDay}, Freq = ${item.frequency}x`;
    await addLogRecord('Create', 'Call Plan', callPlanId, detail);

    if (googleToken) {
      try {
        await saveCallPlansToSheet(nextPlans, googleToken);
      } catch (e) {
        console.warn('Sheets call plan save failed:', e);
      }
    }
    return callPlanId;
  };

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
        await saveCallPlansToSheet(nextPlans, googleToken);
      } catch (e) {
        console.warn('Sheets call plan update failed:', e);
      }
    }
    return true;
  };

  const deleteCallPlan = async (callPlanId: string): Promise<boolean> => {
    const existing = callPlans.find((c) => c.callPlanId === callPlanId);
    if (!existing) return false;

    const nextPlans = callPlans.filter((c) => c.callPlanId !== callPlanId);
    setCallPlans(nextPlans);

    const detail = `Record dihapus: MDS = ${existing.namaMds}, Outlet = ${existing.customerSoGroupArea} (${existing.customerSoGroupAreaCode})`;
    await addLogRecord('Delete', 'Call Plan', callPlanId, detail);

    if (googleToken) {
      try {
        await saveCallPlansToSheet(nextPlans, googleToken);
      } catch (e) {
        console.warn('Sheets call plan delete failed:', e);
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
      } catch (e) {
        console.warn('Sheets call plan bulk save failed:', e);
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
      } catch (e) {
        console.warn('Sheets bulk call plan upload failed:', e);
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
        lastSyncTime,
        errorMessage,

        rawPerformance,
        performance,
        userPics,
        userMds,
        distAssignments,
        mappings,
        callPlans,
        logs,

        accessibleDistributors,
        accessibleDepo,
        accessibleMds,

        login,
        logout,
        switchUser,
        connectGoogle,
        disconnectGoogle,
        syncWithGoogleSheets,
        updateUserPassword,

        createMapping,
        updateMapping,
        deleteMapping,
        bulkImportMappings,

        createCallPlan,
        updateCallPlan,
        deleteCallPlan,
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