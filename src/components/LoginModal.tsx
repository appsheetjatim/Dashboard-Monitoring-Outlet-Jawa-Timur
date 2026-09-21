import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Lock, UserCheck, ShieldCheck, UserCheck2, LogIn, AlertCircle } from 'lucide-react';

export const LoginModal: React.FC = () => {
  const { currentUser, login, userPics } = useApp();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (currentUser) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await login(userId, password);
    setLoading(false);
    if (!res.success) {
      setError(res.message || 'Login gagal.');
    }
  };

  const handleQuickLogin = async (uId: string, pass: string = 'password123') => {
    setError(null);
    setLoading(true);
    const res = await login(uId, pass);
    setLoading(false);
    if (!res.success) {
      setError(res.message || 'Login gagal.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl border border-slate-100">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mx-auto mb-3 shadow-lg shadow-indigo-200">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Login PIC Distributor</h2>
          <p className="text-xs text-slate-500 mt-1">
            Dashboard Monitoring Outlet, POSM & Call Plan MDS
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              User ID PIC
            </label>
            <input
              type="text"
              required
              placeholder="Contoh: budi.spv atau hendra.mgr"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              placeholder="Masukkan password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-xl shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <LogIn className="w-4 h-4" />
            {loading ? 'Memvalidasi...' : 'Masuk ke Dashboard'}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-100">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5 text-center">
            Pilih Akun Demo Cepat (Role PIC)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {userPics.map((u) => {
              const isMgr = u.role === 'Manager';
              return (
                <button
                  key={u.userId}
                  type="button"
                  onClick={() => handleQuickLogin(u.userId, u.password || 'password123')}
                  className="p-2.5 rounded-xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all text-left flex items-start gap-2.5 group"
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                      isMgr
                        ? 'bg-purple-100 text-purple-700 group-hover:bg-purple-200'
                        : 'bg-emerald-100 text-emerald-700 group-hover:bg-emerald-200'
                    }`}
                  >
                    {isMgr ? <ShieldCheck className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs text-slate-800 truncate">
                        {u.namaPic}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                          isMgr ? 'bg-purple-50 text-purple-700' : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {u.role}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">{u.area}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
