import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { OutletPerformance } from '../types';
import L from 'leaflet';
import { MapPin, Filter, Search, Layers, Store, ExternalLink } from 'lucide-react';
import { MultiSelectDropdown } from './MultiSelectDropdown';

interface Props {
  onSelectOutletForCallPlan?: (code: string) => void;
}

type ShadingMetric = 'none' | 'jumlah_toko' | 'omset' | 'dorman';

export const OutletMap: React.FC<Props> = ({ onSelectOutletForCallPlan }) => {
  const { performance, mappings, callPlans, currentUser, accessibleDepo, accessibleKabupaten } = useApp();
  const isManager = currentUser?.role === 'Manager';

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const shadingLayerRef = useRef<L.GeoJSON | null>(null);
  const shadingDataLoadedRef = useRef(false);

  // Kecamatan boundary shading
  const [shadingMetric, setShadingMetric] = useState<ShadingMetric>('none');
  const [kecamatanGeoJson, setKecamatanGeoJson] = useState<any | null>(null);
  const [isLoadingBoundaries, setIsLoadingBoundaries] = useState(false);

  // Filters
  const [selectedRing, setSelectedRing] = useState<string[]>([]);
  const [selectedDepo, setSelectedDepo] = useState<string[]>([]);
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
      if (selectedRing.length > 0 && !selectedRing.includes(item.calculatedRing)) return false;
      if (selectedDepo.length > 0 && !selectedDepo.includes(item.depo)) return false;
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
    if (!isManager) return [...accessibleDepo].sort();
    return Array.from(new Set(performance.map((p) => p.depo).filter(Boolean))).sort();
  }, [performance, isManager, accessibleDepo]);

  // Clean composite key + name pieces for every Kecamatan feature in the
  // boundary data (once GeoJSON is loaded).
  // Restrict which Kecamatan polygons a Supervisor sees on the shading layer
  // to only their assigned Kabupaten/Kota (sheet "Kab") — Manager always
  // sees every Kecamatan in Jawa Timur, same as elsewhere in the app.
  const visibleKecamatanGeoJson = useMemo(() => {
    if (!kecamatanGeoJson) return null;
    if (isManager || accessibleKabupaten.length === 0) return kecamatanGeoJson;

    const allowed = accessibleKabupaten.map((k) => k.toUpperCase().trim());
    const features = kecamatanGeoJson.features.filter((f: any) => {
      const gk = String(f.properties?.KAB_KOTA || '').toUpperCase().trim();
      return allowed.some((a) => a === gk || a.includes(gk) || gk.includes(a));
    });
    return { ...kecamatanGeoJson, features };
  }, [kecamatanGeoJson, isManager, accessibleKabupaten]);

  const geoFeatureKeys = useMemo(() => {
    if (!visibleKecamatanGeoJson) return [];
    return visibleKecamatanGeoJson.features.map((f: any) => ({
      key: `${f.properties.KECAMATAN}|${f.properties.KAB_KOTA}`.toUpperCase(),
      kecamatan: String(f.properties.KECAMATAN || '').toUpperCase().trim(),
      kabKota: String(f.properties.KAB_KOTA || '').toUpperCase().trim(),
    }));
  }, [visibleKecamatanGeoJson]);

  // Bridges the app's raw (kecamatan, kabupaten) fields to the matching
  // boundary feature's clean key. Tries an exact match first; if that fails
  // — e.g. because the app's "kecamatan" field already has the Kabupaten/
  // Kota name appended to it, like "KLOJEN MALANG" instead of clean
  // "KLOJEN" — falls back to checking whether the boundary's clean
  // kecamatan name is contained within the app's field, with the Kabupaten
  // side also lining up so a same-named kecamatan in a different
  // Kabupaten/Kota isn't matched by mistake. Memoized per unique raw pair
  // (not per outlet), since there are far fewer distinct pairs than outlets.
  const resolveGeoKey = useMemo(() => {
    const cache = new Map<string, string | null>();
    return (rawKecamatan: string, rawKabupaten: string): string | null => {
      const cacheKey = `${rawKecamatan}|${rawKabupaten}`.toUpperCase();
      if (cache.has(cacheKey)) return cache.get(cacheKey)!;

      const ak = (rawKecamatan || '').toUpperCase().trim();
      const ab = (rawKabupaten || '').toUpperCase().trim();

      let found = geoFeatureKeys.find((g: { key: string; kecamatan: string; kabKota: string }) => g.kecamatan === ak && g.kabKota === ab);
      if (!found) {
        found = geoFeatureKeys.find(
          (g: { key: string; kecamatan: string; kabKota: string }) =>
            g.kecamatan.length > 0 &&
            (ak.startsWith(g.kecamatan) || ak.includes(g.kecamatan)) &&
            (ab === g.kabKota || ab.includes(g.kabKota) || g.kabKota.includes(ab))
        );
      }
      const result = found ? found.key : null;
      cache.set(cacheKey, result);
      return result;
    };
  }, [geoFeatureKeys]);

  // Per-Kecamatan aggregate stats for shading — keyed by the boundary
  // feature's own clean "KECAMATAN|KAB_KOTA" key (resolved via
  // resolveGeoKey above), so lookups during rendering stay a simple exact
  // match even though the raw app data doesn't line up 1:1.
  const kecamatanStats = useMemo(() => {
    const stats: Record<string, { jumlahToko: number; omset: number; dorman: number }> = {};
    mappedOutlets.forEach((item) => {
      const key = resolveGeoKey(item.kecamatan, item.kabupaten);
      if (!key) return;
      if (!stats[key]) stats[key] = { jumlahToko: 0, omset: 0, dorman: 0 };
      stats[key].jumlahToko += 1;
      stats[key].omset += item.omset2026 || 0;
      if (item.isDormant) stats[key].dorman += 1;
    });
    return stats;
  }, [mappedOutlets, resolveGeoKey]);
  useEffect(() => {
    if (shadingMetric === 'none' || kecamatanGeoJson || isLoadingBoundaries) return;
    setIsLoadingBoundaries(true);
    fetch('/data/jatim-kecamatan.geojson')
      .then((res) => res.json())
      .then((data) => setKecamatanGeoJson(data))
      .catch((err) => console.warn('Failed to load kecamatan boundaries:', err))
      .finally(() => setIsLoadingBoundaries(false));
  }, [shadingMetric, kecamatanGeoJson, isLoadingBoundaries]);

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

    const shadingLayer = L.geoJSON(undefined, { style: () => ({ opacity: 0 }) }).addTo(map);
    shadingLayerRef.current = shadingLayer;
    // Keep shading below the marker layer so pins always stay clickable on top
    shadingLayer.bringToBack();

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Render/update the choropleth shading whenever the metric, boundary data,
  // or underlying stats change.
  useEffect(() => {
    const layer = shadingLayerRef.current;
    if (!layer || !mapInstanceRef.current) return;

    if (shadingMetric === 'none') {
      // Fully detach the geometry when shading is off, so panning/zooming
      // goes back to exactly the same performance as pin-only mode — not
      // just hidden (which would still cost redraw work on every pan/zoom).
      if (shadingDataLoadedRef.current) {
        layer.clearLayers();
        shadingDataLoadedRef.current = false;
      }
      return;
    }

    if (!visibleKecamatanGeoJson) return; // still loading

    // Only (re)build the polygon geometry once per load — switching between
    // metrics afterwards just restyles the same shapes instead of
    // re-parsing and re-adding all 668 features from scratch each time.
    if (!shadingDataLoadedRef.current) {
      layer.clearLayers();
      layer.addData(visibleKecamatanGeoJson);
      shadingDataLoadedRef.current = true;
    }

    const metricKey =
      shadingMetric === 'jumlah_toko' ? 'jumlahToko' : shadingMetric === 'omset' ? 'omset' : 'dorman';
    const baseColor =
      shadingMetric === 'dorman' ? '#e11d48' /* rose-600 */ : '#4f46e5' /* indigo-600 */;

    const maxValue = Math.max(
      1,
      ...Object.values(kecamatanStats).map((s) => s[metricKey as keyof typeof s])
    );

    layer.setStyle((feature) => {
      const key = `${feature?.properties?.KECAMATAN}|${feature?.properties?.KAB_KOTA}`.toUpperCase();
      const value = kecamatanStats[key]?.[metricKey as keyof (typeof kecamatanStats)[string]] || 0;
      const intensity = Math.min(1, value / maxValue);
      return {
        color: baseColor,
        weight: 1,
        opacity: 0.5,
        fillColor: baseColor,
        fillOpacity: value > 0 ? 0.15 + intensity * 0.6 : 0.03,
      };
    });

    layer.eachLayer((l) => {
      const feature = (l as any).feature;
      const key = `${feature?.properties?.KECAMATAN}|${feature?.properties?.KAB_KOTA}`.toUpperCase();
      const stat = kecamatanStats[key];
      const metricLabel =
        shadingMetric === 'jumlah_toko'
          ? `${stat?.jumlahToko || 0} outlet`
          : shadingMetric === 'omset'
          ? `Rp ${(stat?.omset || 0).toLocaleString('id-ID')}`
          : `${stat?.dorman || 0} outlet dorman`;
      (l as L.Layer).bindTooltip(
        `<strong>${feature?.properties?.KECAMATAN}</strong><br/>${feature?.properties?.KAB_KOTA}<br/>${metricLabel}`,
        { sticky: true }
      );
    });

    layer.bringToBack();
  }, [shadingMetric, visibleKecamatanGeoJson, kecamatanStats]);

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
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-1">
              {[
                { id: 'none', label: 'Tanpa Shading' },
                { id: 'jumlah_toko', label: 'Jumlah Toko' },
                { id: 'omset', label: 'Omset' },
                { id: 'dorman', label: 'Outlet Dorman' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setShadingMetric(m.id as ShadingMetric)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                    shadingMetric === m.id
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 hover:bg-white'
                  }`}
                >
                  {m.label}
                </button>
              ))}
              {isLoadingBoundaries && (
                <span className="px-2 text-[11px] text-slate-400">Memuat batas wilayah...</span>
              )}
            </div>
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
            <MultiSelectDropdown
              label="Ring Klasifikasi"
              options={['Ring 1', 'Ring 2', 'Ring 3', 'Ring 4']}
              selected={selectedRing}
              onChange={setSelectedRing}
            />
          </div>

          <div>
            <MultiSelectDropdown
              label="Depo"
              options={depoOptions}
              selected={selectedDepo}
              onChange={setSelectedDepo}
            />
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
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Koordinat:</span>
                    <span className="font-mono text-slate-600">
                      {activeOutlet.latitude?.toFixed(4)}, {activeOutlet.longitude?.toFixed(4)}
                    </span>
                  </div>
                </div>

                {activeOutlet.latitude && activeOutlet.longitude && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${activeOutlet.latitude},${activeOutlet.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-xl transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Buka di Google Maps
                  </a>
                )}

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