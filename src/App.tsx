/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, Suspense, lazy } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { LoginModal } from './components/LoginModal';
import { AlertCircle, RotateCw, FileSpreadsheet, ShieldCheck } from 'lucide-react';

// Lazy-loaded: each tab's code (and, for Peta Sebaran, the Leaflet map
// library) is only downloaded the first time that tab is actually opened,
// instead of bundling everything into one large chunk everyone pays for on
// first load regardless of which tabs they ever visit.
const PerformanceDashboard = lazy(() =>
  import('./components/PerformanceDashboard').then((m) => ({ default: m.PerformanceDashboard }))
);
const MappingManagement = lazy(() =>
  import('./components/MappingManagement').then((m) => ({ default: m.MappingManagement }))
);
const CallPlanManagement = lazy(() =>
  import('./components/CallPlanManagement').then((m) => ({ default: m.CallPlanManagement }))
);
const OutletMap = lazy(() => import('./components/OutletMap').then((m) => ({ default: m.OutletMap })));
const LogActivityView = lazy(() =>
  import('./components/LogActivityView').then((m) => ({ default: m.LogActivityView }))
);

function TabLoadingFallback() {
  return (
    <div className="flex items-center justify-center py-24 text-slate-400 text-sm gap-2">
      <RotateCw className="w-4 h-4 animate-spin" />
      Memuat...
    </div>
  );
}

function DashboardContent() {
  const { currentUser, errorMessage, syncWithGoogleSheets, syncStatus, hasEverSynced } = useApp();
  const [activeTab, setActiveTab] = useState<ActiveTab>('performance');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Jump helper from dashboard or map to call plan
  const handleNavigateToCallPlan = (outletCode?: string) => {
    setActiveTab('callplan');
  };

  const handleNavigateToMap = () => {
    setActiveTab('map');
  };

  // Gate 1: no genuine full sync has ever completed — block access entirely
  // (no Header, no Sidebar, nothing but this screen) until Sync Data
  // succeeds. This checks hasEverSynced specifically (not just "is userPics
  // non-empty"), because individual caches can end up partially populated
  // (e.g. accounts cached but outlet data never synced), which used to let
  // people through into a half-empty app shell.
  if (!hasEverSynced) {
    if (syncStatus === 'error') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 p-4">
          <div className="max-w-sm w-full text-center bg-white rounded-3xl border border-slate-200 shadow-xs p-8">
            <div className="w-14 h-14 bg-rose-100 rounded-2xl flex items-center justify-center text-rose-600 mx-auto mb-4">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h2 className="font-bold text-slate-900 mb-1">Gagal Terhubung ke Database</h2>
            <p className="text-xs text-slate-500 mb-5">
              {errorMessage || 'Tidak bisa menyambungkan ke Google Sheets. Periksa koneksi internet Anda dan coba lagi.'}
            </p>
            <button
              onClick={syncWithGoogleSheets}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-xl shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2"
            >
              <RotateCw className="w-4 h-4" />
              Coba Lagi
            </button>
          </div>
        </div>
      );
    }
    const isSyncing = syncStatus === 'syncing';
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 p-4">
        <div className="max-w-sm w-full text-center bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center text-white mx-auto mb-4 shadow-md shadow-indigo-100">
            <FileSpreadsheet className="w-7 h-7" />
          </div>
          <h1 className="text-base font-bold text-slate-900 mb-0.5">Dashboard Monitoring Outlet</h1>
          <p className="text-xs text-slate-500 mb-4">Nutrifood Indonesia - Jawa Timur</p>

          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            {isSyncing
              ? 'Mengambil data outlet, mapping, dan call plan dari Google Sheets, mohon tunggu sebentar...'
              : 'Aplikasi akan menyambungkan ke Google Sheets untuk mengambil data outlet, mapping klasifikasi, dan jadwal kunjungan MDS terbaru.'}
          </p>

          <button
            onClick={syncWithGoogleSheets}
            disabled={isSyncing}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-xl shadow-md shadow-indigo-200 transition-all inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <RotateCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Menyinkronkan...' : 'Sync Data'}
          </button>

          <div className="mt-5 pt-4 border-t border-slate-100 flex items-start gap-2 text-left">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Data tersambung langsung ke Google Sheets internal perusahaan — tidak disimpan di server pihak ketiga mana pun.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Gate 2: live data is available, but no one is logged in yet
  if (!currentUser) {
    return <LoginModal />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      <Header onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)} />

      {/* Global Sync Error Warning Banner */}
      {errorMessage && (
        <div className="bg-amber-500 text-white text-xs px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 max-w-5xl mx-auto w-full">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage} (Menggunakan data lokal/cache)</span>
            <button
              onClick={syncWithGoogleSheets}
              disabled={syncStatus === 'syncing'}
              className="ml-auto underline font-bold hover:text-amber-100 flex items-center gap-1"
            >
              <RotateCw className={`w-3 h-3 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
              Coba Ulang Sinkron
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          isMobileOpen={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
        />

        <main className="flex-1 p-4 lg:p-6 overflow-x-hidden min-w-0">
          <Suspense fallback={<TabLoadingFallback />}>
            {activeTab === 'performance' && (
              <PerformanceDashboard
                onNavigateToCallPlan={handleNavigateToCallPlan}
                onNavigateToMap={handleNavigateToMap}
              />
            )}

            {activeTab === 'mapping' && <MappingManagement />}

            {activeTab === 'callplan' && <CallPlanManagement />}

            {activeTab === 'map' && (
              <OutletMap onSelectOutletForCallPlan={handleNavigateToCallPlan} />
            )}

            {activeTab === 'logs' && <LogActivityView />}
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <DashboardContent />
    </AppProvider>
  );
}