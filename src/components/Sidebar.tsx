import React from 'react';
import {
  BarChart3,
  Layers,
  CalendarCheck,
  MapPin,
  History,
  AlertTriangle,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export type ActiveTab = 'performance' | 'mapping' | 'callplan' | 'map' | 'logs';

interface SidebarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isMobileOpen,
  onCloseMobile,
}) => {
  const { performance, mappings, callPlans, logs } = useApp();

  const dormanCount = performance.filter((p) => p.isDormant || p.isChurnRisk).length;

  const navItems = [
    {
      id: 'performance' as ActiveTab,
      label: 'Dashboard Performance',
      icon: BarChart3,
      badge: dormanCount > 0 ? `${dormanCount} Dorman` : null,
      badgeColor: 'bg-rose-100 text-rose-700',
    },
    {
      id: 'mapping' as ActiveTab,
      label: 'Mapping & POSM Outlet',
      icon: Layers,
      badge: `${mappings.length}`,
      badgeColor: 'bg-slate-100 text-slate-700',
    },
    {
      id: 'callplan' as ActiveTab,
      label: 'Call Plan MDS',
      icon: CalendarCheck,
      badge: `${callPlans.length}`,
      badgeColor: 'bg-indigo-100 text-indigo-700',
    },
    {
      id: 'map' as ActiveTab,
      label: 'Peta Sebaran Outlet',
      icon: MapPin,
      badge: null,
      badgeColor: '',
    },
    {
      id: 'logs' as ActiveTab,
      label: 'Log Activity',
      icon: History,
      badge: `${logs.length}`,
      badgeColor: 'bg-slate-100 text-slate-600',
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* Sidebar Content */}
      <aside
        className={`fixed lg:sticky top-0 lg:top-[61px] left-0 z-40 h-full lg:h-[calc(100vh-61px)] w-64 bg-white border-r border-slate-200 p-4 flex flex-col justify-between transition-transform duration-200 ease-in-out ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="space-y-6">
          <div className="px-2 pt-2 lg:pt-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Menu Utama
            </span>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectTab(item.id);
                    onCloseMobile();
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>

                  {item.badge && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        isActive ? 'bg-white/20 text-white' : item.badgeColor
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Info Card */}
        <div className="p-3.5 bg-gradient-to-br from-indigo-50/80 to-blue-50/50 rounded-2xl border border-indigo-100/60">
          <div className="flex items-center gap-2 mb-1.5 text-indigo-700">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="text-xs font-bold">Aturan Klasifikasi</span>
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Ring dihitung otomatis: Ring 1 (Mapping Active), Ring 2 (Pareto ≤80% / Aktif & Produktif), Ring 3 (Avg Sales ≥100rb), Ring 4 (&lt;100rb).
          </p>
        </div>
      </aside>
    </>
  );
};
