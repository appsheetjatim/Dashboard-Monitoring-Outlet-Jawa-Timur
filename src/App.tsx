/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { PerformanceDashboard } from './components/PerformanceDashboard';
import { MappingManagement } from './components/MappingManagement';
import { CallPlanManagement } from './components/CallPlanManagement';
import { OutletMap } from './components/OutletMap';
import { LogActivityView } from './components/LogActivityView';
import { LoginModal } from './components/LoginModal';
import { AlertCircle, RotateCw } from 'lucide-react';

function DashboardContent() {
  const { currentUser, errorMessage, syncWithGoogleSheets, syncStatus, userPics } = useApp();
  const [activeTab, setActiveTab] = useState<ActiveTab>('performance');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Jump helper from dashboard or map to call plan
  const handleNavigateToCallPlan = (outletCode?: string) => {
    setActiveTab('callplan');
  };

  const handleNavigateToMap = () => {
    setActiveTab('map');
  };

  // Gate 1: no live data at all yet (first-ever load, or cache cleared) —
  // block access entirely until the person clicks Sync Data and it succeeds.
  // A returning person with cached data from a previous sync skips straight
  // past this (userPics is already populated).
  if (userPics.length === 0) {
    if (syncStatus === 'error') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-sm w-full text-center bg-white rounded-3xl border border-slate-200 shadow-xs p-8">
          <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 mx-auto mb-4">
            <RotateCw className={`w-7 h-7 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
          </div>
          <h2 className="font-bold text-slate-900 mb-1">Monitoring Outlet Distributor</h2>
          <p className="text-xs text-slate-500 mb-5">
            Sambungkan ke database Google Sheets untuk mulai memuat data.
          </p>
          <button
            onClick={syncWithGoogleSheets}
            disabled={syncStatus === 'syncing'}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-xl shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <RotateCw className={`w-4 h-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
            {syncStatus === 'syncing' ? 'Menyinkronkan...' : 'Sync Data'}
          </button>
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