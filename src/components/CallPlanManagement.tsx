import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { CallPlanItem, OutletPerformance, OutletMapping } from '../types';
import { Tooltip } from './Tooltip';
import {
  Calendar,
  CalendarCheck,
  Plus,
  Trash2,
  Edit2,
  Copy,
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
} from 'lucide-react';
import * as XLSX from 'xlsx';

export const CallPlanManagement: React.FC = () => {
  const {
    currentUser,
    callPlans,
    performance,
    mappings,
    userMds,
    createCallPlan,
    updateCallPlan,
    deleteCallPlan,
    bulkAssignCallPlan,
    copyCallPlanFromPrevious,
    bulkImportCallPlans,
    accessibleMds,
    accessibleDepo,
  } = useApp();

  const isManager = currentUser?.role === 'Manager';

  // Filters
  const [selectedMds, setSelectedMds] = useState<string>('ALL');
  const [selectedDay, setSelectedDay] = useState<string>('ALL');
  const [selectedWeek, setSelectedWeek] = useState<'ALL' | 'w1' | 'w2' | 'w3' | 'w4'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // Single Add / Edit Modal
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

  // Bulk Assign Modal State
  const [isBulkAssignOpen, setIsBulkAssignOpen] = useState(false);
  const [importResult, setImportResult] = useState<{
    successCount: number;
    failed: { row: number; reason: string }[];
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedOutletCodes, setSelectedOutletCodes] = useState<string[]>([]);
  const [bulkFilterDepo, setBulkFilterDepo] = useState('ALL');
  const [bulkFilterRing, setBulkFilterRing] = useState('ALL');
  const [bulkSearch, setBulkSearch] = useState('');
  const [bulkTargetMds, setBulkTargetMds] = useState('');
  const [bulkDay, setBulkDay] = useState<CallPlanItem['visitDay']>('Senin');
  const [bulkW1, setBulkW1] = useState(true);
  const [bulkW2, setBulkW2] = useState(true);
  const [bulkW3, setBulkW3] = useState(true);
  const [bulkW4, setBulkW4] = useState(true);
  const [bulkFreq, setBulkFreq] = useState(4);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);

  // Unscheduled Outlets (Ring 1 & 2 especially) — restricted to the logged-in
  // PIC's accessible Depo, same as Dashboard Performance & Mapping.
  const unscheduledOutlets = useMemo(() => {
    const scheduledCodes = new Set(callPlans.map((c) => c.customerSoGroupAreaCode));
    let pool = performance.filter(
      (p) =>
        !scheduledCodes.has(p.kodeCustNfiGroup) &&
        (p.calculatedRing === 'Ring 1' || p.calculatedRing === 'Ring 2')
    );
    if (!isManager && accessibleDepo.length > 0) {
      pool = pool.filter((p) => accessibleDepo.includes(p.depo));
    }
    return pool;
  }, [performance, callPlans, isManager, accessibleDepo]);

  // Filtered Call Plans
  const filteredCallPlans = useMemo(() => {
    return callPlans.filter((item) => {
      // Supervisor can only see their managed MDS
      if (!isManager && accessibleMds.length > 0) {
        const myMdsNames = accessibleMds.map((m) => m.namaMds.toLowerCase());
        if (!myMdsNames.includes(item.namaMds.toLowerCase())) return false;
      }

      if (selectedMds !== 'ALL' && item.namaMds !== selectedMds) return false;
      if (selectedDay !== 'ALL' && item.visitDay !== selectedDay) return false;

      if (selectedWeek === 'w1' && !item.week1) return false;
      if (selectedWeek === 'w2' && !item.week2) return false;
      if (selectedWeek === 'w3' && !item.week3) return false;
      if (selectedWeek === 'w4' && !item.week4) return false;

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

  // Handlers for Single Add / Edit
  const handleOpenAdd = (defaultOutlet?: OutletPerformance) => {
    setEditingId(null);
    setModalError(null);
    if (defaultOutlet) {
      setModalOutletCode(defaultOutlet.kodeCustNfiGroup);
      setModalOutletName(defaultOutlet.namaCustomerBaru);
      setModalRing(defaultOutlet.calculatedRing);
      setModalKabupaten(defaultOutlet.kabupaten);
      setModalKecamatan(defaultOutlet.kecamatan);
      setModalAlamat(defaultOutlet.alamat);
      // Auto-suggest frequency based on Ring
      if (defaultOutlet.calculatedRing === 'Ring 1' || defaultOutlet.calculatedRing === 'Ring 2') {
        setModalFreq(4);
        setModalW1(true);
        setModalW2(true);
        setModalW3(true);
        setModalW4(true);
      } else if (defaultOutlet.calculatedRing === 'Ring 3') {
        setModalFreq(2);
        setModalW1(true);
        setModalW2(false);
        setModalW3(true);
        setModalW4(false);
      } else {
        setModalFreq(1);
        setModalW1(true);
        setModalW2(false);
        setModalW3(false);
        setModalW4(false);
      }
    } else {
      setModalOutletCode('');
      setModalOutletName('');
      setModalRing('Ring 2');
      setModalKabupaten('');
      setModalKecamatan('');
      setModalAlamat('');
      setModalFreq(4);
      setModalW1(true);
      setModalW2(true);
      setModalW3(true);
      setModalW4(true);
    }
    setModalMds(userMds[0]?.namaMds || '');
    setModalVisitDay('Senin');
    setIsModalOpen(true);
  };

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

    if (editingId) {
      await updateCallPlan(editingId, payload);
    } else {
      await createCallPlan(payload);
    }
    setIsModalOpen(false);
  };

  const handleDelete = async (plan: CallPlanItem) => {
    if (window.confirm(`Hapus jadwal kunjungan ke ${plan.customerSoGroupArea} untuk MDS ${plan.namaMds}?`)) {
      await deleteCallPlan(plan.callPlanId);
    }
  };

  // Duplicate Call Plan from previous month
  const handleCopyMonth = async () => {
    if (!selectedMds || selectedMds === 'ALL') {
      alert('Pilih satu nama MDS pada filter untuk menduplikasi jadwal bulan lalu.');
      return;
    }
    if (window.confirm(`Duplikasi semua jadwal kunjungan aktif untuk MDS ${selectedMds} ke periode saat ini?`)) {
      const count = await copyCallPlanFromPrevious(selectedMds);
      alert(`Berhasil menduplikasi ${count} jadwal kunjungan untuk MDS ${selectedMds}.`);
    }
  };

  // Bulk Assign selection
  const handleSelectBulkOutlet = (code: string) => {
    if (selectedOutletCodes.includes(code)) {
      setSelectedOutletCodes(selectedOutletCodes.filter((c) => c !== code));
    } else {
      setSelectedOutletCodes([...selectedOutletCodes, code]);
    }
  };

  const handleSelectAllBulk = (outlets: OutletPerformance[]) => {
    if (selectedOutletCodes.length === outlets.length) {
      setSelectedOutletCodes([]);
    } else {
      setSelectedOutletCodes(outlets.map((o) => o.kodeCustNfiGroup));
    }
  };

  // Bulk Assign outlet pool: restricted to the logged-in PIC's accessible Depo,
  // then narrowed by the (previously unused) bulkFilterDepo/bulkFilterRing/bulkSearch state
  const BULK_MAX_RESULTS = 100;
  const bulkOutletBasePool = useMemo(() => {
    if (!isManager && accessibleDepo.length > 0) {
      return performance.filter((p) => accessibleDepo.includes(p.depo));
    }
    return performance;
  }, [performance, isManager, accessibleDepo]);

  const bulkOutletDepoOptions = useMemo(
    () => Array.from(new Set(bulkOutletBasePool.map((p) => p.depo).filter(Boolean))),
    [bulkOutletBasePool]
  );

  const bulkOutletResults = useMemo(() => {
    let pool = bulkOutletBasePool;
    if (bulkFilterDepo !== 'ALL') pool = pool.filter((p) => p.depo === bulkFilterDepo);
    if (bulkFilterRing !== 'ALL') pool = pool.filter((p) => p.calculatedRing === bulkFilterRing);
    if (bulkSearch.trim()) {
      const q = bulkSearch.trim().toLowerCase();
      pool = pool.filter(
        (p) => p.namaCustomerBaru.toLowerCase().includes(q) || p.kodeCustNfiGroup.toLowerCase().includes(q)
      );
    }
    return pool;
  }, [bulkOutletBasePool, bulkFilterDepo, bulkFilterRing, bulkSearch]);

  const bulkOutletDisplayed = useMemo(
    () => bulkOutletResults.slice(0, BULK_MAX_RESULTS),
    [bulkOutletResults]
  );

  const handleExecuteBulkAssign = async () => {
    if (!bulkTargetMds) {
      setBulkNotice('Pilih petugas MDS.');
      return;
    }
    if (selectedOutletCodes.length === 0) {
      setBulkNotice('Pilih minimal satu outlet.');
      return;
    }

    const targetOutlets = performance.filter((p) => selectedOutletCodes.includes(p.kodeCustNfiGroup));
    const count = await bulkAssignCallPlan(
      targetOutlets,
      bulkTargetMds,
      bulkDay,
      { w1: bulkW1, w2: bulkW2, w3: bulkW3, w4: bulkW4 },
      bulkFreq
    );

    setIsBulkAssignOpen(false);
    setSelectedOutletCodes([]);
    alert(`Sukses! ${count} outlet berhasil ditugaskan ke jadwal MDS ${bulkTargetMds}.`);
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
      } catch (err: any) {
        setImportResult({ successCount: 0, failed: [{ row: 0, reason: 'Gagal membaca file: ' + err.message }] });
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
    XLSX.writeFile(wb, `Call_Plan_MDS_${selectedMds === 'ALL' ? 'Semua' : selectedMds}.xlsx`);
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
              onClick={() => handleOpenAdd()}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Call Plan</span>
            </button>

            <button
              onClick={() => setIsBulkAssignOpen(true)}
              className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-xl border border-indigo-200 transition-colors flex items-center gap-1.5"
            >
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>Bulk Assign Outlets</span>
            </button>

            {selectedMds !== 'ALL' && (
              <button
                onClick={handleCopyMonth}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5"
                title="Salin semua jadwal dari bulan sebelumnya untuk MDS terpilih"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Salin Bulan Lalu</span>
              </button>
            )}

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
            <select
              value={selectedMds}
              onChange={(e) => setSelectedMds(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">Semua Petugas MDS ({accessibleMds.length})</option>
              {accessibleMds.map((m) => (
                <option key={m.namaMds} value={m.namaMds}>
                  {m.namaMds} ({m.area})
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">Semua Hari Kunjungan</option>
              {daysOfWeek.map((d) => (
                <option key={d} value={d}>
                  Hari {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">Semua Minggu</option>
              <option value="w1">Hanya Minggu 1 (W1)</option>
              <option value="w2">Hanya Minggu 2 (W2)</option>
              <option value="w3">Hanya Minggu 3 (W3)</option>
              <option value="w4">Hanya Minggu 4 (W4)</option>
            </select>
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
              onClick={() => {
                setSelectedOutletCodes(unscheduledOutlets.map((o) => o.kodeCustNfiGroup));
                setIsBulkAssignOpen(true);
              }}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs self-start sm:self-auto transition-colors"
            >
              Jadwalkan Semua Sekaligus
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {unscheduledOutlets.slice(0, 6).map((out) => (
              <div
                key={out.kodeCustNfiGroup}
                className="bg-white p-3 rounded-xl border border-amber-200 flex items-center justify-between"
              >
                <div>
                  <div className="font-bold text-xs text-slate-900">{out.namaCustomerBaru}</div>
                  <div className="text-[11px] text-slate-500">
                    {out.depo} • <strong className="text-amber-700">{out.calculatedRing}</strong>
                  </div>
                </div>
                <button
                  onClick={() => handleOpenAdd(out)}
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
              {selectedMds === 'ALL' ? 'Semua MDS' : `MDS: ${selectedMds}`}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                  <th className="py-3 px-3">Petugas MDS</th>
                  <th className="py-3 px-3">Hari Kunjungan</th>
                  <th className="py-3 px-3">Kode &amp; Nama Outlet</th>
                  <th className="py-3 px-3 text-center">Ring</th>
                  <th className="py-3 px-3">Alamat / Wilayah</th>
                  <th className="py-3 px-3 text-center">W1</th>
                  <th className="py-3 px-3 text-center">W2</th>
                  <th className="py-3 px-3 text-center">W3</th>
                  <th className="py-3 px-3 text-center">W4</th>
                  <th className="py-3 px-3 text-center">Frekuensi</th>
                  <th className="py-3 px-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCallPlans.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-8 text-slate-400">
                      Tidak ada call plan yang cocok dengan filter.
                    </td>
                  </tr>
                ) : (
                  filteredCallPlans.map((plan) => (
                    <tr key={plan.callPlanId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 font-bold text-slate-900">
                        {plan.namaMds}
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-semibold text-indigo-700 px-2.5 py-1 bg-indigo-50 rounded-lg">
                          {plan.visitDay}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900">{plan.customerSoGroupArea}</div>
                        <div className="text-[11px] font-mono text-slate-400">
                          {plan.customerSoGroupAreaCode}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="font-bold text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-800">
                          {plan.klasifikasiOutlet}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-600 max-w-xs truncate">
                        {plan.alamat || `${plan.kecamatan}, ${plan.kabupaten}`}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {plan.week1 ? (
                          <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-800 font-bold inline-flex items-center justify-center text-[11px]">
                            ✓
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {plan.week2 ? (
                          <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-800 font-bold inline-flex items-center justify-center text-[11px]">
                            ✓
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {plan.week3 ? (
                          <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-800 font-bold inline-flex items-center justify-center text-[11px]">
                            ✓
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {plan.week4 ? (
                          <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-800 font-bold inline-flex items-center justify-center text-[11px]">
                            ✓
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-slate-800">
                        {plan.frequency}x/bln
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(plan)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
                            title="Edit Jadwal"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(plan)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50"
                            title="Hapus Jadwal"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
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
            return (
              <div
                key={day}
                className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col"
              >
                <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                    <h4 className="font-bold text-sm text-slate-900">Hari {day}</h4>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-md">
                    {list.length} Kunjungan
                  </span>
                </div>

                <div className="p-3 divide-y divide-slate-100 flex-1 overflow-y-auto max-h-96 space-y-2">
                  {list.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-6">
                      Tidak ada jadwal di hari ini.
                    </p>
                  ) : (
                    list.map((item) => (
                      <div
                        key={item.callPlanId}
                        className="pt-2 first:pt-0 pb-1 flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-xs text-slate-900 truncate">
                            {item.customerSoGroupArea}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">{item.alamat}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded">
                              MDS: {item.namaMds}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              Freq: {item.frequency}x
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleOpenEdit(item)}
                            className="p-1 rounded text-slate-400 hover:text-indigo-600"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDelete(item)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
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
                {editingId ? 'Edit Call Plan Kunjungan' : 'Tambah Call Plan Kunjungan'}
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

      {/* BULK ASSIGN MODAL */}
      {isBulkAssignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-7 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-base text-slate-900">
                  Bulk Assign Outlets ke Call Plan MDS
                </h3>
              </div>
              <button
                onClick={() => setIsBulkAssignOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {bulkNotice && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{bulkNotice}</span>
              </div>
            )}

            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tugaskan ke Petugas MDS *
                  </label>
                  <select
                    value={bulkTargetMds}
                    onChange={(e) => setBulkTargetMds(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900"
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
                    Hari Kunjungan *
                  </label>
                  <select
                    value={bulkDay}
                    onChange={(e) => setBulkDay(e.target.value as any)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900"
                  >
                    {daysOfWeek.map((d) => (
                      <option key={d} value={d}>
                        Hari {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Minggu & Frekuensi */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">
                  Pola Minggu:
                </span>
                <div className="flex items-center gap-2">
                  {[
                    { label: 'W1', checked: bulkW1, set: setBulkW1 },
                    { label: 'W2', checked: bulkW2, set: setBulkW2 },
                    { label: 'W3', checked: bulkW3, set: setBulkW3 },
                    { label: 'W4', checked: bulkW4, set: setBulkW4 },
                  ].map((w) => (
                    <label key={w.label} className="flex items-center gap-1 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={w.checked}
                        onChange={(e) => {
                          w.set(e.target.checked);
                          const sum =
                            (w.label === 'W1' ? (e.target.checked ? 1 : 0) : bulkW1 ? 1 : 0) +
                            (w.label === 'W2' ? (e.target.checked ? 1 : 0) : bulkW2 ? 1 : 0) +
                            (w.label === 'W3' ? (e.target.checked ? 1 : 0) : bulkW3 ? 1 : 0) +
                            (w.label === 'W4' ? (e.target.checked ? 1 : 0) : bulkW4 ? 1 : 0);
                          setBulkFreq(sum);
                        }}
                        className="rounded text-indigo-600"
                      />
                      <span className="font-semibold">{w.label}</span>
                    </label>
                  ))}
                  <span className="text-xs text-slate-500 ml-2">({bulkFreq}x/bln)</span>
                </div>
              </div>

              {/* Outlet Selection Table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-800">
                    Pilih Outlet ({selectedOutletCodes.length} dipilih dari {bulkOutletResults.length.toLocaleString('id-ID')} hasil):
                  </label>
                  <button
                    type="button"
                    onClick={() => handleSelectAllBulk(bulkOutletDisplayed)}
                    className="text-xs text-indigo-600 hover:underline font-semibold"
                  >
                    {selectedOutletCodes.length === bulkOutletDisplayed.length ? 'Batalkan Semua' : 'Pilih Semua (halaman ini)'}
                  </button>
                </div>

                {!isManager && (
                  <p className="text-[11px] text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-1.5 mb-2">
                    Daftar otomatis dibatasi ke Depo yang menjadi tanggung jawab Anda.
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                  <div className="relative sm:col-span-1">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={bulkSearch}
                      onChange={(e) => setBulkSearch(e.target.value)}
                      placeholder="Cari nama/kode outlet..."
                      className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </div>
                  <select
                    value={bulkFilterDepo}
                    onChange={(e) => setBulkFilterDepo(e.target.value)}
                    className="text-[11px] px-2.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="ALL">Semua Depo</option>
                    {bulkOutletDepoOptions.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                  <select
                    value={bulkFilterRing}
                    onChange={(e) => setBulkFilterRing(e.target.value)}
                    className="text-[11px] px-2.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="ALL">Semua Ring</option>
                    <option value="Ring 1">Ring 1</option>
                    <option value="Ring 2">Ring 2</option>
                    <option value="Ring 3">Ring 3</option>
                    <option value="Ring 4">Ring 4</option>
                  </select>
                </div>

                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-2xl">
                  {bulkOutletDisplayed.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      Tidak ada outlet yang sesuai filter/pencarian.
                    </div>
                  ) : (
                    bulkOutletDisplayed.map((out) => {
                      const isSelected = selectedOutletCodes.includes(out.kodeCustNfiGroup);
                      return (
                        <div
                          key={out.kodeCustNfiGroup}
                          onClick={() => handleSelectBulkOutlet(out.kodeCustNfiGroup)}
                          className={`p-3 cursor-pointer flex items-center justify-between transition-colors ${
                            isSelected ? 'bg-indigo-50/70 font-semibold' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}} // handled by parent onClick
                              className="rounded text-indigo-600"
                            />
                            <div>
                              <p className="text-xs text-slate-900">{out.namaCustomerBaru}</p>
                              <p className="text-[11px] text-slate-400">
                                {out.kodeCustNfiGroup} • {out.depo} • {out.kabupaten}
                              </p>
                            </div>
                          </div>
                          <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            {out.calculatedRing}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
                {bulkOutletResults.length > BULK_MAX_RESULTS && (
                  <p className="text-[11px] text-amber-600 mt-1.5">
                    Menampilkan {BULK_MAX_RESULTS} dari {bulkOutletResults.length.toLocaleString('id-ID')} hasil — persempit dengan pencarian atau filter Depo/Ring untuk melihat outlet lainnya.
                  </p>
                )}
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsBulkAssignOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleExecuteBulkAssign}
                  className="px-6 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
                >
                  Tugaskan {selectedOutletCodes.length} Outlet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};