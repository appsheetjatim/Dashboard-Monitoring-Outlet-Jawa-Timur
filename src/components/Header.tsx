import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  RotateCw,
  LogOut,
  KeyRound,
  Shield,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Menu,
  ChevronDown,
  Cloud,
  FileSpreadsheet,
} from 'lucide-react';
import { ChangePasswordModal } from './ChangePasswordModal';

interface HeaderProps {
  onToggleMobileMenu: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleMobileMenu }) => {
  const {
    currentUser,
    logout,
    googleUser,
    connectGoogle,
    disconnectGoogle,
    syncWithGoogleSheets,
    syncStatus,
    lastSyncTime,
    isConnectingGoogle,
  } = useApp();

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  if (!currentUser) return null;

  const isManager = currentUser.role === 'Manager';

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 lg:px-6 py-3">
        <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto">
          {/* Left: Mobile Toggle & Brand */}
          <div className="flex items-center gap-3">
            <button
              onClick={onToggleMobileMenu}
              className="lg:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
              aria-label="Toggle menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center text-white shadow-md shadow-indigo-100">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-sm font-bold text-slate-900 leading-tight">
                  Dashboard Monitoring Outlet
                </h1>
                <p className="text-[11px] text-slate-500 leading-none">
                  Nutrifood Indonesia - Jawa Timur
                </p>
              </div>
            </div>
          </div>

          {/* Center: Sync & Google Sheets Connection Status */}
          <div className="hidden md:flex items-center gap-2">
            <div
              className={`flex items-center gap-2.5 pl-3 pr-1 py-1 rounded-full text-xs font-medium border ${
                googleUser
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  googleUser ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              <span className="truncate max-w-[180px]">
                {googleUser ? `Sheets: ${googleUser.email}` : 'Mode Cache (Klik Sambungkan)'}
              </span>
              <span className="w-px h-4 bg-current opacity-20 shrink-0" />
              <span className="whitespace-nowrap opacity-80">{lastSyncTime}</span>
              <button
                onClick={syncWithGoogleSheets}
                disabled={syncStatus === 'syncing' || isConnectingGoogle}
                title="Sinkronkan data manual dari Google Sheets"
                className="p-1.5 rounded-full hover:bg-white/60 transition-all disabled:opacity-50 shrink-0"
              >
                <RotateCw
                  className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`}
                />
              </button>
            </div>

            {!googleUser ? (
              <button
                onClick={connectGoogle}
                disabled={isConnectingGoogle}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>{isConnectingGoogle ? 'Menghubungkan...' : 'Sambungkan Google'}</span>
              </button>
            ) : (
              <button
                onClick={disconnectGoogle}
                className="text-xs text-slate-400 hover:text-rose-600 px-2 py-1 transition-colors"
              >
                Putuskan
              </button>
            )}
          </div>

          {/* Right: PIC Profile & Role */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2.5 p-1.5 pr-2.5 rounded-xl hover:bg-slate-100 transition-colors text-left"
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shadow-xs ${
                    isManager ? 'bg-purple-600' : 'bg-emerald-600'
                  }`}
                >
                  {isManager ? <Shield className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                </div>
                <div className="hidden sm:block">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-800 leading-tight">
                      {currentUser.namaPic}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                        isManager
                          ? 'bg-purple-100 text-purple-700 border border-purple-200'
                          : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {currentUser.role}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-tight truncate max-w-[140px]">
                    {currentUser.area}
                  </p>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {/* Profile Dropdown Menu */}
              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-3 py-2 border-b border-slate-100 mb-1">
                    <p className="text-xs font-bold text-slate-900">{currentUser.namaPic}</p>
                    <p className="text-[11px] text-slate-500">{currentUser.email}</p>
                    <div className="mt-1 flex items-center gap-1">
                      <span className="text-[10px] text-slate-400">Area:</span>
                      <span className="text-[10px] font-medium text-slate-700">{currentUser.area}</span>
                    </div>
                  </div>

                  <div className="py-1">
                    <button
                      onClick={() => {
                        setShowPasswordModal(true);
                        setShowProfileMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 rounded-xl transition-colors"
                    >
                      <KeyRound className="w-4 h-4 text-slate-500" />
                      <span>Ganti Password Sendiri</span>
                    </button>

                    <div className="my-1 border-t border-slate-100 pt-1">
                      <button
                        onClick={() => {
                          logout();
                          setShowProfileMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 rounded-xl transition-colors font-medium"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Keluar / Logout</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile secondary bar for sync & Google */}
        <div className="md:hidden mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-slate-500">
            <span
              className={`w-2 h-2 rounded-full ${googleUser ? 'bg-emerald-500' : 'bg-amber-500'}`}
            />
            <span className="text-[11px] truncate max-w-[160px]">
              {googleUser ? googleUser.email : 'Mode Cache'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={syncWithGoogleSheets}
              disabled={syncStatus === 'syncing'}
              className="flex items-center gap-1 text-[11px] text-slate-600 bg-slate-100 px-2 py-1 rounded-md"
            >
              <RotateCw className={`w-3 h-3 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
              <span>Sinkron</span>
            </button>
            {!googleUser ? (
              <button
                onClick={connectGoogle}
                className="text-[11px] font-medium text-white bg-indigo-600 px-2.5 py-1 rounded-md"
              >
                Sambungkan
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
      />
    </>
  );
};