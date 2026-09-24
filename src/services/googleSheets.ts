import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  OutletPerformance,
  OutletMapping,
  CallPlanItem,
  UserPIC,
  UserMDS,
  DistAssignment,
  KabAssignment,
  LogActivityRecord,
} from '../types';

export const SPREADSHEET_ID = '1ktRQP1TUP_IS57CuMOrHdxG5n3QrDBojoPl73xvMw5A';

// Thrown whenever a Google Sheets API call fails with 401 Unauthorized —
// this specifically means the OAuth access token has expired (Google access
// tokens always expire after 1 hour, and this app doesn't request a refresh
// token, so there's no way to silently renew it). Callers catch this
// distinct error type to show a clear "session expired, reconnect" message
// instead of a raw/confusing API error, and to reset the stored token so the
// "Sambungkan Google" button is ready to be clicked again.
export class GoogleAuthExpiredError extends Error {
  constructor() {
    super('Sesi Google Anda sudah berakhir (token otomatis kedaluwarsa setelah ±1 jam). Klik "Sambungkan Google" di header untuk menyambung ulang.');
    this.name = 'GoogleAuthExpiredError';
  }
}

// Initialize Firebase App
const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/spreadsheets');

let cachedAccessToken: string | null = null;
let isSigningIn = false;

export const initGoogleAuth = (
  onSuccess?: (user: User, token: string) => void,
  onFail?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user && cachedAccessToken) {
      if (onSuccess) onSuccess(user, cachedAccessToken);
    } else {
      cachedAccessToken = null;
      if (onFail) onFail();
    }
  });
};

export const signInWithGoogle = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Gagal mendapatkan token otentikasi Google Sheets.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign-in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const signOutGoogle = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

export const getCachedAccessToken = () => cachedAccessToken;

// Helper to fetch Google Sheets API values
async function fetchSheetValues(range: string, token: string): Promise<any[][] | null> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(
    range
  )}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    if (res.status === 401) throw new GoogleAuthExpiredError();
    const errorBody = await res.json().catch(() => ({}));
    console.warn(`Sheets API fetch ${range} failed:`, errorBody);
    return null;
  }

  const data = await res.json();
  return data.values || [];
}

// Helper to write/append row to sheet
async function appendSheetValues(range: string, values: any[][], token: string): Promise<boolean> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(
    range
  )}:append?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values }),
  });

  if (!res.ok) {
    if (res.status === 401) throw new GoogleAuthExpiredError();
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Gagal menyimpan data ke Google Sheets.');
  }
  return true;
}

// Helper to update specific range in sheet
async function updateSheetValues(range: string, values: any[][], token: string): Promise<boolean> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(
    range
  )}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values }),
  });

  if (!res.ok) {
    if (res.status === 401) throw new GoogleAuthExpiredError();
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Gagal mengupdate data di Google Sheets.');
  }
  return true;
}

