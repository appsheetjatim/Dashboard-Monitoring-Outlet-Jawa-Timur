import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { OutletMapping, OutletPerformance } from '../types';
import { generateCustomerSoGroupAreaCode } from '../services/outletClassification';
import { findCandidateMatches, CandidateMatch } from '../services/fuzzyMatch';
import { Tooltip } from './Tooltip';
import {
  Plus,
  Edit2,
  Trash2,
  Search,
  Filter,
  Download,
  Upload,
  Check,
  X,
  AlertCircle,
  Sparkles,
  Layers,
  MapPin,
  CheckCircle2,
  ChevronRight,
  ArrowRight,
  FileSpreadsheet,
  Store,
} from 'lucide-react';
import * as XLSX from 'xlsx';

export const MappingManagement: React.FC = () => {
  const {
    currentUser,
    mappings,
    performance,
    userMds,
    createMapping,
    updateMapping,
    deleteMapping,
    bulkImportMappings,
    accessibleDistributors,
    accessibleDepo,
  } = useApp();

  const isManager = currentUser?.role === 'Manager';

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDepo, setFilterDepo] = useState('ALL');
  const [filterRing, setFilterRing] = useState('ALL');
  const [filterPosm, setFilterPosm] = useState('ALL');
  const [filterMds, setFilterMds] = useState('ALL');

  // Modal Wizard State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMappingId, setEditingMappingId] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);

  // Form Fields
  const [primaryDist, setPrimaryDist] = useState<'BSP' | 'UDN'>('BSP');
  const [selectedPrimaryOutlet, setSelectedPrimaryOutlet] = useState<OutletPerformance | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateMatch | null>(null);
  const [isOneSided, setIsOneSided] = useState(false);

  // Manual code & name fields
  const [soGroupAreaName, setSoGroupAreaName] = useState('');
  const [klasifikasi, setKlasifikasi] = useState<OutletMapping['klasifikasiOutlet']>('Ring 2');
  const [bspCode1, setBspCode1] = useState('');
  const [bspCode2, setBspCode2] = useState('');
  const [bspCode3, setBspCode3] = useState('');
  const [namaCustomerBsp, setNamaCustomerBsp] = useState('');
  const [depoBsp, setDepoBsp] = useState('');
  const [subDistBsp, setSubDistBsp] = useState('');

  const [udnCode1, setUdnCode1] = useState('');
  const [udnCode2, setUdnCode2] = useState('');
  const [udnCode3, setUdnCode3] = useState('');
  const [namaCustomerUdn, setNamaCustomerUdn] = useState('');
  const [subDistUdn, setSubDistUdn] = useState('');

  const [kabupaten, setKabupaten] = useState('');
  const [kecamatan, setKecamatan] = useState('');
  const [alamat, setAlamat] = useState('');
  const [latitude, setLatitude] = useState<number | undefined>(undefined);
  const [longitude, setLongitude] = useState<number | undefined>(undefined);

  // POSM Fields
  const [dishub, setDishub] = useState(false);
  const [rak50cm, setRak50cm] = useState(false);
  const [rak65cm, setRak65cm] = useState(false);
  const [rak75cm, setRak75cm] = useState(false);
  const [rakDuaSisi, setRakDuaSisi] = useState(false);
  const [rakPack, setRakPack] = useState(false);
  const [rakCustome, setRakCustome] = useState(false);
  const [displayWowAll, setDisplayWowAll] = useState(false);
  const [biayaDisplayWow, setBiayaDisplayWow] = useState(0);
  const [displayWowHilo, setDisplayWowHilo] = useState(false);
  const [biayaDisplayWowHilo, setBiayaDisplayWowHilo] = useState(0);
  const [namaMds, setNamaMds] = useState('');
  const [picName, setPicName] = useState(currentUser?.namaPic || '');
  const [notes, setNotes] = useState('');

  // Validation / errors
  const [formError, setFormError] = useState<string | null>(null);

  // Bulk import state
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Filtered Mappings list
  const filteredMappings = useMemo(() => {
    return mappings.filter((m) => {
      // Restrict to mappings whose BSP Depo or UDN Sub Dist falls within the
      // PIC's assigned Depo list — checking only Dist (BSP/UDN presence) was
      // wrong because most mappings have both BSP and UDN sides filled, which
      // made this check always pass and exposed all mappings to every Supervisor.
      if (!isManager && accessibleDepo.length > 0) {
        const matchesBsp = !!m.depoBsp && accessibleDepo.includes(m.depoBsp);
        const matchesUdn = !!m.subDistUdn && accessibleDepo.includes(m.subDistUdn);
        if (!matchesBsp && !matchesUdn) return false;
      }

      if (filterDepo !== 'ALL' && m.depoBsp !== filterDepo) return false;
      if (filterRing !== 'ALL' && m.klasifikasiOutlet !== filterRing) return false;
      if (filterMds !== 'ALL' && m.namaMds !== filterMds) return false;

      if (filterPosm === 'dishub' && !m.dishub) return false;
      if (filterPosm === 'rak' && !m.rak50cm && !m.rak65cm && !m.rak75cm && !m.rakDuaSisi && !m.rakPack && !m.rakCustome) return false;
      if (filterPosm === 'wow' && !m.displayWowAll && !m.displayWowHilo) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesCode = m.customerSoGroupAreaCode.toLowerCase().includes(q);
        const matchesName = m.customerSoGroupArea.toLowerCase().includes(q);
        const matchesBsp = m.namaCustomerBsp.toLowerCase().includes(q) || m.bspCode1.toLowerCase().includes(q);
        const matchesUdn = m.namaCustomerUdn.toLowerCase().includes(q) || m.udnCode1.toLowerCase().includes(q);
        if (!matchesCode && !matchesName && !matchesBsp && !matchesUdn) return false;
      }

      return true;
    });
  }, [mappings, isManager, accessibleDistributors, filterDepo, filterRing, filterMds, filterPosm, searchQuery]);

  // Unique options for filter
  const depoOptions = useMemo(() => {
    return Array.from(new Set(mappings.map((m) => m.depoBsp).filter(Boolean)));
  }, [mappings]);

  const mdsOptions = useMemo(() => {
    return Array.from(new Set(mappings.map((m) => m.namaMds).filter(Boolean)));
  }, [mappings]);

  // Candidates for fuzzy cross-distributor matching
  const matchingCandidates = useMemo(() => {
    if (!selectedPrimaryOutlet) return [];
    const targetDist = primaryDist === 'BSP' ? 'UDN' : 'BSP';
    const targetOutlets = performance.filter((p) => p.dist === targetDist);
    return findCandidateMatches(selectedPrimaryOutlet, targetOutlets);
  }, [selectedPrimaryOutlet, primaryDist, performance]);

  // Generated Real-time Customer SO Group Area Code
  const generatedCode = useMemo(() => {
    return generateCustomerSoGroupAreaCode(soGroupAreaName, klasifikasi);
  }, [klasifikasi, soGroupAreaName]);

  // Open modal for new mapping
  const handleOpenAdd = () => {
    setEditingMappingId(null);
    setWizardStep(1);
    setSelectedPrimaryOutlet(null);
    setSelectedCandidate(null);
    setIsOneSided(false);
    setSoGroupAreaName('');
    setKlasifikasi('Ring 2');
    setBspCode1('');
    setBspCode2('');
    setBspCode3('');
    setNamaCustomerBsp('');
    setDepoBsp('');
    setSubDistBsp('');
    setUdnCode1('');
    setUdnCode2('');
    setUdnCode3('');
    setNamaCustomerUdn('');
    setSubDistUdn('');
    setKabupaten('');
    setKecamatan('');
    setAlamat('');
    setLatitude(undefined);
    setLongitude(undefined);
    setDishub(false);
    setRak50cm(false);
    setRak65cm(false);
    setRak75cm(false);
    setRakDuaSisi(false);
    setRakPack(false);
    setRakCustome(false);
    setDisplayWowAll(false);
    setBiayaDisplayWow(0);
    setDisplayWowHilo(false);
    setBiayaDisplayWowHilo(0);
    setNamaMds('');
    setPicName(currentUser?.namaPic || '');
    setNotes('');
    setFormError(null);
    setIsModalOpen(true);
  };

  // Open modal for editing
  const handleOpenEdit = (mapping: OutletMapping) => {
    setEditingMappingId(mapping.mappingId);
    setWizardStep(3); // jump to details
    setSoGroupAreaName(mapping.customerSoGroupArea);
    setKlasifikasi(mapping.klasifikasiOutlet);
    setBspCode1(mapping.bspCode1);
    setBspCode2(mapping.bspCode2);
    setBspCode3(mapping.bspCode3);
    setNamaCustomerBsp(mapping.namaCustomerBsp);
    setDepoBsp(mapping.depoBsp);
    setSubDistBsp(mapping.subDistBsp);
    setUdnCode1(mapping.udnCode1);
    setUdnCode2(mapping.udnCode2);
    setUdnCode3(mapping.udnCode3);
    setNamaCustomerUdn(mapping.namaCustomerUdn);
    setSubDistUdn(mapping.subDistUdn);
    setKabupaten(mapping.kabupaten);
    setKecamatan(mapping.kecamatan);
    setAlamat(mapping.alamat);
    setLatitude(mapping.latitude);
    setLongitude(mapping.longitude);
    setDishub(mapping.dishub);
    setRak50cm(mapping.rak50cm);
    setRak65cm(mapping.rak65cm);
    setRak75cm(mapping.rak75cm);
    setRakDuaSisi(mapping.rakDuaSisi);
    setRakPack(mapping.rakPack);
    setRakCustome(mapping.rakCustome);
    setDisplayWowAll(mapping.displayWowAll);
    setBiayaDisplayWow(mapping.biayaDisplayWow);
    setDisplayWowHilo(mapping.displayWowHilo);
    setBiayaDisplayWowHilo(mapping.biayaDisplayWowHilo);
    setNamaMds(mapping.namaMds);
    setPicName(mapping.pic || currentUser?.namaPic || '');
    setNotes(mapping.notes || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  // Handle selecting primary outlet in Step 1
  const handleSelectPrimaryOutlet = (outlet: OutletPerformance) => {
    setSelectedPrimaryOutlet(outlet);
    setSelectedCandidate(null);
    setIsOneSided(false);
    setSoGroupAreaName(outlet.namaCustomerBaru);
    setKlasifikasi(outlet.calculatedRing);
    setKabupaten(outlet.kabupaten);
    setKecamatan(outlet.kecamatan);
    setAlamat(outlet.alamat);
    setLatitude(outlet.latitude);
    setLongitude(outlet.longitude);

    if (outlet.dist === 'BSP') {
      setPrimaryDist('BSP');
      setBspCode1(outlet.kodeCustNfiGroup);
      setNamaCustomerBsp(outlet.namaCustomerBaru);
      setDepoBsp(outlet.depo);
      setSubDistBsp(outlet.subDist);
      setUdnCode1('');
      setNamaCustomerUdn('');
      setSubDistUdn('');
    } else {
      setPrimaryDist('UDN');
      setUdnCode1(outlet.kodeCustNfiGroup);
      setNamaCustomerUdn(outlet.namaCustomerBaru);
      setSubDistUdn(outlet.subDist);
      setBspCode1('');
      setNamaCustomerBsp('');
      setDepoBsp('');
      setSubDistBsp('');
    }

    setWizardStep(2);
  };

  // Handle selecting candidate match in Step 2
  const handleSelectCandidate = (candidate: CandidateMatch) => {
    setSelectedCandidate(candidate);
    setIsOneSided(false);

    if (primaryDist === 'BSP') {
      setUdnCode1(candidate.outlet.kodeCustNfiGroup);
      setNamaCustomerUdn(candidate.outlet.namaCustomerBaru);
      setSubDistUdn(candidate.outlet.subDist);
    } else {
      setBspCode1(candidate.outlet.kodeCustNfiGroup);
      setNamaCustomerBsp(candidate.outlet.namaCustomerBaru);
      setDepoBsp(candidate.outlet.depo);
      setSubDistBsp(candidate.outlet.subDist);
    }

    setWizardStep(3);
  };

  const handleSelectOneSided = () => {
    setSelectedCandidate(null);
    setIsOneSided(true);
    if (primaryDist === 'BSP') {
      setUdnCode1('');
      setNamaCustomerUdn('');
      setSubDistUdn('');
    } else {
      setBspCode1('');
      setNamaCustomerBsp('');
      setDepoBsp('');
      setSubDistBsp('');
    }
    setWizardStep(3);
  };

  // Submit Mapping Form
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!soGroupAreaName.trim()) {
      setFormError('Nama Customer SO Group Area harus diisi.');
      return;
    }

    // Duplicate check
    const existingSameCode = mappings.find(
      (m) =>
        m.mappingId !== editingMappingId &&
        m.customerSoGroupAreaCode.toLowerCase() === generatedCode.toLowerCase()
    );
    if (existingSameCode) {
      setFormError(`Kode ${generatedCode} sudah terdaftar pada mapping ID: ${existingSameCode.mappingId}.`);
      return;
    }

    const payload: Omit<OutletMapping, 'mappingId' | 'mappingDate' | 'lastUpdated'> = {
      customerSoGroupAreaCode: generatedCode,
      customerSoGroupArea: soGroupAreaName.trim(),
      klasifikasiOutlet: klasifikasi,
      subDistBsp,
      depoBsp,
      namaCustomerBsp,
      bspCode1,
      bspCode2,
      bspCode3,
      subDistUdn,
      namaCustomerUdn,
      udnCode1,
      udnCode2,
      udnCode3,
      kabupaten,
      kecamatan,
      alamat,
      dishub,
      rak50cm,
      rak65cm,
      rak75cm,
      rakDuaSisi,
      rakPack,
      rakCustome,
      displayWowAll,
      biayaDisplayWow,
      displayWowHilo,
      biayaDisplayWowHilo,
      namaMds,
      pic: picName,
      latitude,
      longitude,
      status: 'Active',
      notes,
    };

    try {
      if (editingMappingId) {
        await updateMapping(editingMappingId, payload);
      } else {
        await createMapping(payload);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan mapping.');
    }
  };

  // Delete Mapping
  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Yakin ingin menghapus mapping outlet "${name}"? Aksi ini akan dicatat di Log Activity.`)) {
      await deleteMapping(id);
    }
  };

  // Export Mappings
  const handleExport = () => {
    const rows = filteredMappings.map((m) => ({
      'Mapping ID': m.mappingId,
      'Customer SO Group Area Code': m.customerSoGroupAreaCode,
      'Customer SO Group Area': m.customerSoGroupArea,
      Klasifikasi: m.klasifikasiOutlet,
      'Sub Dist BSP': m.subDistBsp,
      'Depo BSP': m.depoBsp,
      'Nama Customer BSP': m.namaCustomerBsp,
      'BSP Code 1': m.bspCode1,
      'BSP Code 2': m.bspCode2,
      'BSP Code 3': m.bspCode3,
      'Sub Dist UDN': m.subDistUdn,
      'Nama Customer UDN': m.namaCustomerUdn,
      'UDN Code 1': m.udnCode1,
      'UDN Code 2': m.udnCode2,
      'UDN Code 3': m.udnCode3,
      Kabupaten: m.kabupaten,
      Kecamatan: m.kecamatan,
      Alamat: m.alamat,
      Dishub: m.dishub ? 'Yes' : 'No',
      'Rak 50cm': m.rak50cm ? 'Yes' : 'No',
      'Rak 65cm': m.rak65cm ? 'Yes' : 'No',
      'Rak 75cm': m.rak75cm ? 'Yes' : 'No',
      'Rak Dua Sisi': m.rakDuaSisi ? 'Yes' : 'No',
      'Rak Pack': m.rakPack ? 'Yes' : 'No',
      'Rak Custome': m.rakCustome ? 'Yes' : 'No',
      'Display Wow All': m.displayWowAll ? 'Yes' : 'No',
      'Biaya Wow All': m.biayaDisplayWow,
      'Display Wow Hilo': m.displayWowHilo ? 'Yes' : 'No',
      'Biaya Wow Hilo': m.biayaDisplayWowHilo,
      'Nama MDS': m.namaMds,
      PIC: m.pic,
      Status: m.status,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Mapping Outlet');
    XLSX.writeFile(wb, 'Data_Mapping_Outlet_POSM.xlsx');
  };

  // Bulk Import handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        const wb = XLSX.read(data, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json: any[] = XLSX.utils.sheet_to_json(ws);

        if (json.length === 0) {
          alert('File kosong.');
          return;
        }

        const itemsToImport = json.map((r) => ({
          customerSoGroupAreaCode: r['Customer SO Group Area Code'] || `JWTM-R2-00-OUTLET`,
          customerSoGroupArea: r['Customer SO Group Area'] || r['Nama Customer BSP'] || 'Outlet Baru',
          klasifikasiOutlet: (r['Klasifikasi'] || 'Ring 2') as any,
          subDistBsp: r['Sub Dist BSP'] || '',
          depoBsp: r['Depo BSP'] || '',
          namaCustomerBsp: r['Nama Customer BSP'] || '',
          bspCode1: String(r['BSP Code 1'] || ''),
          bspCode2: String(r['BSP Code 2'] || ''),
          bspCode3: String(r['BSP Code 3'] || ''),
          subDistUdn: r['Sub Dist UDN'] || '',
          namaCustomerUdn: r['Nama Customer UDN'] || '',
          udnCode1: String(r['UDN Code 1'] || ''),
          udnCode2: String(r['UDN Code 2'] || ''),
          udnCode3: String(r['UDN Code 3'] || ''),
          kabupaten: r['Kabupaten'] || '',
          kecamatan: r['Kecamatan'] || '',
          alamat: r['Alamat'] || '',
          dishub: String(r['Dishub']).toLowerCase() === 'yes' || r['Dishub'] === true,
          rak50cm: String(r['Rak 50cm']).toLowerCase() === 'yes',
          rak65cm: String(r['Rak 65cm']).toLowerCase() === 'yes',
          rak75cm: String(r['Rak 75cm']).toLowerCase() === 'yes',
          rakDuaSisi: String(r['Rak Dua Sisi']).toLowerCase() === 'yes',
          rakPack: String(r['Rak Pack']).toLowerCase() === 'yes',
          rakCustome: String(r['Rak Custome']).toLowerCase() === 'yes',
          displayWowAll: String(r['Display Wow All']).toLowerCase() === 'yes',
          biayaDisplayWow: Number(r['Biaya Wow All']) || 0,
          displayWowHilo: String(r['Display Wow Hilo']).toLowerCase() === 'yes',
          biayaDisplayWowHilo: Number(r['Biaya Wow Hilo']) || 0,
          namaMds: r['Nama MDS'] || '',
          pic: r['PIC'] || currentUser?.namaPic || '',
          status: 'Active' as const,
          notes: r['Notes'] || '',
        }));

        const res = await bulkImportMappings(itemsToImport);
        setImportStatus(`Berhasil mengimpor ${res.successCount} data mapping baru!`);
        setTimeout(() => setImportStatus(null), 4000);
      } catch (err: any) {
        alert('Gagal membaca file: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="bg-white p-4 lg:p-5 rounded-2xl shadow-xs border border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Mapping Klasifikasi &amp; POSM Outlet
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pemetaan kode outlet cross-distributor (BSP &amp; UDN), klasifikasi, sarana rak &amp; display wow
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleOpenAdd}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Mapping Baru</span>
            </button>

            <button
              onClick={handleExport}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel</span>
            </button>

            <label className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Bulk Import</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {importStatus && (
          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{importStatus}</span>
          </div>
        )}

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 pt-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Cari kode/nama/MDS..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <select
              value={filterDepo}
              onChange={(e) => setFilterDepo(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">Semua Depo BSP ({depoOptions.length})</option>
              {depoOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={filterRing}
              onChange={(e) => setFilterRing(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">Semua Ring</option>
              <option value="Ring 1">Ring 1</option>
              <option value="Ring 2">Ring 2</option>
              <option value="Ring 3">Ring 3</option>
              <option value="Ring 4">Ring 4</option>
            </select>
          </div>

          <div>
            <select
              value={filterPosm}
              onChange={(e) => setFilterPosm(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">Semua Status POSM</option>
              <option value="dishub">Memiliki Dishub</option>
              <option value="rak">Memiliki Rak Display</option>
              <option value="wow">Memiliki Display Wow</option>
            </select>
          </div>

          <div>
            <select
              value={filterMds}
              onChange={(e) => setFilterMds(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">Semua Petugas MDS</option>
              {mdsOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Mappings Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-800">
            Daftar Mapping Outlet &amp; Sarana POSM ({filteredMappings.length} Terdata)
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                <th className="py-3 px-3">Kode SO Group Area</th>
                <th className="py-3 px-3">Nama Group &amp; Wilayah</th>
                <th className="py-3 px-3 text-center">Klasifikasi</th>
                <th className="py-3 px-3">Kode BSP (1/2/3)</th>
                <th className="py-3 px-3">Kode UDN (1/2/3)</th>
                <th className="py-3 px-3 text-center">Sarana POSM</th>
                <th className="py-3 px-3 text-center">Display Wow</th>
                <th className="py-3 px-3 text-center">MDS &amp; PIC</th>
                <th className="py-3 px-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMappings.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-slate-400">
                    Belum ada data mapping yang sesuai. Klik "Tambah Mapping Baru" untuk membuat.
                  </td>
                </tr>
              ) : (
                filteredMappings.map((m) => {
                  const hasAnyRak =
                    m.rak50cm ||
                    m.rak65cm ||
                    m.rak75cm ||
                    m.rakDuaSisi ||
                    m.rakPack ||
                    m.rakCustome;

                  return (
                    <tr key={m.mappingId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {m.customerSoGroupAreaCode}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900">{m.customerSoGroupArea}</div>
                        <div className="text-[11px] text-slate-400">
                          {m.kecamatan}, {m.kabupaten}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-md ${
                            m.klasifikasiOutlet === 'Ring 1'
                              ? 'bg-emerald-100 text-emerald-800'
                              : m.klasifikasiOutlet === 'Ring 2'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {m.klasifikasiOutlet}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        {m.bspCode1 ? (
                          <div>
                            <div className="font-semibold text-slate-800">{m.namaCustomerBsp}</div>
                            <div className="text-[11px] font-mono text-slate-500">
                              {m.bspCode1}
                              {m.bspCode2 ? `, ${m.bspCode2}` : ''}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Tidak ada</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {m.udnCode1 ? (
                          <div>
                            <div className="font-semibold text-slate-800">{m.namaCustomerUdn}</div>
                            <div className="text-[11px] font-mono text-slate-500">
                              {m.udnCode1}
                              {m.udnCode2 ? `, ${m.udnCode2}` : ''}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Tidak ada</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex flex-wrap gap-1 justify-center max-w-[140px] mx-auto">
                          {m.dishub && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700">
                              Dishub
                            </span>
                          )}
                          {m.rak50cm && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700">
                              Rak 50
                            </span>
                          )}
                          {m.rak65cm && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700">
                              Rak 65
                            </span>
                          )}
                          {m.rak75cm && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700">
                              Rak 75
                            </span>
                          )}
                          {m.rakDuaSisi && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700">
                              2 Sisi
                            </span>
                          )}
                          {m.rakPack && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700">
                              Pack
                            </span>
                          )}
                          {m.rakCustome && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-purple-50 text-purple-700">
                              Custom
                            </span>
                          )}
                          {!m.dishub && !hasAnyRak && (
                            <span className="text-slate-400 text-[11px]">-</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {m.displayWowAll || m.displayWowHilo ? (
                          <div className="text-[11px]">
                            {m.displayWowAll && (
                              <div className="font-semibold text-amber-700">
                                Wow All (Rp {m.biayaDisplayWow.toLocaleString('id-ID')})
                              </div>
                            )}
                            {m.displayWowHilo && (
                              <div className="font-semibold text-emerald-700">
                                Wow Hilo (Rp {m.biayaDisplayWowHilo.toLocaleString('id-ID')})
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">-</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="font-semibold text-slate-800">{m.namaMds || '-'}</div>
                        <div className="text-[10px] text-slate-400">PIC: {m.pic || '-'}</div>
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(m)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="Edit Mapping"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(m.mappingId, m.customerSoGroupArea)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Hapus Mapping"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* WIZARD MODAL (TAMBAH / EDIT MAPPING) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-7 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    {editingMappingId ? 'Edit Data Mapping Outlet' : 'Wizard Pairing & Mapping Outlet'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Pencocokan nama &amp; koordinat antar distributor dengan auto-generate kode
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stepper bar (only for new mapping) */}
            {!editingMappingId && (
              <div className="flex items-center justify-between mt-4 mb-6 px-4">
                {[
                  { step: 1, label: '1. Pilih Toko Utama' },
                  { step: 2, label: '2. Rekomendasi Pairing' },
                  { step: 3, label: '3. Detail & Kode' },
                  { step: 4, label: '4. POSM & MDS' },
                ].map((s) => (
                  <div key={s.step} className="flex items-center gap-2">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        wizardStep === s.step
                          ? 'bg-indigo-600 text-white'
                          : wizardStep > s.step
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {wizardStep > s.step ? '✓' : s.step}
                    </span>
                    <span
                      className={`text-xs hidden sm:inline ${
                        wizardStep === s.step ? 'font-bold text-slate-900' : 'text-slate-400'
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {formError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitForm} className="space-y-4">
              {/* STEP 1: PILIH OUTLET UTAMA */}
              {wizardStep === 1 && !editingMappingId && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">
                      Pilih Distributor Asal Outlet Utama:
                    </label>
                    <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
                      {(['BSP', 'UDN'] as const).map((dist) => (
                        <button
                          key={dist}
                          type="button"
                          onClick={() => setPrimaryDist(dist)}
                          className={`px-4 py-1.5 rounded-lg transition-all ${
                            primaryDist === dist
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {dist}
                        </button>
                      ))}
                    </div>
                  </div>

                  <p className="text-xs text-slate-500">
                    Pilih toko dari data Performance distributor <strong>{primaryDist}</strong> yang ingin dipetakan:
                  </p>

                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-2xl">
                    {performance
                      .filter((p) => p.dist === primaryDist)
                      .map((p) => (
                        <div
                          key={p.kodeCustNfiGroup}
                          onClick={() => handleSelectPrimaryOutlet(p)}
                          className="p-3 hover:bg-indigo-50/50 cursor-pointer flex items-center justify-between transition-colors group"
                        >
                          <div>
                            <div className="font-bold text-xs text-slate-900 group-hover:text-indigo-600">
                              {p.namaCustomerBaru}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {p.kodeCustNfiGroup} • {p.kecamatan}, {p.kabupaten} ({p.depo})
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                              {p.calculatedRing}
                            </span>
                            <div className="text-[10px] text-slate-400 mt-1">
                              Omset: Rp {p.omset2026.toLocaleString('id-ID')}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* STEP 2: REKOMENDASI CANDIDATE PAIRING */}
              {wizardStep === 2 && !editingMappingId && selectedPrimaryOutlet && (
                <div className="space-y-4">
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                    <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block mb-1">
                      Outlet Utama ({selectedPrimaryOutlet.dist})
                    </span>
                    <p className="font-bold text-sm text-slate-900">
                      {selectedPrimaryOutlet.namaCustomerBaru}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {selectedPrimaryOutlet.alamat} • {selectedPrimaryOutlet.kecamatan},{' '}
                      {selectedPrimaryOutlet.kabupaten}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      <span>Rekomendasi Top 5 Pasangan dari {primaryDist === 'BSP' ? 'UDN' : 'BSP'}</span>
                      <Tooltip
                        title="Algoritma Pencocokan"
                        content="60% kemiripan nama (fuzzy matching) + 40% kedekatan lokasi geospasial (formula Haversine)."
                      />
                    </h4>
                    <button
                      type="button"
                      onClick={handleSelectOneSided}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold underline"
                    >
                      Tidak ada pasangan (1-sided)
                    </button>
                  </div>

                  <div className="space-y-2.5 max-h-72 overflow-y-auto">
                    {matchingCandidates.map((cand, idx) => (
                      <div
                        key={cand.outlet.kodeCustNfiGroup}
                        onClick={() => handleSelectCandidate(cand)}
                        className="p-3.5 rounded-2xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/30 cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-slate-100 group-hover:bg-indigo-100 text-xs font-bold flex items-center justify-center text-slate-700 group-hover:text-indigo-700">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-xs text-slate-900 group-hover:text-indigo-600">
                              {cand.outlet.namaCustomerBaru}
                            </span>
                            <span className="text-[11px] font-mono text-slate-400">
                              ({cand.outlet.kodeCustNfiGroup})
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-500 pl-7">
                            {cand.outlet.alamat} • {cand.outlet.kecamatan}
                          </p>

                          {/* Word matching comparison badges */}
                          <div className="pl-7 flex flex-wrap gap-1 pt-1">
                            {cand.matchedWords.map((w: string) => (
                              <span
                                key={w}
                                className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-semibold"
                              >
                                {w}
                              </span>
                            ))}
                            {cand.distanceMeters !== null && cand.distanceMeters !== undefined && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 font-semibold flex items-center gap-1">
                                <MapPin className="w-2.5 h-2.5" />
                                {cand.distanceMeters < 1000
                                  ? `${Math.round(cand.distanceMeters)} meter`
                                  : `${(cand.distanceMeters / 1000).toFixed(1)} km`}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center pl-7 sm:pl-0 shrink-0">
                          <span
                            className={`text-xs font-bold px-2.5 py-1 rounded-xl ${
                              cand.score >= 75
                                ? 'bg-emerald-100 text-emerald-800'
                                : cand.score >= 50
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            Skor: {cand.score.toFixed(0)}%
                          </span>
                          <span className="text-[10px] text-slate-400 mt-1">
                            {cand.nameScore}% Nama • {cand.distScore}% Jarak
                          </span>
                        </div>
                      </div>
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
                      onClick={handleSelectOneSided}
                      className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
                    >
                      Lewati (Tanpa Pasangan) →
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: DETAIL OUTLET & KODE OTOMATIS */}
              {(wizardStep === 3 || editingMappingId) && (
                <div className="space-y-4">
                  {/* Real-time Code Generation Banner */}
                  <div className="p-4 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-2xl border border-indigo-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                          Otomatisasi Customer SO Group Area Code
                        </span>
                        <div className="text-base sm:text-lg font-mono font-bold text-slate-900 mt-0.5">
                          {generatedCode}
                        </div>
                      </div>
                      <span className="text-xs px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-semibold">
                        Format: JWTM-{klasifikasi.replace('Ring ', 'R')}-XX-NAMA
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Nama Customer SO Group Area *
                      </label>
                      <input
                        type="text"
                        required
                        value={soGroupAreaName}
                        onChange={(e) => setSoGroupAreaName(e.target.value)}
                        placeholder="Contoh: TOKO BAROKAH JAYA"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Klasifikasi Outlet *
                      </label>
                      <select
                        value={klasifikasi}
                        onChange={(e) => setKlasifikasi(e.target.value as any)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="Ring 1">Ring 1 (Mapping Active)</option>
                        <option value="Ring 2">Ring 2 (Pareto ≤80% / Produktif)</option>
                        <option value="Ring 3">Ring 3 (Avg Sales ≥ 100rb)</option>
                        <option value="Ring 4">Ring 4 (Avg Sales &lt; 100rb)</option>
                      </select>
                    </div>
                  </div>

                  {/* Distributor BSP Fields */}
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                    <span className="text-xs font-bold text-slate-800 block">
                      Data Distributor BSP
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-0.5">Nama di BSP</label>
                        <input
                          type="text"
                          value={namaCustomerBsp}
                          onChange={(e) => setNamaCustomerBsp(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-0.5">Depo BSP</label>
                        <input
                          type="text"
                          value={depoBsp}
                          onChange={(e) => setDepoBsp(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-0.5">BSP Code 1</label>
                        <input
                          type="text"
                          value={bspCode1}
                          onChange={(e) => setBspCode1(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Distributor UDN Fields */}
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                    <span className="text-xs font-bold text-slate-800 block">
                      Data Distributor UDN
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-0.5">Nama di UDN</label>
                        <input
                          type="text"
                          value={namaCustomerUdn}
                          onChange={(e) => setNamaCustomerUdn(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-0.5">Sub Dist UDN</label>
                        <input
                          type="text"
                          value={subDistUdn}
                          onChange={(e) => setSubDistUdn(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-0.5">UDN Code 1</label>
                        <input
                          type="text"
                          value={udnCode1}
                          onChange={(e) => setUdnCode1(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Geolocation & Address */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Kabupaten / Kota
                      </label>
                      <input
                        type="text"
                        value={kabupaten}
                        onChange={(e) => setKabupaten(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Kecamatan
                      </label>
                      <input
                        type="text"
                        value={kecamatan}
                        onChange={(e) => setKecamatan(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Alamat</label>
                    <input
                      type="text"
                      value={alamat}
                      onChange={(e) => setAlamat(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900"
                    />
                  </div>

                  {!editingMappingId && (
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
                        onClick={() => setWizardStep(4)}
                        className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl"
                      >
                        Lanjut ke POSM &amp; MDS →
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 4: POSM & MDS ASSIGNMENT */}
              {(wizardStep === 4 || editingMappingId) && (
                <div className="space-y-4">
                  {/* Sarana Rak POSM Toggles */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                    <span className="text-xs font-bold text-slate-800 block">
                      Sarana Display &amp; Rak POSM
                    </span>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {[
                        { label: 'Dishub', checked: dishub, set: setDishub },
                        { label: 'Rak 50 cm', checked: rak50cm, set: setRak50cm },
                        { label: 'Rak 65 cm', checked: rak65cm, set: setRak65cm },
                        { label: 'Rak 75 cm', checked: rak75cm, set: setRak75cm },
                        { label: 'Rak Dua Sisi', checked: rakDuaSisi, set: setRakDuaSisi },
                        { label: 'Rak Pack', checked: rakPack, set: setRakPack },
                        { label: 'Rak Custome', checked: rakCustome, set: setRakCustome },
                      ].map((item) => (
                        <label
                          key={item.label}
                          className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-indigo-400"
                        >
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={(e) => item.set(e.target.checked)}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-xs font-medium text-slate-700">{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Display Wow Section */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                    <span className="text-xs font-bold text-slate-800 block">
                      Program Display Wow
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={displayWowAll}
                            onChange={(e) => setDisplayWowAll(e.target.checked)}
                            className="rounded text-indigo-600"
                          />
                          <span className="text-xs font-bold text-slate-800">Display Wow All</span>
                        </label>
                        {displayWowAll && (
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-0.5">
                              Biaya Display Wow (Rcg)
                            </label>
                            <input
                              type="number"
                              value={biayaDisplayWow}
                              onChange={(e) => setBiayaDisplayWow(Number(e.target.value) || 0)}
                              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                            />
                          </div>
                        )}
                      </div>

                      <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={displayWowHilo}
                            onChange={(e) => setDisplayWowHilo(e.target.checked)}
                            className="rounded text-indigo-600"
                          />
                          <span className="text-xs font-bold text-slate-800">Display Wow Hilo</span>
                        </label>
                        {displayWowHilo && (
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-0.5">
                              Biaya Display Wow Hilo (Rcg)
                            </label>
                            <input
                              type="number"
                              value={biayaDisplayWowHilo}
                              onChange={(e) => setBiayaDisplayWowHilo(Number(e.target.value) || 0)}
                              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* MDS & PIC Assignment */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Petugas MDS Penanggung Jawab
                      </label>
                      <select
                        value={namaMds}
                        onChange={(e) => setNamaMds(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">Pilih Petugas MDS...</option>
                        {userMds.map((m) => (
                          <option key={m.namaMds} value={m.namaMds}>
                            {m.namaMds} ({m.area})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        PIC Distributor
                      </label>
                      <input
                        type="text"
                        value={picName}
                        onChange={(e) => setPicName(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="pt-3 flex justify-between items-center border-t border-slate-100">
                    {!editingMappingId && (
                      <button
                        type="button"
                        onClick={() => setWizardStep(3)}
                        className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                      >
                        ← Kembali
                      </button>
                    )}
                    <div className="flex gap-2 ml-auto">
                      <button
                        type="button"
                        onClick={() => setIsModalOpen(false)}
                        className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        className="px-6 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors"
                      >
                        {editingMappingId ? 'Simpan Perubahan' : 'Selesaikan Mapping'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
};