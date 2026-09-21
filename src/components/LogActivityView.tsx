import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { LogActivityRecord } from '../types';
import {
  History,
  Search,
  Filter,
  Download,
  Calendar,
  UserCheck,
  Layers,
  CalendarCheck,
  KeyRound,
  FileSpreadsheet,
} from 'lucide-react';
import * as XLSX from 'xlsx';

export const LogActivityView: React.FC = () => {
  const { logs, userPics } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterPic, setFilterPic] = useState('ALL');
  const [filterTarget, setFilterTarget] = useState('ALL');
  const [filterAction, setFilterAction] = useState('ALL');

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (filterPic !== 'ALL' && l.namaPic !== filterPic) return false;
      if (filterTarget !== 'ALL' && l.sheetTarget !== filterTarget) return false;
      if (filterAction !== 'ALL' && l.jenisAksi !== filterAction) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesDetail = l.detailPerubahan.toLowerCase().includes(q);
        const matchesId = l.idRecord.toLowerCase().includes(q);
        const matchesPic = l.namaPic.toLowerCase().includes(q);
        if (!matchesDetail && !matchesId && !matchesPic) return false;
      }
      return true;
    });
  }, [logs, filterPic, filterTarget, filterAction, searchQuery]);

  const picOptions = useMemo(() => {
    return Array.from(new Set(logs.map((l) => l.namaPic).filter(Boolean)));
  }, [logs]);

  const handleExport = () => {
    const rows = filteredLogs.map((l) => ({
      Timestamp: l.timestamp,
      'Nama PIC': l.namaPic,
      'Jenis Aksi': l.jenisAksi,
      'Sheet Target': l.sheetTarget,
      'ID Record': l.idRecord,
      'Detail Perubahan': l.detailPerubahan,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Log Activity');
    XLSX.writeFile(wb, 'Log_Histori_Perubahan_Distributor.xlsx');
  };

  return (
    <div className="space-y-6">
      {/* Top Filter Bar */}
      <div className="bg-white p-4 lg:p-5 rounded-2xl shadow-xs border border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Log Activity &amp; Audit Trail</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Catatan lengkap riwayat penambahan, modifikasi, dan penghapusan data PIC secara real-time
            </p>
          </div>

          <button
            onClick={handleExport}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 self-start sm:self-auto"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Log Excel</span>
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Cari kata kunci perubahan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <select
              value={filterPic}
              onChange={(e) => setFilterPic(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">Semua Nama PIC</option>
              {picOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={filterTarget}
              onChange={(e) => setFilterTarget(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">Semua Sheet Target</option>
              <option value="Mapping">Sheet Mapping</option>
              <option value="Call Plan">Sheet Call Plan</option>
              <option value="User PIC">Sheet User PIC</option>
            </select>
          </div>

          <div>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">Semua Jenis Aksi</option>
              <option value="Create">Create (Penambahan)</option>
              <option value="Update">Update (Perubahan)</option>
              <option value="Delete">Delete (Penghapusan)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Log Activity Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-800">
            Riwayat Aktivitas ({filteredLogs.length} Entri)
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                <th className="py-3 px-3 w-40">Waktu &amp; Tanggal</th>
                <th className="py-3 px-3">Nama PIC</th>
                <th className="py-3 px-3 text-center">Jenis Aksi</th>
                <th className="py-3 px-3">Sheet Target</th>
                <th className="py-3 px-3 font-mono">ID Record</th>
                <th className="py-3 px-3">Detail Perubahan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400">
                    Belum ada riwayat aktivitas yang tercatat.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log, idx) => {
                  const isCreate = log.jenisAksi === 'Create';
                  const isUpdate = log.jenisAksi === 'Update';
                  const isDelete = log.jenisAksi === 'Delete';

                  const badgeClass = isCreate
                    ? 'bg-emerald-100 text-emerald-800'
                    : isUpdate
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-rose-100 text-rose-800';

                  return (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 text-slate-500 whitespace-nowrap font-mono text-[11px]">
                        {log.timestamp}
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-900">{log.namaPic}</td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] ${badgeClass}`}
                        >
                          {log.jenisAksi}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-semibold text-slate-700">{log.sheetTarget}</span>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-500 text-[11px]">
                        {log.idRecord}
                      </td>
                      <td className="py-3 px-3 text-slate-800 font-medium">
                        {log.detailPerubahan}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
