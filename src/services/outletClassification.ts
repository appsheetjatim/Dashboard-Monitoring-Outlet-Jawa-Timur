import { OutletPerformance, OutletMapping } from '../types';

/**
 * Cleans outlet name for code generation:
 * UPPERCASE, removes spaces, punctuation, special characters
 */
export function cleanOutletNameForCode(name: string): string {
  if (!name) return '';
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Gets classification prefix for code (Ring 1 -> R1, Ring 2 -> R2, etc.)
 */
export function getRingCodePrefix(ring: string): string {
  switch (ring) {
    case 'Ring 1':
      return 'R1';
    case 'Ring 2':
      return 'R2';
    case 'Ring 3':
      return 'R3';
    case 'Ring 4':
      return 'R4';
    default:
      return 'R4';
  }
}

/**
 * Generates Customer SO Group Area Code:
 * Format: JWTM-{KODE_KLASIFIKASI}-{JUMLAH_KARAKTER}-{NAMA_OUTLET_BERSIH}
 * Example: "BINTANG MAS,TOKO" + Ring 1 -> "JWTM-R1-14-BINTANGMASTOKO"
 */
export function generateCustomerSoGroupAreaCode(
  rawName: string,
  ring: 'Ring 1' | 'Ring 2' | 'Ring 3' | 'Ring 4'
): string {
  const cleanName = cleanOutletNameForCode(rawName);
  const count = cleanName.length;
  const ringPrefix = getRingCodePrefix(ring);
  return `JWTM-${ringPrefix}-${count}-${cleanName}`;
}

/**
 * Calculates days difference between a date string and reference date
 */
const MONTH_ABBR: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parses LAST ORDER values in "Mon-YY" format (e.g. "Aug-26" = August 2026).
 * Native `new Date("Aug-26")` misparses this as day=26, year=2001 — do NOT use it.
 */
export function parseMonYearDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const match = String(dateStr).trim().match(/^([A-Za-z]{3})-(\d{2,4})$/);
  if (!match) return null;
  const monthIdx = MONTH_ABBR[match[1].toLowerCase()];
  if (monthIdx === undefined) return null;
  let year = parseInt(match[2], 10);
  if (year < 100) year += 2000;
  // Use last day of that month so a same-month order is never counted as dormant
  return new Date(year, monthIdx + 1, 0);
}

export function isMoreThanTwoMonthsAgo(dateStr: string, refDate: Date = new Date(2026, 8, 20)): boolean {
  if (!dateStr) return true;
  const parsed = parseMonYearDate(dateStr);
  if (!parsed || isNaN(parsed.getTime())) return true;
  const diffTime = refDate.getTime() - parsed.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 60;
}

/**
 * Recalculates Pareto (% Kontribusi & % Kumulatif per Depo)
 * and classifies outlets into Ring 1 - 4 according to business rules.
 */
