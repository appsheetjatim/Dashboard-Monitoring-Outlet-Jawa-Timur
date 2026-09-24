export type UserRole = 'Manager' | 'Supervisor';

export interface UserPIC {
  userId: string;
  namaPic: string;
  email: string;
  role: UserRole;
  area: string;
  region: string;
  password?: string;
}

export interface UserMDS {
  nik: string;
  namaMds: string;
  area: string;
  namaPic: string;
  region: string;
}

export interface DistAssignment {
  dist: string;
  subDist: string;
  depo: string;
  namaPic: string;
}

// Sheet "Kab": maps a PIC to the Kabupaten/Kota they're responsible for.
// Used ONLY to scope which Kecamatan polygons render in the Peta Sebaran
// shading layer — separate from the Depo-based access system (DistAssignment)
// used everywhere else, since Depo doesn't map cleanly to Kabupaten.
export interface KabAssignment {
  namaPic: string;
  kabupaten: string;
}

export interface OutletPerformance {
  dist: string;
  subDist: string;
  depo: string;
  kodeCustNfiGroup: string;
  namaCustomerBaru: string;
  kabupaten: string;
  kecamatan: string;
  alamat: string;
  omset2024: number;
  omset2025: number;
  omset2026: number;
  sku2024: number;
  sku2025: number;
  sku2026: number;
  grSku: number; // % Gr SKU
  avgPa2025: number;
  avgPa2026: number;
  grPa: number; // % Gr PA
  pa2025: number; // % PA 2025
  pa2026: number; // % PA 2026
  avgSales2024: number;
  avgSales2025: number;
  avgSales2026: number;
  grAvgSales: number; // % Gr Avg Sales
  kontribusi: number; // % Kontr (dihitung ulang per depo)
  kumulatif: number; // % Kum (dihitung ulang per depo)
  f2025: number;
  f2026: number;
  fLast12m: number;
  f3: number;
  ds2025: number;
  ds2026: number;
  grDs: number; // % Gr DS
  lastOrder: string; // YYYY-MM-DD
  latitude?: number;
  longitude?: number;
  // Computed fields
  calculatedRing: 'Ring 1' | 'Ring 2' | 'Ring 3' | 'Ring 4';
  previousRing?: 'Ring 1' | 'Ring 2' | 'Ring 3' | 'Ring 4';
  isPareto80: boolean;
  isDormant: boolean; // Last order > 2 months
  isChurnRisk: boolean; // Downgraded ring
}

export interface OutletMapping {
  mappingId: string;
  customerSoGroupAreaCode: string;
  customerSoGroupArea: string;
  klasifikasiOutlet: 'Ring 1' | 'Ring 2' | 'Ring 3' | 'Ring 4';
  subDistBsp: string;
  depoBsp: string;
  namaCustomerBsp: string;
  bspCode1: string;
  bspCode2: string;
  bspCode3: string;
  subDistUdn: string;
  namaCustomerUdn: string;
  udnCode1: string;
  udnCode2: string;
  udnCode3: string;
  kabupaten: string;
  kecamatan: string;
  alamat: string;
  dishub: boolean;
  rak50cm: boolean;
  rak65cm: boolean;
  rak75cm: boolean;
  rakDuaSisi: boolean;
  rakPack: boolean;
  rakCustome: boolean;
  displayWowAll: boolean;
  biayaDisplayWow: number;
  displayWowHilo: boolean;
  biayaDisplayWowHilo: number;
  namaMds: string;
  pic: string;
  mappingDate: string;
  lastUpdated: string;
  latitude?: number;
  longitude?: number;
  status: 'Active' | 'Inactive';
  notes: string;
}

export interface CallPlanItem {
  callPlanId: string;
  namaPic: string;
  namaMds: string;
  customerSoGroupAreaCode: string;
  customerSoGroupArea: string;
  klasifikasiOutlet: 'Ring 1' | 'Ring 2' | 'Ring 3' | 'Ring 4';
  kabupaten: string;
  kecamatan: string;
  alamat: string;
  visitDay: 'Senin' | 'Selasa' | 'Rabu' | 'Kamis' | 'Jumat' | 'Sabtu';
  week1: boolean;
  week2: boolean;
  week3: boolean;
  week4: boolean;
  frequency: number; // 1 to 4
}

export interface LogActivityRecord {
  timestamp: string;
  namaPic: string;
  jenisAksi: 'Create' | 'Update' | 'Delete';
  sheetTarget: 'Mapping' | 'Call Plan' | 'User PIC';
  idRecord: string;
  detailPerubahan: string;
}

export interface CandidatePair {
  outlet: OutletPerformance;
  score: number; // 0 to 100
  nameScore: number;
  distScore: number;
  distanceMeters: number | null;
  matchedWords: string[];
  diffWords: string[];
}