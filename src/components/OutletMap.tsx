import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { OutletPerformance } from '../types';
import L from 'leaflet';
import { MapPin, Filter, Search, Layers, Store, ExternalLink } from 'lucide-react';

interface Props {
  onSelectOutletForCallPlan?: (code: string) => void;
}

export const OutletMap: React.FC<Props> = ({ onSelectOutletForCallPlan }) => {
  const { performance, mappings, callPlans, currentUser, accessibleDepo } = useApp();
  const isManager = currentUser?.role === 'Manager';

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  // Filters
  const [selectedRing, setSelectedRing] = useState<string>('ALL');
  const [selectedDepo, setSelectedDepo] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeOutlet, setActiveOutlet] = useState<OutletPerformance | null>(null);

  // Filtered outlets that have valid coordinates
  const mappedOutlets = useMemo(() => {
    return performance.filter((item) => {
      if (!item.latitude || !item.longitude) return false;
      // Peta Sebaran sebelumnya tidak membatasi akses sama sekali — Supervisor
      // bisa melihat seluruh outlet se-Jawa Timur di peta. Terapkan pembatasan
      // Depo yang sama seperti Dashboard Performance & Mapping.
      if (!isManager && accessibleDepo.length > 0 && !accessibleDepo.includes(item.depo)) return false;
      if (selectedRing !== 'ALL' && item.calculatedRing !== selectedRing) return false;
      if (selectedDepo !== 'ALL' && item.depo !== selectedDepo) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (
          !item.namaCustomerBaru.toLowerCase().includes(q) &&
          !item.kodeCustNfiGroup.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [performance, selectedRing, selectedDepo, searchQuery]);

  const depoOptions = useMemo(() => {
    if (!isManager) return accessibleDepo;
    return Array.from(new Set(performance.map((p) => p.depo).filter(Boolean)));
  }, [performance, isManager, accessibleDepo]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Center on East Java (Surabaya / Malang region)
    const map = L.map(mapContainerRef.current, {
      center: [-7.35, 112.75],
      zoom: 10,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = layerGroup;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Markers when filtered outlets change
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;

    markersLayerRef.current.clearLayers();

    const bounds = L.latLngBounds([]);

    mappedOutlets.forEach((outlet) => {
      if (!outlet.latitude || !outlet.longitude) return;

      const ringColor =
        outlet.calculatedRing === 'Ring 1'
          ? '#10b981' // emerald
          : outlet.calculatedRing === 'Ring 2'
          ? '#3b82f6' // blue
          : outlet.calculatedRing === 'Ring 3'
          ? '#f59e0b' // amber
          : '#64748b'; // slate

      const customIcon = L.divIcon({
        className: 'custom-pin-marker',
        html: `
          <div style="
            background-color: ${ringColor};
            width: 22px;
            height: 22px;
            border-radius: 50%;
            border: 2.5px solid white;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 10px;
            font-weight: bold;
          ">
            ${outlet.calculatedRing.replace('Ring ', 'R')}
          </div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const marker = L.marker([outlet.latitude, outlet.longitude], {
        icon: customIcon,
      });

      marker.on('click', () => {
        setActiveOutlet(outlet);
      });

      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 12px; min-width: 180px;">
          <div style="font-weight: bold; font-size: 13px; margin-bottom: 2px;">${outlet.namaCustomerBaru}</div>
          <div style="color: #64748b; font-size: 11px; margin-bottom: 6px;">${outlet.kodeCustNfiGroup} • ${outlet.depo}</div>
          <div style="margin-bottom: 4px;">
            <span style="background-color: ${ringColor}; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px;">
              ${outlet.calculatedRing}
            </span>
          </div>
          <div style="font-size: 11px; margin-top: 4px;">Omset 2026: <strong>Rp ${outlet.omset2026.toLocaleString('id-ID')}</strong></div>
          <div style="font-size: 11px;">Last Order: <strong>${outlet.lastOrder || '-'}</strong></div>
        </div>
      `);

      markersLayerRef.current?.addLayer(marker);
      bounds.extend([outlet.latitude, outlet.longitude]);
    });

    if (mappedOutlets.length > 0 && bounds.isValid()) {
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    }
  }, [mappedOutlets]);

  return (
    <div className="space-y-6">
      {/* Top Filter Bar */}
      <div className="bg-white p-4 lg:p-5 rounded-2xl shadow-xs border border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Peta Sebaran Geospasial Outlet</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Visualisasi zonasi outlet berkoordinat dengan kode warna klasifikasi Ring 1–4
            </p>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { label: 'Ring 1', color: 'bg-emerald-500' },
              { label: 'Ring 2', color: 'bg-blue-500' },
              { label: 'Ring 3', color: 'bg-amber-500' },
              { label: 'Ring 4', color: 'bg-slate-500' },
            ].map((r) => (
              <span
                key={r.label}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 bg-slate-50 rounded-lg border border-slate-200"
              >
                <span className={`w-2.5 h-2.5 rounded-full ${r.color}`} />
                <span>{r.label}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Cari toko pada peta..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <select
              value={selectedRing}
              onChange={(e) => setSelectedRing(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">Semua Ring Klasifikasi</option>
              <option value="Ring 1">Ring 1 (Hijau)</option>
              <option value="Ring 2">Ring 2 (Biru)</option>
              <option value="Ring 3">Ring 3 (Kuning)</option>
              <option value="Ring 4">Ring 4 (Abu-abu)</option>
            </select>
          </div>

          <div>
            <select
              value={selectedDepo}
              onChange={(e) => setSelectedDepo(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">Semua Depo ({depoOptions.length})</option>
              {depoOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Map Stage & Selected Outlet Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden h-[540px] relative">
          <div ref={mapContainerRef} className="w-full h-full z-0" />
        </div>

        {/* Details card for selected pin */}
        <div className="lg:col-span-1 bg-white rounded-3xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              Detail Titik Outlet Terpilih
            </h3>

            {activeOutlet ? (
              <div className="space-y-3.5">
                <div>
                  <span
                    className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-md mb-1.5 ${
                      activeOutlet.calculatedRing === 'Ring 1'
                        ? 'bg-emerald-100 text-emerald-800'
                        : activeOutlet.calculatedRing === 'Ring 2'
                        ? 'bg-blue-100 text-blue-800'
                        : activeOutlet.calculatedRing === 'Ring 3'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {activeOutlet.calculatedRing}
                  </span>
                  <h4 className="font-bold text-base text-slate-900 leading-tight">
                    {activeOutlet.namaCustomerBaru}
                  </h4>
                  <p className="text-xs font-mono text-slate-400 mt-0.5">
                    {activeOutlet.kodeCustNfiGroup}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Depo:</span>
                    <span className="font-semibold text-slate-800">{activeOutlet.depo}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Wilayah:</span>
                    <span className="font-semibold text-slate-800">
                      {activeOutlet.kecamatan}, {activeOutlet.kabupaten}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Omset 2026:</span>
                    <span className="font-bold text-slate-900">
                      Rp {activeOutlet.omset2026.toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Last Order:</span>
                    <span className="font-semibold text-slate-800">
                      {activeOutlet.lastOrder || '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Koordinat:</span>
                    <span className="font-mono text-slate-600">
                      {activeOutlet.latitude?.toFixed(4)}, {activeOutlet.longitude?.toFixed(4)}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">{activeOutlet.alamat}</p>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 text-xs">
                <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <span>Klik salah satu pin pada peta untuk melihat detail outlet dan rutenya.</span>
              </div>
            )}
          </div>

          {activeOutlet && onSelectOutletForCallPlan && (
            <button
              onClick={() => onSelectOutletForCallPlan(activeOutlet.kodeCustNfiGroup)}
              className="mt-4 w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Jadwalkan di Call Plan MDS</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};