// Helper to rewrite an entire sheet (with header + rows)
async function overwriteSheetValues(
  sheetName: string,
  headers: string[],
  rows: any[][],
  token: string
): Promise<boolean> {
  // Clear first. This step MUST succeed before writing — if the sheet isn't
  // actually cleared and the new data has FEWER rows than what's currently
  // there (e.g. after a delete), the extra old rows at the bottom would be
  // left untouched, silently un-deleting whatever was just removed. A
  // previous version of this function swallowed clear failures with
  // `.catch(() => null)`, which is exactly how that could happen unnoticed.
  const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(
    sheetName
  )}:clear`;
  const clearRes = await fetch(clearUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!clearRes.ok) {
    if (clearRes.status === 401) throw new GoogleAuthExpiredError();
    const err = await clearRes.json().catch(() => ({}));
    throw new Error(
      err.error?.message || `Gagal membersihkan sheet "${sheetName}" sebelum menyimpan perubahan.`
    );
  }

  // Write all rows
  const allValues = [headers, ...rows];
  return updateSheetValues(`${sheetName}!A1`, allValues, token);
}

// Ensure Log Activity sheet exists
export async function ensureLogActivitySheetExists(token: string) {
  try {
    const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;
    const res = await fetch(metadataUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const metadata = await res.json();
    const sheetExists = metadata.sheets?.some(
      (s: any) => s.properties?.title === 'Log Activity'
    );

    if (!sheetExists) {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  title: 'Log Activity',
                },
              },
            },
          ],
        }),
      });

      // Write header
      await updateSheetValues(
        'Log Activity!A1:F1',
        [
          [
            'Timestamp',
            'Nama PIC',
            'Jenis Aksi',
            'Sheet Target',
            'ID Record',
            'Detail Perubahan',
          ],
        ],
        token
      );
    }
  } catch (err) {
    console.warn('Could not auto-create Log Activity sheet:', err);
  }
}

// Number & Boolean clean parsers
function parseNum(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

function parseBool(val: any): boolean {
  if (typeof val === 'boolean') return val;
  const str = String(val).trim().toLowerCase();
  return str === 'true' || str === 'yes' || str === 'ya' || str === '1' || str === 'y';
}

// Parsers for Google Sheet rows
export async function fetchAllGoogleSheetsData(token: string) {
  await ensureLogActivitySheetExists(token);

  const [
    perfRows,
    picRows,
    mdsRows,
    distRows,
    kabRows,
    mappingRows,
    callPlanRows,
    logRows,
  ] = await Promise.all([
    fetchSheetValues('Performance!A2:AK', token),
    fetchSheetValues('User PIC!A2:G', token),
    fetchSheetValues('User MDS!A2:E', token),
    fetchSheetValues('Dist!A2:D', token),
    fetchSheetValues('Kab!A2:B', token),
    fetchSheetValues('Mapping!A2:AJ', token),
    fetchSheetValues('Call Plan!A2:O', token),
    fetchSheetValues('Log Activity!A2:F', token),
  ]);

  return {
    performance: parsePerformanceRows(perfRows),
    userPics: parseUserPicRows(picRows),
    userMds: parseUserMdsRows(mdsRows),
    distAssignments: parseDistRows(distRows),
    kabAssignments: parseKabRows(kabRows),
    mappings: parseMappingRows(mappingRows),
    callPlans: parseCallPlanRows(callPlanRows),
    logs: parseLogRows(logRows),
  };
}

function parsePerformanceRows(rows: any[][] | null): OutletPerformance[] | null {
  if (!rows) return null; // fetch genuinely failed — do not overwrite existing data with this
  return rows.map((r) => {
    const lat = r[34] ? parseNum(r[34]) : undefined;
    const lng = r[35] ? parseNum(r[35]) : undefined;

    return {
      dist: r[0] || '',
      subDist: r[1] || '',
      depo: r[2] || '',
      kodeCustNfiGroup: r[3] || '',
      namaCustomerBaru: r[4] || '',
      kabupaten: r[5] || '',
      kecamatan: r[6] || '',
      alamat: r[7] || '',
      omset2024: parseNum(r[8]),
      omset2025: parseNum(r[9]),
      omset2026: parseNum(r[10]),
      sku2024: parseNum(r[11]),
      sku2025: parseNum(r[12]),
      sku2026: parseNum(r[13]),
      grSku: parseNum(r[14]),
      avgPa2025: parseNum(r[15]),
      avgPa2026: parseNum(r[16]),
      grPa: parseNum(r[17]),
      pa2025: parseNum(r[18]),
      pa2026: parseNum(r[19]),
      avgSales2024: parseNum(r[20]),
      avgSales2025: parseNum(r[21]),
      avgSales2026: parseNum(r[22]),
      grAvgSales: parseNum(r[23]),
      kontribusi: 0, // Calculated in app
      kumulatif: 0, // Calculated in app
      f2025: parseNum(r[26] || r[24]),
      f2026: parseNum(r[27] || r[25]),
      fLast12m: parseNum(r[28] || r[26]),
      f3: parseNum(r[29] || r[27]),
      ds2025: parseNum(r[30] || r[28]),
      ds2026: parseNum(r[31] || r[29]),
      grDs: parseNum(r[32] || r[30]),
      lastOrder: r[33] || r[31] || '2026-09-01',
      latitude: lat,
      longitude: lng,
      calculatedRing: 'Ring 4',
      isPareto80: false,
      isDormant: false,
      isChurnRisk: false,
    };
  });
}

function parseUserPicRows(rows: any[][] | null): UserPIC[] | null {
  if (!rows) return null; // fetch genuinely failed — do not overwrite existing data with this
  return rows.map((r) => ({
    userId: r[0] || '',
    namaPic: r[1] || '',
    email: r[2] || '',
    role: (r[3] === 'Manager' ? 'Manager' : 'Supervisor') as any,
    area: r[4] || '',
    region: r[5] || '',
    password: r[6] || 'password123',
  }));
}

function parseUserMdsRows(rows: any[][] | null): UserMDS[] | null {
  if (!rows) return null; // fetch genuinely failed — do not overwrite existing data with this
  return rows.map((r) => ({
    nik: r[0] || '',
    namaMds: r[1] || '',
    area: r[2] || '',
    namaPic: r[3] || '',
    region: r[4] || '',
  }));
}

function parseDistRows(rows: any[][] | null): DistAssignment[] | null {
  if (!rows) return null; // fetch genuinely failed — do not overwrite existing data with this
  return rows.map((r) => ({
    dist: r[0] || '',
    subDist: r[1] || '',
    depo: r[2] || '',
    namaPic: r[3] || '',
  }));
}

// Sheet "Kab": columns are Nama PIC, Kabupaten (one row per PIC-Kabupaten
// pair, same one-row-per-assignment pattern as the Dist sheet).
function parseKabRows(rows: any[][] | null): KabAssignment[] | null {
  if (!rows) return null; // fetch genuinely failed — do not overwrite existing data with this
  return rows.map((r) => ({
    namaPic: r[0] || '',
    kabupaten: r[1] || '',
  }));
}

function parseMappingRows(rows: any[][] | null): OutletMapping[] | null {
  if (!rows) return null; // fetch genuinely failed — do not overwrite existing data with this
  return rows.map((r) => ({
    mappingId: r[0] || `MAP-${Date.now()}`,
    customerSoGroupAreaCode: r[1] || '',
    customerSoGroupArea: r[2] || '',
    klasifikasiOutlet: (r[3] || 'Ring 2') as any,
    subDistBsp: r[4] || '',
    depoBsp: r[5] || '',
    namaCustomerBsp: r[6] || '',
    bspCode1: r[7] || '',
    bspCode2: r[8] || '',
    bspCode3: r[9] || '',
    subDistUdn: r[10] || '',
    namaCustomerUdn: r[11] || '',
    udnCode1: r[12] || '',
    udnCode2: r[13] || '',
    udnCode3: r[14] || '',
    kabupaten: r[15] || '',
    kecamatan: r[16] || '',
    alamat: r[17] || '',
    dishub: parseBool(r[18]),
    rak50cm: parseBool(r[19]),
    rak65cm: parseBool(r[20]),
    rak75cm: parseBool(r[21]),
    rakDuaSisi: parseBool(r[22]),
    rakPack: parseBool(r[23]),
    rakCustome: parseBool(r[24]),
    displayWowAll: parseBool(r[25]),
    biayaDisplayWow: parseNum(r[26]),
    displayWowHilo: parseBool(r[27]),
    biayaDisplayWowHilo: parseNum(r[28]),
    namaMds: r[29] || '',
    pic: r[30] || '',
    mappingDate: r[31] || new Date().toISOString(),
    lastUpdated: r[32] || new Date().toISOString(),
    latitude: r[33] ? parseNum(r[33]) : undefined,
    longitude: r[34] ? parseNum(r[34]) : undefined,
    status: (r[35] === 'Inactive' ? 'Inactive' : 'Active') as any,
    notes: r[36] || '',
  }));
}

function parseCallPlanRows(rows: any[][] | null): CallPlanItem[] | null {
  if (!rows) return null; // fetch genuinely failed — do not overwrite existing data with this
  return rows.map((r) => ({
    callPlanId: r[0] || `CP-${Date.now()}`,
    namaPic: r[1] || '',
    namaMds: r[2] || '',
    customerSoGroupAreaCode: r[3] || '',
    customerSoGroupArea: r[4] || '',
    klasifikasiOutlet: (r[5] || 'Ring 2') as any,
    kabupaten: r[6] || '',
    kecamatan: r[7] || '',
    alamat: r[8] || '',
    visitDay: (r[9] || 'Senin') as any,
    week1: parseBool(r[10]),
    week2: parseBool(r[11]),
    week3: parseBool(r[12]),
    week4: parseBool(r[13]),
    frequency: parseNum(r[14]) || 1,
  }));
}

function parseLogRows(rows: any[][] | null): LogActivityRecord[] | null {
  if (!rows) return null; // fetch genuinely failed — do not overwrite existing data with this
  return rows.map((r) => ({
    timestamp: r[0] || new Date().toISOString(),
    namaPic: r[1] || '',
    jenisAksi: (r[2] || 'Create') as any,
    sheetTarget: (r[3] || 'Mapping') as any,
    idRecord: r[4] || '',
    detailPerubahan: r[5] || '',
  }));
}

// Write operation: Append to Log Activity
export async function appendLogActivityToSheet(log: LogActivityRecord, token: string) {
  const row = [
    log.timestamp,
    log.namaPic,
    log.jenisAksi,
    log.sheetTarget,
    log.idRecord,
    log.detailPerubahan,
  ];
  return appendSheetValues('Log Activity!A:F', [row], token);
}

const MAPPING_HEADERS = [
  'Mapping ID',
  'Customer SO Group Area Code',
  'Customer SO Group Area',
  'Klasifikasi Outlet',
  'Sub Dist BSP',
  'Depo BSP',
  'Nama Customer BSP',
  'BSP Code 1',
  'BSP Code 2',
  'BSP Code 3',
  'Sub Dist UDN',
  'Nama Customer UDN',
  'UDN Code 1',
  'UDN Code 2',
  'UDN Code 3',
  'Kabupaten',
  'Kecamatan',
  'Alamat',
  'Dishub',
  'Rak 50 cm',
  'Rak 65 cm',
  'Rak 75 cm',
  'Rak Dua Sisi',
  'Rak Pack',
  'Rak Custome',
  'Display Wow All',
  'Biaya Display Wow (Rcg)',
  'Display Wow Hilo',
  'Biaya Display Wow Hilo (Rcg)',
  'Nama MDS',
  'PIC',
  'Mapping Date',
  'Last Updated',
  'Latitude',
  'Longitude',
  'Status',
  'Notes',
];

function mappingToRow(m: OutletMapping): any[] {
  return [
    m.mappingId,
    m.customerSoGroupAreaCode,
    m.customerSoGroupArea,
    m.klasifikasiOutlet,
    m.subDistBsp,
    m.depoBsp,
    m.namaCustomerBsp,
    m.bspCode1,
    m.bspCode2,
    m.bspCode3,
    m.subDistUdn,
    m.namaCustomerUdn,
    m.udnCode1,
    m.udnCode2,
    m.udnCode3,
    m.kabupaten,
    m.kecamatan,
    m.alamat,
    m.dishub ? 'Yes' : 'No',
    m.rak50cm ? 'Yes' : 'No',
    m.rak65cm ? 'Yes' : 'No',
    m.rak75cm ? 'Yes' : 'No',
    m.rakDuaSisi ? 'Yes' : 'No',
    m.rakPack ? 'Yes' : 'No',
    m.rakCustome ? 'Yes' : 'No',
    m.displayWowAll ? 'Yes' : 'No',
    m.biayaDisplayWow,
    m.displayWowHilo ? 'Yes' : 'No',
    m.biayaDisplayWowHilo,
    m.namaMds,
    m.pic,
    m.mappingDate,
    m.lastUpdated,
    m.latitude ?? '',
    m.longitude ?? '',
    m.status,
    m.notes,
  ];
}

// Full rewrite — still used for bulk import (many rows at once, ordering
// doesn't matter) and as a one-off recovery tool if ever needed. Single
// create/update now go through the row-targeted functions below instead, so
// two people editing DIFFERENT outlets at the same time no longer overwrite
// each other's changes via a full-sheet clear+rewrite.
export async function saveMappingsToSheet(mappings: OutletMapping[], token: string) {
  const rows = mappings.map(mappingToRow);
  return overwriteSheetValues('Mapping', MAPPING_HEADERS, rows, token);
}

// Create: append ONE new row at the end of the sheet — never touches any
// existing row, so it can't collide with anyone else's concurrent edit.
export async function appendMappingToSheet(mapping: OutletMapping, token: string): Promise<boolean> {
  const row = mappingToRow(mapping);
  return appendSheetValues('Mapping!A:A', [row], token);
}

// Finds which sheet row (1-indexed, header included) a given Mapping ID is
// currently on, by reading only column A (cheap) rather than the whole sheet.
async function findMappingRowNumber(mappingId: string, token: string): Promise<number | null> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(
    'Mapping!A:A'
  )}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    if (res.status === 401) throw new GoogleAuthExpiredError();
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Gagal membaca data Mapping dari Google Sheets.');
  }
  const data = await res.json();
  const colA: string[][] = data.values || [];
  for (let i = 1; i < colA.length; i++) {
    if (colA[i]?.[0] === mappingId) {
      return i + 1; // sheet rows are 1-indexed; colA[0] is the header row
    }
  }
  return null;
}

// Edit: update ONLY the one row matching this Mapping ID, in place — every
// other row in the sheet is left completely untouched. This is what fixes
// the race condition where editing outlet A could accidentally wipe out a
// concurrent edit someone else just made to unrelated outlet B.
export async function updateMappingInSheet(mapping: OutletMapping, token: string): Promise<boolean> {
  const rowNumber = await findMappingRowNumber(mapping.mappingId, token);
  if (rowNumber === null) {
    throw new Error(
      `Mapping ID "${mapping.mappingId}" tidak ditemukan di sheet saat ini — mungkin baris ini baru saja dihapus/diubah oleh orang lain. Coba sync ulang dan periksa kembali.`
    );
  }
  const row = mappingToRow(mapping);
  return updateSheetValues(`Mapping!A${rowNumber}`, [row], token);
}

// Write operation: Save Call Plans to Sheet
const CALL_PLAN_HEADERS = [
  'Call Plan ID',
  'Nama PIC',
  'Nama MDS',
  'Customer SO Group Area Code',
  'Customer SO Group Area',
  'Klasifikasi Outlet',
  'Kabupaten',
  'Kecamatan',
  'Alamat',
  'Visit Day',
  'Week 1',
  'Week 2',
  'Week 3',
  'Week 4',
  'Frequency',
];

function callPlanToRow(c: CallPlanItem): any[] {
  return [
    c.callPlanId,
    c.namaPic,
    c.namaMds,
    c.customerSoGroupAreaCode,
    c.customerSoGroupArea,
    c.klasifikasiOutlet,
    c.kabupaten,
    c.kecamatan,
    c.alamat,
    c.visitDay,
    c.week1 ? 'TRUE' : 'FALSE',
    c.week2 ? 'TRUE' : 'FALSE',
    c.week3 ? 'TRUE' : 'FALSE',
    c.week4 ? 'TRUE' : 'FALSE',
    c.frequency,
  ];
}

// Full rewrite — still used for Bulk Upload and the Call Plan Wizard's
// finalize step (both genuinely write many rows at once, so a full rewrite
// is reasonable there). Single create/update now go through the
// row-targeted functions below instead, so editing/adding one schedule
// entry can't collide with someone else's concurrent edit to a different one.
export async function saveCallPlansToSheet(callPlans: CallPlanItem[], token: string) {
  const rows = callPlans.map(callPlanToRow);
  return overwriteSheetValues('Call Plan', CALL_PLAN_HEADERS, rows, token);
}

// Create: append ONE new row at the end of the sheet — never touches any
// existing row, so it can't collide with anyone else's concurrent edit.
export async function appendCallPlanToSheet(callPlan: CallPlanItem, token: string): Promise<boolean> {
  const row = callPlanToRow(callPlan);
  return appendSheetValues('Call Plan!A:A', [row], token);
}

// Finds which sheet row (1-indexed, header included) a given Call Plan ID is
// currently on, by reading only column A (cheap) rather than the whole sheet.
async function findCallPlanRowNumber(callPlanId: string, token: string): Promise<number | null> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(
    'Call Plan!A:A'
  )}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    if (res.status === 401) throw new GoogleAuthExpiredError();
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Gagal membaca data Call Plan dari Google Sheets.');
  }
  const data = await res.json();
  const colA: string[][] = data.values || [];
  for (let i = 1; i < colA.length; i++) {
    if (colA[i]?.[0] === callPlanId) {
      return i + 1; // sheet rows are 1-indexed; colA[0] is the header row
    }
  }
  return null;
}

// Edit: update ONLY the one row matching this Call Plan ID, in place — every
// other row in the sheet is left completely untouched.
export async function updateCallPlanInSheet(callPlan: CallPlanItem, token: string): Promise<boolean> {
  const rowNumber = await findCallPlanRowNumber(callPlan.callPlanId, token);
  if (rowNumber === null) {
    throw new Error(
      `Call Plan ID "${callPlan.callPlanId}" tidak ditemukan di sheet saat ini — mungkin baris ini baru saja dihapus/diubah oleh orang lain. Coba sync ulang dan periksa kembali.`
    );
  }
  const row = callPlanToRow(callPlan);
  return updateSheetValues(`Call Plan!A${rowNumber}`, [row], token);
}

// Write operation: Update User PIC Password
export async function updateUserPicPasswordInSheet(
  userId: string,
  newPassword: string,
  userPics: UserPIC[],
  token: string
) {
  const headers = [
    'User ID',
    'Nama PIC',
    'Email',
    'Role (Manager/Supervisor)',
    'Area',
    'Region',
    'Password',
  ];

  const updatedUsers = userPics.map((u) =>
    u.userId === userId ? { ...u, password: newPassword } : u
  );

  const rows = updatedUsers.map((u) => [
    u.userId,
    u.namaPic,
    u.email,
    u.role,
    u.area,
    u.region,
    u.password || '',
  ]);

  return overwriteSheetValues('User PIC', headers, rows, token);
}