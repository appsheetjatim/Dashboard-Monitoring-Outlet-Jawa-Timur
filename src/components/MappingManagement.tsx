import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { OutletMapping, OutletPerformance } from '../types';
import { generateCustomerSoGroupAreaCode } from '../services/outletClassification';
import { findCandidateMatches, CandidateMatch, calculateNameSimilarity } from '../services/fuzzyMatch';
import { Tooltip } from './Tooltip';
import { Toast, ToastState } from './Toast';
import { MultiSelectDropdown } from './MultiSelectDropdown';
import { PageSizeSelector } from './PageSizeSelector';
import {
  Plus,
  Edit2,
  Search,
  Filter,
  Download,
  Upload,
  X,
  AlertCircle,
  Sparkles,
  Layers,
  MapPin,
  CheckCircle2,
  FileDown,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import * as XLSX from 'xlsx';

// Search-and-select input backed by Performance data — used for the
// "Nama di BSP/UDN" and "Code 2/3" fields in the Add/Edit Mapping form.
// Defined at MODULE level (not nested inside MappingManagement) so its own
// query/dropdown state survives every keystroke elsewhere in that very long
// form — a component defined inside another component's render body gets a
// new identity on every parent re-render, which would silently reset this
// field's local state constantly.
const OutletSearchField: React.FC<{
  label: string;
  placeholder?: string;
  displayValue: string;
  pool: OutletPerformance[];
  onSelect: (p: OutletPerformance) => void;
  mono?: boolean;
  optional?: boolean;
}> = ({ label, placeholder, displayValue, pool, onSelect, mono, optional }) => {
  const [query, setQuery] = useState(displayValue);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    setQuery(displayValue);
  }, [displayValue]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return pool
      .filter(
        (p) =>
          p.namaCustomerBaru.toLowerCase().includes(q) || p.kodeCustNfiGroup.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [pool, query]);

  return (
    <div className="relative">
      <label className="block text-[11px] text-slate-600 mb-0.5">
        {label} {optional && <span className="text-slate-400">(opsional)</span>}
      </label>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setShowSuggestions(true);
        }}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        placeholder={placeholder}
        className={`w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs ${
          mono ? 'font-mono' : ''
        }`}
      />
      {showSuggestions && results.length > 0 && (
        <div className="absolute z-30 mt-1 w-80 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg py-1 text-left">
          {results.map((p) => (
            <button
              type="button"
              key={p.kodeCustNfiGroup}
              onMouseDown={() => {
                onSelect(p);
                setShowSuggestions(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-indigo-50 border-b border-slate-50 last:border-0"
            >
              <p className="font-bold text-xs text-slate-900 truncate">{p.namaCustomerBaru}</p>
              <p className="text-[10px] font-mono text-slate-400 truncate">{p.kodeCustNfiGroup}</p>
              <p className="text-[10px] text-slate-500 truncate">
                {p.alamat} • {p.kecamatan}, {p.kabupaten}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {p.sku2026} SKU • PA {p.avgPa2026.toFixed(1)} ({p.pa2026.toFixed(0)}%) • Avg Sales: Rp{' '}
                {p.avgSales2026.toLocaleString('id-ID')}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const MappingManagement: React.FC = () => {
  const {
    currentUser,
    mappings,
    performance,
    userMds,
    accessibleMds,
    createMapping,
    updateMapping,
    bulkImportMappings,
    accessibleDistributors,
    accessibleDepo,
  } = useApp();

  const isManager = currentUser?.role === 'Manager';

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDepo, setFilterDepo] = useState<string[]>([]);
  const [filterRing, setFilterRing] = useState<string[]>([]);
  const [filterPosm, setFilterPosm] = useState<string[]>([]);
  const [filterMds, setFilterMds] = useState<string[]>([]);
  const [filterKabupaten, setFilterKabupaten] = useState<string[]>([]);
  const [filterKecamatan, setFilterKecamatan] = useState<string[]>([]);

  // Modal Wizard State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMappingId, setEditingMappingId] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);

  // Form Fields
  const [primaryDist, setPrimaryDist] = useState<'BSP' | 'UDN'>('BSP');
  const [selectedPrimaryOutlet, setSelectedPrimaryOutlet] = useState<OutletPerformance | null>(null);
  const [wizardSearch, setWizardSearch] = useState('');
  const [wizardSubDist, setWizardSubDist] = useState('ALL');
  const [wizardDepo, setWizardDepo] = useState('ALL');
  const [wizardKabupaten, setWizardKabupaten] = useState('ALL');
  const [wizardKecamatan, setWizardKecamatan] = useState('ALL');
  const [showManualPairSearch, setShowManualPairSearch] = useState(false);
  const [manualPairSearch, setManualPairSearch] = useState('');
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
  const [toast, setToast] = useState<ToastState | null>(null);

  // Bulk import state
  const [importResult, setImportResult] = useState<{
    successCount: number;
    failed: { row: number; reason: string }[];
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);

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

      if (filterDepo.length > 0 && !filterDepo.includes(m.depoBsp) && !filterDepo.includes(m.subDistUdn)) return false;
      if (filterRing.length > 0 && !filterRing.includes(m.klasifikasiOutlet)) return false;
      if (filterMds.length > 0 && !filterMds.includes(m.namaMds)) return false;
      if (filterKabupaten.length > 0 && !filterKabupaten.includes(m.kabupaten)) return false;
      if (filterKecamatan.length > 0 && !filterKecamatan.includes(m.kecamatan)) return false;

      if (filterPosm.length > 0) {
        const hasDishub = filterPosm.includes('Memiliki Dishub') && m.dishub;
        const hasRak =
          filterPosm.includes('Memiliki Rak Display') &&
          (m.rak50cm || m.rak65cm || m.rak75cm || m.rakDuaSisi || m.rakPack || m.rakCustome);
        const hasWow =
          filterPosm.includes('Memiliki Display Wow') && (m.displayWowAll || m.displayWowHilo);
        if (!hasDishub && !hasRak && !hasWow) return false;
      }

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
  }, [
    mappings,
    isManager,
    accessibleDistributors,
    accessibleDepo,
    filterDepo,
    filterRing,
    filterMds,
    filterKabupaten,
    filterKecamatan,
    filterPosm,
    searchQuery,
  ]);

  // Sorting for the Daftar Mapping Outlet table
  type MapSortField = 'ring' | 'name' | 'code' | 'bsp' | 'udn' | 'mds';
  const [mapSortField, setMapSortField] = useState<MapSortField>('name');
  const [mapSortDirection, setMapSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleMapSort = (field: MapSortField) => {
    if (mapSortField === field) {
      setMapSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setMapSortField(field);
      setMapSortDirection('asc');
    }
  };

  const sortedMappings = useMemo(() => {
    const dir = mapSortDirection === 'asc' ? 1 : -1;
    return [...filteredMappings].sort((a, b) => {
      switch (mapSortField) {
        case 'ring':
          return a.klasifikasiOutlet.localeCompare(b.klasifikasiOutlet) * dir;
        case 'code':
          return a.customerSoGroupAreaCode.localeCompare(b.customerSoGroupAreaCode) * dir;
        case 'bsp':
          return (a.namaCustomerBsp || '').localeCompare(b.namaCustomerBsp || '') * dir;
        case 'udn':
          return (a.namaCustomerUdn || '').localeCompare(b.namaCustomerUdn || '') * dir;
        case 'mds':
          return (a.namaMds || '').localeCompare(b.namaMds || '') * dir;
        case 'name':
        default:
          return a.customerSoGroupArea.localeCompare(b.customerSoGroupArea) * dir;
      }
    });
  }, [filteredMappings, mapSortField, mapSortDirection]);

  // Pagination for Daftar Mapping Outlet table — selectable page size (10/25/50)
  const [mappingPageSize, setMappingPageSize] = useState(50);
  const [mappingPage, setMappingPage] = useState(1);
  const mappingTotalPages = Math.max(1, Math.ceil(sortedMappings.length / mappingPageSize));
  const paginatedMappings = useMemo(() => {
    const start = (mappingPage - 1) * mappingPageSize;
    return sortedMappings.slice(start, start + mappingPageSize);
  }, [sortedMappings, mappingPage, mappingPageSize]);

  // Land back on page 1 when the page size changes, so we don't end up on
  // a now out-of-range page.
  useEffect(() => {
    setMappingPage(1);
  }, [mappingPageSize]);

  // Reset to page 1 whenever filters, search, or sort change
  useEffect(() => {
    setMappingPage(1);
  }, [filteredMappings, mapSortField, mapSortDirection]);

  const SortIcon: React.FC<{ field: MapSortField }> = ({ field }) => {
    if (mapSortField !== field) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
    return mapSortDirection === 'asc' ? (
      <ChevronUp className="w-3 h-3 text-indigo-600" />
    ) : (
      <ChevronDown className="w-3 h-3 text-indigo-600" />
    );
  };

  // Unique options for filter
  // Access-restricted base used to derive filter dropdown options, so a
  // Supervisor never sees Depo/Kabupaten/Kecamatan options outside their area.
  const accessRestrictedMappings = useMemo(() => {
    if (isManager || accessibleDepo.length === 0) return mappings;
    return mappings.filter(
      (m) => accessibleDepo.includes(m.depoBsp) || accessibleDepo.includes(m.subDistUdn)
    );
  }, [mappings, isManager, accessibleDepo]);

  const depoOptions = useMemo(() => {
    const bsp = accessRestrictedMappings.map((m) => m.depoBsp);
    const udn = accessRestrictedMappings.map((m) => m.subDistUdn);
    return Array.from(new Set([...bsp, ...udn].filter(Boolean))).sort();
  }, [accessRestrictedMappings]);

  // Cascading: Kabupaten options narrow when a Depo is selected (but not by
  // Kabupaten itself, so picking one doesn't shrink its own option list).
  const depoFilteredMappingsPool = useMemo(() => {
    if (filterDepo.length === 0) return accessRestrictedMappings;
    return accessRestrictedMappings.filter(
      (m) => filterDepo.includes(m.depoBsp) || filterDepo.includes(m.subDistUdn)
    );
  }, [accessRestrictedMappings, filterDepo]);

  const kabupatenOptions = useMemo(() => {
    return Array.from(new Set(depoFilteredMappingsPool.map((m) => m.kabupaten).filter(Boolean))).sort();
  }, [depoFilteredMappingsPool]);

  // Cascading: Kecamatan options narrow further when a Kabupaten is also
  // selected, on top of the Depo narrowing above.
  const kecamatanOptions = useMemo(() => {
    const pool =
      filterKabupaten.length > 0
        ? depoFilteredMappingsPool.filter((m) => filterKabupaten.includes(m.kabupaten))
        : depoFilteredMappingsPool;
    return Array.from(new Set(pool.map((m) => m.kecamatan).filter(Boolean))).sort();
  }, [depoFilteredMappingsPool, filterKabupaten]);

  const mdsOptions = useMemo(() => {
    if (!isManager) return Array.from(new Set(accessibleMds.map((m) => m.namaMds).filter(Boolean))).sort();
    return Array.from(new Set(mappings.map((m) => m.namaMds).filter(Boolean))).sort();
  }, [mappings, isManager, accessibleMds]);

  // Wizard Step 1: base pool already restricted to the logged-in PIC's Depo access
  // All codes (BSP + UDN, Code 1/2/3) already used by an active mapping —
  // these outlets are excluded from Step 1's picker since they're already mapped.
  const allMappedCodes = useMemo(() => {
    const set = new Set<string>();
    mappings.forEach((m) => {
      if (m.status !== 'Active') return;
      [m.bspCode1, m.bspCode2, m.bspCode3, m.udnCode1, m.udnCode2, m.udnCode3].forEach(
        (c) => c && set.add(c)
      );
    });
    return set;
  }, [mappings]);

  const wizardBasePool = useMemo(() => {
    let pool = performance.filter((p) => p.dist === primaryDist && !allMappedCodes.has(p.kodeCustNfiGroup));
    if (!isManager && accessibleDepo.length > 0) {
      pool = pool.filter((p) => accessibleDepo.includes(p.depo));
    }
    return pool;
  }, [performance, primaryDist, isManager, accessibleDepo, allMappedCodes]);

  // Cascading filter dropdown options (Sub Dist -> Depo -> Kabupaten -> Kecamatan)
  const wizardSubDistOptions = useMemo(
    () => Array.from(new Set(wizardBasePool.map((p) => p.subDist).filter(Boolean))).sort(),
    [wizardBasePool]
  );
  const wizardDepoOptions = useMemo(() => {
    const pool = wizardSubDist === 'ALL' ? wizardBasePool : wizardBasePool.filter((p) => p.subDist === wizardSubDist);
    return Array.from(new Set(pool.map((p) => p.depo).filter(Boolean))).sort();
  }, [wizardBasePool, wizardSubDist]);
  const wizardKabupatenOptions = useMemo(() => {
    let pool = wizardSubDist === 'ALL' ? wizardBasePool : wizardBasePool.filter((p) => p.subDist === wizardSubDist);
    pool = wizardDepo === 'ALL' ? pool : pool.filter((p) => p.depo === wizardDepo);
    return Array.from(new Set(pool.map((p) => p.kabupaten).filter(Boolean))).sort();
  }, [wizardBasePool, wizardSubDist, wizardDepo]);
  const wizardKecamatanOptions = useMemo(() => {
    let pool = wizardSubDist === 'ALL' ? wizardBasePool : wizardBasePool.filter((p) => p.subDist === wizardSubDist);
    pool = wizardDepo === 'ALL' ? pool : pool.filter((p) => p.depo === wizardDepo);
    pool = wizardKabupaten === 'ALL' ? pool : pool.filter((p) => p.kabupaten === wizardKabupaten);
    return Array.from(new Set(pool.map((p) => p.kecamatan).filter(Boolean))).sort();
  }, [wizardBasePool, wizardSubDist, wizardDepo, wizardKabupaten]);

  // Final Wizard Step 1 results: access + filters + search, capped for render performance
  const WIZARD_MAX_RESULTS = 100;
  const primaryOutletResults = useMemo(() => {
    let pool = wizardBasePool;
    if (wizardSubDist !== 'ALL') pool = pool.filter((p) => p.subDist === wizardSubDist);
    if (wizardDepo !== 'ALL') pool = pool.filter((p) => p.depo === wizardDepo);
    if (wizardKabupaten !== 'ALL') pool = pool.filter((p) => p.kabupaten === wizardKabupaten);
    if (wizardKecamatan !== 'ALL') pool = pool.filter((p) => p.kecamatan === wizardKecamatan);
    if (wizardSearch.trim()) {
      const q = wizardSearch.trim().toLowerCase();
      pool = pool.filter(
        (p) => p.namaCustomerBaru.toLowerCase().includes(q) || p.kodeCustNfiGroup.toLowerCase().includes(q)
      );
    }
    return pool;
  }, [wizardBasePool, wizardSubDist, wizardDepo, wizardKabupaten, wizardKecamatan, wizardSearch]);

  const primaryOutletDisplayed = useMemo(
    () => primaryOutletResults.slice(0, WIZARD_MAX_RESULTS),
    [primaryOutletResults]
  );

  // Reset dependent filters whenever a parent filter changes (Dist -> Sub Dist -> Depo -> Kabupaten -> Kecamatan)
  const handleWizardDistChange = (dist: 'BSP' | 'UDN') => {
    setPrimaryDist(dist);
    setWizardSubDist('ALL');
    setWizardDepo('ALL');
    setWizardKabupaten('ALL');
    setWizardKecamatan('ALL');
    setWizardSearch('');
  };
  const handleWizardSubDistChange = (value: string) => {
    setWizardSubDist(value);
    setWizardDepo('ALL');
    setWizardKabupaten('ALL');
    setWizardKecamatan('ALL');
  };
  const handleWizardDepoChange = (value: string) => {
    setWizardDepo(value);
    setWizardKabupaten('ALL');
    setWizardKecamatan('ALL');
  };
  const handleWizardKabupatenChange = (value: string) => {
    setWizardKabupaten(value);
    setWizardKecamatan('ALL');
  };

  // Candidates for fuzzy cross-distributor matching
  const matchingCandidates = useMemo(() => {
    if (!selectedPrimaryOutlet) return [];
    const targetDist = primaryDist === 'BSP' ? 'UDN' : 'BSP';
    let targetOutlets = performance.filter(
      (p) => p.dist === targetDist && !allMappedCodes.has(p.kodeCustNfiGroup)
    );
    // Restrict candidate pool to the logged-in PIC's accessible Depo — otherwise
    // a Supervisor gets pairing suggestions from anywhere in Jawa Timur, which
    // also produces geographically nonsensical matches (different cities).
    if (!isManager && accessibleDepo.length > 0) {
      targetOutlets = targetOutlets.filter((p) => accessibleDepo.includes(p.depo));
    }
    return findCandidateMatches(selectedPrimaryOutlet, targetOutlets);
  }, [selectedPrimaryOutlet, primaryDist, performance, isManager, accessibleDepo, allMappedCodes]);

  // Manual pairing search: same access-restricted pool as the recommendation
  // engine, but user-driven by free text — for cases where the top-5 auto
  // recommendation doesn't contain the correct match.
  const MANUAL_PAIR_MAX_RESULTS = 20;
  const manualPairResults = useMemo(() => {
    if (!selectedPrimaryOutlet || !manualPairSearch.trim()) return [];
    const targetDist = primaryDist === 'BSP' ? 'UDN' : 'BSP';
    let pool = performance.filter(
      (p) => p.dist === targetDist && !allMappedCodes.has(p.kodeCustNfiGroup)
    );
    if (!isManager && accessibleDepo.length > 0) {
      pool = pool.filter((p) => accessibleDepo.includes(p.depo));
    }
    const q = manualPairSearch.trim().toLowerCase();
    pool = pool.filter(
      (p) => p.namaCustomerBaru.toLowerCase().includes(q) || p.kodeCustNfiGroup.toLowerCase().includes(q)
    );
    return pool.slice(0, MANUAL_PAIR_MAX_RESULTS);
  }, [selectedPrimaryOutlet, primaryDist, performance, isManager, accessibleDepo, manualPairSearch, allMappedCodes]);

  // Handle picking a pairing manually (bypassing the top-5 algorithm)
  const handleSelectManualPair = (outlet: OutletPerformance) => {
    setSelectedCandidate(null);
    setIsOneSided(false);
    if (primaryDist === 'BSP') {
      setUdnCode1(outlet.kodeCustNfiGroup);
      setNamaCustomerUdn(outlet.namaCustomerBaru);
      setSubDistUdn(outlet.subDist);
    } else {
      setBspCode1(outlet.kodeCustNfiGroup);
      setNamaCustomerBsp(outlet.namaCustomerBaru);
      setDepoBsp(outlet.depo);
      setSubDistBsp(outlet.subDist);
    }
    setWizardStep(3);
  };

  // Detect possible duplicate codes within the SAME distributor + depo/subdist
  // (same physical store registered under a different code, e.g. after a tax
  // ID change) — suggested only, never auto-filled, and excludes codes already
  // used in this form or in any other active mapping.
  const codesUsedElsewhere = useMemo(() => {
    const set = new Set<string>();
    mappings.forEach((m) => {
      if (m.mappingId === editingMappingId) return;
      [m.bspCode1, m.bspCode2, m.bspCode3, m.udnCode1, m.udnCode2, m.udnCode3].forEach(
        (c) => c && set.add(c)
      );
    });
    return set;
  }, [mappings, editingMappingId]);

  // Search pools for the BSP/UDN name & code search fields — outlets whose
  // codes are already used elsewhere are excluded so search results only
  // surface outlets that are actually still available to map, and (like
  // every other outlet picker in this app) a Supervisor only sees outlets
  // within their own accessible Depo.
  const bspSearchPool = useMemo(() => {
    let pool = performance.filter((p) => p.dist === 'BSP' && !codesUsedElsewhere.has(p.kodeCustNfiGroup));
    if (!isManager && accessibleDepo.length > 0) {
      pool = pool.filter((p) => accessibleDepo.includes(p.depo));
    }
    return pool;
  }, [performance, codesUsedElsewhere, isManager, accessibleDepo]);

  const udnSearchPool = useMemo(() => {
    let pool = performance.filter((p) => p.dist === 'UDN' && !codesUsedElsewhere.has(p.kodeCustNfiGroup));
    if (!isManager && accessibleDepo.length > 0) {
      pool = pool.filter((p) => accessibleDepo.includes(p.depo));
    }
    return pool;
  }, [performance, codesUsedElsewhere, isManager, accessibleDepo]);

  const bspDuplicateSuggestions = useMemo(() => {
    if (!namaCustomerBsp.trim() || !depoBsp) return [];
    const usedHere = new Set([bspCode1, bspCode2, bspCode3].filter(Boolean));
    return performance
      .filter(
        (p) =>
          p.dist === 'BSP' &&
          p.depo === depoBsp &&
          !usedHere.has(p.kodeCustNfiGroup) &&
          !codesUsedElsewhere.has(p.kodeCustNfiGroup)
      )
      .map((p) => ({ outlet: p, score: calculateNameSimilarity(namaCustomerBsp, p.namaCustomerBaru).score }))
      .filter((x) => x.score >= 60)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [namaCustomerBsp, depoBsp, bspCode1, bspCode2, bspCode3, performance, codesUsedElsewhere]);

  const udnDuplicateSuggestions = useMemo(() => {
    if (!namaCustomerUdn.trim() || !subDistUdn) return [];
    const usedHere = new Set([udnCode1, udnCode2, udnCode3].filter(Boolean));
    return performance
      .filter(
        (p) =>
          p.dist === 'UDN' &&
          p.subDist === subDistUdn &&
          !usedHere.has(p.kodeCustNfiGroup) &&
          !codesUsedElsewhere.has(p.kodeCustNfiGroup)
      )
      .map((p) => ({ outlet: p, score: calculateNameSimilarity(namaCustomerUdn, p.namaCustomerBaru).score }))
      .filter((x) => x.score >= 60)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [namaCustomerUdn, subDistUdn, udnCode1, udnCode2, udnCode3, performance, codesUsedElsewhere]);

  const handleAddBspCode = (code: string) => {
    if (!bspCode2) setBspCode2(code);
    else if (!bspCode3) setBspCode3(code);
  };
  const handleAddUdnCode = (code: string) => {
    if (!udnCode2) setUdnCode2(code);
    else if (!udnCode3) setUdnCode3(code);
  };

  // Generated Real-time Customer SO Group Area Code
  const generatedCode = useMemo(() => {
    return generateCustomerSoGroupAreaCode(soGroupAreaName, klasifikasi, bspCode1 || udnCode1);
  }, [klasifikasi, soGroupAreaName, bspCode1, udnCode1]);

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
    setShowManualPairSearch(false);
    setManualPairSearch('');
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

    // Outlets outside Ring 1 don't need POSM/Display Wow mapping — only MDS
    // assignment matters. Force these fields to their empty state regardless
    // of leftover UI state, so no stale POSM data is saved for non-Ring-1 outlets.
    const isRing1Submit = klasifikasi === 'Ring 1';

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
      dishub: isRing1Submit ? dishub : false,
      rak50cm: isRing1Submit ? rak50cm : false,
      rak65cm: isRing1Submit ? rak65cm : false,
      rak75cm: isRing1Submit ? rak75cm : false,
      rakDuaSisi: isRing1Submit ? rakDuaSisi : false,
      rakPack: isRing1Submit ? rakPack : false,
      rakCustome: isRing1Submit ? rakCustome : false,
      displayWowAll: isRing1Submit ? displayWowAll : false,
      biayaDisplayWow: isRing1Submit && displayWowAll ? biayaDisplayWow : 0,
      displayWowHilo: isRing1Submit ? displayWowHilo : false,
      biayaDisplayWowHilo: isRing1Submit && displayWowHilo ? biayaDisplayWowHilo : 0,
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
        setToast({ message: `Mapping "${soGroupAreaName.trim()}" berhasil diperbarui.`, type: 'success' });
      } else {
        await createMapping(payload);
        setToast({ message: `Mapping "${soGroupAreaName.trim()}" berhasil ditambahkan.`, type: 'success' });
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan mapping.');
      setToast({ message: err.message || 'Gagal menyimpan mapping.', type: 'error' });
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

  // Download a blank Excel template with the correct headers + 1 example row
  const handleDownloadTemplate = () => {
    const exampleRow = {
      'BSP Code 1': 'B200011569.0605.M030',
      'UDN Code 1': 'D200231481.CS024001159',
      'BSP Code 2': '',
      'BSP Code 3': '',
      'UDN Code 2': '',
      'UDN Code 3': '',
      Klasifikasi: 'Ring 1',
      Dishub: 'No',
      'Rak 50cm': 'Yes',
      'Rak 65cm': 'No',
      'Rak 75cm': 'No',
      'Rak Dua Sisi': 'No',
      'Rak Pack': 'No',
      'Rak Custome': 'No',
      'Display Wow All': 'Yes',
      'Biaya Wow All': 4,
      'Display Wow Hilo': 'Yes',
      'Biaya Wow Hilo': 4,
      'Nama MDS': accessibleMds[0]?.namaMds || 'Nama MDS',
      PIC: currentUser?.namaPic || 'Nama PIC',
      Notes: '',
    };
    const ws = XLSX.utils.json_to_sheet([exampleRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template Mapping');
    XLSX.writeFile(wb, 'Template_Bulk_Upload_Mapping.xlsx');
  };

  // Bulk Import handler — looks up descriptive data from Performance by code,
  // validates every row, and skips only the rows that fail (with a reason),
  // rather than aborting the whole batch or importing broken data.
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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

        const VALID_RINGS = ['Ring 1', 'Ring 2', 'Ring 3', 'Ring 4'];
        const parseYesNo = (v: any): boolean | null => {
          const s = String(v ?? '').trim().toLowerCase();
          if (s === 'yes') return true;
          if (s === 'no' || s === '') return false;
          return null; // ambiguous / invalid value
        };

        // Existing codes already used by other active mappings (never duplicate)
        const codesUsedElsewhere = new Set<string>();
        mappings.forEach((m) => {
          [m.bspCode1, m.bspCode2, m.bspCode3, m.udnCode1, m.udnCode2, m.udnCode3].forEach(
            (c) => c && codesUsedElsewhere.add(c)
          );
        });
        // Codes claimed within this same file (prevent intra-file duplicates)
        const codesClaimedInFile = new Set<string>();

        const validItems: Array<Omit<OutletMapping, 'mappingId' | 'mappingDate' | 'lastUpdated'>> = [];
        const failed: { row: number; reason: string }[] = [];

        json.forEach((r, idx) => {
          const rowNum = idx + 2; // +2: header row + 1-indexed
          const bspCode1Raw = String(r['BSP Code 1'] || '').trim();
          const udnCode1Raw = String(r['UDN Code 1'] || '').trim();

          if (!bspCode1Raw && !udnCode1Raw) {
            failed.push({ row: rowNum, reason: 'BSP Code 1 atau UDN Code 1 wajib diisi salah satu.' });
            return;
          }

          let bspOutlet: OutletPerformance | undefined;
          if (bspCode1Raw) {
            bspOutlet = performance.find((p) => p.dist === 'BSP' && p.kodeCustNfiGroup === bspCode1Raw);
            if (!bspOutlet) {
              failed.push({ row: rowNum, reason: `BSP Code 1 "${bspCode1Raw}" tidak ditemukan di data Performance.` });
              return;
            }
          }

          let udnOutlet: OutletPerformance | undefined;
          if (udnCode1Raw) {
            udnOutlet = performance.find((p) => p.dist === 'UDN' && p.kodeCustNfiGroup === udnCode1Raw);
            if (!udnOutlet) {
              failed.push({ row: rowNum, reason: `UDN Code 1 "${udnCode1Raw}" tidak ditemukan di data Performance.` });
              return;
            }
          }

          // Access control: non-Manager can only import into their own Depo
          if (!isManager && accessibleDepo.length > 0) {
            const depoOk =
              (bspOutlet && accessibleDepo.includes(bspOutlet.depo)) ||
              (udnOutlet && accessibleDepo.includes(udnOutlet.depo));
            if (!depoOk) {
              failed.push({ row: rowNum, reason: 'Depo outlet ini di luar akses Anda.' });
              return;
            }
          }

          const klasifikasiRaw = String(r['Klasifikasi'] || '').trim();
          if (!VALID_RINGS.includes(klasifikasiRaw)) {
            failed.push({ row: rowNum, reason: `Klasifikasi "${klasifikasiRaw}" tidak valid — harus Ring 1/2/3/4.` });
            return;
          }
          const klasifikasiVal = klasifikasiRaw as OutletMapping['klasifikasiOutlet'];
          const isRing1Row = klasifikasiVal === 'Ring 1';

          // POSM & Display Wow: mandatory Yes/No only for Ring 1 rows
          let dishub = false, rak50cm = false, rak65cm = false, rak75cm = false;
          let rakDuaSisi = false, rakPack = false, rakCustome = false;
          let displayWowAll = false, displayWowHilo = false;
          let biayaDisplayWow = 0, biayaDisplayWowHilo = 0;

          if (isRing1Row) {
            const posmFields: [string, string][] = [
              ['Dishub', 'Dishub'], ['Rak 50cm', 'Rak 50 cm'], ['Rak 65cm', 'Rak 65 cm'],
              ['Rak 75cm', 'Rak 75 cm'], ['Rak Dua Sisi', 'Rak Dua Sisi'],
              ['Rak Pack', 'Rak Pack'], ['Rak Custome', 'Rak Custome'],
              ['Display Wow All', 'Display Wow All'], ['Display Wow Hilo', 'Display Wow Hilo'],
            ];
            const parsed: Record<string, boolean> = {};
            let posmError = '';
            for (const [col, label] of posmFields) {
              const val = parseYesNo(r[col]);
              if (val === null) {
                posmError = `Kolom "${label}" harus diisi Yes atau No (outlet Ring 1).`;
                break;
              }
              parsed[col] = val;
            }
            if (posmError) {
              failed.push({ row: rowNum, reason: posmError });
              return;
            }
            dishub = parsed['Dishub'];
            rak50cm = parsed['Rak 50cm'];
            rak65cm = parsed['Rak 65cm'];
            rak75cm = parsed['Rak 75cm'];
            rakDuaSisi = parsed['Rak Dua Sisi'];
            rakPack = parsed['Rak Pack'];
            rakCustome = parsed['Rak Custome'];
            displayWowAll = parsed['Display Wow All'];
            displayWowHilo = parsed['Display Wow Hilo'];

            if (displayWowAll) {
              const biaya = Number(r['Biaya Wow All']);
              if (r['Biaya Wow All'] === undefined || r['Biaya Wow All'] === '' || isNaN(biaya)) {
                failed.push({ row: rowNum, reason: 'Biaya Wow All wajib diisi angka karena Display Wow All = Yes.' });
                return;
              }
              biayaDisplayWow = biaya;
            }
            if (displayWowHilo) {
              const biaya = Number(r['Biaya Wow Hilo']);
              if (r['Biaya Wow Hilo'] === undefined || r['Biaya Wow Hilo'] === '' || isNaN(biaya)) {
                failed.push({ row: rowNum, reason: 'Biaya Wow Hilo wajib diisi angka karena Display Wow Hilo = Yes.' });
                return;
              }
              biayaDisplayWowHilo = biaya;
            }
          }
          // Non-Ring-1 rows: POSM/Display Wow stay false/0 regardless of file content

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

          const picRaw = String(r['PIC'] || '').trim();
          if (!picRaw) {
            failed.push({ row: rowNum, reason: 'PIC wajib diisi.' });
            return;
          }
          if (!isManager && picRaw.toLowerCase() !== (currentUser?.namaPic || '').toLowerCase()) {
            failed.push({ row: rowNum, reason: `PIC "${picRaw}" harus sama dengan akun Anda yang login.` });
            return;
          }

          // Duplicate-code check (against existing mappings AND within this file)
          const codesInRow = [bspCode1Raw, udnCode1Raw].filter(Boolean);
          const dupe = codesInRow.find(
            (c) => codesUsedElsewhere.has(c) || codesClaimedInFile.has(c)
          );
          if (dupe) {
            failed.push({ row: rowNum, reason: `Kode "${dupe}" sudah dipakai di mapping lain atau duplikat dalam file ini.` });
            return;
          }
          codesInRow.forEach((c) => codesClaimedInFile.add(c));

          // Lookup descriptive fields from Performance — BSP side preferred as source of truth
          const primary = bspOutlet || udnOutlet!;
          const nameForCode = bspOutlet?.namaCustomerBaru || udnOutlet?.namaCustomerBaru || 'Outlet';
          const generatedCodeRow = generateCustomerSoGroupAreaCode(
            nameForCode,
            klasifikasiVal,
            bspCode1Raw || udnCode1Raw
          );

          validItems.push({
            customerSoGroupAreaCode: generatedCodeRow,
            customerSoGroupArea: nameForCode,
            klasifikasiOutlet: klasifikasiVal,
            subDistBsp: bspOutlet?.subDist || '',
            depoBsp: bspOutlet?.depo || '',
            namaCustomerBsp: bspOutlet?.namaCustomerBaru || '',
            bspCode1: bspCode1Raw,
            bspCode2: String(r['BSP Code 2'] || ''),
            bspCode3: String(r['BSP Code 3'] || ''),
            subDistUdn: udnOutlet?.subDist || '',
            namaCustomerUdn: udnOutlet?.namaCustomerBaru || '',
            udnCode1: udnCode1Raw,
            udnCode2: String(r['UDN Code 2'] || ''),
            udnCode3: String(r['UDN Code 3'] || ''),
            kabupaten: primary.kabupaten,
            kecamatan: primary.kecamatan,
            alamat: primary.alamat,
            dishub, rak50cm, rak65cm, rak75cm, rakDuaSisi, rakPack, rakCustome,
            displayWowAll, biayaDisplayWow, displayWowHilo, biayaDisplayWowHilo,
            namaMds: mdsMatch.namaMds,
            pic: picRaw,
            latitude: primary.latitude,
            longitude: primary.longitude,
            status: 'Active',
            notes: String(r['Notes'] || ''),
          });
        });

        if (validItems.length > 0) {
          await bulkImportMappings(validItems);
        }
        setImportResult({ successCount: validItems.length, failed });
        if (validItems.length > 0) {
          setToast({
            message: `Bulk import selesai: ${validItems.length} mapping berhasil ditambahkan${
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

            <button
              onClick={handleDownloadTemplate}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Download Template</span>
            </button>

            <label className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>{isImporting ? 'Memproses...' : 'Bulk Import'}</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                disabled={isImporting}
                className="hidden"
              />
            </label>
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
                  {importResult.successCount} baris berhasil diimpor
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

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 pt-4">
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
            <MultiSelectDropdown
              label="Depo"
              options={depoOptions}
              selected={filterDepo}
              onChange={setFilterDepo}
            />
          </div>

          <div>
            <MultiSelectDropdown
              label="Kabupaten"
              options={kabupatenOptions}
              selected={filterKabupaten}
              onChange={setFilterKabupaten}
            />
          </div>

          <div>
            <MultiSelectDropdown
              label="Kecamatan"
              options={kecamatanOptions}
              selected={filterKecamatan}
              onChange={setFilterKecamatan}
            />
          </div>

          <div>
            <MultiSelectDropdown
              label="Ring"
              options={['Ring 1', 'Ring 2', 'Ring 3', 'Ring 4']}
              selected={filterRing}
              onChange={setFilterRing}
            />
          </div>

          <div>
            <MultiSelectDropdown
              label="Status POSM"
              options={['Memiliki Dishub', 'Memiliki Rak Display', 'Memiliki Display Wow']}
              selected={filterPosm}
              onChange={setFilterPosm}
            />
          </div>

          <div>
            <MultiSelectDropdown
              label="MDS"
              options={mdsOptions}
              selected={filterMds}
              onChange={setFilterMds}
            />
          </div>
        </div>
      </div>

      {/* Mappings Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-bold text-sm text-slate-800">
            Daftar Mapping Outlet &amp; Sarana POSM ({filteredMappings.length} Terdata)
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                <th className="py-3 px-3 cursor-pointer select-none whitespace-nowrap" onClick={() => handleMapSort('ring')}>
                  <div className="flex items-center gap-1">
                    Classification Outlet <SortIcon field="ring" />
                  </div>
                </th>
                <th className="py-3 px-3 cursor-pointer select-none whitespace-nowrap" onClick={() => handleMapSort('name')}>
                  <div className="flex items-center gap-1">
                    Customer SO Group Area &amp; Area <SortIcon field="name" />
                  </div>
                </th>
                <th className="py-3 px-3 cursor-pointer select-none whitespace-nowrap" onClick={() => handleMapSort('code')}>
                  <div className="flex items-center gap-1">
                    Customer SO Group Area Code <SortIcon field="code" />
                  </div>
                </th>
                <th className="py-3 px-3 cursor-pointer select-none whitespace-nowrap" onClick={() => handleMapSort('bsp')}>
                  <div className="flex items-center gap-1">
                    Kode BSP (1/2/3) <SortIcon field="bsp" />
                  </div>
                </th>
                <th className="py-3 px-3 cursor-pointer select-none whitespace-nowrap" onClick={() => handleMapSort('udn')}>
                  <div className="flex items-center gap-1">
                    Kode UDN (1/2/3) <SortIcon field="udn" />
                  </div>
                </th>
                <th className="py-3 px-3 text-center whitespace-nowrap">Sarana POSM</th>
                <th className="py-3 px-3 text-center whitespace-nowrap">Display Wow</th>
                <th className="py-3 px-3 text-center cursor-pointer select-none whitespace-nowrap" onClick={() => handleMapSort('mds')}>
                  <div className="flex items-center justify-center gap-1">
                    MDS &amp; PIC <SortIcon field="mds" />
                  </div>
                </th>
                <th className="py-3 px-3 text-center whitespace-nowrap">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedMappings.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-slate-400">
                    Belum ada data mapping yang sesuai. Klik "Tambah Mapping Baru" untuk membuat.
                  </td>
                </tr>
              ) : (
                paginatedMappings.map((m) => {
                  const hasAnyRak =
                    m.rak50cm ||
                    m.rak65cm ||
                    m.rak75cm ||
                    m.rakDuaSisi ||
                    m.rakPack ||
                    m.rakCustome;

                  return (
                    <tr key={m.mappingId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3">
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
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-bold text-slate-900">{m.customerSoGroupArea}</div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1">
                          <span>
                            {m.kecamatan}, {m.kabupaten}
                          </span>
                          {m.latitude && m.longitude && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${m.latitude},${m.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Buka lokasi di Google Maps"
                              onClick={(e) => e.stopPropagation()}
                              className="text-indigo-500 hover:text-indigo-700"
                            >
                              <MapPin className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-900 whitespace-nowrap text-[11px]">
                        {m.customerSoGroupAreaCode}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
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
                      <td className="py-3 px-3 whitespace-nowrap">
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
                        <div className="flex flex-wrap gap-1 justify-center max-w-[160px] mx-auto">
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
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {m.displayWowAll || m.displayWowHilo ? (
                          <div className="text-[11px]">
                            {m.displayWowAll && (
                              <div className="font-semibold text-amber-700">
                                Wow All ({m.biayaDisplayWow.toLocaleString('id-ID')} Rcg)
                              </div>
                            )}
                            {m.displayWowHilo && (
                              <div className="font-semibold text-emerald-700">
                                Wow Hilo ({m.biayaDisplayWowHilo.toLocaleString('id-ID')} Rcg)
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
                        <button
                          onClick={() => handleOpenEdit(m)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="Edit Mapping"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {sortedMappings.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-600">
            <div className="flex items-center gap-3">
              <span>
                Menampilkan {(mappingPage - 1) * mappingPageSize + 1}
                –{Math.min(mappingPage * mappingPageSize, sortedMappings.length)} dari{' '}
                {sortedMappings.length.toLocaleString('id-ID')} outlet
              </span>
              <PageSizeSelector value={mappingPageSize} onChange={setMappingPageSize} />
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setMappingPage((p) => Math.max(1, p - 1))}
                disabled={mappingPage === 1}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Sebelumnya
              </button>
              <span className="px-2 font-semibold text-slate-700">
                Halaman {mappingPage} / {mappingTotalPages}
              </span>
              <button
                onClick={() => setMappingPage((p) => Math.min(mappingTotalPages, p + 1))}
                disabled={mappingPage === mappingTotalPages}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
      </div>

      {/* WIZARD MODAL (TAMBAH / EDIT MAPPING) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-5xl w-full shadow-2xl border border-slate-100 my-8 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 sm:px-7 pt-6 sm:pt-7 pb-4 border-b border-slate-100 shrink-0">
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
              <div className="flex items-center justify-between mt-4 mb-2 px-6 sm:px-7 shrink-0">
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

            <form onSubmit={handleSubmitForm} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto px-6 sm:px-7 py-4 space-y-4">
                {formError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

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
                          onClick={() => handleWizardDistChange(dist)}
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

                  {!isManager && (
                    <p className="text-[11px] text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-1.5">
                      Daftar di bawah otomatis dibatasi ke Depo yang menjadi tanggung jawab Anda.
                    </p>
                  )}

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={wizardSearch}
                      onChange={(e) => setWizardSearch(e.target.value)}
                      placeholder="Cari nama atau kode outlet..."
                      className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <select
                      value={wizardSubDist}
                      onChange={(e) => handleWizardSubDistChange(e.target.value)}
                      className="text-[11px] px-2.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    >
                      <option value="ALL">Semua Sub Dist</option>
                      {wizardSubDistOptions.map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                    <select
                      value={wizardDepo}
                      onChange={(e) => handleWizardDepoChange(e.target.value)}
                      className="text-[11px] px-2.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    >
                      <option value="ALL">Semua Depo</option>
                      {wizardDepoOptions.map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                    <select
                      value={wizardKabupaten}
                      onChange={(e) => handleWizardKabupatenChange(e.target.value)}
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
                  </div>

                  <p className="text-xs text-slate-500">
                    Pilih toko dari data Performance distributor <strong>{primaryDist}</strong> yang ingin dipetakan
                    {' '}({primaryOutletResults.length.toLocaleString('id-ID')} hasil):
                  </p>

                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-2xl">
                    {primaryOutletDisplayed.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">
                        Tidak ada outlet yang sesuai filter/pencarian.
                      </div>
                    ) : (
                      primaryOutletDisplayed.map((p) => (
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
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {p.sku2026} SKU • {p.avgPa2026.toFixed(1)} PA ({p.pa2026.toFixed(0)}%) • Avg Sales: Rp{' '}
                              {p.avgSales2026.toLocaleString('id-ID')}
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
                      ))
                    )}
                  </div>
                  {primaryOutletResults.length > WIZARD_MAX_RESULTS && (
                    <p className="text-[11px] text-amber-600">
                      Menampilkan {WIZARD_MAX_RESULTS} dari {primaryOutletResults.length.toLocaleString('id-ID')} hasil — persempit dengan pencarian atau filter Depo/Kabupaten/Kecamatan untuk melihat outlet lainnya.
                    </p>
                  )}
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
                          <p className="text-[10px] text-slate-400 pl-7">
                            {cand.outlet.sku2026} SKU • {cand.outlet.avgPa2026.toFixed(1)} PA ({cand.outlet.pa2026.toFixed(0)}%) • Avg Sales: Rp{' '}
                            {cand.outlet.avgSales2026.toLocaleString('id-ID')}
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

                  <div className="pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowManualPairSearch((v) => !v)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                    >
                      <Search className="w-3.5 h-3.5" />
                      {showManualPairSearch ? 'Sembunyikan pencarian manual' : 'Rekomendasi tidak cocok? Cari & pilih manual'}
                    </button>

                    {showManualPairSearch && (
                      <div className="mt-2.5 space-y-2">
                        <input
                          type="text"
                          value={manualPairSearch}
                          onChange={(e) => setManualPairSearch(e.target.value)}
                          placeholder={`Cari nama/kode outlet ${primaryDist === 'BSP' ? 'UDN' : 'BSP'} secara manual...`}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                        {manualPairSearch.trim() && (
                          <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-2xl">
                            {manualPairResults.length === 0 ? (
                              <div className="p-3 text-center text-xs text-slate-400">
                                Tidak ada outlet yang cocok dengan pencarian.
                              </div>
                            ) : (
                              manualPairResults.map((out) => (
                                <div
                                  key={out.kodeCustNfiGroup}
                                  onClick={() => handleSelectManualPair(out)}
                                  className="p-2.5 hover:bg-indigo-50/50 cursor-pointer flex items-center justify-between transition-colors group"
                                >
                                  <div>
                                    <div className="font-bold text-xs text-slate-900 group-hover:text-indigo-600">
                                      {out.namaCustomerBaru}
                                    </div>
                                    <div className="text-[11px] text-slate-400">
                                      {out.kodeCustNfiGroup} • {out.kecamatan}, {out.kabupaten} ({out.depo})
                                    </div>
                                    <div className="text-[10px] text-slate-500">
                                      {out.sku2026} SKU • {out.avgPa2026.toFixed(1)} PA ({out.pa2026.toFixed(0)}%) • Avg Sales: Rp{' '}
                                      {out.avgSales2026.toLocaleString('id-ID')}
                                    </div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )}
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

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Distributor BSP Fields */}
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                    <span className="text-xs font-bold text-slate-800 block">
                      Data Distributor BSP
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <OutletSearchField
                          label="Nama di BSP"
                          placeholder="Cari nama/kode outlet BSP..."
                          displayValue={namaCustomerBsp}
                          pool={bspSearchPool}
                          onSelect={(p) => {
                            setNamaCustomerBsp(p.namaCustomerBaru);
                            setDepoBsp(p.depo);
                            setBspCode1(p.kodeCustNfiGroup);
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-0.5">Depo BSP</label>
                        <input
                          type="text"
                          value={depoBsp}
                          disabled
                          placeholder="Otomatis terisi setelah pilih outlet"
                          className="w-full px-2.5 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-500 cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-0.5">BSP Code 1</label>
                        <input
                          type="text"
                          value={bspCode1}
                          disabled
                          placeholder="Otomatis terisi setelah pilih outlet"
                          className="w-full px-2.5 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono text-slate-500 cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <OutletSearchField
                          label="BSP Code 2"
                          optional
                          placeholder="Kode ganti pajak/NPWP, dll — atau cari nama/kode"
                          displayValue={bspCode2}
                          pool={bspSearchPool}
                          onSelect={(p) => setBspCode2(p.kodeCustNfiGroup)}
                          mono
                        />
                      </div>
                      <div>
                        <OutletSearchField
                          label="BSP Code 3"
                          optional
                          placeholder="Cari nama/kode outlet..."
                          displayValue={bspCode3}
                          pool={bspSearchPool}
                          onSelect={(p) => setBspCode3(p.kodeCustNfiGroup)}
                          mono
                        />
                      </div>
                    </div>

                    {bspDuplicateSuggestions.length > 0 && (bspCode2 === '' || bspCode3 === '') && (
                      <div className="pt-1">
                        <p className="text-[11px] text-amber-700 mb-1.5 flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          Kemungkinan kode lain untuk toko yang sama (nama &amp; depo mirip) — cek alamat sebelum menambahkan:
                        </p>
                        <div className="space-y-1.5">
                          {bspDuplicateSuggestions.map((s) => (
                            <div
                              key={s.outlet.kodeCustNfiGroup}
                              onClick={() => handleAddBspCode(s.outlet.kodeCustNfiGroup)}
                              className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl cursor-pointer hover:bg-amber-100 hover:border-amber-300 transition-colors flex items-center justify-between gap-2 group"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-xs text-slate-900 truncate">
                                    {s.outlet.namaCustomerBaru}
                                  </span>
                                  <span className="text-[11px] font-mono text-slate-500 shrink-0">
                                    ({s.outlet.kodeCustNfiGroup})
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-500 truncate">
                                  {s.outlet.alamat} • {s.outlet.kecamatan}, {s.outlet.kabupaten}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-amber-200 text-amber-900">
                                  {s.score}%
                                </span>
                                <span className="text-[11px] font-semibold text-amber-700 group-hover:text-amber-900 flex items-center gap-0.5">
                                  <Plus className="w-3 h-3" /> Tambah
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Distributor UDN Fields */}
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                    <span className="text-xs font-bold text-slate-800 block">
                      Data Distributor UDN
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <OutletSearchField
                          label="Nama di UDN"
                          placeholder="Cari nama/kode outlet UDN..."
                          displayValue={namaCustomerUdn}
                          pool={udnSearchPool}
                          onSelect={(p) => {
                            setNamaCustomerUdn(p.namaCustomerBaru);
                            setSubDistUdn(p.depo);
                            setUdnCode1(p.kodeCustNfiGroup);
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-0.5">Sub Dist UDN</label>
                        <input
                          type="text"
                          value={subDistUdn}
                          disabled
                          placeholder="Otomatis terisi setelah pilih outlet"
                          className="w-full px-2.5 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-500 cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-0.5">UDN Code 1</label>
                        <input
                          type="text"
                          value={udnCode1}
                          disabled
                          placeholder="Otomatis terisi setelah pilih outlet"
                          className="w-full px-2.5 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono text-slate-500 cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <OutletSearchField
                          label="UDN Code 2"
                          optional
                          placeholder="Kode ganti pajak/NPWP, dll — atau cari nama/kode"
                          displayValue={udnCode2}
                          pool={udnSearchPool}
                          onSelect={(p) => setUdnCode2(p.kodeCustNfiGroup)}
                          mono
                        />
                      </div>
                      <div>
                        <OutletSearchField
                          label="UDN Code 3"
                          optional
                          placeholder="Cari nama/kode outlet..."
                          displayValue={udnCode3}
                          pool={udnSearchPool}
                          onSelect={(p) => setUdnCode3(p.kodeCustNfiGroup)}
                          mono
                        />
                      </div>
                    </div>

                    {udnDuplicateSuggestions.length > 0 && (udnCode2 === '' || udnCode3 === '') && (
                      <div className="pt-1">
                        <p className="text-[11px] text-amber-700 mb-1.5 flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          Kemungkinan kode lain untuk toko yang sama (nama &amp; sub dist mirip) — cek alamat sebelum menambahkan:
                        </p>
                        <div className="space-y-1.5">
                          {udnDuplicateSuggestions.map((s) => (
                            <div
                              key={s.outlet.kodeCustNfiGroup}
                              onClick={() => handleAddUdnCode(s.outlet.kodeCustNfiGroup)}
                              className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl cursor-pointer hover:bg-amber-100 hover:border-amber-300 transition-colors flex items-center justify-between gap-2 group"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-xs text-slate-900 truncate">
                                    {s.outlet.namaCustomerBaru}
                                  </span>
                                  <span className="text-[11px] font-mono text-slate-500 shrink-0">
                                    ({s.outlet.kodeCustNfiGroup})
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-500 truncate">
                                  {s.outlet.alamat} • {s.outlet.kecamatan}, {s.outlet.kabupaten}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-amber-200 text-amber-900">
                                  {s.score}%
                                </span>
                                <span className="text-[11px] font-semibold text-amber-700 group-hover:text-amber-900 flex items-center gap-0.5">
                                  <Plus className="w-3 h-3" /> Tambah
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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
                  {klasifikasi !== 'Ring 1' && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500">
                      Outlet dengan klasifikasi <strong>{klasifikasi}</strong> tidak memerlukan mapping POSM/Display Wow — bagian ini dinonaktifkan. Cukup tetapkan Petugas MDS di bawah.
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Sarana Rak POSM Toggles */}
                  <div
                    className={`p-4 rounded-2xl border space-y-3 ${
                      klasifikasi === 'Ring 1'
                        ? 'bg-slate-50 border-slate-200'
                        : 'bg-slate-100/60 border-slate-200 opacity-50 pointer-events-none'
                    }`}
                  >
                    <span className="text-xs font-bold text-slate-800 block">
                      Sarana Display &amp; Rak POSM
                    </span>

                    <div className="grid grid-cols-2 gap-2.5">
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
                            disabled={klasifikasi !== 'Ring 1'}
                            onChange={(e) => item.set(e.target.checked)}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-xs font-medium text-slate-700">{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Display Wow Section */}
                  <div
                    className={`p-4 rounded-2xl border space-y-3 ${
                      klasifikasi === 'Ring 1'
                        ? 'bg-slate-50 border-slate-200'
                        : 'bg-slate-100/60 border-slate-200 opacity-50 pointer-events-none'
                    }`}
                  >
                    <span className="text-xs font-bold text-slate-800 block">
                      Program Display Wow
                    </span>

                    <div className="grid grid-cols-1 gap-4">
                      <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={displayWowAll}
                            disabled={klasifikasi !== 'Ring 1'}
                            onChange={(e) => {
                              setDisplayWowAll(e.target.checked);
                              if (!e.target.checked) setBiayaDisplayWow(0);
                            }}
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
                              disabled={klasifikasi !== 'Ring 1'}
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
                            disabled={klasifikasi !== 'Ring 1'}
                            onChange={(e) => {
                              setDisplayWowHilo(e.target.checked);
                              if (!e.target.checked) setBiayaDisplayWowHilo(0);
                            }}
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
                              disabled={klasifikasi !== 'Ring 1'}
                              onChange={(e) => setBiayaDisplayWowHilo(Number(e.target.value) || 0)}
                              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                            />
                          </div>
                        )}
                      </div>
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
                        {accessibleMds.map((m) => (
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

                  </div>
              )}
              </div>

              {(wizardStep === 4 || editingMappingId) && (
                <div className="shrink-0 px-6 sm:px-7 py-4 border-t border-slate-100 flex justify-between items-center bg-white rounded-b-3xl">
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
              )}
            </form>
          </div>
        </div>
      )}

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
};