export function calculateOutletPerformance(
  rawOutlets: OutletPerformance[],
  mappings: OutletMapping[]
): OutletPerformance[] {
  // Build lookup map for Active mappings
  // Matches via Customer SO Group Area Code, BSP Codes 1-3, or UDN Codes 1-3
  const activeRing1Codes = new Set<string>();
  const mappingRingLookup = new Map<string, 'Ring 1' | 'Ring 2' | 'Ring 3' | 'Ring 4'>();

  for (const m of mappings) {
    if (m.status === 'Active') {
      const codes = [
        m.customerSoGroupAreaCode,
        m.bspCode1,
        m.bspCode2,
        m.bspCode3,
        m.udnCode1,
        m.udnCode2,
        m.udnCode3,
      ].filter(Boolean);

      for (const code of codes) {
        mappingRingLookup.set(code, m.klasifikasiOutlet);
        if (m.klasifikasiOutlet === 'Ring 1') {
          activeRing1Codes.add(code);
        }
      }
    }
  }

  // Group outlets by Depo to calculate Depo metrics (Total Omset & Line/RO)
  const depoGroups = new Map<string, OutletPerformance[]>();
  for (const outlet of rawOutlets) {
    const depoKey = outlet.depo || 'DEFAULT';
    if (!depoGroups.has(depoKey)) {
      depoGroups.set(depoKey, []);
    }
    depoGroups.get(depoKey)!.push(outlet);
  }

  const result: OutletPerformance[] = [];

  // Process each Depo independently for Pareto & Line/RO
  for (const [, outletsInDepo] of depoGroups.entries()) {
    // 1. Calculate Depo totals
    const totalOmsetDepo = outletsInDepo.reduce((sum, o) => sum + (o.omset2026 || 0), 0);
    const totalSkuDepo = outletsInDepo.reduce((sum, o) => sum + (o.sku2026 || 0), 0);
    const outletCount = outletsInDepo.length || 1;
    // Line/RO 2026 Depo = Total SKU 2026 semua outlet Depo ÷ jumlah outlet Depo
    const lineRoDepo = totalSkuDepo / outletCount;

    // 2. Sort outlets per Depo from largest to smallest Omset 2026 for Pareto analysis
    const sorted = [...outletsInDepo].sort((a, b) => (b.omset2026 || 0) - (a.omset2026 || 0));

    // 3. Compute cumulative % Kontribusi running sum
    let runningKumulatif = 0;
    const computedInDepo: OutletPerformance[] = [];

    for (const o of sorted) {
      const omset = o.omset2026 || 0;
      const kontribusi = totalOmsetDepo > 0 ? (omset / totalOmsetDepo) * 100 : 0;
      runningKumulatif += kontribusi;
      const kumulatif = Math.min(100, runningKumulatif);

      // Check priority classification rules
      let calculatedRing: 'Ring 1' | 'Ring 2' | 'Ring 3' | 'Ring 4' = 'Ring 4';

      // Rule 1: Ring 1 - match in Mapping with Klasifikasi Outlet = "Ring 1" and Status = "Active"
      if (activeRing1Codes.has(o.kodeCustNfiGroup)) {
        calculatedRing = 'Ring 1';
      } else {
        // Rule 2: Ring 2 - either Pareto % Kum <= 80% OR Aktif DAN Produktif
        const isPareto80Condition = kumulatif <= 80;
        // Aktif: F Last 12M >= 6 AND F3 > 0
        const isAktif = (o.fLast12m || 0) >= 6 && (o.f3 || 0) > 0;
        // Produktif: % PA 2026 >= 40% AND SKU 2026 >= Line/RO 2026 Depo
        // Notice % PA can be decimal (0.4) or percentage (40), handle both safely
        const paVal = (o.pa2026 || 0) > 1 ? o.pa2026 : (o.pa2026 || 0) * 100;
        const isProduktif = paVal >= 40 && (o.sku2026 || 0) >= lineRoDepo;

        if (isPareto80Condition || (isAktif && isProduktif)) {
          calculatedRing = 'Ring 2';
        } else if ((o.avgSales2026 || 0) >= 100000) {
          // Rule 3: Ring 3 - Avg Sales 2026 >= Rp 100.000
          calculatedRing = 'Ring 3';
        } else {
          // Rule 4: Ring 4 - Avg Sales 2026 < Rp 100.000
          calculatedRing = 'Ring 4';
        }
      }

      // Check Churn / Dormant
      const isDormant = isMoreThanTwoMonthsAgo(o.lastOrder);
      // Previous ring check: if previous ring was Ring 1 and now Ring 2/3/4, or previous was Ring 2 and now Ring 3/4
      const previousRing = o.previousRing || calculatedRing;
      const ringOrder = { 'Ring 1': 1, 'Ring 2': 2, 'Ring 3': 3, 'Ring 4': 4 };
      const isChurnRisk = ringOrder[calculatedRing] > ringOrder[previousRing];

      computedInDepo.push({
        ...o,
        kontribusi: Number(kontribusi.toFixed(2)),
        kumulatif: Number(kumulatif.toFixed(2)),
        isPareto80: kumulatif <= 80,
        calculatedRing,
        previousRing,
        isDormant,
        isChurnRisk,
      });
    }

    result.push(...computedInDepo);
  }

  return result;
}
