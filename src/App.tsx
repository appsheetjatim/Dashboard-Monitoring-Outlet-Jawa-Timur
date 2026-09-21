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
  const { currentUser, errorMessage, syncWithGoogleSheets, syncStatus } = useApp();
  const [activeTab, setActiveTab] = useState<ActiveTab>('performance');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Jump helper from dashboard or map to call plan
  const handleNavigateToCallPlan = (outletCode?: string) => {
    setActiveTab('callplan');
  };

  const handleNavigateToMap = () => {
    setActiveTab('map');
  };

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
