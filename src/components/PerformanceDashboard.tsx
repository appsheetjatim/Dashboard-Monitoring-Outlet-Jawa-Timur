import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { OutletPerformance, OutletMapping } from '../types';
import { Tooltip } from './Tooltip';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Store,
  Layers,
  ShoppingBag,
  Award,
  AlertTriangle,
  FileSpreadsheet,
  Download,
  Search,
  Filter,
  Users,
  ChevronRight,
  ChevronDown,
  ArrowUpDown,
  Calendar,
  CheckCircle,
  Clock,
  Sparkles,
  ExternalLink,
  RotateCw,
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface Props {
  onNavigateToCallPlan?: (outletCode?: string) => void;
  onNavigateToMap?: () => void;
}

export const PerformanceDashboard: React.FC<Props> = ({
  onNavigateToCallPlan,
  onNavigateToMap,
}) => {
  const {
    currentUser,
    performance,
    callPlans,
    mappings,
    accessibleDistributors,
    accessibleDepo,
    lastSyncTime,
    syncWithGoogleSheets,
    syncStatus,
  } = useApp();

  const isManager = currentUser?.role === 'Manager';

  // Filters
  const [selectedYear, setSelectedYear] = useState<'2024' | '2025' | '2026'>('2026');
  const [selectedDist, setSelectedDist] = useState<string>('ALL');
  const [selectedDepo, setSelectedDepo] = useState<string>('ALL');
  const [selectedKabupaten, setSelectedKabupaten] = useState<string>('ALL');
  const [selectedRing, setSelectedRing] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Sorting
  const [sortField, setSortField] = useState<keyof OutletPerformance>('omset2026');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Active view tab inside Dashboard
  const [activeSection, setActiveSection] = useState<
    'overview' | 'pareto' | 'gainers' | 'coverage' | 'watchlist' | 'mds_leaderboard'
  >('overview');

  // Pagination for Tabel Detail Outlet
  const PAGE_SIZE = 50;
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Pagination for Coverage MDS vs Call Plan and Watchlist Dorman tables
  const [coveragePage, setCoveragePage] = useState<number>(1);
  const [watchlistPage, setWatchlistPage] = useState<number>(1);

  // Pareto per Depo: accordion, all depos collapsed by default so opening the
  // tab doesn't render dozens of full outlet tables at once
  const [expandedDepos, setExpandedDepos] = useState<Set<string>>(new Set());
  const toggleDepoExpanded = (depoName: string) => {
    setExpandedDepos((prev) => {
      const next = new Set(prev);
      if (next.has(depoName)) {
        next.delete(depoName);
      } else {
        next.add(depoName);
      }
      return next;
    });
  };

  // Tabel Detail Outlet restructure: "Outlet Termapping" (one collapsible
  // section, paginated) then "Outlet Belum Termapping" grouped per Depo (each
  // Depo its own collapsible section, paginated within)
  const [isMappedSectionOpen, setIsMappedSectionOpen] = useState(false);
  const [mappedPage, setMappedPage] = useState<number>(1);
  const [expandedUnmappedDepos, setExpandedUnmappedDepos] = useState<Set<string>>(new Set());
  const [unmappedDepoPages, setUnmappedDepoPages] = useState<Record<string, number>>({});
  const toggleUnmappedDepoExpanded = (depoName: string) => {
    setExpandedUnmappedDepos((prev) => {
      const next = new Set(prev);
      if (next.has(depoName)) {
        next.delete(depoName);
      } else {
        next.add(depoName);
      }
      return next;
    });
  };
  const getUnmappedDepoPage = (depoName: string) => unmappedDepoPages[depoName] || 1;
  const setUnmappedDepoPage = (depoName: string, page: number) => {
    setUnmappedDepoPages((prev) => ({ ...prev, [depoName]: page }));
  };

  // Reset to page 1 / collapsed whenever any filter/search/sort changes
  useEffect(() => {
    setCurrentPage(1);
    setMappedPage(1);
    setIsMappedSectionOpen(false);
    setExpandedUnmappedDepos(new Set());
    setUnmappedDepoPages({});
  }, [selectedYear, selectedDist, selectedDepo, selectedKabupaten, selectedRing, searchQuery, sortField, sortDirection]);

  // Filter raw data based on permissions & UI filters
  const filteredData = useMemo(() => {
    return performance.filter((item) => {
      // Role Supervisor: restrict to outlets whose Depo is in the PIC's assignment
      // (Dist alone is NOT a valid discriminator — dataset only has 2 Dist values
      // (BSP/UDN) and most Supervisors cover both, which previously made the
      // Dist check always true and let Supervisors see all of Jawa Timur)
      if (!isManager && accessibleDepo.length > 0) {
        if (!accessibleDepo.includes(item.depo)) return false;
      }

      if (selectedDist !== 'ALL' && item.dist !== selectedDist) return false;
      if (selectedDepo !== 'ALL' && item.depo !== selectedDepo) return false;
      if (selectedKabupaten !== 'ALL' && item.kabupaten !== selectedKabupaten) return false;
      if (selectedRing !== 'ALL' && item.calculatedRing !== selectedRing) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesCode = item.kodeCustNfiGroup.toLowerCase().includes(q);
        const matchesName = item.namaCustomerBaru.toLowerCase().includes(q);
        const matchesKec = item.kecamatan.toLowerCase().includes(q);
        if (!matchesCode && !matchesName && !matchesKec) return false;
      }

      return true;
    });
  }, [
    performance,
    isManager,
    accessibleDistributors,
    accessibleDepo,
    selectedDist,
    selectedDepo,
    selectedKabupaten,
    selectedRing,
    searchQuery,
  ]);

  // Split filteredData into "Termapping" (this outlet's raw distributor code
  // appears as a BSP/UDN code in some active Mapping) vs "Belum Termapping",
  // the latter grouped per Depo — mirrors the same accordion pattern as
  // Pareto per Depo so opening the tab doesn't render everything at once.
  const mappedCodes = useMemo(() => {
    const set = new Set<string>();
    mappings.forEach((m) => {
      if (m.status !== 'Active') return;
      [m.bspCode1, m.bspCode2, m.bspCode3, m.udnCode1, m.udnCode2, m.udnCode3].forEach(
        (c) => c && set.add(c)
      );
    });
    return set;
  }, [mappings]);

  const unmappedByDepo = useMemo(() => {
    const groups: Record<string, OutletPerformance[]> = {};
    filteredData.forEach((p) => {
      if (mappedCodes.has(p.kodeCustNfiGroup)) return;
      const depoKey = p.depo || 'Tanpa Depo';
      if (!groups[depoKey]) groups[depoKey] = [];
      groups[depoKey].push(p);
    });
    return groups;
  }, [filteredData, mappedCodes]);

  // Lookup by raw distributor code, built from the FULL Performance dataset
  // (not filteredData) so a mapped outlet is never dropped just because its
  // BSP or UDN code happens to miss one of the page's incidental filters —
  // "Outlet Termapping" is driven by Mapping records directly below, and this
  // is purely for enriching each one with performance metrics when available.
  const performanceByCode = useMemo(() => {
    const map = new Map<string, OutletPerformance>();
    performance.forEach((p) => map.set(p.kodeCustNfiGroup, p));
    return map;
  }, [performance]);

  // Outlet Termapping: ONE row per active Mapping record (single code),
  // regardless of whether its BSP/UDN performance data was found — this way
  // an outlet with incomplete supporting data (e.g. missing lat/long, or a
  // code that doesn't resolve in Performance) still shows up, just with
  // whatever metrics ARE available. Combining rule: Omset/Avg Sales/SKU/PA
  // sum across BSP+UDN; % PA is RE-DERIVED as (total PA ÷ total SKU), never
  // summed directly; F12/F3 take the higher of the two sides.
  interface MappedOutletRow {
    code: string;
    name: string;
    depo: string;
    kabupaten: string;
    kecamatan: string;
    klasifikasi: 'Ring 1' | 'Ring 2' | 'Ring 3' | 'Ring 4';
    omset: number;
    avgSales: number;
    sku: number;
    avgPa: number;
    percentPa: number;
    f12: number;
    f3: number;
    hasPerformanceData: boolean;
  }

  const mappedOutletRows = useMemo(() => {
    let list = mappings.filter((m) => m.status === 'Active');

    if (!isManager && accessibleDepo.length > 0) {
      list = list.filter(
        (m) => accessibleDepo.includes(m.depoBsp) || accessibleDepo.includes(m.subDistUdn)
      );
    }
    if (selectedDepo !== 'ALL') {
      list = list.filter((m) => m.depoBsp === selectedDepo || m.subDistUdn === selectedDepo);
    }
    if (selectedKabupaten !== 'ALL') {
      list = list.filter((m) => m.kabupaten === selectedKabupaten);
    }
    if (selectedRing !== 'ALL') {
      list = list.filter((m) => m.klasifikasiOutlet === selectedRing);
    }
    if (selectedDist !== 'ALL') {
      if (selectedDist === 'BSP') list = list.filter((m) => !!m.bspCode1);
      else if (selectedDist === 'UDN') list = list.filter((m) => !!m.udnCode1);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.customerSoGroupArea.toLowerCase().includes(q) ||
          m.customerSoGroupAreaCode.toLowerCase().includes(q)
      );
    }

    return list.map((mapping): MappedOutletRow => {
      const bsp = mapping.bspCode1 ? performanceByCode.get(mapping.bspCode1) : undefined;
      const udn = mapping.udnCode1 ? performanceByCode.get(mapping.udnCode1) : undefined;
      const sources = [bsp, udn].filter((x): x is OutletPerformance => !!x);

      const omset = (bsp?.omset2026 || 0) + (udn?.omset2026 || 0);
      const avgSales = (bsp?.avgSales2026 || 0) + (udn?.avgSales2026 || 0);
      const sku = (bsp?.sku2026 || 0) + (udn?.sku2026 || 0);
      const avgPa = (bsp?.avgPa2026 || 0) + (udn?.avgPa2026 || 0);
      const percentPa = sku > 0 ? (avgPa / sku) * 100 : 0;
      const f12 = sources.length > 0 ? Math.max(...sources.map((r) => r.fLast12m)) : 0;
      const f3 = sources.length > 0 ? Math.max(...sources.map((r) => r.f3)) : 0;

      return {
        code: mapping.customerSoGroupAreaCode,
        name: mapping.customerSoGroupArea,
        depo: mapping.depoBsp || mapping.subDistUdn,
        kabupaten: mapping.kabupaten,
        kecamatan: mapping.kecamatan,
        klasifikasi: mapping.klasifikasiOutlet,
        omset,
        avgSales,
        sku,
        avgPa,
        percentPa,
        f12,
        f3,
        hasPerformanceData: sources.length > 0,
      };
    });
  }, [
    mappings,
    performanceByCode,
    isManager,
    accessibleDepo,
    selectedDepo,
    selectedKabupaten,
    selectedRing,
    selectedDist,
    searchQuery,
  ]);

  const totalUnmappedCount = useMemo(
    () =>
      Object.values(unmappedByDepo).reduce(
        (sum: number, arr: OutletPerformance[]) => sum + arr.length,
        0
      ),
    [unmappedByDepo]
  );

  // Unique dropdown options
  const distOptions = useMemo(() => {
    const list = isManager ? performance.map((p) => p.dist) : accessibleDistributors;
    return Array.from(new Set(list.filter(Boolean)));
  }, [performance, isManager, accessibleDistributors]);

  const depoOptions = useMemo(() => {
    const subset = selectedDist === 'ALL' ? performance : performance.filter((p) => p.dist === selectedDist);
    const list = isManager ? subset.map((p) => p.depo) : accessibleDepo;
    return Array.from(new Set(list.filter(Boolean)));
  }, [performance, isManager, accessibleDepo, selectedDist]);

  const kabupatenOptions = useMemo(() => {
    return Array.from(new Set(filteredData.map((p) => p.kabupaten).filter(Boolean)));
  }, [filteredData]);

  // KPIs
  const totalOmset = useMemo(() => {
    return filteredData.reduce((sum, item) => {
      if (selectedYear === '2024') return sum + (item.omset2024 || 0);
      if (selectedYear === '2025') return sum + (item.omset2025 || 0);
      return sum + (item.omset2026 || 0);
    }, 0);
  }, [filteredData, selectedYear]);

  const totalOmsetPrev = useMemo(() => {
    return filteredData.reduce((sum, item) => {
      if (selectedYear === '2024') return sum + (item.omset2024 || 0);
      if (selectedYear === '2025') return sum + (item.omset2024 || 0);
      return sum + (item.omset2025 || 0);
    }, 0);
  }, [filteredData, selectedYear]);

  const yoyGrowth = totalOmsetPrev > 0 ? ((totalOmset - totalOmsetPrev) / totalOmsetPrev) * 100 : 0;

  const activeOutletCount = useMemo(() => {
    return filteredData.filter((i) => (selectedYear === '2026' ? i.f2026 > 0 : i.f2025 > 0)).length;
  }, [filteredData, selectedYear]);

  const avgSku = useMemo(() => {
    if (filteredData.length === 0) return 0;
    const sum = filteredData.reduce((s, i) => s + (selectedYear === '2026' ? i.sku2026 : i.sku2025), 0);
    return Math.round((sum / filteredData.length) * 10) / 10;
  }, [filteredData, selectedYear]);

  const avgPa = useMemo(() => {
    if (filteredData.length === 0) return 0;
    const sum = filteredData.reduce((s, i) => s + (selectedYear === '2026' ? i.avgPa2026 : i.avgPa2025), 0);
    return Math.round((sum / filteredData.length) * 10) / 10;
  }, [filteredData, selectedYear]);

  const avgSalesPerStore = useMemo(() => {
    if (filteredData.length === 0) return 0;
    const sum = filteredData.reduce((s, i) => s + (selectedYear === '2026' ? i.avgSales2026 : i.avgSales2025), 0);
    return Math.round(sum / filteredData.length);
  }, [filteredData, selectedYear]);

  // Ring Distribution breakdown
  const ringStats = useMemo(() => {
    const rings = ['Ring 1', 'Ring 2', 'Ring 3', 'Ring 4'] as const;
    const grandTotal2026 = filteredData.reduce((sum, i) => sum + (i.omset2026 || 0), 0) || 1;

    return rings.map((ring) => {
      const items = filteredData.filter((i) => i.calculatedRing === ring);
      const ringOmset = items.reduce((sum, i) => sum + (i.omset2026 || 0), 0);
      const omsetPct = (ringOmset / grandTotal2026) * 100;
      return {
        ring,
        count: items.length,
        omset: ringOmset,
        omsetPct,
      };
    });
  }, [filteredData]);

  // Pareto Table grouped per Depo
  const paretoPerDepo = useMemo(() => {
    const groups: { [depo: string]: OutletPerformance[] } = {};
    filteredData.forEach((item) => {
      const d = item.depo || 'Lainnya';
      if (!groups[d]) groups[d] = [];
      groups[d].push(item);
    });

    // Ensure each depo list is sorted by omset descending
    Object.keys(groups).forEach((d) => {
      groups[d].sort((a, b) => (b.omset2026 || 0) - (a.omset2026 || 0));
    });

    return groups;
  }, [filteredData]);

  // Top Gainers & Top Decliners
  const topGainers = useMemo(() => {
    return [...filteredData]
      .filter((i) => i.omset2025 > 0)
      .sort((a, b) => b.grAvgSales - a.grAvgSales)
      .slice(0, 10);
  }, [filteredData]);

  const topDecliners = useMemo(() => {
    return [...filteredData]
      .filter((i) => i.omset2025 > 0)
      .sort((a, b) => a.grAvgSales - b.grAvgSales)
      .slice(0, 10);
  }, [filteredData]);

  // Coverage MDS vs Call Plan — enrich ALL filtered outlets with assigned MDS /
  // dormant / churn-risk flags. This pool is also the source for Watchlist,
  // so it must NOT be pre-filtered to scheduled-only outlets.
  const enrichedOutlets = useMemo(() => {
    // Map call plans by customer code or name
    const scheduledCodes = new Map<string, string>();
    callPlans.forEach((cp) => {
      scheduledCodes.set(cp.customerSoGroupAreaCode, cp.namaMds);
      scheduledCodes.set(cp.customerSoGroupArea.toLowerCase(), cp.namaMds);
    });

    return filteredData.map((outlet) => {
      const assignedMds =
        scheduledCodes.get(outlet.kodeCustNfiGroup) ||
        scheduledCodes.get(outlet.namaCustomerBaru.toLowerCase()) ||
        null;

      const isScheduled = !!assignedMds;
      const isZeroOmset = outlet.omset2026 === 0;
      const isInactiveWarning = isScheduled && (outlet.isDormant || isZeroOmset);

      return {
        ...outlet,
        assignedMds,
        isScheduled,
        isInactiveWarning,
      };
    });
  }, [filteredData, callPlans]);

  // Coverage MDS vs Call Plan tab: shows EVERY filtered outlet (both scheduled
  // and not yet scheduled) so PIC can see coverage gaps and jump straight to
  // Call Plan for the ones missing a schedule — this is intentional, not a bug.
  const coverageData = enrichedOutlets;

  // Watchlist Dorman / Churn Risk — spans ALL outlets (not just scheduled
  // ones), since the point is to surface outlets that may need a Call Plan
  // entry at all, not only ones that already have one.
  const watchlistItems = useMemo(() => {
    return enrichedOutlets.filter((i) => i.isDormant || i.isChurnRisk);
  }, [enrichedOutlets]);

  // Pagination slices for both tables
  const coverageTotalPages = Math.max(1, Math.ceil(coverageData.length / PAGE_SIZE));
  const paginatedCoverageData = useMemo(() => {
    const start = (coveragePage - 1) * PAGE_SIZE;
    return coverageData.slice(start, start + PAGE_SIZE);
  }, [coverageData, coveragePage]);

  const watchlistTotalPages = Math.max(1, Math.ceil(watchlistItems.length / PAGE_SIZE));
  const paginatedWatchlistItems = useMemo(() => {
    const start = (watchlistPage - 1) * PAGE_SIZE;
    return watchlistItems.slice(start, start + PAGE_SIZE);
  }, [watchlistItems, watchlistPage]);

  // Reset to page 1 / collapsed whenever the underlying filtered data changes
  useEffect(() => {
    setCoveragePage(1);
    setWatchlistPage(1);
    setExpandedDepos(new Set());
  }, [filteredData]);

  // MDS Performance Leaderboard
  const mdsLeaderboard = useMemo(() => {
    const map = new Map<
      string,
      {
        namaMds: string;
        outletCount: number;
        totalOmset: number;
        growthSum: number;
        dormanCount: number;
        downgradedCount: number;
        upgradedCount: number;
      }
    >();

    coverageData.forEach((item) => {
      const mds = item.assignedMds || 'Belum Terjadwal';
      if (!map.has(mds)) {
        map.set(mds, {
          namaMds: mds,
          outletCount: 0,
          totalOmset: 0,
          growthSum: 0,
          dormanCount: 0,
          downgradedCount: 0,
          upgradedCount: 0,
        });
      }
      const stat = map.get(mds)!;
      stat.outletCount += 1;
      stat.totalOmset += item.omset2026 || 0;
      stat.growthSum += item.grAvgSales || 0;
      if (item.isDormant) stat.dormanCount += 1;
      if (item.isChurnRisk) stat.downgradedCount += 1;
      if (item.previousRing && item.calculatedRing < item.previousRing) {
        stat.upgradedCount += 1;
      }
    });

    return Array.from(map.values())
      .filter((m) => m.namaMds !== 'Belum Terjadwal')
      .map((m) => ({
        ...m,
        avgGrowth: m.outletCount > 0 ? m.growthSum / m.outletCount : 0,
      }))
      .sort((a, b) => b.totalOmset - a.totalOmset);
  }, [coverageData]);

  // Export to Excel / CSV
  const handleExport = (format: 'xlsx' | 'csv') => {
    const exportRows = filteredData.map((item) => ({
      Distributor: item.dist,
      'Sub Dist': item.subDist,
      Depo: item.depo,
      'Kode Cust': item.kodeCustNfiGroup,
      'Nama Outlet': item.namaCustomerBaru,
      Kabupaten: item.kabupaten,
      Kecamatan: item.kecamatan,
      Alamat: item.alamat,
      'Klasifikasi Ring': item.calculatedRing,
      'Omset 2024': item.omset2024,
      'Omset 2025': item.omset2025,
      'Omset 2026': item.omset2026,
      '% Gr Omset YoY': item.grAvgSales,
      'SKU 2026': item.sku2026,
      'AVG PA 2026': item.avgPa2026,
      '% PA 2026': item.pa2026,
      'Avg Sales 2026': item.avgSales2026,
      '% Kontribusi (Depo)': item.kontribusi,
      '% Kumulatif (Pareto)': item.kumulatif,
      'Pareto 80%': item.isPareto80 ? 'YA' : 'TIDAK',
      'Frekuensi F2026': item.f2026,
      'F Last 12M': item.fLast12m,
      F3: item.f3,
      'Dropsize 2026': item.ds2026,
      'Last Order': item.lastOrder,
      Status: item.isDormant ? 'DORMAN' : item.isChurnRisk ? 'TURUN RING' : 'AKTIF',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Performance Outlet');

    if (format === 'xlsx') {
      XLSX.writeFile(workbook, `Monitoring_Performance_Outlet_${selectedYear}.xlsx`);
    } else {
      XLSX.writeFile(workbook, `Monitoring_Performance_Outlet_${selectedYear}.csv`, {
        bookType: 'csv',
      });
    }
  };

  const formatRupiah = (val: number) => {
    return 'Rp ' + Math.round(val).toLocaleString('id-ID');
  };

  // Reusable table renderer for outlet detail rows (used by both the
  // "Outlet Termapping" section and each Depo's section under "Belum
  // Termapping"), each with its own independent pagination.
  // Table renderer for "Outlet Termapping" — one row per Mapping (combined
  // BSP+UDN metrics), separate from renderOutletDetailTable which still shows
  // raw per-distributor-code rows for "Belum Termapping".
  const renderMappedOutletTable = (
    rows: MappedOutletRow[],
    page: number,
    onPageChange: (p: number) => void
  ) => {
    const totalP = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const start = (page - 1) * PAGE_SIZE;
    const pageItems = rows.slice(start, start + PAGE_SIZE);

    return (
      <>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                <th className="py-3 px-3">Customer SO Group Area Code &amp; Nama</th>
                <th className="py-3 px-3">Depo &amp; Wilayah</th>
                <th className="py-3 px-3 text-center">
                  Klasifikasi
                  <Tooltip
                    title="Klasifikasi Ring"
                    content="Dihitung otomatis: Ring 1 (Mapping), Ring 2 (Pareto/Produktif), Ring 3 (Avg Sales ≥ 100rb), Ring 4 (<100rb)"
                  />
                </th>
                <th className="py-3 px-3 text-right">
                  Omset 2026
                  <Tooltip title="Omset gabungan" content="Jumlah Omset 2026 dari sisi BSP + UDN" />
                </th>
                <th className="py-3 px-3 text-right">
                  Avg Sales 2026
                  <Tooltip title="Avg Sales gabungan" content="Jumlah Avg Sales 2026 dari sisi BSP + UDN" />
                </th>
                <th className="py-3 px-3 text-center">
                  SKU 2026
                  <Tooltip title="SKU gabungan" content="Jumlah SKU 2026 dari sisi BSP + UDN" />
                </th>
                <th className="py-3 px-3 text-center">
                  PA 2026
                  <Tooltip
                    title="AVG PA & % PA gabungan"
                    content="AVG PA dijumlahkan dari BSP + UDN. % PA dihitung ulang: total PA ÷ total SKU (bukan dijumlah)"
                  />
                </th>
                <th className="py-3 px-3 text-center">
                  F12
                  <Tooltip title="F Last 12M" content="Diambil nilai tertinggi antara sisi BSP dan UDN" />
                </th>
                <th className="py-3 px-3 text-center">
                  F3
                  <Tooltip title="F3" content="Diambil nilai tertinggi antara sisi BSP dan UDN" />
                </th>
                <th className="py-3 px-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-slate-400">
                    Tidak ada outlet.
                  </td>
                </tr>
              ) : (
                pageItems.map((row) => {
                  const isR1 = row.klasifikasi === 'Ring 1';
                  const isR2 = row.klasifikasi === 'Ring 2';
                  const isR3 = row.klasifikasi === 'Ring 3';
                  const ringBadge = isR1
                    ? 'bg-emerald-100 text-emerald-800'
                    : isR2
                    ? 'bg-blue-100 text-blue-800'
                    : isR3
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-100 text-slate-700';

                  return (
                    <tr key={row.code} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">{row.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{row.code}</div>
                        {!row.hasPerformanceData && (
                          <div className="text-[10px] text-amber-600 font-semibold mt-0.5">
                            Data performa tidak ditemukan
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-700">{row.depo}</div>
                        <div className="text-[11px] text-slate-400">
                          {row.kabupaten} • {row.kecamatan}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-md ${ringBadge}`}>
                          {row.klasifikasi}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                        {row.hasPerformanceData ? formatRupiah(row.omset) : <span className="text-slate-300 font-normal">-</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-700">
                        {row.hasPerformanceData ? formatRupiah(row.avgSales) : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-800 font-medium">
                        {row.hasPerformanceData ? row.sku : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {row.hasPerformanceData ? (
                          <>
                            <span className="text-indigo-600 font-semibold">{row.avgPa.toFixed(1)}</span>
                            <span className="text-[11px] text-slate-400"> ({row.percentPa.toFixed(0)}%)</span>
                          </>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-700">
                        {row.hasPerformanceData ? row.f12 : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-700">
                        {row.hasPerformanceData ? row.f3 : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {onNavigateToCallPlan && (
                          <button
                            onClick={() => onNavigateToCallPlan(row.code)}
                            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-1"
                          >
                            <span>Call Plan</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {rows.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-600">
            <span>
              Menampilkan {start + 1}–{Math.min(page * PAGE_SIZE, rows.length)} dari{' '}
              {rows.length.toLocaleString('id-ID')} outlet
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onPageChange(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Sebelumnya
              </button>
              <span className="px-2 font-semibold text-slate-700">
                Halaman {page} / {totalP}
              </span>
              <button
                onClick={() => onPageChange(Math.min(totalP, page + 1))}
                disabled={page === totalP}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
      </>
    );
  };

  const renderOutletDetailTable = (
    outlets: OutletPerformance[],
    page: number,
    onPageChange: (p: number) => void
  ) => {
    const totalP = Math.max(1, Math.ceil(outlets.length / PAGE_SIZE));
    const start = (page - 1) * PAGE_SIZE;
    const pageItems = outlets.slice(start, start + PAGE_SIZE);

    return (
      <>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                <th className="py-3 px-3">Kode &amp; Nama Outlet</th>
                <th className="py-3 px-3">Depo &amp; Wilayah</th>
                <th className="py-3 px-3 text-center">
                  Klasifikasi
                  <Tooltip
                    title="Klasifikasi Ring"
                    content="Dihitung otomatis: Ring 1 (Mapping), Ring 2 (Pareto/Produktif), Ring 3 (Avg Sales ≥ 100rb), Ring 4 (<100rb)"
                  />
                </th>
                <th className="py-3 px-3 text-right">Omset 2026</th>
                <th className="py-3 px-3 text-right">Avg Sales 2026</th>
                <th className="py-3 px-3 text-center">SKU 2026</th>
                <th className="py-3 px-3 text-center">
                  PA 2026
                  <Tooltip title="AVG PA 2026" content="Rata-rata jumlah SKU aktif bertransaksi per bulan" />
                </th>
                <th className="py-3 px-3 text-center">
                  F12
                  <Tooltip title="F Last 12M" content="Frekuensi bulan bertransaksi dalam 12 bulan terakhir" />
                </th>
                <th className="py-3 px-3 text-center">
                  F3
                  <Tooltip title="F3" content="Frekuensi bulan bertransaksi dalam 3 bulan terakhir" />
                </th>
                <th className="py-3 px-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-slate-400">
                    Tidak ada outlet.
                  </td>
                </tr>
              ) : (
                pageItems.map((outlet) => {
                  const isR1 = outlet.calculatedRing === 'Ring 1';
                  const isR2 = outlet.calculatedRing === 'Ring 2';
                  const isR3 = outlet.calculatedRing === 'Ring 3';
                  const ringBadge = isR1
                    ? 'bg-emerald-100 text-emerald-800'
                    : isR2
                    ? 'bg-blue-100 text-blue-800'
                    : isR3
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-100 text-slate-700';

                  return (
                    <tr key={outlet.kodeCustNfiGroup} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">{outlet.namaCustomerBaru}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{outlet.kodeCustNfiGroup}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-700">{outlet.depo}</div>
                        <div className="text-[11px] text-slate-400">
                          {outlet.kabupaten} • {outlet.kecamatan}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-md ${ringBadge}`}>
                          {outlet.calculatedRing}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                        {formatRupiah(outlet.omset2026)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-700">
                        {formatRupiah(outlet.avgSales2026)}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-800 font-medium">{outlet.sku2026}</td>
                      <td className="py-2.5 px-3 text-center text-indigo-600 font-semibold">{outlet.avgPa2026}</td>
                      <td className="py-2.5 px-3 text-center text-slate-700">{outlet.fLast12m}</td>
                      <td className="py-2.5 px-3 text-center text-slate-700">{outlet.f3}</td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {onNavigateToCallPlan && (
                          <button
                            onClick={() => onNavigateToCallPlan(outlet.kodeCustNfiGroup)}
                            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-1"
                          >
                            <span>Call Plan</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {outlets.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-600">
            <span>
              Menampilkan {start + 1}–{Math.min(page * PAGE_SIZE, outlets.length)} dari{' '}
              {outlets.length.toLocaleString('id-ID')} outlet
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onPageChange(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Sebelumnya
              </button>
              <span className="px-2 font-semibold text-slate-700">
                Halaman {page} / {totalP}
              </span>
              <button
                onClick={() => onPageChange(Math.min(totalP, page + 1))}
                disabled={page === totalP}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
      </>
    );
  };

  // "Tabel Detail Outlet" tab: Outlet Termapping (collapsed by default,
  // paginated) then Outlet Belum Termapping grouped per Depo (each Depo its
  // own collapsible section, paginated within)
  const renderOutletOverviewTab = () => (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => setIsMappedSectionOpen((v) => !v)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50/70 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            {isMappedSectionOpen ? (
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            )}
            <div>
              <h3 className="font-bold text-sm text-slate-800">Outlet Termapping</h3>
              <p className="text-xs text-slate-500">
                {mappedOutletRows.length.toLocaleString('id-ID')} outlet sudah ada di data Mapping
              </p>
            </div>
          </div>
        </button>
        {isMappedSectionOpen && (
          <div className="border-t border-slate-100">
            {renderMappedOutletTable(mappedOutletRows, mappedPage, setMappedPage)}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-bold text-sm text-slate-800">Outlet Belum Termapping per Depo</h3>
          <p className="text-xs text-slate-500">
            {totalUnmappedCount.toLocaleString('id-ID')} outlet di {Object.keys(unmappedByDepo).length} Depo belum ada di data Mapping
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {Object.keys(unmappedByDepo).length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400">
              Semua outlet pada filter saat ini sudah termapping.
            </div>
          ) : (
            Object.keys(unmappedByDepo)
              .sort()
              .map((depoName) => {
                const depoOutlets = unmappedByDepo[depoName];
                const isExpanded = expandedUnmappedDepos.has(depoName);
                return (
                  <div key={depoName}>
                    <button
                      type="button"
                      onClick={() => toggleUnmappedDepoExpanded(depoName)}
                      className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-50/70 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span className="text-sm font-bold text-slate-900">{depoName}</span>
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
                        {depoOutlets.length.toLocaleString('id-ID')} outlet
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50/30">
                        {renderOutletDetailTable(
                          depoOutlets,
                          getUnmappedDepoPage(depoName),
                          (p) => setUnmappedDepoPage(depoName, p)
                        )}
                      </div>
                    )}
                  </div>
                );
              })
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {performance.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-10 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-500 mb-4">
            <FileSpreadsheet className="w-8 h-8" />
          </div>
          <h2 className="text-base font-bold text-slate-900 mb-1">Belum Ada Data Performance</h2>
          <p className="text-xs text-slate-500 max-w-sm mb-5">
            Data outlet belum tersambung ke Google Sheets di sesi ini. Klik tombol di bawah untuk menyinkronkan data terbaru.
          </p>
          <button
            onClick={syncWithGoogleSheets}
            disabled={syncStatus === 'syncing'}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-2 disabled:opacity-60"
          >
            <RotateCw className={`w-4 h-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
            {syncStatus === 'syncing' ? 'Menyinkronkan...' : 'Sambungkan & Sync Data'}
          </button>
        </div>
      ) : (
      <>
      {/* Top Filter & Toolbar Bar */}
      <div className="bg-white p-4 lg:p-5 rounded-2xl shadow-xs border border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Dashboard Performance Outlet</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Analisis Pareto per Depo, Klasifikasi Otomatis Ring 1–4, &amp; Deteksi Dorman
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Year Selector */}
            <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
              {(['2024', '2025', '2026'] as const).map((year) => (
                <button
                  key={year}
                  onClick={() => setSelectedYear(year)}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    selectedYear === year
                      ? 'bg-white text-indigo-600 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tahun {year}
                </button>
              ))}
            </div>

            {/* Export Buttons */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleExport('xlsx')}
                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-xl border border-emerald-200 flex items-center gap-1.5 transition-colors"
                title="Download data terfilter ke format Excel"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Excel</span>
              </button>
              <button
                onClick={() => handleExport('csv')}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
                title="Download CSV"
              >
                CSV
              </button>
            </div>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="pt-4 flex flex-col lg:flex-row gap-3">
          {/* Quick Search — standalone, visually distinct from the filter group */}
          <div className="relative lg:w-64 shrink-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Cari kode/nama outlet..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Filter dropdowns — grouped together in one tinted container */}
          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-2 bg-slate-50 border border-slate-100 rounded-xl p-2">
          {/* Distributor Filter */}
          <div>
            <select
              value={selectedDist}
              onChange={(e) => {
                setSelectedDist(e.target.value);
                setSelectedDepo('ALL');
              }}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">Semua Distributor ({distOptions.length})</option>
              {distOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* Depo Filter */}
          <div>
            <select
              value={selectedDepo}
              onChange={(e) => setSelectedDepo(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">Semua Depo ({depoOptions.length})</option>
              {depoOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* Kabupaten Filter */}
          <div>
            <select
              value={selectedKabupaten}
              onChange={(e) => setSelectedKabupaten(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">Semua Kabupaten/Kota</option>
              {kabupatenOptions.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>

          {/* Ring Filter */}
          <div>
            <select
              value={selectedRing}
              onChange={(e) => setSelectedRing(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">Semua Ring Klasifikasi</option>
              <option value="Ring 1">Ring 1 (Mapping Active)</option>
              <option value="Ring 2">Ring 2 (Pareto ≤80% / Produktif)</option>
              <option value="Ring 3">Ring 3 (Avg Sales ≥ 100rb)</option>
              <option value="Ring 4">Ring 4 (Avg Sales &lt; 100rb)</option>
            </select>
          </div>
          </div>
        </div>

        {/* Supervisor Scope Notice */}
        {!isManager && (
          <div className="mt-3 px-3 py-1.5 bg-blue-50/70 border border-blue-200 text-blue-700 text-xs rounded-xl flex items-center justify-between">
            <span>
              Akses Supervisor aktif: Data otomatis terkunci ke distributor tanggung jawab Anda (<strong>{currentUser?.namaPic}</strong>).
            </span>
            <span className="text-[11px] font-semibold text-blue-800 uppercase tracking-wider">
              {accessibleDepo.join(', ')}
            </span>
          </div>
        )}
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Omset */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Omset</span>
            <Tooltip
              title="Total Omset"
              content="Akumulasi omset seluruh outlet pada tahun terpilih."
            />
          </div>
          <div className="mt-2">
            <p className="text-base lg:text-lg font-bold text-slate-900 leading-tight">
              {formatRupiah(totalOmset)}
            </p>
            <div className="mt-1 flex items-center gap-1 text-[11px]">
              {yoyGrowth >= 0 ? (
                <span className="text-emerald-600 font-semibold flex items-center">
                  <TrendingUp className="w-3 h-3 mr-0.5" /> +{yoyGrowth.toFixed(1)}% YoY
                </span>
              ) : (
                <span className="text-rose-600 font-semibold flex items-center">
                  <TrendingDown className="w-3 h-3 mr-0.5" /> {yoyGrowth.toFixed(1)}% YoY
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Outlet Aktif */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Outlet Aktif</span>
            <Tooltip
              title="Frekuensi Transaksi"
              content="Outlet yang memiliki frekuensi bertransaksi F > 0 dalam tahun terpilih."
            />
          </div>
          <div className="mt-2">
            <p className="text-base lg:text-lg font-bold text-slate-900 leading-tight">
              {activeOutletCount}{' '}
              <span className="text-xs font-normal text-slate-400">/ {filteredData.length}</span>
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {filteredData.length > 0
                ? `${Math.round((activeOutletCount / filteredData.length) * 100)}% aktif berbelanja`
                : '-'}
            </p>
          </div>
        </div>

        {/* Rata-rata SKU */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Rata-rata SKU</span>
            <Tooltip
              title="Rata-rata SKU"
              content="Rata-rata jumlah SKU yang dibeli per toko per tahun."
            />
          </div>
          <div className="mt-2">
            <p className="text-base lg:text-lg font-bold text-slate-900 leading-tight">
              {avgSku}{' '}
              <span className="text-xs font-normal text-slate-400">item/toko</span>
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Kedalaman varian produk</p>
          </div>
        </div>

        {/* AVG PA */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">AVG PA (Produk Aktif)</span>
            <Tooltip
              title="AVG PA (Produk Aktif)"
              content="Rata-rata jumlah SKU/item aktif bertransaksi per toko per bulan."
            />
          </div>
          <div className="mt-2">
            <p className="text-base lg:text-lg font-bold text-indigo-600 leading-tight">
              {avgPa}{' '}
              <span className="text-xs font-normal text-slate-400">item/bln</span>
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Keaktifan repeat purchase</p>
          </div>
        </div>

        {/* Avg Sales */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Avg Sales / Toko</span>
            <Tooltip
              title="Avg Sales"
              content="Rata-rata omset per toko per bulan (bukan omset total)."
            />
          </div>
          <div className="mt-2">
            <p className="text-base lg:text-lg font-bold text-slate-900 leading-tight">
              {formatRupiah(avgSalesPerStore)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Omset rata-rata bulanan</p>
          </div>
        </div>

        {/* Dorman / Churn Risk Watchlist */}
        <div
          className={`p-4 rounded-2xl border shadow-xs flex flex-col justify-between transition-all ${
            watchlistItems.length > 0
              ? 'bg-rose-50/70 border-rose-300 border-2 shadow-rose-100/50'
              : 'bg-rose-50/40 border-rose-100'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-700">Perlu Perhatian</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2">
            <p className="text-base lg:text-lg font-bold text-rose-800 leading-tight">
              {watchlistItems.length}{' '}
              <span className="text-xs font-normal text-rose-600">outlet</span>
            </p>
            <button
              onClick={() => setActiveSection('watchlist')}
              className="mt-1 text-[11px] font-semibold text-rose-700 hover:text-rose-900 hover:underline flex items-center gap-0.5"
            >
              Lihat Watchlist <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Ring Distribution Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Award className="w-4 h-4 text-indigo-600" />
              <span>Distribusi Outlet &amp; Kontribusi Omset per Ring Klasifikasi</span>
              <Tooltip
                title="Aturan Klasifikasi Otomatis"
                content="Ring 1: Mapping Active. Ring 2: Pareto ≤80% ATAU Aktif & Produktif (PA≥40% & SKU≥Line/RO Depo). Ring 3: Avg Sales ≥ 100rb. Ring 4: Avg Sales < 100rb."
              />
            </h3>
            <p className="text-xs text-slate-500">
              Evaluasi struktur basis outlet dan ketergantungan pendapatan
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {ringStats.map((item) => {
            const isR1 = item.ring === 'Ring 1';
            const isR2 = item.ring === 'Ring 2';
            const isR3 = item.ring === 'Ring 3';

            const bgClass = isR1
              ? 'bg-emerald-50/70 border-emerald-200'
              : isR2
              ? 'bg-blue-50/70 border-blue-200'
              : isR3
              ? 'bg-amber-50/70 border-amber-200'
              : 'bg-slate-50 border-slate-200';

            const badgeClass = isR1
              ? 'bg-emerald-600 text-white'
              : isR2
              ? 'bg-blue-600 text-white'
              : isR3
              ? 'bg-amber-500 text-white'
              : 'bg-slate-500 text-white';

            return (
              <div
                key={item.ring}
                className={`p-3.5 rounded-xl border ${bgClass} transition-all hover:shadow-xs`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${badgeClass}`}>
                    {item.ring}
                  </span>
                  <span className="text-xs font-bold text-slate-700">
                    {item.omsetPct.toFixed(1)}% Omset
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-500">Jumlah Toko:</span>
                    <span className="text-xs font-bold text-slate-800">{item.count} outlet</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-500">Kontribusi:</span>
                    <span className="text-xs font-bold text-slate-900">
                      {formatRupiah(item.omset)}
                    </span>
                  </div>
                </div>

                {/* Mini progress bar */}
                <div className="w-full bg-slate-200 h-2.5 rounded-full mt-3 overflow-hidden ring-1 ring-black/5">
                  <div
                    className={`h-full rounded-full ${
                      isR1 ? 'bg-emerald-500' : isR2 ? 'bg-blue-500' : isR3 ? 'bg-amber-500' : 'bg-slate-500'
                    }`}
                    style={{ width: `${Math.max(3, Math.min(100, item.omsetPct))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sub-Navigation Tabs inside Performance */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-100 rounded-2xl border border-slate-200 max-w-full overflow-x-auto">
        {[
          { id: 'overview', label: 'Tabel Detail Outlet' },
          { id: 'pareto', label: 'Tabel Pareto per Depo (80/20)' },
          { id: 'gainers', label: 'Top Gainer & Decliner' },
          { id: 'coverage', label: 'Coverage MDS vs Call Plan' },
          {
            id: 'watchlist',
            label: `Watchlist Dorman (${watchlistItems.length})`,
            alert: watchlistItems.length > 0,
          },
          { id: 'mds_leaderboard', label: 'Ranking Performa MDS' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id as any)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeSection === tab.id
                ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-black/5'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <span>{tab.label}</span>
            {tab.alert && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            )}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW / DETAIL TABLE */}
      {activeSection === 'overview' && renderOutletOverviewTab()}

      {/* TAB 2: TABEL PARETO PER DEPO */}
      {activeSection === 'pareto' && (
        <div className="space-y-6">
          <div className="bg-amber-50/80 border border-amber-200 p-4 rounded-2xl text-xs text-amber-900 flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold">Prinsip Analisis Pareto (Aturan Per Depo):</strong>
              <p className="mt-0.5 text-amber-800 leading-relaxed">
                % Kontribusi dan % Kumulatif dihitung ulang per Depo dengan mengurutkan omset outlet dari terbesar ke terkecil. Baris yang disorot kuning menandai batas kumulatif 80% (Core Pareto Outlets yang menghasilkan 80% omset depo).
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">{Object.keys(paretoPerDepo).length} Depo</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setExpandedDepos(new Set(Object.keys(paretoPerDepo)))}
                className="text-xs text-indigo-600 hover:underline font-semibold"
              >
                Buka Semua
              </button>
              <span className="text-slate-300">|</span>
              <button
                onClick={() => setExpandedDepos(new Set())}
                className="text-xs text-indigo-600 hover:underline font-semibold"
              >
                Tutup Semua
              </button>
            </div>
          </div>

          {Object.keys(paretoPerDepo).map((depoName) => {
            const depoOutlets = paretoPerDepo[depoName];
            const depoTotal = depoOutlets.reduce((s, i) => s + (i.omset2026 || 0), 0);
            const isExpanded = expandedDepos.has(depoName);

            return (
              <div
                key={depoName}
                className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleDepoExpanded(depoName)}
                  className="w-full p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-left hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <div>
                      <h4 className="font-bold text-sm text-slate-900">{depoName}</h4>
                      <p className="text-xs text-slate-500">
                        Total Omset Depo: <strong>{formatRupiah(depoTotal)}</strong> ({depoOutlets.length} outlet)
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg self-start sm:self-auto">
                    {depoOutlets.filter((o) => o.isPareto80).length} Outlet Pareto (≤80%)
                  </span>
                </button>

                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-semibold">
                          <th className="py-2.5 px-3 w-12 text-center">Rank</th>
                          <th className="py-2.5 px-3">Kode &amp; Nama Outlet</th>
                          <th className="py-2.5 px-3 text-center">Klasifikasi</th>
                          <th className="py-2.5 px-3 text-right">Omset 2026</th>
                          <th className="py-2.5 px-3 text-right">% Kontribusi</th>
                          <th className="py-2.5 px-3 text-right">% Kumulatif</th>
                          <th className="py-2.5 px-3 text-center">Status Pareto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {depoOutlets.map((outlet, idx) => {
                          const isBorderline =
                            outlet.isPareto80 &&
                            (idx === depoOutlets.length - 1 || !depoOutlets[idx + 1].isPareto80);

                          return (
                            <tr
                              key={outlet.kodeCustNfiGroup}
                              className={`${
                                outlet.isPareto80
                                  ? 'bg-amber-50/40 hover:bg-amber-50/70 font-medium'
                                  : 'hover:bg-slate-50'
                              } ${isBorderline ? 'border-b-2 border-b-amber-400' : ''}`}
                            >
                              <td className="py-2 px-3 text-center text-slate-400 font-mono">
                                #{idx + 1}
                              </td>
                              <td className="py-2 px-3">
                                <span className="font-bold text-slate-900">
                                  {outlet.namaCustomerBaru}
                                </span>
                                <span className="text-[11px] text-slate-400 ml-2">
                                  ({outlet.kodeCustNfiGroup})
                                </span>
                              </td>
                              <td className="py-2 px-3 text-center">
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-800">
                                  {outlet.calculatedRing}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right font-bold text-slate-900">
                                {formatRupiah(outlet.omset2026)}
                              </td>
                              <td className="py-2 px-3 text-right text-slate-700">
                                {outlet.kontribusi.toFixed(2)}%
                              </td>
                              <td className="py-2 px-3 text-right font-bold text-slate-900">
                                {outlet.kumulatif.toFixed(2)}%
                              </td>
                              <td className="py-2 px-3 text-center">
                                {outlet.isPareto80 ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                                    <CheckCircle className="w-3 h-3" /> Core 80%
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400">Long Tail 20%</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 3: TOP GAINERS & DECLINERS */}
      {activeSection === 'gainers' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Gainers */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-emerald-50/60 border-b border-emerald-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                <h4 className="font-bold text-sm text-slate-900">Top 10 Gainer (% Growth Sales)</h4>
              </div>
              <span className="text-xs text-emerald-700 font-semibold">Tahun 2026 vs 2025</span>
            </div>
            <div className="divide-y divide-slate-100">
              {topGainers.map((item, idx) => (
                <div key={item.kodeCustNfiGroup} className="p-3.5 flex items-center justify-between hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="font-bold text-xs text-slate-900">{item.namaCustomerBaru}</p>
                      <p className="text-[11px] text-slate-400">
                        {item.depo} • {item.calculatedRing}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-emerald-600 block">
                      +{item.grAvgSales.toFixed(1)}%
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {formatRupiah(item.omset2026)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Decliners */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-rose-50/60 border-b border-rose-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-rose-600" />
                <h4 className="font-bold text-sm text-slate-900">Top 10 Decliner (% Growth Sales)</h4>
              </div>
              <span className="text-xs text-rose-700 font-semibold">Tahun 2026 vs 2025</span>
            </div>
            <div className="divide-y divide-slate-100">
              {topDecliners.map((item, idx) => (
                <div key={item.kodeCustNfiGroup} className="p-3.5 flex items-center justify-between hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-rose-100 text-rose-800 text-xs font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="font-bold text-xs text-slate-900">{item.namaCustomerBaru}</p>
                      <p className="text-[11px] text-slate-400">
                        {item.depo} • {item.calculatedRing}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-rose-600 block">
                      {item.grAvgSales.toFixed(1)}%
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {formatRupiah(item.omset2026)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: COVERAGE MDS VS CALL PLAN */}
      {activeSection === 'coverage' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-900">
                Coverage MDS vs Call Plan
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Join Performance + Call Plan: menandai outlet yang dijadwalkan tetapi LAST ORDER sudah lama (&gt;2 bulan) atau omset minim.
              </p>
            </div>
            <span className="text-xs font-semibold px-3 py-1 bg-indigo-50 text-indigo-700 rounded-xl">
              {coverageData.filter((c) => c.isScheduled).length} Outlet Tercover Jadwal
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <th className="py-3 px-3">Kode &amp; Nama Toko</th>
                  <th className="py-3 px-3">Depo</th>
                  <th className="py-3 px-3 text-center">Ring</th>
                  <th className="py-3 px-3 text-center">MDS Ditugaskan</th>
                  <th className="py-3 px-3 text-center">Status Call Plan</th>
                  <th className="py-3 px-3 text-right">Omset 2026</th>
                  <th className="py-3 px-3 text-center">Last Order</th>
                  <th className="py-3 px-3 text-center">Evaluasi Kunjungan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedCoverageData.map((item) => (
                  <tr key={item.kodeCustNfiGroup} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900">{item.namaCustomerBaru}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {item.kodeCustNfiGroup}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{item.depo}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-700">
                      {item.calculatedRing}
                    </td>
                    <td className="py-2.5 px-3 text-center font-semibold text-slate-800">
                      {item.assignedMds ? (
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md">
                          {item.assignedMds}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Belum Ada</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {item.isScheduled ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                          <CheckCircle className="w-3 h-3" /> Terjadwal
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                          <Clock className="w-3 h-3" /> Belum Dijadwal
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                      {formatRupiah(item.omset2026)}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap text-slate-600">
                      {item.lastOrder}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {item.isInactiveWarning ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-100 text-rose-800 rounded-full inline-block">
                          Dijadwalkan tapi Dorman / Omset Minim!
                        </span>
                      ) : item.isScheduled ? (
                        <span className="text-[10px] text-emerald-700 font-medium">Optimal</span>
                      ) : (
                        <button
                          onClick={() => onNavigateToCallPlan && onNavigateToCallPlan(item.kodeCustNfiGroup)}
                          className="text-[11px] text-indigo-600 hover:underline font-semibold"
                        >
                          + Tambah Call Plan
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {coverageData.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-600">
              <span>
                Menampilkan {(coveragePage - 1) * PAGE_SIZE + 1}
                –{Math.min(coveragePage * PAGE_SIZE, coverageData.length)} dari{' '}
                {coverageData.length.toLocaleString('id-ID')} outlet
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCoveragePage((p) => Math.max(1, p - 1))}
                  disabled={coveragePage === 1}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
                >
                  Sebelumnya
                </button>
                <span className="px-2 font-semibold text-slate-700">
                  Halaman {coveragePage} / {coverageTotalPages}
                </span>
                <button
                  onClick={() => setCoveragePage((p) => Math.min(coverageTotalPages, p + 1))}
                  disabled={coveragePage === coverageTotalPages}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
                >
                  Berikutnya
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: WATCHLIST OUTLET DORMAN / BERISIKO CHURN */}
      {activeSection === 'watchlist' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 bg-rose-50/50 border-b border-rose-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-sm text-rose-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Watchlist Outlet Dorman &amp; Berisiko Churn ({watchlistItems.length} Outlet)</span>
              </h3>
              <p className="text-xs text-rose-700 mt-0.5">
                Kriteria: Last Order &gt;2 bulan (badge merah) atau klasifikasi Ring turun dibanding bulan sebelumnya (badge kuning).
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {watchlistItems.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                Bagus! Tidak ada outlet dorman atau mengalami churn risk saat ini.
              </div>
            ) : (
              paginatedWatchlistItems.map((outlet) => (
                <div
                  key={outlet.kodeCustNfiGroup}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-rose-50/20 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">
                        {outlet.namaCustomerBaru}
                      </span>
                      <span className="text-xs font-mono text-slate-400">
                        ({outlet.kodeCustNfiGroup})
                      </span>

                      {outlet.isDormant && (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                          DORMAN (&gt; 2 Bulan)
                        </span>
                      )}

                      {outlet.isChurnRisk && (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                          TURUN RING: {outlet.previousRing} → {outlet.calculatedRing}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-600">
                      {outlet.alamat} • {outlet.kecamatan}, {outlet.kabupaten} ({outlet.depo})
                    </p>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-0.5">
                      <span>
                        Last Order:{' '}
                        <strong className="text-rose-700">{outlet.lastOrder || 'Tidak Ada'}</strong>
                      </span>
                      <span>
                        Omset 2026: <strong>{formatRupiah(outlet.omset2026)}</strong>
                      </span>
                      <span>
                        MDS Ditugaskan:{' '}
                        <strong>{outlet.assignedMds || 'Belum Dijadwalkan'}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {onNavigateToCallPlan && (
                      <button
                        onClick={() => onNavigateToCallPlan(outlet.kodeCustNfiGroup)}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Atur Jadwal Kunjungan MDS</span>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {watchlistItems.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-600">
              <span>
                Menampilkan {(watchlistPage - 1) * PAGE_SIZE + 1}
                –{Math.min(watchlistPage * PAGE_SIZE, watchlistItems.length)} dari{' '}
                {watchlistItems.length.toLocaleString('id-ID')} outlet
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setWatchlistPage((p) => Math.max(1, p - 1))}
                  disabled={watchlistPage === 1}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
                >
                  Sebelumnya
                </button>
                <span className="px-2 font-semibold text-slate-700">
                  Halaman {watchlistPage} / {watchlistTotalPages}
                </span>
                <button
                  onClick={() => setWatchlistPage((p) => Math.min(watchlistTotalPages, p + 1))}
                  disabled={watchlistPage === watchlistTotalPages}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
                >
                  Berikutnya
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: RANKING PERFORMA MDS */}
      {activeSection === 'mds_leaderboard' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" />
                <span>Leaderboard &amp; Ranking Performa MDS</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Evaluasi jumlah outlet dikelola, rata-rata growth omset, dan penanganan outlet dorman per MDS
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-3 px-3 text-center w-12">Rank</th>
                  <th className="py-3 px-3">Nama MDS</th>
                  <th className="py-3 px-3 text-center">Outlet Dikelola</th>
                  <th className="py-3 px-3 text-right">Total Omset Terkelola</th>
                  <th className="py-3 px-3 text-right">Rata-rata % Growth</th>
                  <th className="py-3 px-3 text-center">Outlet Dorman</th>
                  <th className="py-3 px-3 text-center">Naik / Turun Ring</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mdsLeaderboard.map((mds, idx) => (
                  <tr key={mds.namaMds} className="hover:bg-slate-50">
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`w-6 h-6 rounded-full inline-flex items-center justify-center font-bold text-xs ${
                          idx === 0
                            ? 'bg-amber-100 text-amber-800'
                            : idx === 1
                            ? 'bg-slate-200 text-slate-800'
                            : idx === 2
                            ? 'bg-amber-50 text-amber-700'
                            : 'text-slate-400'
                        }`}
                      >
                        {idx + 1}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-bold text-slate-900 text-sm">{mds.namaMds}</span>
                    </td>
                    <td className="py-3 px-3 text-center font-semibold text-slate-700">
                      {mds.outletCount} toko
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-slate-900">
                      {formatRupiah(mds.totalOmset)}
                    </td>
                    <td className="py-3 px-3 text-right font-semibold">
                      <span className={mds.avgGrowth >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                        {mds.avgGrowth >= 0 ? '+' : ''}
                        {mds.avgGrowth.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {mds.dormanCount > 0 ? (
                        <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[11px]">
                          {mds.dormanCount} dorman
                        </span>
                      ) : (
                        <span className="text-emerald-600 font-semibold">0 dorman</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="text-emerald-600 font-semibold">+{mds.upgradedCount}</span>
                      <span className="text-slate-400 mx-1">/</span>
                      <span className="text-rose-600 font-semibold">-{mds.downgradedCount}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
    )}
    </div>
  );
};