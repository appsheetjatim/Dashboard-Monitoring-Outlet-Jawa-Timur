import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { CallPlanItem, OutletPerformance, OutletMapping } from '../types';
import { Tooltip } from './Tooltip';
import { Toast, ToastState } from './Toast';
import { MultiSelectDropdown } from './MultiSelectDropdown';
import {
  Calendar,
  CalendarCheck,
  Plus,
  Edit2,
  Download,
  Upload,
  Search,
  Filter,
  Check,
  X,
  AlertTriangle,
  UserCheck,
  Sparkles,
  Printer,
  ChevronRight,
  Clock,
  CheckCircle2,
  FileDown,
  Store,
} from 'lucide-react';
import * as XLSX from 'xlsx';

export const CallPlanManagement: React.FC = () => {
  const {
    currentUser,
    callPlans,
    performance,
    mappings,
    updateCallPlan,
    bulkAssignCallPlan,
    bulkImportCallPlans,
    accessibleMds,
    accessibleDepo,
  } = useApp();

  const isManager = currentUser?.role === 'Manager';

  // Filters
  const [selectedMds, setSelectedMds] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState<string[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // Edit Modal (editing an EXISTING call plan entry only — creation now goes
  // through the Wizard below)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalMds, setModalMds] = useState('');
  const [modalOutletCode, setModalOutletCode] = useState('');
  const [modalOutletName, setModalOutletName] = useState('');
  const [modalRing, setModalRing] = useState<'Ring 1' | 'Ring 2' | 'Ring 3' | 'Ring 4'>('Ring 2');
  const [modalKabupaten, setModalKabupaten] = useState('');
  const [modalKecamatan, setModalKecamatan] = useState('');
  const [modalAlamat, setModalAlamat] = useState('');
  const [modalVisitDay, setModalVisitDay] = useState<CallPlanItem['visitDay']>('Senin');
  const [modalW1, setModalW1] = useState(true);
  const [modalW2, setModalW2] = useState(true);
  const [modalW3, setModalW3] = useState(true);
  const [modalW4, setModalW4] = useState(true);
  const [modalFreq, setModalFreq] = useState(4);
  const [modalError, setModalError] = useState<string | null>(null);

  const [importResult, setImportResult] = useState<{
    successCount: number;
    failed: { row: number; reason: string }[];
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Call Plan Wizard — MDS -> Hari -> Checklist Toko (filter Kab/Kec) -> Week
  // per toko -> Review & Simpan. This is now the ONLY way to create Call Plan
  // entries (standing plans, not weekly — Week 1-4 are recurrence flags within
  // an ongoing schedule, not a period that needs re-creating each month).
  type WizardWeeks = { w1: boolean; w2: boolean; w3: boolean; w4: boolean };
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [wizardMds, setWizardMds] = useState('');
  const [wizardDay, setWizardDay] = useState<CallPlanItem['visitDay']>('Senin');
  const [wizardKabupaten, setWizardKabupaten] = useState('ALL');
  const [wizardKecamatan, setWizardKecamatan] = useState('ALL');
  const [wizardDepo, setWizardDepo] = useState('ALL');
  const [wizardRing, setWizardRing] = useState('ALL');
  const [wizardSearch, setWizardSearch] = useState('');
  const [wizardSelectedCodes, setWizardSelectedCodes] = useState<string[]>([]);
  const [wizardWeeks, setWizardWeeks] = useState<Record<string, WizardWeeks>>({});

  // Unscheduled Outlets (Ring 1 & 2 especially) — sourced from Mapping (not
  // raw Performance) since CallPlanItem.customerSoGroupAreaCode is the
  // Mapping-derived code, not a raw distributor code. Comparing against raw
  // Performance codes here previously meant this list was never accurate
  // (the two code spaces never matched).
  const unscheduledOutlets = useMemo(() => {
    const scheduledCodes = new Set(callPlans.map((c) => c.customerSoGroupAreaCode));
    let pool = mappings.filter(
      (m) =>
        m.status === 'Active' &&
        !scheduledCodes.has(m.customerSoGroupAreaCode) &&
        (m.klasifikasiOutlet === 'Ring 1' || m.klasifikasiOutlet === 'Ring 2')
    );
    if (!isManager && accessibleDepo.length > 0) {
      pool = pool.filter(
        (m) => accessibleDepo.includes(m.depoBsp) || accessibleDepo.includes(m.subDistUdn)
      );
    }
    return pool;
  }, [mappings, callPlans, isManager, accessibleDepo]);

  // Filtered Call Plans
  const filteredCallPlans = useMemo(() => {
    return callPlans.filter((item) => {
      // Supervisor can only see their managed MDS
      if (!isManager && accessibleMds.length > 0) {
        const myMdsNames = accessibleMds.map((m) => m.namaMds.toLowerCase());
        if (!myMdsNames.includes(item.namaMds.toLowerCase())) return false;
      }

      if (selectedMds.length > 0 && !selectedMds.includes(item.namaMds)) return false;
      if (selectedDay.length > 0 && !selectedDay.includes(item.visitDay)) return false;

      if (selectedWeek.length > 0) {
        const matchesWeek =
          (selectedWeek.includes('w1') && item.week1) ||
          (selectedWeek.includes('w2') && item.week2) ||
          (selectedWeek.includes('w3') && item.week3) ||
          (selectedWeek.includes('w4') && item.week4);
        if (!matchesWeek) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesCode = item.customerSoGroupAreaCode.toLowerCase().includes(q);
        const matchesName = item.customerSoGroupArea.toLowerCase().includes(q);
        const matchesMds = item.namaMds.toLowerCase().includes(q);
        if (!matchesCode && !matchesName && !matchesMds) return false;
      }

      return true;
    });
  }, [callPlans, isManager, accessibleMds, selectedMds, selectedDay, selectedWeek, searchQuery]);

  // Day groupings for Calendar Grid view
  const daysOfWeek = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const;

  const plansByDay = useMemo(() => {
    const map: { [key: string]: CallPlanItem[] } = {};
    daysOfWeek.forEach((d) => (map[d] = []));
    filteredCallPlans.forEach((plan) => {
      if (map[plan.visitDay]) {
        map[plan.visitDay].push(plan);
      }
    });
    return map;
  }, [filteredCallPlans]);

  // Today's day name (Indonesian), used to highlight the matching day-group
  const todayName = useMemo(() => {
    const idx = new Date().getDay(); // 0=Sun..6=Sat
    const map: Record<number, string> = { 1: 'Senin', 2: 'Selasa', 3: 'Rabu', 4: 'Kamis', 5: 'Jumat', 6: 'Sabtu' };
    return map[idx] || '';
  }, []);

  // Deterministic small color per MDS name, so the same MDS always shows the
  // same dot color within a day group (helps the eye "stick" to one MDS's
  // rows even when scanning quickly through a mixed day).
  const MDS_DOT_COLORS = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-sky-500', 'bg-purple-500'];
  const getMdsColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % MDS_DOT_COLORS.length;
    return MDS_DOT_COLORS[Math.abs(hash) % MDS_DOT_COLORS.length];
  };

  // Compact visual for Week 1-4 + frequency, replacing 5 separate columns
  const WeekPattern: React.FC<{ plan: CallPlanItem }> = ({ plan }) => (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {[plan.week1, plan.week2, plan.week3, plan.week4].map((on, i) => (
          <span
            key={i}
            title={`Minggu ${i + 1}${on ? ' — dikunjungi' : ''}`}
            className={`w-2 h-2 rounded-full ${on ? 'bg-indigo-500' : 'bg-slate-200'}`}
          />
        ))}
      </div>
      <span className="text-[10px] text-slate-400 whitespace-nowrap">{plan.frequency}x/bln</span>
    </div>
  );

  // Table view: each day as its own group (header row + its outlets), and
  // within a day, sorted by MDS so consecutive same-MDS rows can skip
  // repeating the MDS name/day — a flat list previously repeated both on
  // every single row, which was noisy to scan.
  const tableGroupedByDay = useMemo(() => {
    return daysOfWeek
      .map((day) => ({
        day,
        plans: [...(plansByDay[day] || [])].sort((a, b) => a.namaMds.localeCompare(b.namaMds)),
      }))
      .filter((g) => g.plans.length > 0);
  }, [plansByDay]);

  // Grid view: same per-day data, but further sub-grouped by MDS (as
  // [mdsName, items][] pairs) — computed once here for all days, rather than
  // calling useMemo inside the render .map() below (which would break the
  // Rules of Hooks).
  const mdsGroupsByDay = useMemo(() => {
    const result: Record<string, [string, CallPlanItem[]][]> = {};
    daysOfWeek.forEach((day) => {
      const list = plansByDay[day] || [];
      const map = new Map<string, CallPlanItem[]>();
      [...list]
        .sort((a, b) => a.namaMds.localeCompare(b.namaMds))
        .forEach((item) => {
          if (!map.has(item.namaMds)) map.set(item.namaMds, []);
          map.get(item.namaMds)!.push(item);
        });
      result[day] = Array.from(map.entries());
    });
    return result;
  }, [plansByDay]);

  // Handlers for Single Add / Edit
  const handleOpenEdit = (plan: CallPlanItem) => {
    setEditingId(plan.callPlanId);
    setModalError(null);
    setModalMds(plan.namaMds);
    setModalOutletCode(plan.customerSoGroupAreaCode);
    setModalOutletName(plan.customerSoGroupArea);
    setModalRing(plan.klasifikasiOutlet);
    setModalKabupaten(plan.kabupaten);
    setModalKecamatan(plan.kecamatan);
    setModalAlamat(plan.alamat);
    setModalVisitDay(plan.visitDay);
    setModalW1(plan.week1);
    setModalW2(plan.week2);
    setModalW3(plan.week3);
    setModalW4(plan.week4);
    setModalFreq(plan.frequency);
    setIsModalOpen(true);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalMds) {
      setModalError('Silakan pilih nama petugas MDS.');
      return;
    }
    if (!modalOutletName) {
      setModalError('Nama outlet tidak boleh kosong.');
      return;
    }
    if (!editingId) return; // this modal is edit-only now

    const payload: Omit<CallPlanItem, 'callPlanId'> = {
      namaPic: currentUser?.namaPic || '',
      namaMds: modalMds,
      customerSoGroupAreaCode: modalOutletCode,
      customerSoGroupArea: modalOutletName,
      klasifikasiOutlet: modalRing,
      kabupaten: modalKabupaten,
      kecamatan: modalKecamatan,
      alamat: modalAlamat,
      visitDay: modalVisitDay,
      week1: modalW1,
      week2: modalW2,
      week3: modalW3,
      week4: modalW4,
      frequency: modalFreq,
    };

    try {
      await updateCallPlan(editingId, payload);
      setToast({ message: `Jadwal ${modalOutletName} berhasil diperbarui.`, type: 'success' });
      setIsModalOpen(false);
    } catch (err: any) {
      setModalError(err.message || 'Gagal menyimpan jadwal.');
      setToast({ message: err.message || 'Gagal menyimpan jadwal.', type: 'error' });
    }
  };

  // ===== CALL PLAN WIZARD =====
  // Default Week pattern suggested by Ring — user can still override per store.
  const getDefaultWeeksForRing = (ring: string): WizardWeeks => {
    if (ring === 'Ring 1' || ring === 'Ring 2') return { w1: true, w2: true, w3: true, w4: true };
    if (ring === 'Ring 3') return { w1: true, w2: false, w3: true, w4: false };
    return { w1: true, w2: false, w3: false, w4: false };
  };

  const openWizard = (preselectCodes?: string[]) => {
    setWizardStep(1);
    setWizardMds('');
    setWizardDay('Senin');
    setWizardKabupaten('ALL');
    setWizardKecamatan('ALL');
    setWizardDepo('ALL');
    setWizardRing('ALL');
    setWizardSearch('');
    if (preselectCodes && preselectCodes.length > 0) {
      setWizardSelectedCodes(preselectCodes);
      const weeksInit: Record<string, WizardWeeks> = {};
      preselectCodes.forEach((code) => {
        const m = mappings.find((mm) => mm.customerSoGroupAreaCode === code);
        weeksInit[code] = getDefaultWeeksForRing(m?.klasifikasiOutlet || 'Ring 2');
      });
      setWizardWeeks(weeksInit);
    } else {
      setWizardSelectedCodes([]);
      setWizardWeeks({});
    }
    setIsWizardOpen(true);
  };

  const closeWizard = () => setIsWizardOpen(false);

  const toggleWizardOutlet = (mapping: OutletMapping) => {
    const code = mapping.customerSoGroupAreaCode;
    setWizardSelectedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
    setWizardWeeks((prev) => {
      if (prev[code]) return prev; // keep existing choice if toggled back on
      return { ...prev, [code]: getDefaultWeeksForRing(mapping.klasifikasiOutlet) };
    });
  };

  const setWizardWeekForCode = (code: string, key: keyof WizardWeeks, value: boolean) => {
    setWizardWeeks((prev) => ({
      ...prev,
      [code]: { ...(prev[code] || { w1: false, w2: false, w3: false, w4: false }), [key]: value },
    }));
  };

  // Wizard Step 3 outlet pool: sourced from Mapping (Active), access-restricted,
  // excluding outlets that already have a schedule for the chosen MDS + Day.
  const wizardBasePool = useMemo(() => {
    let pool = mappings.filter((m) => m.status === 'Active');
    if (!isManager && accessibleDepo.length > 0) {
      pool = pool.filter(
        (m) => accessibleDepo.includes(m.depoBsp) || accessibleDepo.includes(m.subDistUdn)
      );
    }
    return pool;
  }, [mappings, isManager, accessibleDepo]);

  const wizardKabupatenOptions = useMemo(
    () => Array.from(new Set(wizardBasePool.map((m) => m.kabupaten).filter(Boolean))).sort(),
    [wizardBasePool]
  );
  const wizardKecamatanOptions = useMemo(() => {
    const pool = wizardKabupaten === 'ALL' ? wizardBasePool : wizardBasePool.filter((m) => m.kabupaten === wizardKabupaten);
    return Array.from(new Set(pool.map((m) => m.kecamatan).filter(Boolean))).sort();
  }, [wizardBasePool, wizardKabupaten]);
  const wizardDepoOptions = useMemo(
    () => Array.from(new Set(wizardBasePool.map((m) => m.depoBsp).filter(Boolean))).sort(),
    [wizardBasePool]
  );

  const wizardAlreadyScheduledKeys = useMemo(
    () => new Set(callPlans.map((c) => `${c.namaMds.toLowerCase()}|${c.customerSoGroupAreaCode}|${c.visitDay}`)),
    [callPlans]
  );

  const WIZARD_MAX_RESULTS = 100;
  const wizardOutletResults = useMemo(() => {
    let pool = wizardBasePool;
    if (wizardKabupaten !== 'ALL') pool = pool.filter((m) => m.kabupaten === wizardKabupaten);
    if (wizardKecamatan !== 'ALL') pool = pool.filter((m) => m.kecamatan === wizardKecamatan);
    if (wizardDepo !== 'ALL') pool = pool.filter((m) => m.depoBsp === wizardDepo);
    if (wizardRing !== 'ALL') pool = pool.filter((m) => m.klasifikasiOutlet === wizardRing);
    if (wizardSearch.trim()) {
      const q = wizardSearch.trim().toLowerCase();
      pool = pool.filter(
        (m) => m.customerSoGroupArea.toLowerCase().includes(q) || m.customerSoGroupAreaCode.toLowerCase().includes(q)
      );
    }
    if (wizardMds && wizardDay) {
      pool = pool.filter(
        (m) => !wizardAlreadyScheduledKeys.has(`${wizardMds.toLowerCase()}|${m.customerSoGroupAreaCode}|${wizardDay}`)
      );
    }
    return pool;
  }, [
    wizardBasePool,
    wizardKabupaten,
    wizardKecamatan,
    wizardDepo,
    wizardRing,
    wizardSearch,
    wizardMds,
    wizardDay,
    wizardAlreadyScheduledKeys,
  ]);
  const wizardOutletDisplayed = useMemo(
    () => wizardOutletResults.slice(0, WIZARD_MAX_RESULTS),
    [wizardOutletResults]
  );

  // Combined Performance metrics (BSP + UDN summed) for each Mapping outlet —
  // valid because Avg Sales / AVG PA are monthly averages; summing two
  // channels' monthly averages gives the correct combined monthly figure.
  const performanceByCode = useMemo(() => {
    const map = new Map<string, OutletPerformance>();
    performance.forEach((p) => map.set(p.kodeCustNfiGroup, p));
    return map;
  }, [performance]);

  const getCombinedMetrics = (mapping: OutletMapping) => {
    const bsp = mapping.bspCode1 ? performanceByCode.get(mapping.bspCode1) : undefined;
    const udn = mapping.udnCode1 ? performanceByCode.get(mapping.udnCode1) : undefined;
    const sku = (bsp?.sku2026 || 0) + (udn?.sku2026 || 0);
    const avgPa = (bsp?.avgPa2026 || 0) + (udn?.avgPa2026 || 0);
    return {
      omset: (bsp?.omset2026 || 0) + (udn?.omset2026 || 0),
      avgSales: (bsp?.avgSales2026 || 0) + (udn?.avgSales2026 || 0),
      sku,
      avgPa,
      percentPa: sku > 0 ? (avgPa / sku) * 100 : 0,
    };
  };

  const wizardSelectedMappings = useMemo(() => {
    return wizardSelectedCodes
      .map((code) => mappings.find((m) => m.customerSoGroupAreaCode === code))
      .filter((m): m is OutletMapping => !!m);
  }, [wizardSelectedCodes, mappings]);

  const canGoWizardStep2 = !!wizardMds;
  const canGoWizardStep3 = !!wizardMds && !!wizardDay;
  const canGoWizardStep4 = wizardSelectedCodes.length > 0;
  const canGoWizardStep5 = wizardSelectedCodes.every((c) => {
    const w = wizardWeeks[c];
    return !!w && (w.w1 || w.w2 || w.w3 || w.w4);
  });

  const handleFinalizeWizard = async () => {
    const items = wizardSelectedMappings.map((m) => {
      const w = wizardWeeks[m.customerSoGroupAreaCode] || { w1: false, w2: false, w3: false, w4: false };
      return { mapping: m, week1: w.w1, week2: w.w2, week3: w.w3, week4: w.w4 };
    });
    try {
      const count = await bulkAssignCallPlan(items, wizardMds, wizardDay);
      setIsWizardOpen(false);
      setToast({
        message: `Sukses! ${count} jadwal kunjungan dibuat untuk MDS ${wizardMds} (Hari ${wizardDay}).`,
        type: 'success',
      });
    } catch (err: any) {
      setToast({ message: err.message || 'Gagal menyimpan jadwal Call Plan.', type: 'error' });
    }
  };

  // Export Call Plan
  // Download a blank Excel template for Call Plan bulk upload
  const handleDownloadCallPlanTemplate = () => {
    const sampleMapping = mappings.find((m) =>
      isManager ? true : accessibleDepo.includes(m.depoBsp) || accessibleDepo.includes(m.subDistUdn)
    );
    const exampleRow = {
      'Nama MDS': accessibleMds[0]?.namaMds || 'Nama MDS',
      'Kode Outlet': sampleMapping?.customerSoGroupAreaCode || 'JWTM-R1-14-CONTOHTOKO',
      'Hari Kunjungan': 'Senin',
      'Minggu 1': 'Yes',
      'Minggu 2': 'No',
      'Minggu 3': 'Yes',
      'Minggu 4': 'No',
    };
    const ws = XLSX.utils.json_to_sheet([exampleRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template Call Plan');
    XLSX.writeFile(wb, 'Template_Bulk_Upload_CallPlan.xlsx');
  };

  // Bulk Upload handler — looks up outlet details from Mapping by code,
  // validates every row, and skips only the rows that fail (with a reason).
  const VALID_VISIT_DAYS: CallPlanItem['visitDay'][] = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const parseYesNoCp = (v: any): boolean | null => {
    const s = String(v ?? '').trim().toLowerCase();
    if (s === 'yes') return true;
    if (s === 'no' || s === '') return false;
    return null;
  };

  const handleCallPlanFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    setIsImporting(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        const wb = XLSX.read(data, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json: any[] = XLSX.utils.sheet_to_json(ws);

        if (json.length === 0) {
          setImportResult({ successCount: 0, failed: [{ row: 0, reason: 'File kosong.' }] });
          setIsImporting(false);
          return;
        }

        // Existing schedule keys (MDS + outlet code + visit day) — never duplicate
        const existingKeys = new Set(
          callPlans.map((c) => `${c.namaMds.toLowerCase()}|${c.customerSoGroupAreaCode}|${c.visitDay}`)
        );
        const keysClaimedInFile = new Set<string>();

        const validItems: Array<Omit<CallPlanItem, 'callPlanId'>> = [];
        const failed: { row: number; reason: string }[] = [];

        json.forEach((r, idx) => {
          const rowNum = idx + 2;

          const namaMdsRaw = String(r['Nama MDS'] || '').trim();
          if (!namaMdsRaw) {
            failed.push({ row: rowNum, reason: 'Nama MDS wajib diisi.' });
            return;
          }
          const mdsMatch = accessibleMds.find((m) => m.namaMds.toLowerCase() === namaMdsRaw.toLowerCase());
          if (!mdsMatch) {
            failed.push({ row: rowNum, reason: `MDS "${namaMdsRaw}" tidak ditemukan / bukan MDS Anda.` });
            return;
          }

          const kodeOutletRaw = String(r['Kode Outlet'] || '').trim();
          if (!kodeOutletRaw) {
            failed.push({ row: rowNum, reason: 'Kode Outlet wajib diisi.' });
            return;
          }
          const mappingMatch = mappings.find(
            (m) => m.customerSoGroupAreaCode.toLowerCase() === kodeOutletRaw.toLowerCase() && m.status === 'Active'
          );
          if (!mappingMatch) {
            failed.push({ row: rowNum, reason: `Kode Outlet "${kodeOutletRaw}" tidak ditemukan di data Mapping (atau tidak aktif).` });
            return;
          }

          if (!isManager && accessibleDepo.length > 0) {
            const depoOk =
              accessibleDepo.includes(mappingMatch.depoBsp) || accessibleDepo.includes(mappingMatch.subDistUdn);
            if (!depoOk) {
              failed.push({ row: rowNum, reason: 'Outlet ini di luar akses Anda.' });
              return;
            }
          }

          const visitDayRaw = String(r['Hari Kunjungan'] || '').trim();
          if (!VALID_VISIT_DAYS.includes(visitDayRaw as CallPlanItem['visitDay'])) {
            failed.push({ row: rowNum, reason: `Hari Kunjungan "${visitDayRaw}" tidak valid — harus Senin–Sabtu.` });
            return;
          }
          const visitDay = visitDayRaw as CallPlanItem['visitDay'];

          const w1 = parseYesNoCp(r['Minggu 1']);
          const w2 = parseYesNoCp(r['Minggu 2']);
          const w3 = parseYesNoCp(r['Minggu 3']);
          const w4 = parseYesNoCp(r['Minggu 4']);
          if (w1 === null || w2 === null || w3 === null || w4 === null) {
            failed.push({ row: rowNum, reason: 'Kolom Minggu 1–4 harus diisi Yes atau No.' });
            return;
          }
          const frequency = [w1, w2, w3, w4].filter(Boolean).length;
          if (frequency === 0) {
            failed.push({ row: rowNum, reason: 'Minimal 1 minggu harus dicentang Yes.' });
            return;
          }

          const key = `${namaMdsRaw.toLowerCase()}|${mappingMatch.customerSoGroupAreaCode}|${visitDay}`;
          if (existingKeys.has(key) || keysClaimedInFile.has(key)) {
            failed.push({
              row: rowNum,
              reason: `Jadwal MDS "${namaMdsRaw}" untuk outlet ini di hari ${visitDay} sudah ada / duplikat dalam file.`,
            });
            return;
          }
          keysClaimedInFile.add(key);

          validItems.push({
            namaPic: currentUser?.namaPic || '',
            namaMds: mdsMatch.namaMds,
            customerSoGroupAreaCode: mappingMatch.customerSoGroupAreaCode,
            customerSoGroupArea: mappingMatch.customerSoGroupArea,
            klasifikasiOutlet: mappingMatch.klasifikasiOutlet,
            kabupaten: mappingMatch.kabupaten,
            kecamatan: mappingMatch.kecamatan,
            alamat: mappingMatch.alamat,
            visitDay,
            week1: w1,
            week2: w2,
            week3: w3,
            week4: w4,
            frequency,
          });
        });

        if (validItems.length > 0) {
          await bulkImportCallPlans(validItems);
        }
        setImportResult({ successCount: validItems.length, failed });
        if (validItems.length > 0) {
          setToast({
            message: `Bulk upload selesai: ${validItems.length} jadwal berhasil diimpor${
              failed.length > 0 ? `, ${failed.length} gagal` : ''
            }.`,
            type: failed.length > 0 ? 'error' : 'success',
          });
        }
      } catch (err: any) {
        setImportResult({ successCount: 0, failed: [{ row: 0, reason: err.message || 'Gagal memproses file.' }] });
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleExport = () => {
    const rows = filteredCallPlans.map((c) => ({
      'Call Plan ID': c.callPlanId,
      'Nama PIC': c.namaPic,
      'Nama MDS': c.namaMds,
      'Kode Customer SO': c.customerSoGroupAreaCode,
      'Nama Toko': c.customerSoGroupArea,
      Klasifikasi: c.klasifikasiOutlet,
      Kabupaten: c.kabupaten,
      Kecamatan: c.kecamatan,
      Alamat: c.alamat,
      'Hari Kunjungan': c.visitDay,
      'Minggu 1': c.week1 ? 'YA' : '-',
      'Minggu 2': c.week2 ? 'YA' : '-',
      'Minggu 3': c.week3 ? 'YA' : '-',
      'Minggu 4': c.week4 ? 'YA' : '-',
      'Frekuensi Kunjungan': `${c.frequency}x/bulan`,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Call Plan MDS');
    const mdsLabel = selectedMds.length === 0 ? 'Semua' : selectedMds.join('-');
    XLSX.writeFile(wb, `Call_Plan_MDS_${mdsLabel}.xlsx`);
  };

  // Print schedule
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Filter & Actions Bar */}
      <div className="bg-white p-4 lg:p-5 rounded-2xl shadow-xs border border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Call Plan Jadwal Kunjungan MDS</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Rencana rute mingguan, frekuensi kunjungan Ring 1–4, &amp; monitoring coverage outlet
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => openWizard()}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Sparkles className="w-4 h-4" />
              <span>Buat Call Plan</span>
            </button>

            <button
              onClick={handleExport}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>

            <button
              onClick={handleDownloadCallPlanTemplate}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Download Template</span>
            </button>

            <label className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>{isImporting ? 'Memproses...' : 'Bulk Upload'}</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleCallPlanFileUpload}
                disabled={isImporting}
                className="hidden"
              />
            </label>

            <button
              onClick={handlePrint}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak</span>
            </button>
          </div>
        </div>

        {importResult && (
          <div className="mt-3 space-y-2">
            <div
              className={`p-3 border text-xs rounded-xl flex items-center justify-between gap-2 ${
                importResult.failed.length === 0
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  {importResult.successCount} jadwal berhasil diimpor
                  {importResult.failed.length > 0 && `, ${importResult.failed.length} baris gagal (lihat detail di bawah)`}.
                </span>
              </div>
              <button
                onClick={() => setImportResult(null)}
                className="text-slate-400 hover:text-slate-700 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {importResult.failed.length > 0 && (
              <div className="max-h-48 overflow-y-auto border border-red-200 rounded-xl divide-y divide-red-100">
                {importResult.failed.map((f, i) => (
                  <div key={i} className="p-2.5 text-[11px] text-red-700 bg-red-50/60 flex gap-2">
                    <span className="font-bold shrink-0">
                      {f.row > 0 ? `Baris ${f.row}` : 'Error'}
                    </span>
                    <span>{f.reason}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Filters Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 pt-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Cari toko/kode/MDS..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <MultiSelectDropdown
              label="Petugas MDS"
              options={accessibleMds.map((m) => m.namaMds)}
              selected={selectedMds}
              onChange={setSelectedMds}
            />
          </div>

          <div>
            <MultiSelectDropdown
              label="Hari Kunjungan"
              options={[...daysOfWeek]}
              selected={selectedDay}
              onChange={setSelectedDay}
            />
          </div>

          <div>
            <MultiSelectDropdown
              label="Minggu"
              options={['w1', 'w2', 'w3', 'w4']}
              selected={selectedWeek}
              onChange={setSelectedWeek}
            />
          </div>

          {/* View toggle */}
          <div className="flex items-center justify-end">
            <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  viewMode === 'table' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600'
                }`}
              >
                Tabel
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  viewMode === 'grid' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600'
                }`}
              >
                Grid Hari
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ALERT: OUTLET RING 1 & 2 BELUM TERJADWAL */}
      {unscheduledOutlets.length > 0 && (
        <div className="bg-amber-50/90 border border-amber-200 p-4 lg:p-5 rounded-2xl shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-amber-900">
                  {unscheduledOutlets.length} Outlet Prioritas (Ring 1 &amp; Ring 2) Belum Terjadwal!
                </h3>
                <p className="text-xs text-amber-700">
                  Outlet ini wajib memiliki jadwal kunjungan rutin mingguan (rekomendasi frekuensi 4x)
                </p>
              </div>
            </div>
            <button
              onClick={() => openWizard(unscheduledOutlets.map((o) => o.customerSoGroupAreaCode))}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs self-start sm:self-auto transition-colors"
            >
              Jadwalkan Semua Sekaligus
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {unscheduledOutlets.slice(0, 6).map((out) => (
              <div
                key={out.customerSoGroupAreaCode}
                className="bg-white p-3 rounded-xl border border-amber-200 flex items-center justify-between"
              >
                <div>
                  <div className="font-bold text-xs text-slate-900">{out.customerSoGroupArea}</div>
                  <div className="text-[11px] text-slate-500">
                    {out.depoBsp || out.subDistUdn} • <strong className="text-amber-700">{out.klasifikasiOutlet}</strong>
                  </div>
                </div>
                <button
                  onClick={() => openWizard([out.customerSoGroupAreaCode])}
                  className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 text-[11px] font-bold rounded-lg transition-colors"
                >
                  + Jadwalkan
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 1: TABLE VIEW */}
      {viewMode === 'table' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-800">
              Daftar Call Plan ({filteredCallPlans.length} Jadwal)
            </h3>
            <span className="text-xs text-slate-500">
              {selectedMds.length === 0
                ? 'Semua MDS'
                : selectedMds.length === 1
                ? `MDS: ${selectedMds[0]}`
                : `${selectedMds.length} MDS dipilih`}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                  <th className="py-3 px-3">Petugas MDS</th>
                  <th className="py-3 px-3">Kode &amp; Nama Outlet</th>
                  <th className="py-3 px-3 text-center">Ring</th>
                  <th className="py-3 px-3">Kecamatan / Kabupaten</th>
                  <th className="py-3 px-3">Pola Kunjungan</th>
                  <th className="py-3 px-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tableGroupedByDay.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400">
                      Tidak ada call plan yang cocok dengan filter.
                    </td>
                  </tr>
                ) : (
                  tableGroupedByDay.map((group) => (
                    <React.Fragment key={group.day}>
                      <tr className={group.day === todayName ? 'bg-indigo-50/70' : 'bg-slate-50/70'}>
                        <td colSpan={6} className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <Calendar
                              className={`w-3.5 h-3.5 ${
                                group.day === todayName ? 'text-indigo-600' : 'text-slate-400'
                              }`}
                            />
                            <span
                              className={`text-xs font-bold ${
                                group.day === todayName ? 'text-indigo-700' : 'text-slate-700'
                              }`}
                            >
                              {group.day}
                            </span>
                            {group.day === todayName && (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 bg-indigo-600 text-white rounded">
                                HARI INI
                              </span>
                            )}
                            <span className="text-[11px] text-slate-400">
                              ({group.plans.length} kunjungan)
                            </span>
                          </div>
                        </td>
                      </tr>
                      {group.plans.map((plan, idx) => {
                        const showMds = idx === 0 || group.plans[idx - 1].namaMds !== plan.namaMds;
                        return (
                          <tr key={plan.callPlanId} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2.5 px-3">
                              {showMds ? (
                                <div className="flex items-center gap-1.5">
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${getMdsColor(plan.namaMds)}`} />
                                  <span className="font-bold text-slate-900">{plan.namaMds}</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 pl-3.5 text-slate-300">
                                  <span className="text-[10px]">↳</span>
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-slate-900">{plan.customerSoGroupArea}</div>
                              <div className="text-[11px] font-mono text-slate-400">
                                {plan.customerSoGroupAreaCode}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="font-bold text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-800">
                                {plan.klasifikasiOutlet}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-600" title={plan.alamat}>
                              {plan.kecamatan}, {plan.kabupaten}
                            </td>
                            <td className="py-2.5 px-3">
                              <WeekPattern plan={plan} />
                            </td>
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              <button
                                onClick={() => handleOpenEdit(plan)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
                                title="Edit Jadwal"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* VIEW 2: CALENDAR GRID VIEW PER HARI */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {daysOfWeek.map((day) => {
            const list = plansByDay[day] || [];
            const isToday = day === todayName;
            const mdsGroups = mdsGroupsByDay[day] || [];
            const hasMultipleMds = mdsGroups.length > 1;

            return (
              <div
                key={day}
                className={`bg-white rounded-2xl border shadow-xs overflow-hidden flex flex-col ${
                  isToday ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-200'
                }`}
              >
                <div
                  className={`p-3.5 border-b flex items-center justify-between ${
                    isToday ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Calendar className={`w-4 h-4 ${isToday ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <h4 className={`font-bold text-sm ${isToday ? 'text-indigo-700' : 'text-slate-900'}`}>
                      Hari {day}
                    </h4>
                    {isToday && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 bg-indigo-600 text-white rounded">
                        HARI INI
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-md">
                    {list.length} Kunjungan
                  </span>
                </div>

                <div className="p-3 flex-1 overflow-y-auto max-h-96 space-y-3">
                  {list.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-6">
                      Tidak ada jadwal di hari ini.
                    </p>
                  ) : (
                    mdsGroups.map(([mdsName, items]) => (
                      <div key={mdsName}>
                        {hasMultipleMds && (
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${getMdsColor(mdsName)}`} />
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                              {mdsName} ({items.length})
                            </span>
                          </div>
                        )}
                        <div className="divide-y divide-slate-100 space-y-1.5">
                          {items.map((item) => (
                            <div
                              key={item.callPlanId}
                              className="pt-1.5 first:pt-0 pb-1 flex items-start justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="font-bold text-xs text-slate-900 truncate">
                                    {item.customerSoGroupArea}
                                  </p>
                                  <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700">
                                    {item.klasifikasiOutlet}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-500 truncate" title={item.alamat}>
                                  {item.kecamatan}, {item.kabupaten}
                                </p>
                                <div className="mt-1">
                                  <WeekPattern plan={item} />
                                </div>
                                {!hasMultipleMds && (
                                  <p className="text-[10px] text-slate-400 mt-0.5">MDS: {item.namaMds}</p>
                                )}
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => handleOpenEdit(item)}
                                  className="p-1 rounded text-slate-400 hover:text-indigo-600"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* SINGLE CALL PLAN MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">
                Edit Call Plan Kunjungan
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveModal} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Petugas MDS Penanggung Jawab *
                </label>
                <select
                  value={modalMds}
                  onChange={(e) => setModalMds(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Pilih Petugas MDS...</option>
                  {accessibleMds.map((m) => (
                    <option key={m.namaMds} value={m.namaMds}>
                      {m.namaMds} ({m.area})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Outlet *
                </label>
                <input
                  type="text"
                  required
                  value={modalOutletName}
                  onChange={(e) => setModalOutletName(e.target.value)}
                  placeholder="Contoh: TOKO BERKAH JAYA"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kode Outlet SO
                  </label>
                  <input
                    type="text"
                    value={modalOutletCode}
                    onChange={(e) => setModalOutletCode(e.target.value)}
                    placeholder="JWTM-..."
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Klasifikasi
                  </label>
                  <select
                    value={modalRing}
                    onChange={(e) => setModalRing(e.target.value as any)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs"
                  >
                    <option value="Ring 1">Ring 1</option>
                    <option value="Ring 2">Ring 2</option>
                    <option value="Ring 3">Ring 3</option>
                    <option value="Ring 4">Ring 4</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Alamat</label>
                <input
                  type="text"
                  value={modalAlamat}
                  onChange={(e) => setModalAlamat(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Hari Kunjungan *
                </label>
                <select
                  value={modalVisitDay}
                  onChange={(e) => setModalVisitDay(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs"
                >
                  {daysOfWeek.map((d) => (
                    <option key={d} value={d}>
                      Hari {d}
                    </option>
                  ))}
                </select>
              </div>

              {/* Pola Minggu */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                <label className="block text-xs font-bold text-slate-800 mb-2">
                  Jadwal Minggu Kunjungan (Frekuensi: {modalFreq}x/bln)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'W1', checked: modalW1, set: setModalW1 },
                    { label: 'W2', checked: modalW2, set: setModalW2 },
                    { label: 'W3', checked: modalW3, set: setModalW3 },
                    { label: 'W4', checked: modalW4, set: setModalW4 },
                  ].map((w) => (
                    <label
                      key={w.label}
                      className="p-2 bg-white border border-slate-200 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer hover:border-indigo-400"
                    >
                      <input
                        type="checkbox"
                        checked={w.checked}
                        onChange={(e) => {
                          w.set(e.target.checked);
                          // auto update freq count
                          const newCount =
                            (w.label === 'W1' ? (e.target.checked ? 1 : 0) : modalW1 ? 1 : 0) +
                            (w.label === 'W2' ? (e.target.checked ? 1 : 0) : modalW2 ? 1 : 0) +
                            (w.label === 'W3' ? (e.target.checked ? 1 : 0) : modalW3 ? 1 : 0) +
                            (w.label === 'W4' ? (e.target.checked ? 1 : 0) : modalW4 ? 1 : 0);
                          setModalFreq(newCount);
                        }}
                        className="rounded text-indigo-600"
                      />
                      <span className="text-xs font-bold text-slate-700">{w.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
                >
                  Simpan Jadwal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CALL PLAN WIZARD */}
      {isWizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-7 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="font-bold text-base text-slate-900">Wizard Call Plan Kunjungan</h3>
                  <p className="text-xs text-slate-500">
                    Jadwal berlaku terus (standing plan) sampai diubah manual — bukan mingguan/bulanan.
                  </p>
                </div>
              </div>
              <button
                onClick={closeWizard}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-1.5 py-4 overflow-x-auto">
              {[
                { step: 1, label: 'Pilih MDS' },
                { step: 2, label: 'Hari Kunjungan' },
                { step: 3, label: 'Checklist Toko' },
                { step: 4, label: 'Set Minggu' },
                { step: 5, label: 'Review & Simpan' },
              ].map((s, idx) => (
                <React.Fragment key={s.step}>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                        wizardStep === s.step
                          ? 'bg-indigo-600 text-white'
                          : wizardStep > s.step
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {wizardStep > s.step ? '✓' : s.step}
                    </div>
                    <span
                      className={`text-[11px] whitespace-nowrap ${
                        wizardStep === s.step ? 'font-bold text-slate-900' : 'text-slate-400'
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                  {idx < 4 && <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
                </React.Fragment>
              ))}
            </div>

            {/* STEP 1: PILIH MDS */}
            {wizardStep === 1 && (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">Pilih petugas MDS yang akan dijadwalkan:</p>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-2xl">
                  {accessibleMds.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      Tidak ada MDS yang tersedia untuk akun Anda.
                    </div>
                  ) : (
                    accessibleMds.map((m) => (
                      <button
                        type="button"
                        key={m.namaMds}
                        onClick={() => setWizardMds(m.namaMds)}
                        className={`w-full text-left p-3 flex items-center justify-between transition-colors ${
                          wizardMds === m.namaMds ? 'bg-indigo-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <UserCheck
                            className={`w-4 h-4 ${wizardMds === m.namaMds ? 'text-indigo-600' : 'text-slate-300'}`}
                          />
                          <span className={`text-xs ${wizardMds === m.namaMds ? 'font-bold text-indigo-900' : 'text-slate-800'}`}>
                            {m.namaMds}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400">{m.area}</span>
                      </button>
                    ))
                  )}
                </div>
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    disabled={!canGoWizardStep2}
                    onClick={() => setWizardStep(2)}
                    className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Lanjut →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: HARI KUNJUNGAN */}
            {wizardStep === 2 && (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Pilih hari kunjungan untuk MDS <strong>{wizardMds}</strong>:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {daysOfWeek.map((d) => (
                    <button
                      type="button"
                      key={d}
                      onClick={() => setWizardDay(d)}
                      className={`p-3.5 rounded-2xl border text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
                        wizardDay === d
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300'
                      }`}
                    >
                      <Calendar className="w-4 h-4" />
                      {d}
                    </button>
                  ))}
                </div>
                <div className="pt-2 flex justify-between">
                  <button
                    type="button"
                    onClick={() => setWizardStep(1)}
                    className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    ← Kembali
                  </button>
                  <button
                    type="button"
                    disabled={!canGoWizardStep3}
                    onClick={() => setWizardStep(3)}
                    className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Lanjut →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: CHECKLIST TOKO */}
            {wizardStep === 3 && (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Centang toko yang dikunjungi <strong>{wizardMds}</strong> pada hari <strong>{wizardDay}</strong>{' '}
                  ({wizardSelectedCodes.length} dipilih dari {wizardOutletResults.length.toLocaleString('id-ID')} hasil):
                </p>

                {!isManager && (
                  <p className="text-[11px] text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-1.5">
                    Daftar otomatis dibatasi ke Depo yang menjadi tanggung jawab Anda. Outlet yang sudah punya jadwal untuk MDS &amp; hari ini otomatis disembunyikan.
                  </p>
                )}

                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={wizardSearch}
                    onChange={(e) => setWizardSearch(e.target.value)}
                    placeholder="Cari nama/kode outlet..."
                    className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <select
                    value={wizardKabupaten}
                    onChange={(e) => {
                      setWizardKabupaten(e.target.value);
                      setWizardKecamatan('ALL');
                    }}
                    className="text-[11px] px-2.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="ALL">Semua Kabupaten</option>
                    {wizardKabupatenOptions.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                  <select
                    value={wizardKecamatan}
                    onChange={(e) => setWizardKecamatan(e.target.value)}
                    className="text-[11px] px-2.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="ALL">Semua Kecamatan</option>
                    {wizardKecamatanOptions.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                  <select
                    value={wizardDepo}
                    onChange={(e) => setWizardDepo(e.target.value)}
                    className="text-[11px] px-2.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="ALL">Semua Depo</option>
                    {wizardDepoOptions.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                  <select
                    value={wizardRing}
                    onChange={(e) => setWizardRing(e.target.value)}
                    className="text-[11px] px-2.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="ALL">Semua Ring</option>
                    <option value="Ring 1">Ring 1</option>
                    <option value="Ring 2">Ring 2</option>
                    <option value="Ring 3">Ring 3</option>
                    <option value="Ring 4">Ring 4</option>
                  </select>
                </div>

                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-2xl">
                  {wizardOutletDisplayed.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      Tidak ada outlet yang sesuai filter/pencarian.
                    </div>
                  ) : (
                    wizardOutletDisplayed.map((m) => {
                      const isSelected = wizardSelectedCodes.includes(m.customerSoGroupAreaCode);
                      const metrics = getCombinedMetrics(m);
                      return (
                        <div
                          key={m.customerSoGroupAreaCode}
                          onClick={() => toggleWizardOutlet(m)}
                          className={`p-3 cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                            isSelected ? 'bg-indigo-50/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}} // handled by parent onClick
                              className="mt-0.5 rounded text-indigo-600 shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 truncate">{m.customerSoGroupArea}</p>
                              <p className="text-[11px] text-slate-400 truncate">
                                {m.customerSoGroupAreaCode} • {m.kecamatan}, {m.kabupaten}
                              </p>
                              <p className="text-[10px] text-slate-500 mt-0.5">
                                Omset: Rp {metrics.omset.toLocaleString('id-ID')} • Avg Sales: Rp{' '}
                                {metrics.avgSales.toLocaleString('id-ID')} • SKU: {metrics.sku.toFixed(1)} • PA:{' '}
                                {metrics.avgPa.toFixed(1)} ({metrics.percentPa.toFixed(0)}%)
                              </p>
                            </div>
                          </div>
                          <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 shrink-0">
                            {m.klasifikasiOutlet}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
                {wizardOutletResults.length > WIZARD_MAX_RESULTS && (
                  <p className="text-[11px] text-amber-600">
                    Menampilkan {WIZARD_MAX_RESULTS} dari {wizardOutletResults.length.toLocaleString('id-ID')} hasil — persempit dengan pencarian atau filter Kabupaten/Kecamatan/Depo/Ring untuk melihat outlet lainnya.
                  </p>
                )}

                <div className="pt-2 flex justify-between">
                  <button
                    type="button"
                    onClick={() => setWizardStep(2)}
                    className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    ← Kembali
                  </button>
                  <button
                    type="button"
                    disabled={!canGoWizardStep4}
                    onClick={() => setWizardStep(4)}
                    className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Lanjut ({wizardSelectedCodes.length} toko) →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: SET MINGGU PER TOKO */}
            {wizardStep === 4 && (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Atur Minggu 1–4 untuk tiap toko (default disarankan sesuai Ring, bisa diubah per toko):
                </p>

                <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-2xl">
                  {wizardSelectedMappings.map((m) => {
                    const w = wizardWeeks[m.customerSoGroupAreaCode] || {
                      w1: false,
                      w2: false,
                      w3: false,
                      w4: false,
                    };
                    const freq = [w.w1, w.w2, w.w3, w.w4].filter(Boolean).length;
                    const hasNoWeek = freq === 0;
                    return (
                      <div key={m.customerSoGroupAreaCode} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">{m.customerSoGroupArea}</p>
                          <p className="text-[11px] text-slate-400 truncate">
                            {m.customerSoGroupAreaCode} • {m.klasifikasiOutlet}
                          </p>
                          {hasNoWeek && (
                            <p className="text-[11px] text-rose-600 font-semibold mt-0.5">
                              Pilih minimal 1 minggu
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {(['w1', 'w2', 'w3', 'w4'] as const).map((wk, idx) => (
                            <label
                              key={wk}
                              className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer flex items-center gap-1 ${
                                w[wk]
                                  ? 'bg-indigo-600 border-indigo-600 text-white'
                                  : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={w[wk]}
                                onChange={(e) => setWizardWeekForCode(m.customerSoGroupAreaCode, wk, e.target.checked)}
                                className="hidden"
                              />
                              W{idx + 1}
                            </label>
                          ))}
                          <span className="text-[11px] text-slate-400 ml-1">({freq}x/bln)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2 flex justify-between">
                  <button
                    type="button"
                    onClick={() => setWizardStep(3)}
                    className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    ← Kembali
                  </button>
                  <button
                    type="button"
                    disabled={!canGoWizardStep5}
                    onClick={() => setWizardStep(5)}
                    className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Lanjut ke Review →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 5: REVIEW & SIMPAN */}
            {wizardStep === 5 && (
              <div className="space-y-3">
                <div className="p-3.5 bg-indigo-50 border border-indigo-100 rounded-2xl flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
                  <span>
                    <strong className="text-slate-900">MDS:</strong> {wizardMds}
                  </span>
                  <span>
                    <strong className="text-slate-900">Hari:</strong> {wizardDay}
                  </span>
                  <span>
                    <strong className="text-slate-900">Jumlah Toko:</strong> {wizardSelectedMappings.length}
                  </span>
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-2xl">
                  {wizardSelectedMappings.map((m) => {
                    const w = wizardWeeks[m.customerSoGroupAreaCode] || {
                      w1: false,
                      w2: false,
                      w3: false,
                      w4: false,
                    };
                    const freq = [w.w1, w.w2, w.w3, w.w4].filter(Boolean).length;
                    return (
                      <div key={m.customerSoGroupAreaCode} className="p-3 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">{m.customerSoGroupArea}</p>
                          <p className="text-[11px] text-slate-400 truncate">{m.customerSoGroupAreaCode}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {(['w1', 'w2', 'w3', 'w4'] as const).map((wk, idx) => (
                            <span
                              key={wk}
                              className={`w-5 h-5 rounded-md text-[10px] font-bold flex items-center justify-center ${
                                w[wk] ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-300'
                              }`}
                            >
                              {idx + 1}
                            </span>
                          ))}
                          <span className="text-[11px] text-slate-500 ml-1.5">{freq}x/bln</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2 flex justify-between">
                  <button
                    type="button"
                    onClick={() => setWizardStep(4)}
                    className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    ← Kembali
                  </button>
                  <button
                    type="button"
                    onClick={handleFinalizeWizard}
                    className="px-6 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
                  >
                    Simpan Semua ({wizardSelectedMappings.length} Jadwal)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
};