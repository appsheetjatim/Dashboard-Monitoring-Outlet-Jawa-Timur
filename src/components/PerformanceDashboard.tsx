import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { OutletPerformance } from '../types';
import { Tooltip } from './Tooltip';
import { MultiSelectDropdown } from './MultiSelectDropdown';
import { PageSizeSelector } from './PageSizeSelector';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import {
  TrendingUp,
  TrendingDown,
  Store,
  Award,
  AlertTriangle,
  FileSpreadsheet,
  Download,
  Search,
  Filter,
  Users,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Calendar,
  CheckCircle,
  Clock,
  Sparkles,
  RotateCw,
  MapPin,
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
  const [selectedDist, setSelectedDist] = useState<string[]>([]);
  const [selectedDepo, setSelectedDepo] = useState<string[]>([]);
  const [selectedKabupaten, setSelectedKabupaten] = useState<string[]>([]);
  const [selectedKecamatan, setSelectedKecamatan] = useState<string[]>([]);
  const [selectedRing, setSelectedRing] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery);

  // Sorting
  const [sortField, setSortField] = useState<keyof OutletPerformance>('omset2026');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [mappedSortField, setMappedSortField] = useState<keyof MappedOutletRow>('omset');
  const [mappedSortDirection, setMappedSortDirection] = useState<'asc' | 'desc'>('desc');

  // Active view tab inside Dashboard
  const [activeSection, setActiveSection] = useState<
    'overview' | 'pareto' | 'gainers' | 'coverage' | 'watchlist' | 'mds_leaderboard'
  >('overview');

  // Pagination for Tabel Detail Outlet — selectable page size (10/25/50),
  // shared across all paginated tables on this page (Termapping, Belum
  // Termapping per Depo, Coverage, Watchlist).
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Changing how many rows show per page shifts what "page 3" even means,
  // so land back on page 1 everywhere rather than risk landing on a now
  // out-of-range page.
  useEffect(() => {
    setCurrentPage(1);
    setCoveragePage(1);
    setWatchlistPage(1);
    setMappedPage(1);
    setUnmappedDepoPages({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize]);

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
  }, [selectedYear, selectedDist, selectedDepo, selectedKabupaten, selectedKecamatan, selectedRing, searchQuery, sortField, sortDirection]);

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

      if (selectedDist.length > 0 && !selectedDist.includes(item.dist)) return false;
      if (selectedDepo.length > 0 && !selectedDepo.includes(item.depo)) return false;
      if (selectedKabupaten.length > 0 && !selectedKabupaten.includes(item.kabupaten)) return false;
      if (selectedKecamatan.length > 0 && !selectedKecamatan.includes(item.kecamatan)) return false;
      if (selectedRing.length > 0 && !selectedRing.includes(item.calculatedRing)) return false;

      if (debouncedSearchQuery.trim()) {
        const q = debouncedSearchQuery.toLowerCase();
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
    selectedKecamatan,
    selectedRing,
    debouncedSearchQuery,
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
    latitude?: number;
    longitude?: number;
  }

  const mappedOutletRows = useMemo(() => {
    let list = mappings.filter((m) => m.status === 'Active');

    if (!isManager && accessibleDepo.length > 0) {
      list = list.filter(
        (m) => accessibleDepo.includes(m.depoBsp) || accessibleDepo.includes(m.subDistUdn)
      );
    }
    if (selectedDepo.length > 0) {
      list = list.filter((m) => selectedDepo.includes(m.depoBsp) || selectedDepo.includes(m.subDistUdn));
    }
    if (selectedKabupaten.length > 0) {
      list = list.filter((m) => selectedKabupaten.includes(m.kabupaten));
    }
    if (selectedKecamatan.length > 0) {
      list = list.filter((m) => selectedKecamatan.includes(m.kecamatan));
    }
    if (selectedRing.length > 0) {
      list = list.filter((m) => selectedRing.includes(m.klasifikasiOutlet));
    }
    if (selectedDist.length > 0) {
      list = list.filter((m) => {
        if (selectedDist.includes('BSP') && !!m.bspCode1) return true;
        if (selectedDist.includes('UDN') && !!m.udnCode1) return true;
        return false;
      });
    }
    if (debouncedSearchQuery.trim()) {
      const q = debouncedSearchQuery.trim().toLowerCase();
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

      // Show BOTH depots when a mapped outlet spans both sides (BSP depot
      // and UDN sub-dist can genuinely differ) — showing only one silently
      // hid half the picture for dual-sided outlets.
      const depoLabel =
        mapping.depoBsp && mapping.subDistUdn && mapping.depoBsp !== mapping.subDistUdn
          ? `${mapping.depoBsp} / ${mapping.subDistUdn}`
          : mapping.depoBsp || mapping.subDistUdn;

      return {
        code: mapping.customerSoGroupAreaCode,
        name: mapping.customerSoGroupArea,
        depo: depoLabel,
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
        latitude: mapping.latitude,
        longitude: mapping.longitude,
      };
    });
  }, [
    mappings,
    performanceByCode,
    isManager,
    accessibleDepo,
    selectedDepo,
    selectedKabupaten,
    selectedKecamatan,
    selectedRing,
    selectedDist,
    debouncedSearchQuery,
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
    return Array.from(new Set(list.filter(Boolean))).sort();
  }, [performance, isManager, accessibleDistributors]);

  const depoOptions = useMemo(() => {
    const subset =
      selectedDist.length > 0 ? performance.filter((p) => selectedDist.includes(p.dist)) : performance;
    const list = isManager ? subset.map((p) => p.depo) : accessibleDepo;
    return Array.from(new Set(list.filter(Boolean))).sort();
  }, [performance, isManager, accessibleDepo, selectedDist]);

  // Base pool for Kabupaten/Kecamatan options: respects access + Dist + Depo,
  // but deliberately NOT Kabupaten/Kecamatan themselves — otherwise picking
  // one Kabupaten would shrink its own dropdown to just that one value,
  // making it impossible to add more to a multi-select.
  const locationOptionsPool = useMemo(() => {
    return performance.filter((item) => {
      if (!isManager && accessibleDepo.length > 0 && !accessibleDepo.includes(item.depo)) return false;
      if (selectedDist.length > 0 && !selectedDist.includes(item.dist)) return false;
      if (selectedDepo.length > 0 && !selectedDepo.includes(item.depo)) return false;
      return true;
    });
  }, [performance, isManager, accessibleDepo, selectedDist, selectedDepo]);

  const kabupatenOptions = useMemo(() => {
    return Array.from(new Set(locationOptionsPool.map((p) => p.kabupaten).filter(Boolean))).sort();
  }, [locationOptionsPool]);

  const kecamatanOptions = useMemo(() => {
    const pool =
      selectedKabupaten.length > 0
        ? locationOptionsPool.filter((p) => selectedKabupaten.includes(p.kabupaten))
        : locationOptionsPool;
    return Array.from(new Set(pool.map((p) => p.kecamatan).filter(Boolean))).sort();
  }, [locationOptionsPool, selectedKabupaten]);

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

  // Portfolio-level Avg Sales — SUM of each outlet's own Avg Sales field
  // (not divided by outlet count, and not Total Sales / 12 either): each
  // outlet's Avg Sales is already its own monthly average, so adding them
  // together gives the combined monthly average across the whole portfolio.
  const avgSalesTotal = useMemo(() => {
    return filteredData.reduce((s, item) => {
      if (selectedYear === '2024') return s + (item.avgSales2024 || 0);
      if (selectedYear === '2025') return s + (item.avgSales2025 || 0);
      return s + (item.avgSales2026 || 0);
    }, 0);
  }, [filteredData, selectedYear]);

  const avgSalesTotalPrev = useMemo(() => {
    return filteredData.reduce((s, item) => {
      if (selectedYear === '2025') return s + (item.avgSales2024 || 0);
      if (selectedYear === '2026') return s + (item.avgSales2025 || 0);
      return s + (item.avgSales2024 || 0);
    }, 0);
  }, [filteredData, selectedYear]);

  const avgSalesGrowth =
    avgSalesTotalPrev > 0 ? ((avgSalesTotal - avgSalesTotalPrev) / avgSalesTotalPrev) * 100 : 0;

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

    // Mapped outlets count once (their combined BSP+UDN figures) instead of
    // as separate raw rows — otherwise a dual-sided outlet inflates its
    // ring's outlet count and skews Line/RO. Unmapped outlets have no single
    // code to combine into, so they're still counted individually per Depo.
    type RingUnit = { ring: string; omset: number; sku: number };
    const mappedUnits: RingUnit[] = mappedOutletRows.map((m) => ({
      ring: m.klasifikasi,
      omset: m.omset,
      sku: m.sku,
    }));
    const unmappedUnits: RingUnit[] = filteredData
      .filter((p) => !mappedCodes.has(p.kodeCustNfiGroup))
      .map((p) => ({
        ring: p.calculatedRing,
        omset: p.omset2026 || 0,
        sku: p.sku2026 || 0,
      }));
    const allUnits = [...mappedUnits, ...unmappedUnits];
    const grandTotal2026 = allUnits.reduce((sum, i) => sum + i.omset, 0) || 1;

    return rings.map((ring) => {
      const items = allUnits.filter((i) => i.ring === ring);
      const ringOmset = items.reduce((sum, i) => sum + i.omset, 0);
      const ringSku = items.reduce((sum, i) => sum + i.sku, 0);
      const omsetPct = (ringOmset / grandTotal2026) * 100;
      const lineRo = items.length > 0 ? ringSku / items.length : 0;
      return {
        ring,
        count: items.length,
        omset: ringOmset,
        omsetPct,
        lineRo,
      };
    });
  }, [filteredData, mappedOutletRows, mappedCodes]);

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
  const coverageTotalPages = Math.max(1, Math.ceil(coverageData.length / pageSize));
  const paginatedCoverageData = useMemo(() => {
    const start = (coveragePage - 1) * pageSize;
    return coverageData.slice(start, start + pageSize);
  }, [coverageData, coveragePage]);

  const watchlistTotalPages = Math.max(1, Math.ceil(watchlistItems.length / pageSize));
  const paginatedWatchlistItems = useMemo(() => {
    const start = (watchlistPage - 1) * pageSize;
    return watchlistItems.slice(start, start + pageSize);
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

  // Compact currency format for narrow table cells — full "Rp 13.034.095"
  // can overflow a column, so large values get abbreviated (e.g. "Rp 13.0Jt",
  // "Rp 543.4rb"). Callers should still put the exact value in a title
  // attribute for hover.
  const formatRupiahCompact = (val: number) => {
    const abs = Math.abs(val);
    if (abs >= 1_000_000_000) return 'Rp ' + (val / 1_000_000_000).toFixed(1) + 'M';
    if (abs >= 1_000_000) return 'Rp ' + (val / 1_000_000).toFixed(1) + 'Jt';
    if (abs >= 1_000) return 'Rp ' + (val / 1_000).toFixed(1) + 'rb';
    return 'Rp ' + Math.round(val).toLocaleString('id-ID');
  };

  // Reusable table renderer for outlet detail rows (used by both the
  // "Outlet Termapping" section and each Depo's section under "Belum
  // Termapping"), each with its own independent pagination.
  // Table renderer for "Outlet Termapping" — one row per Mapping (combined
  // BSP+UDN metrics), separate from renderOutletDetailTable which still shows
  // raw per-distributor-code rows for "Belum Termapping".
  const handleMappedSort = (field: keyof MappedOutletRow) => {
    if (mappedSortField === field) {
      setMappedSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setMappedSortField(field);
      setMappedSortDirection('desc');
    }
  };

  const MappedSortIcon: React.FC<{ field: keyof MappedOutletRow }> = ({ field }) =>
    mappedSortField !== field ? (
      <ArrowUpDown className="w-3 h-3 inline ml-1 text-slate-300" />
    ) : mappedSortDirection === 'asc' ? (
      <ChevronUp className="w-3 h-3 inline ml-1 text-indigo-600" />
    ) : (
      <ChevronDown className="w-3 h-3 inline ml-1 text-indigo-600" />
    );

  const renderMappedOutletTable = (
    rowsIn: MappedOutletRow[],
    page: number,
    onPageChange: (p: number) => void
  ) => {
    // Plain sort (not useMemo) — this function is a render helper, not a
    // component, so it can't call hooks itself.
    const rows = [...rowsIn].sort((a, b) => {
      const av = a[mappedSortField];
      const bv = b[mappedSortField];
      if (typeof av === 'number' && typeof bv === 'number') {
        return mappedSortDirection === 'asc' ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      if (as < bs) return mappedSortDirection === 'asc' ? -1 : 1;
      if (as > bs) return mappedSortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    const totalP = Math.max(1, Math.ceil(rows.length / pageSize));
    const start = (page - 1) * pageSize;
    const pageItems = rows.slice(start, start + pageSize);

    return (
      <>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                <th
                  className="py-3 px-3 cursor-pointer select-none hover:text-indigo-700"
                  onClick={() => handleMappedSort('name')}
                >
                  Customer SO Group Area Code &amp; Name
                  <MappedSortIcon field="name" />
                </th>
                <th className="py-3 px-3">Depot &amp; Region</th>
                <th
                  className="py-3 px-3 text-center cursor-pointer select-none hover:text-indigo-700"
                  onClick={() => handleMappedSort('klasifikasi')}
                >
                  Classification
                  <MappedSortIcon field="klasifikasi" />
                  <Tooltip
                    title="Ring Classification"
                    content="Calculated automatically: Ring 1 (Mapping), Ring 2 (Pareto/Productive), Ring 3 (Avg Sales ≥ 100k), Ring 4 (<100k)"
                  />
                </th>
                <th
                  className="py-3 px-3 text-right cursor-pointer select-none hover:text-indigo-700"
                  onClick={() => handleMappedSort('omset')}
                >
                  Sales 2026
                  <MappedSortIcon field="omset" />
                  <Tooltip title="Combined sales" content="Sum of 2026 sales from BSP + UDN" />
                </th>
                <th
                  className="py-3 px-3 text-right cursor-pointer select-none hover:text-indigo-700"
                  onClick={() => handleMappedSort('avgSales')}
                >
                  Avg Sales 2026
                  <MappedSortIcon field="avgSales" />
                  <Tooltip title="Combined Avg Sales" content="Sum of 2026 Avg Sales from BSP + UDN" />
                </th>
                <th
                  className="py-3 px-3 text-center cursor-pointer select-none hover:text-indigo-700"
                  onClick={() => handleMappedSort('sku')}
                >
                  SKU 2026
                  <MappedSortIcon field="sku" />
                  <Tooltip title="Combined SKU" content="Sum of 2026 SKU from BSP + UDN" />
                </th>
                <th
                  className="py-3 px-3 text-center cursor-pointer select-none hover:text-indigo-700"
                  onClick={() => handleMappedSort('avgPa')}
                >
                  PA 2026
                  <MappedSortIcon field="avgPa" />
                  <Tooltip
                    title="Combined AVG PA & % PA"
                    content="AVG PA is summed from BSP + UDN. % PA is recalculated: total PA ÷ total SKU (not summed)"
                  />
                </th>
                <th
                  className="py-3 px-3 text-center cursor-pointer select-none hover:text-indigo-700"
                  onClick={() => handleMappedSort('f12')}
                >
                  F12
                  <MappedSortIcon field="f12" />
                  <Tooltip title="F Last 12M" content="Takes the higher value between the BSP and UDN sides" />
                </th>
                <th
                  className="py-3 px-3 text-center cursor-pointer select-none hover:text-indigo-700"
                  onClick={() => handleMappedSort('f3')}
                >
                  F3
                  <MappedSortIcon field="f3" />
                  <Tooltip title="F3" content="Takes the higher value between the BSP and UDN sides" />
                </th>
                <th className="py-3 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-slate-400">
                    No outlets.
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
                            Performance data not found
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-700">{row.depo}</div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1">
                          <span>
                            {row.kabupaten} • {row.kecamatan}
                          </span>
                          {row.latitude && row.longitude && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${row.latitude},${row.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Open location in Google Maps"
                              className="text-indigo-500 hover:text-indigo-700 shrink-0"
                            >
                              <MapPin className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-md ${ringBadge}`}>
                          {row.klasifikasi}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900" title={row.hasPerformanceData ? formatRupiah(row.omset) : undefined}>
                        {row.hasPerformanceData ? formatRupiahCompact(row.omset) : <span className="text-slate-300 font-normal">-</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-700" title={row.hasPerformanceData ? formatRupiah(row.avgSales) : undefined}>
                        {row.hasPerformanceData ? formatRupiahCompact(row.avgSales) : <span className="text-slate-300">-</span>}
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
            <div className="flex items-center gap-3">
              <span>
                Showing {start + 1}–{Math.min(page * pageSize, rows.length)} of{' '}
                {rows.length.toLocaleString('id-ID')} outlets
              </span>
              <PageSizeSelector value={pageSize} onChange={setPageSize} />
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onPageChange(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Previous
              </button>
              <span className="px-2 font-semibold text-slate-700">
                Page {page} / {totalP}
              </span>
              <button
                onClick={() => onPageChange(Math.min(totalP, page + 1))}
                disabled={page === totalP}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </>
    );
  };

  const handleSort = (field: keyof OutletPerformance) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const SortIcon: React.FC<{ field: keyof OutletPerformance }> = ({ field }) =>
    sortField !== field ? (
      <ArrowUpDown className="w-3 h-3 inline ml-1 text-slate-300" />
    ) : sortDirection === 'asc' ? (
      <ChevronUp className="w-3 h-3 inline ml-1 text-indigo-600" />
    ) : (
      <ChevronDown className="w-3 h-3 inline ml-1 text-indigo-600" />
    );

  const renderOutletDetailTable = (
    outletsIn: OutletPerformance[],
    page: number,
    onPageChange: (p: number) => void
  ) => {
    const outlets = [...outletsIn].sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDirection === 'asc' ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      if (as < bs) return sortDirection === 'asc' ? -1 : 1;
      if (as > bs) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    const totalP = Math.max(1, Math.ceil(outlets.length / pageSize));
    const start = (page - 1) * pageSize;
    const pageItems = outlets.slice(start, start + pageSize);

    return (
      <>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                <th
                  className="py-3 px-3 cursor-pointer select-none hover:text-indigo-700"
                  onClick={() => handleSort('namaCustomerBaru')}
                >
                  Outlet Code &amp; Name
                  <SortIcon field="namaCustomerBaru" />
                </th>
                <th className="py-3 px-3">Depot &amp; Region</th>
                <th
                  className="py-3 px-3 text-center cursor-pointer select-none hover:text-indigo-700"
                  onClick={() => handleSort('calculatedRing')}
                >
                  Classification
                  <SortIcon field="calculatedRing" />
                  <Tooltip
                    title="Ring Classification"
                    content="Calculated automatically: Ring 1 (Mapping), Ring 2 (Pareto/Productive), Ring 3 (Avg Sales ≥ 100k), Ring 4 (<100k)"
                  />
                </th>
                <th
                  className="py-3 px-3 text-right cursor-pointer select-none hover:text-indigo-700"
                  onClick={() => handleSort('omset2026')}
                >
                  Sales 2026
                  <SortIcon field="omset2026" />
                </th>
                <th
                  className="py-3 px-3 text-right cursor-pointer select-none hover:text-indigo-700"
                  onClick={() => handleSort('avgSales2026')}
                >
                  Avg Sales 2026
                  <SortIcon field="avgSales2026" />
                </th>
                <th
                  className="py-3 px-3 text-center cursor-pointer select-none hover:text-indigo-700"
                  onClick={() => handleSort('sku2026')}
                >
                  SKU 2026
                  <SortIcon field="sku2026" />
                </th>
                <th
                  className="py-3 px-3 text-center cursor-pointer select-none hover:text-indigo-700"
                  onClick={() => handleSort('avgPa2026')}
                >
                  PA 2026
                  <SortIcon field="avgPa2026" />
                  <Tooltip title="AVG PA 2026" content="Average number of active SKUs transacted per month." />
                </th>
                <th
                  className="py-3 px-3 text-center cursor-pointer select-none hover:text-indigo-700"
                  onClick={() => handleSort('fLast12m')}
                >
                  F12
                  <SortIcon field="fLast12m" />
                  <Tooltip title="F Last 12M" content="Number of months with a transaction in the last 12 months." />
                </th>
                <th
                  className="py-3 px-3 text-center cursor-pointer select-none hover:text-indigo-700"
                  onClick={() => handleSort('f3')}
                >
                  F3
                  <SortIcon field="f3" />
                  <Tooltip title="F3" content="Number of months with a transaction in the last 3 months." />
                </th>
                <th className="py-3 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-slate-400">
                    No outlets.
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
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900" title={formatRupiah(outlet.omset2026)}>
                        {formatRupiahCompact(outlet.omset2026)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-700" title={formatRupiah(outlet.avgSales2026)}>
                        {formatRupiahCompact(outlet.avgSales2026)}
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
            <div className="flex items-center gap-3">
              <span>
                Showing {start + 1}–{Math.min(page * pageSize, outlets.length)} of{' '}
                {outlets.length.toLocaleString('id-ID')} outlets
              </span>
              <PageSizeSelector value={pageSize} onChange={setPageSize} />
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onPageChange(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Previous
              </button>
              <span className="px-2 font-semibold text-slate-700">
                Page {page} / {totalP}
              </span>
              <button
                onClick={() => onPageChange(Math.min(totalP, page + 1))}
                disabled={page === totalP}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Next
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
              <h3 className="font-bold text-sm text-slate-800">Mapped Outlets</h3>
              <p className="text-xs text-slate-500">
                {mappedOutletRows.length.toLocaleString('id-ID')} outlets already in Mapping data
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
          <h3 className="font-bold text-sm text-slate-800">Unmapped Outlets by Depot</h3>
          <p className="text-xs text-slate-500">
            {totalUnmappedCount.toLocaleString('id-ID')} outlets across {Object.keys(unmappedByDepo).length} depots not yet in Mapping data
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {Object.keys(unmappedByDepo).length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400">
              All outlets under the current filter are already mapped.
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
                        {depoOutlets.length.toLocaleString('id-ID')} outlets
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
          <h2 className="text-base font-bold text-slate-900 mb-1">No Performance Data Yet</h2>
          <p className="text-xs text-slate-500 max-w-sm mb-5">
            Outlet data isn't connected to Google Sheets in this session yet. Click the button below to sync the latest data.
          </p>
          <button
            onClick={syncWithGoogleSheets}
            disabled={syncStatus === 'syncing'}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-2 disabled:opacity-60"
          >
            <RotateCw className={`w-4 h-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
            {syncStatus === 'syncing' ? 'Syncing...' : 'Connect & Sync Data'}
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
              Pareto Analysis by Depot, Automatic Ring 1–4 Classification, &amp; Dormant Detection
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
                title="Download filtered data as Excel"
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
          {/* Quick Search — same padded-box treatment as the filter group so both sit flush */}
          <div className="relative lg:w-64 shrink-0 bg-slate-50 border border-slate-100 rounded-xl p-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search outlet code/name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Filter dropdowns — grouped together in one tinted container, each allows multiple selections */}
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 bg-slate-50 border border-slate-100 rounded-xl p-2">
            <MultiSelectDropdown
              label="Distributors"
              options={distOptions}
              selected={selectedDist}
              onChange={setSelectedDist}
            />
            <MultiSelectDropdown
              label="Depots"
              options={depoOptions}
              selected={selectedDepo}
              onChange={setSelectedDepo}
            />
            <MultiSelectDropdown
              label="Regencies"
              options={kabupatenOptions}
              selected={selectedKabupaten}
              onChange={setSelectedKabupaten}
            />
            <MultiSelectDropdown
              label="Districts"
              options={kecamatanOptions}
              selected={selectedKecamatan}
              onChange={setSelectedKecamatan}
            />
            <MultiSelectDropdown
              label="Rings"
              options={['Ring 1', 'Ring 2', 'Ring 3', 'Ring 4']}
              selected={selectedRing}
              onChange={setSelectedRing}
            />
          </div>
        </div>

        {/* Supervisor Scope Notice */}
        {!isManager && (
          <div className="mt-3 px-3 py-1.5 bg-blue-50/70 border border-blue-200 text-blue-700 text-xs rounded-xl flex items-center justify-between">
            <span>
              Supervisor access active: data is automatically locked to the distributors you're responsible for (<strong>{currentUser?.namaPic}</strong>).
            </span>
            <span className="text-[11px] font-semibold text-blue-800 uppercase tracking-wider">
              {accessibleDepo.join(', ')}
            </span>
          </div>
        )}
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Sales */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Sales</span>
            <Tooltip
              title="Total Sales"
              content="Total sales across all outlets for the selected year."
            />
          </div>
          <div className="mt-2">
            <p
              className="text-base lg:text-lg font-bold text-slate-900 leading-tight"
              title={formatRupiah(totalOmset)}
            >
              {formatRupiahCompact(totalOmset)}
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
            <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
              <span title={formatRupiah(avgSalesTotal)}>
                Total Avg Sales: <span className="text-slate-600 font-semibold">{formatRupiahCompact(avgSalesTotal)}</span>
              </span>
              <span className={avgSalesGrowth >= 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
                {avgSalesGrowth >= 0 ? '+' : ''}
                {avgSalesGrowth.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Active Outlets */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Active Outlets</span>
            <Tooltip
              title="Transaction Frequency"
              content="Outlets with a transaction frequency of F > 0 in the selected year."
            />
          </div>
          <div className="mt-2">
            <p className="text-base lg:text-lg font-bold text-slate-900 leading-tight">
              {activeOutletCount}{' '}
              <span className="text-xs font-normal text-slate-400">/ {filteredData.length}</span>
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {filteredData.length > 0
                ? `${Math.round((activeOutletCount / filteredData.length) * 100)}% actively purchasing`
                : '-'}
            </p>
          </div>
        </div>

        {/* Line/RO */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Line/RO</span>
            <Tooltip
              title="Line/RO"
              content="Average number of SKUs purchased per outlet per year."
            />
          </div>
          <div className="mt-2">
            <p className="text-base lg:text-lg font-bold text-slate-900 leading-tight">
              {avgSku}{' '}
              <span className="text-xs font-normal text-slate-400">items/outlet</span>
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Product range depth</p>
          </div>
        </div>

        {/* AVG PA */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">AVG PA (Active Products)</span>
            <Tooltip
              title="AVG PA (Active Products)"
              content="Average number of active SKUs/items transacted per outlet per month."
            />
          </div>
          <div className="mt-2">
            <p className="text-base lg:text-lg font-bold text-indigo-600 leading-tight">
              {avgPa}{' '}
              <span className="text-xs font-normal text-slate-400">items/mo</span>
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Repeat purchase activity</p>
          </div>
        </div>

        {/* Avg Sales */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Avg Sales / Outlet</span>
            <Tooltip
              title="Avg Sales"
              content="Average sales per outlet per month (not total sales)."
            />
          </div>
          <div className="mt-2">
            <p className="text-base lg:text-lg font-bold text-slate-900 leading-tight" title={formatRupiah(avgSalesPerStore)}>
              {formatRupiahCompact(avgSalesPerStore)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Average monthly sales</p>
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
            <span className="text-xs font-bold text-rose-700">Needs Attention</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2">
            <p className="text-base lg:text-lg font-bold text-rose-800 leading-tight">
              {watchlistItems.length}{' '}
              <span className="text-xs font-normal text-rose-600">outlets</span>
            </p>
            <button
              onClick={() => setActiveSection('watchlist')}
              className="mt-1 text-[11px] font-semibold text-rose-700 hover:text-rose-900 hover:underline flex items-center gap-0.5"
            >
              View Watchlist <ChevronRight className="w-3 h-3" />
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
              <span>Outlet Distribution &amp; Sales Contribution by Ring Classification</span>
              <Tooltip
                title="Automatic Classification Rules"
                content="Ring 1: Mapping Active. Ring 2: Pareto ≤80% OR Active & Productive (PA≥40% & SKU≥Depot Line/RO). Ring 3: Avg Sales ≥ 100k. Ring 4: Avg Sales < 100k. Mapped outlets are counted once as a single combined code."
              />
            </h3>
            <p className="text-xs text-slate-500">
              Outlet base structure and revenue concentration by ring
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
                    {item.omsetPct.toFixed(1)}% Sales
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-500">Outlet Count:</span>
                    <span className="text-xs font-bold text-slate-800">{item.count} outlets</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-500">Contribution:</span>
                    <span className="text-xs font-bold text-slate-900">
                      {formatRupiahCompact(item.omset)}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-500">Line/RO:</span>
                    <span className="text-xs font-bold text-slate-800">{item.lineRo.toFixed(1)}</span>
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
          { id: 'overview', label: 'Outlet Detail Table' },
          { id: 'pareto', label: 'Pareto Table by Depot (80/20)' },
          { id: 'gainers', label: 'Top Gainer & Decliner' },
          { id: 'coverage', label: 'Coverage MDS vs Call Plan' },
          {
            id: 'watchlist',
            label: `Dormant Watchlist (${watchlistItems.length})`,
            alert: watchlistItems.length > 0,
          },
          { id: 'mds_leaderboard', label: 'MDS Performance Ranking' },
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
              <strong className="font-bold">Pareto Analysis Principle (Per-Depot Rule):</strong>
              <p className="mt-0.5 text-amber-800 leading-relaxed">
                % Contribution and % Cumulative are recalculated per Depot, sorting outlet sales from highest to lowest. Rows highlighted in yellow mark the 80% cumulative threshold (Core Pareto Outlets generating 80% of the depot's sales).
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">{Object.keys(paretoPerDepo).length} Depots</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setExpandedDepos(new Set(Object.keys(paretoPerDepo)))}
                className="text-xs text-indigo-600 hover:underline font-semibold"
              >
                Expand All
              </button>
              <span className="text-slate-300">|</span>
              <button
                onClick={() => setExpandedDepos(new Set())}
                className="text-xs text-indigo-600 hover:underline font-semibold"
              >
                Collapse All
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
                      <p className="text-xs text-slate-500" title={formatRupiah(depoTotal)}>
                        Depot Total Sales: <strong>{formatRupiahCompact(depoTotal)}</strong> ({depoOutlets.length} outlets)
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg self-start sm:self-auto">
                    {depoOutlets.filter((o) => o.isPareto80).length} Pareto Outlets (≤80%)
                  </span>
                </button>

                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-semibold">
                          <th className="py-2.5 px-3 w-12 text-center">Rank</th>
                          <th className="py-2.5 px-3">Outlet Code &amp; Name</th>
                          <th className="py-2.5 px-3 text-center">Classification</th>
                          <th className="py-2.5 px-3 text-right">Sales 2026</th>
                          <th className="py-2.5 px-3 text-right">% Contribution</th>
                          <th className="py-2.5 px-3 text-right">% Cumulative</th>
                          <th className="py-2.5 px-3 text-center">Pareto Status</th>
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
                              <td className="py-2 px-3 text-right font-bold text-slate-900" title={formatRupiah(outlet.omset2026)}>
                                {formatRupiahCompact(outlet.omset2026)}
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
              <span className="text-xs text-emerald-700 font-semibold">2026 vs 2025</span>
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
                    <span className="text-[11px] text-slate-500" title={formatRupiah(item.omset2026)}>
                      {formatRupiahCompact(item.omset2026)}
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
              <span className="text-xs text-rose-700 font-semibold">2026 vs 2025</span>
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
                    <span className="text-[11px] text-slate-500" title={formatRupiah(item.omset2026)}>
                      {formatRupiahCompact(item.omset2026)}
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
                Joins Performance + Call Plan: flags outlets that are scheduled but whose LAST ORDER is old (&gt;2 months) or whose sales are minimal.
              </p>
            </div>
            <span className="text-xs font-semibold px-3 py-1 bg-indigo-50 text-indigo-700 rounded-xl">
              {coverageData.filter((c) => c.isScheduled).length} Outlets Covered by Schedule
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <th className="py-3 px-3">Store Code &amp; Name</th>
                  <th className="py-3 px-3">Depot</th>
                  <th className="py-3 px-3 text-center">Ring</th>
                  <th className="py-3 px-3 text-center">Assigned MDS</th>
                  <th className="py-3 px-3 text-center">Call Plan Status</th>
                  <th className="py-3 px-3 text-right">Sales 2026</th>
                  <th className="py-3 px-3 text-center">Last Order</th>
                  <th className="py-3 px-3 text-center">Visit Status</th>
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
                        <span className="text-slate-400 italic">Not Yet Assigned</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {item.isScheduled ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                          <CheckCircle className="w-3 h-3" /> Scheduled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                          <Clock className="w-3 h-3" /> Not Yet Scheduled
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-900" title={formatRupiah(item.omset2026)}>
                      {formatRupiahCompact(item.omset2026)}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap text-slate-600">
                      {item.lastOrder}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {item.isInactiveWarning ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-100 text-rose-800 rounded-full inline-block">
                          Scheduled but Dormant / Minimal Sales!
                        </span>
                      ) : item.isScheduled ? (
                        <span className="text-[10px] text-emerald-700 font-medium">Optimal</span>
                      ) : (
                        <button
                          onClick={() => onNavigateToCallPlan && onNavigateToCallPlan(item.kodeCustNfiGroup)}
                          className="text-[11px] text-indigo-600 hover:underline font-semibold"
                        >
                          + Add Call Plan
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
              <div className="flex items-center gap-3">
                <span>
                  Showing {(coveragePage - 1) * pageSize + 1}
                  –{Math.min(coveragePage * pageSize, coverageData.length)} of{' '}
                  {coverageData.length.toLocaleString('id-ID')} outlets
                </span>
                <PageSizeSelector value={pageSize} onChange={setPageSize} />
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCoveragePage((p) => Math.max(1, p - 1))}
                  disabled={coveragePage === 1}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
                >
                  Previous
                </button>
                <span className="px-2 font-semibold text-slate-700">
                  Page {coveragePage} / {coverageTotalPages}
                </span>
                <button
                  onClick={() => setCoveragePage((p) => Math.min(coverageTotalPages, p + 1))}
                  disabled={coveragePage === coverageTotalPages}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
                >
                  Next
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
                <span>Dormant &amp; Churn Risk Watchlist ({watchlistItems.length} Outlets)</span>
              </h3>
              <p className="text-xs text-rose-700 mt-0.5">
                Criteria: Last Order &gt;2 months (red badge) or Ring classification dropped vs. the previous month (yellow badge).
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {watchlistItems.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                Great! No dormant or churn-risk outlets right now.
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
                          DORMANT (&gt; 2 Months)
                        </span>
                      )}

                      {outlet.isChurnRisk && (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                          RING DROPPED: {outlet.previousRing} → {outlet.calculatedRing}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-600">
                      {outlet.alamat} • {outlet.kecamatan}, {outlet.kabupaten} ({outlet.depo})
                    </p>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-0.5">
                      <span>
                        Last Order:{' '}
                        <strong className="text-rose-700">{outlet.lastOrder || 'None'}</strong>
                      </span>
                      <span title={formatRupiah(outlet.omset2026)}>
                        Sales 2026: <strong>{formatRupiahCompact(outlet.omset2026)}</strong>
                      </span>
                      <span>
                        Assigned MDS:{' '}
                        <strong>{outlet.assignedMds || 'Not Yet Scheduled'}</strong>
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
                        <span>Set MDS Visit Schedule</span>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {watchlistItems.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-600">
              <div className="flex items-center gap-3">
                <span>
                  Showing {(watchlistPage - 1) * pageSize + 1}
                  –{Math.min(watchlistPage * pageSize, watchlistItems.length)} of{' '}
                  {watchlistItems.length.toLocaleString('id-ID')} outlets
                </span>
                <PageSizeSelector value={pageSize} onChange={setPageSize} />
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setWatchlistPage((p) => Math.max(1, p - 1))}
                  disabled={watchlistPage === 1}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
                >
                  Previous
                </button>
                <span className="px-2 font-semibold text-slate-700">
                  Page {watchlistPage} / {watchlistTotalPages}
                </span>
                <button
                  onClick={() => setWatchlistPage((p) => Math.min(watchlistTotalPages, p + 1))}
                  disabled={watchlistPage === watchlistTotalPages}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
                >
                  Next
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
                <span>MDS Performance Leaderboard &amp; Ranking</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Evaluates outlet count managed, average sales growth, and dormant outlet handling per MDS
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-3 px-3 text-center w-12">Rank</th>
                  <th className="py-3 px-3">MDS Name</th>
                  <th className="py-3 px-3 text-center">Outlets Managed</th>
                  <th className="py-3 px-3 text-right">Total Sales Managed</th>
                  <th className="py-3 px-3 text-right">Avg % Growth</th>
                  <th className="py-3 px-3 text-center">Dormant Outlets</th>
                  <th className="py-3 px-3 text-center">Ring Up / Down</th>
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
                      {mds.outletCount} outlets
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-slate-900" title={formatRupiah(mds.totalOmset)}>
                      {formatRupiahCompact(mds.totalOmset)}
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
                          {mds.dormanCount} dormant
                        </span>
                      ) : (
                        <span className="text-emerald-600 font-semibold">0 dormant</span>
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