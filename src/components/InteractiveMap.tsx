import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Complaint } from '../types/civic';

interface InteractiveMapProps {
  complaints: Complaint[];
  selectedId?: number | null;
  onSelectComplaint?: (complaint: Complaint) => void;
  pickerMode?: boolean;
  pickedCoords?: { lat: number; lng: number } | null;
  onPickCoords?: (lat: number, lng: number) => void;
  heightClass?: string;
}

function getMarkerColor(c: Complaint): string {
  if (c.status === 'Resolved') return '#16a34a';
  if (c.status === 'Escalated' || c.is_overdue === 1 || c.priority === 'Critical') return '#dc2626';
  if (c.status === 'In Progress') return '#d97706';
  return '#1d4ed8';
}

export function InteractiveMap({
  complaints,
  selectedId,
  onSelectComplaint,
  pickerMode = false,
  pickedCoords,
  onPickCoords,
  heightClass = 'h-[480px]',
}: InteractiveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const pickerMarkerRef = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCenter: [number, number] = pickedCoords
      ? [pickedCoords.lat, pickedCoords.lng]
      : [12.9616, 77.6146];

    const map = L.map(containerRef.current, {
      center: initialCenter,
      zoom: pickerMode ? 13 : 12,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    mapRef.current = map;
    markersLayerRef.current = layerGroup;

    if (pickerMode && onPickCoords) {
      map.on('click', (e: L.LeafletMouseEvent) => {
        onPickCoords(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
      });
    }

    return () => {
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      pickerMarkerRef.current = null;
    };
  }, [pickerMode]);

  // Update complaint pins
  useEffect(() => {
    const map = mapRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    for (const c of complaints) {
      if (!Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) continue;
      const color = getMarkerColor(c);
      const isSelected = selectedId === c.id;

      const marker = L.circleMarker([c.latitude, c.longitude], {
        radius: isSelected ? 11 : 8,
        color: '#ffffff',
        weight: isSelected ? 3 : 2,
        fillColor: color,
        fillOpacity: 0.92,
      });

      const safeTitle = c.title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const safeAddr = c.address.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      marker.bindTooltip(
        `<div style="font-family: DM Sans, sans-serif; font-size: 12px; max-width: 240px;">
          <div style="font-family: JetBrains Mono, monospace; font-weight: 600; color: #0f172a;">${c.tracking_id} · ${c.status}</div>
          <div style="font-weight: 600; margin-top: 2px; color: #1e293b;">${safeTitle}</div>
          <div style="color: #64748b; margin-top: 2px;">${c.category} · ${safeAddr}</div>
        </div>`,
        { direction: 'top', offset: [0, -6] }
      );

      if (onSelectComplaint) {
        marker.on('click', () => onSelectComplaint(c));
      }
      marker.addTo(layer);
    }
  }, [complaints, selectedId, onSelectComplaint]);

  // Update picker pin & pan smoothly when GPS updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pickerMode || !pickedCoords) return;

    if (pickerMarkerRef.current) {
      pickerMarkerRef.current.setLatLng([pickedCoords.lat, pickedCoords.lng]);
    } else {
      pickerMarkerRef.current = L.circleMarker([pickedCoords.lat, pickedCoords.lng], {
        radius: 10,
        color: '#ffffff',
        weight: 3,
        fillColor: '#1d4ed8',
        fillOpacity: 1,
      }).addTo(map);
    }
    map.setView([pickedCoords.lat, pickedCoords.lng], Math.max(map.getZoom(), 14), {
      animate: true,
    });
  }, [pickerMode, pickedCoords]);

  return (
    <div
      ref={containerRef}
      className={`w-full ${heightClass} rounded-lg border border-slate-200 bg-slate-100 overflow-hidden`}
    />
  );
}
