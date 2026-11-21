import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Crosshair, Flame, Layers, Maximize2, Minimize2, Minus, Plus, X } from 'lucide-react';
import { D3DemandLayer } from './D3DemandLayer';
import { ErrorBoundary } from './ErrorBoundary';
import type { DemandHotspot, DemandMapData, DemandPoint, MapPoint, RouteResult, ServiceZone } from '../types';

interface PartnerMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  vehicle?: string;
}

export interface MapFocusTarget {
  lat: number;
  lng: number;
  zoom?: number;
  ts: number;
}

interface StreetMapProps {
  center?: [number, number];
  zoom?: number;
  pickup?: MapPoint | null;
  dropoff?: MapPoint | null;
  route?: RouteResult | null;
  onRouteComputed?: (route: RouteResult | null) => void;
  livePartner?: { lat: number; lng: number; label?: string } | null;
  partnerMarkers?: PartnerMarker[];
  zones?: ServiceZone[];
  demandData?: DemandMapData | null;
  demandAudience?: 'partner' | 'passenger';
  showDemandLayer?: boolean;
  focusTarget?: MapFocusTarget | null;
  onHotspotSelect?: (hotspot: DemandHotspot) => void;
  pickMode?: 'pickup' | 'dropoff' | null;
  onMapPick?: (lat: number, lng: number) => void;
  onLocateUser?: (lat: number, lng: number) => void;
  heightClass?: string;
  routeError?: string | null;
}

function isQuotaError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '');
  const status = (err as any)?.status || (err as any)?.code;
  return (
    status === 429 ||
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('OverQuota')
  );
}

const MapController: React.FC<{
  pickup?: MapPoint | null;
  dropoff?: MapPoint | null;
  route?: RouteResult | null;
  onRouteComputed?: (route: RouteResult | null) => void;
  livePartner?: { lat: number; lng: number; label?: string } | null;
  zones: ServiceZone[];
  d3Active: boolean;
  focusTarget?: MapFocusTarget | null;
  isFullscreen: boolean;
  onLocateUser?: (lat: number, lng: number) => void;
  setGpsNotice: (msg: string | null) => void;
  mapActionsRef: React.MutableRefObject<{
    zoomIn: () => void;
    zoomOut: () => void;
    locateMe: () => void;
  } | null>;
}> = ({
  pickup,
  dropoff,
  route,
  onRouteComputed,
  livePartner,
  zones,
  d3Active,
  focusTarget,
  isFullscreen,
  onLocateUser,
  setGpsNotice,
  mapActionsRef,
}) => {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const mapsLib = useMapsLibrary('maps');
  const coreLib = useMapsLibrary('core');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const circlesRef = useRef<google.maps.Circle[]>([]);
  const fallbackPolylineRef = useRef<google.maps.Polyline | null>(null);
  const onRouteComputedRef = useRef(onRouteComputed);
  onRouteComputedRef.current = onRouteComputed;

  useEffect(() => {
    mapActionsRef.current = {
      zoomIn: () => {
        if (!map) return;
        map.setZoom((map.getZoom() ?? 12) + 1);
      },
      zoomOut: () => {
        if (!map) return;
        map.setZoom(Math.max(3, (map.getZoom() ?? 12) - 1));
      },
      locateMe: () => {
        setGpsNotice(null);
        if (!navigator.geolocation) {
          setGpsNotice('GPS geolocation is not supported by this browser.');
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            map?.panTo({ lat: latitude, lng: longitude });
            map?.setZoom(15);
            onLocateUser?.(latitude, longitude);
          },
          (err) => {
            setGpsNotice(
              err.code === err.PERMISSION_DENIED
                ? 'Location permission denied. Enable GPS access or search address manually.'
                : 'Unable to determine current GPS coordinates.'
            );
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      },
    };
  }, [map, onLocateUser, setGpsNotice, mapActionsRef]);

  useEffect(() => {
    if (!map || !focusTarget) return;
    map.panTo({ lat: focusTarget.lat, lng: focusTarget.lng });
    if (focusTarget.zoom) {
      map.setZoom(focusTarget.zoom);
    }
  }, [map, focusTarget?.ts]);

  useEffect(() => {
    const gEvent = (window as any).google?.maps?.event;
    if (!map || !gEvent) return;
    const timer = setTimeout(() => {
      gEvent.trigger(map, 'resize');
    }, 120);
    return () => clearTimeout(timer);
  }, [map, isFullscreen]);

  useEffect(() => {
    circlesRef.current.forEach((c) => c.setMap(null));
    circlesRef.current = [];
    if (!map || !mapsLib || d3Active) return;

    for (const z of zones) {
      const color = z.demand_level === 'high' ? '#DC2626' : z.demand_level === 'medium' ? '#D4A017' : '#16A34A';
      const circle = new mapsLib.Circle({
        map,
        center: { lat: z.center_lat, lng: z.center_lng },
        radius: z.radius_km * 350,
        strokeColor: color,
        strokeOpacity: 0.8,
        strokeWeight: 1.5,
        fillColor: color,
        fillOpacity: z.demand_level === 'high' ? 0.24 : 0.14,
      });
      circlesRef.current.push(circle);
    }

    return () => {
      circlesRef.current.forEach((c) => c.setMap(null));
      circlesRef.current = [];
    };
  }, [map, mapsLib, zones, d3Active]);

  useEffect(() => {
    if (!map) return;

    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
    if (fallbackPolylineRef.current) {
      fallbackPolylineRef.current.setMap(null);
      fallbackPolylineRef.current = null;
    }

    if (!pickup || !dropoff) {
      if (pickup && !dropoff) {
        map.panTo({ lat: pickup.lat, lng: pickup.lng });
        map.setZoom(14);
      } else if (dropoff && !pickup) {
        map.panTo({ lat: dropoff.lat, lng: dropoff.lng });
        map.setZoom(14);
      } else if (livePartner && Number.isFinite(livePartner.lat) && Number.isFinite(livePartner.lng)) {
        map.panTo({ lat: livePartner.lat, lng: livePartner.lng });
      }
      return;
    }

    let cancelled = false;

    const drawFallbackRoute = () => {
      const BoundsCtor = coreLib?.LatLngBounds || (window as any).google?.maps?.LatLngBounds;
      if (!mapsLib || !route || route.coordinates.length < 2) {
        if (BoundsCtor) {
          const bounds = new BoundsCtor();
          bounds.extend({ lat: pickup.lat, lng: pickup.lng });
          bounds.extend({ lat: dropoff.lat, lng: dropoff.lng });
          if (livePartner) bounds.extend({ lat: livePartner.lat, lng: livePartner.lng });
          map.fitBounds(bounds, 52);
        }
        return;
      }
      const line = new mapsLib.Polyline({
        path: route.coordinates.map(([lat, lng]) => ({ lat, lng })),
        strokeColor: '#1E40AF',
        strokeWeight: 5,
        strokeOpacity: 0.9,
        map,
      });
      fallbackPolylineRef.current = line;
      if (BoundsCtor) {
        const bounds = new BoundsCtor();
        route.coordinates.forEach(([lat, lng]) => bounds.extend({ lat, lng }));
        map.fitBounds(bounds, 48);
      }
    };

    if (!routesLib || !(routesLib as any).Route) {
      drawFallbackRoute();
      return () => {
        cancelled = true;
      };
    }

    const request = {
      origin: { lat: pickup.lat, lng: pickup.lng },
      destination: { lat: dropoff.lat, lng: dropoff.lng },
      travelMode: 'DRIVING',
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
    };

    ((routesLib as any).Route.computeRoutes(request) as Promise<{ routes?: any[] }>)
      .then((res) => {
        if (cancelled) return;
        const primaryRoute = res?.routes?.[0];
        if (!primaryRoute) {
          drawFallbackRoute();
          return;
        }
        const createdPolylines = primaryRoute.createPolylines() as google.maps.Polyline[];
        createdPolylines.forEach((polyline) => {
          polyline.setOptions({
            strokeColor: '#1E40AF',
            strokeWeight: 5,
            strokeOpacity: 0.92,
          });
          polyline.setMap(map);
        });
        polylinesRef.current = createdPolylines;

        if (primaryRoute.viewport) {
          map.fitBounds(primaryRoute.viewport, 48);
        }

        const pathCoords: [number, number][] = [];
        for (const poly of createdPolylines) {
          const pts = poly.getPath().getArray();
          for (const pt of pts) {
            pathCoords.push([pt.lat(), pt.lng()]);
          }
        }
        const distMeters = Number(primaryRoute.distanceMeters || 0);
        const durMillis = Number(primaryRoute.durationMillis || 0);
        if (distMeters > 0 && onRouteComputedRef.current) {
          onRouteComputedRef.current({
            distanceKm: Number((distMeters / 1000).toFixed(2)),
            durationMin: Math.max(1, Math.round(durMillis / 60000)),
            coordinates: pathCoords.length > 1 ? pathCoords : [
              [pickup.lat, pickup.lng],
              [dropoff.lat, dropoff.lng],
            ],
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        drawFallbackRoute();
      });

    return () => {
      cancelled = true;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
      if (fallbackPolylineRef.current) {
        fallbackPolylineRef.current.setMap(null);
        fallbackPolylineRef.current = null;
      }
    };
  }, [map, routesLib, mapsLib, pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng, livePartner?.lat, livePartner?.lng]);

  return null;
};

// Leaflet interactive street map canvas when Google Maps key is omitted or quota limited
const LeafletFallbackMap: React.FC<{
  center: [number, number];
  zoom: number;
  pickup?: MapPoint | null;
  dropoff?: MapPoint | null;
  route?: RouteResult | null;
  livePartner?: { lat: number; lng: number; label?: string } | null;
  partnerMarkers: PartnerMarker[];
  hotspots: DemandHotspot[];
  showHotspots: boolean;
  pickMode?: 'pickup' | 'dropoff' | null;
  onMapPick?: (lat: number, lng: number) => void;
  isFullscreen: boolean;
  focusTarget?: MapFocusTarget | null;
  onLocateUser?: (lat: number, lng: number) => void;
  setGpsNotice: (msg: string | null) => void;
  mapActionsRef: React.MutableRefObject<{ zoomIn: () => void; zoomOut: () => void; locateMe: () => void } | null>;
}> = ({
  center,
  zoom,
  pickup,
  dropoff,
  route,
  livePartner,
  partnerMarkers,
  hotspots,
  showHotspots,
  pickMode,
  onMapPick,
  isFullscreen,
  focusTarget,
  onLocateUser,
  setGpsNotice,
  mapActionsRef,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const onMapPickRef = useRef(onMapPick);
  const pickModeRef = useRef(pickMode);
  onMapPickRef.current = onMapPick;
  pickModeRef.current = pickMode;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initCenter: [number, number] = pickup ? [pickup.lat, pickup.lng] : center;
    const map = L.map(containerRef.current, {
      center: initCenter,
      zoom,
      zoomControl: false,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    map.on('click', (ev: L.LeafletMouseEvent) => {
      if (pickModeRef.current && onMapPickRef.current) {
        onMapPickRef.current(ev.latlng.lat, ev.latlng.lng);
      }
    });

    mapActionsRef.current = {
      zoomIn: () => map.zoomIn(),
      zoomOut: () => map.zoomOut(),
      locateMe: () => {
        setGpsNotice(null);
        if (!navigator.geolocation) {
          setGpsNotice('GPS geolocation is not supported by this browser.');
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            map.setView([pos.coords.latitude, pos.coords.longitude], 15);
            onLocateUser?.(pos.coords.latitude, pos.coords.longitude);
          },
          () => setGpsNotice('Location permission denied or unavailable.'),
          { enableHighAccuracy: true, timeout: 8000 }
        );
      },
    };

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const timer = setTimeout(() => map.invalidateSize(), 120);
    return () => clearTimeout(timer);
  }, [isFullscreen]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusTarget) return;
    map.setView([focusTarget.lat, focusTarget.lng], focusTarget.zoom || 13);
  }, [focusTarget?.ts]);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (showHotspots) {
      hotspots.forEach((hs) => {
        const color = hs.demandLevel === 'high' ? '#DC2626' : hs.demandLevel === 'medium' ? '#D4A017' : '#16A34A';
        L.circle([hs.lat, hs.lng], {
          radius: hs.radiusKm * 300,
          color,
          weight: 1.5,
          fillColor: color,
          fillOpacity: 0.14,
        }).addTo(group);
      });
    }

    const boundsPts: [number, number][] = [];

    if (pickup) {
      L.circleMarker([pickup.lat, pickup.lng], {
        radius: 8,
        color: '#FFFFFF',
        weight: 2.5,
        fillColor: '#15803D',
        fillOpacity: 1,
      })
        .bindPopup(`<b>Pickup:</b> ${pickup.label}`)
        .addTo(group);
      boundsPts.push([pickup.lat, pickup.lng]);
    }

    if (dropoff) {
      L.circleMarker([dropoff.lat, dropoff.lng], {
        radius: 8,
        color: '#FFFFFF',
        weight: 2.5,
        fillColor: '#DC2626',
        fillOpacity: 1,
      })
        .bindPopup(`<b>Drop-off:</b> ${dropoff.label}`)
        .addTo(group);
      boundsPts.push([dropoff.lat, dropoff.lng]);
    }

    if (livePartner && Number.isFinite(livePartner.lat) && Number.isFinite(livePartner.lng)) {
      L.circleMarker([livePartner.lat, livePartner.lng], {
        radius: 9,
        color: '#D4A017',
        weight: 3,
        fillColor: '#0D0D10',
        fillOpacity: 1,
      })
        .bindPopup(livePartner.label || 'Pro Partner Live')
        .addTo(group);
      boundsPts.push([livePartner.lat, livePartner.lng]);
    }

    partnerMarkers.forEach((pm) => {
      if (Number.isFinite(pm.lat) && Number.isFinite(pm.lng)) {
        L.circleMarker([pm.lat, pm.lng], {
          radius: 7,
          color: '#D4A017',
          weight: 2,
          fillColor: '#0D0D10',
          fillOpacity: 1,
        })
          .bindPopup(`${pm.name}${pm.vehicle ? ` (${pm.vehicle})` : ''}`)
          .addTo(group);
      }
    });

    if (route && route.coordinates.length >= 2) {
      L.polyline(route.coordinates, { color: '#1E40AF', weight: 5, opacity: 0.88 }).addTo(group);
      map.fitBounds(route.coordinates as L.LatLngBoundsExpression, { padding: [40, 40] });
    } else if (boundsPts.length >= 2) {
      map.fitBounds(boundsPts as L.LatLngBoundsExpression, { padding: [40, 40] });
    } else if (boundsPts.length === 1) {
      map.setView(boundsPts[0], 14);
    }
  }, [pickup, dropoff, route, livePartner, partnerMarkers, hotspots, showHotspots]);

  return <div ref={containerRef} className="w-full h-full z-10" />;
};

export const StreetMap: React.FC<StreetMapProps> = ({
  center = [33.6844, 73.0479],
  zoom = 12,
  pickup,
  dropoff,
  route,
  onRouteComputed,
  livePartner,
  partnerMarkers = [],
  zones = [],
  demandData = null,
  demandAudience = 'passenger',
  showDemandLayer = true,
  focusTarget = null,
  onHotspotSelect,
  pickMode = null,
  onMapPick,
  onLocateUser,
  heightClass = 'h-[360px] md:h-[420px]',
  routeError = null,
}) => {
  const hasGoogleKey = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
  const [useFallbackMap, setUseFallbackMap] = useState(!hasGoogleKey);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [gpsNotice, setGpsNotice] = useState<string | null>(null);
  const [layerEnabled, setLayerEnabled] = useState(showDemandLayer);
  const [hoveredHotspot, setHoveredHotspot] = useState<DemandHotspot | null>(null);
  const [selectedHotspot, setSelectedHotspot] = useState<DemandHotspot | null>(null);
  const [activeInfo, setActiveInfo] = useState<{ title: string; subtitle: string; lat: number; lng: number } | null>(
    null
  );
  const mapActionsRef = useRef<{ zoomIn: () => void; zoomOut: () => void; locateMe: () => void } | null>(null);

  useEffect(() => {
    const onQuota = () => setUseFallbackMap(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  const resolvedHotspots: DemandHotspot[] = React.useMemo(() => {
    if (demandData && demandData.hotspots.length > 0) return demandData.hotspots;
    return zones.map((z) => ({
      id: z.id,
      city: z.city,
      areaName: z.area_name,
      lat: z.center_lat,
      lng: z.center_lng,
      radiusKm: Number(z.radius_km || 5),
      demandLevel: z.demand_level,
      activeBookings: 0,
      openRequests: 0,
      recentBookings: 0,
      surgeMultiplier: z.demand_level === 'high' ? 1.35 : z.demand_level === 'medium' ? 1.15 : 1.0,
      demandScore: z.demand_level === 'high' ? 70 : z.demand_level === 'medium' ? 45 : 22,
      rickshawEnabled: Boolean(z.rickshaw_enabled),
    }));
  }, [demandData, zones]);

  const resolvedPoints: DemandPoint[] = React.useMemo(() => {
    if (demandData && demandData.points.length > 0) return demandData.points;
    return resolvedHotspots.map((hs) => ({
      lat: hs.lat,
      lng: hs.lng,
      weight: hs.demandScore / 45,
      areaName: hs.areaName,
      isLiveBooking: false,
    }));
  }, [demandData, resolvedHotspots]);

  const hasDemandOverlay = resolvedHotspots.length > 0 || resolvedPoints.length > 0;
  const d3Visible = Boolean(layerEnabled && hasDemandOverlay);
  const inspectedHotspot = selectedHotspot || hoveredHotspot;

  return (
    <ErrorBoundary
      fallback={
        <div className={`rounded-2xl border border-zinc-200 bg-zinc-100 flex items-center justify-center p-6 text-xs text-zinc-600 ${heightClass}`}>
          Interactive Map view could not initialize cleanly. Pickup and drop-off inputs above remain active.
        </div>
      }
    >
      <div
        className={`relative overflow-hidden border border-zinc-200 bg-zinc-100 ${
          isFullscreen ? 'fixed inset-0 z-50 rounded-none' : `rounded-2xl ${heightClass}`
        }`}
      >
        <div className={`w-full h-full ${pickMode ? 'cursor-crosshair' : ''}`}>
          {useFallbackMap ? (
            <LeafletFallbackMap
              center={center}
              zoom={zoom}
              pickup={pickup}
              dropoff={dropoff}
              route={route}
              livePartner={livePartner}
              partnerMarkers={partnerMarkers}
              hotspots={resolvedHotspots}
              showHotspots={d3Visible}
              pickMode={pickMode}
              onMapPick={onMapPick}
              isFullscreen={isFullscreen}
              focusTarget={focusTarget}
              onLocateUser={onLocateUser}
              setGpsNotice={setGpsNotice}
              mapActionsRef={mapActionsRef}
            />
          ) : (
            <GoogleMap
              mapId="DEMO_MAP_ID"
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              defaultCenter={{ lat: center[0], lng: center[1] }}
              defaultZoom={zoom}
              gestureHandling="greedy"
              disableDefaultUI
              style={{ width: '100%', height: '100%' }}
              onClick={(ev) => {
                if (pickMode && onMapPick && ev.detail.latLng) {
                  onMapPick(ev.detail.latLng.lat, ev.detail.latLng.lng);
                } else {
                  setActiveInfo(null);
                  setSelectedHotspot(null);
                }
              }}
            >
              <MapController
                pickup={pickup}
                dropoff={dropoff}
                route={route}
                onRouteComputed={onRouteComputed}
                livePartner={livePartner}
                zones={zones}
                d3Active={d3Visible}
                focusTarget={focusTarget}
                isFullscreen={isFullscreen}
                onLocateUser={onLocateUser}
                setGpsNotice={setGpsNotice}
                mapActionsRef={mapActionsRef}
              />

              <D3DemandLayer
                hotspots={resolvedHotspots}
                points={resolvedPoints}
                visible={d3Visible}
                audience={demandAudience}
                interactive={!pickMode}
                selectedHotspotId={selectedHotspot?.id || null}
                onHotspotHover={setHoveredHotspot}
                onHotspotSelect={(hs) => {
                  setSelectedHotspot(hs);
                  onHotspotSelect?.(hs);
                }}
              />

              {pickup && (
                <AdvancedMarker
                  position={{ lat: pickup.lat, lng: pickup.lng }}
                  onClick={() =>
                    setActiveInfo({
                      title: 'Pickup Point',
                      subtitle: pickup.label,
                      lat: pickup.lat,
                      lng: pickup.lng,
                    })
                  }
                >
                  <Pin background="#15803D" borderColor="#FFFFFF" glyphColor="#FFFFFF" />
                </AdvancedMarker>
              )}

              {dropoff && (
                <AdvancedMarker
                  position={{ lat: dropoff.lat, lng: dropoff.lng }}
                  onClick={() =>
                    setActiveInfo({
                      title: 'Drop-off Point',
                      subtitle: dropoff.label,
                      lat: dropoff.lat,
                      lng: dropoff.lng,
                    })
                  }
                >
                  <Pin background="#DC2626" borderColor="#FFFFFF" glyphColor="#FFFFFF" />
                </AdvancedMarker>
              )}

              {livePartner && Number.isFinite(livePartner.lat) && Number.isFinite(livePartner.lng) && (
                <AdvancedMarker
                  position={{ lat: livePartner.lat, lng: livePartner.lng }}
                  onClick={() =>
                    setActiveInfo({
                      title: livePartner.label || 'Pro Partner',
                      subtitle: 'Live verified Pro Partner location',
                      lat: livePartner.lat,
                      lng: livePartner.lng,
                    })
                  }
                >
                  <div className="px-2 py-1 rounded-lg bg-[#0D0D10] text-[#D4A017] text-[10px] font-extrabold border-2 border-[#D4A017] shadow-lg">
                    PR LIVE
                  </div>
                </AdvancedMarker>
              )}

              {partnerMarkers.map(
                (pm) =>
                  Number.isFinite(pm.lat) &&
                  Number.isFinite(pm.lng) && (
                    <AdvancedMarker
                      key={pm.id}
                      position={{ lat: pm.lat, lng: pm.lng }}
                      onClick={() =>
                        setActiveInfo({
                          title: pm.name,
                          subtitle: pm.vehicle || 'Verified Pro Partner',
                          lat: pm.lat,
                          lng: pm.lng,
                        })
                      }
                    >
                      <Pin background="#0D0D10" borderColor="#D4A017" glyphColor="#D4A017" />
                    </AdvancedMarker>
                  )
              )}

              {activeInfo && (
                <InfoWindow
                  position={{ lat: activeInfo.lat, lng: activeInfo.lng }}
                  onCloseClick={() => setActiveInfo(null)}
                >
                  <div className="text-xs text-[#0D0D10] max-w-[200px]">
                    <p className="font-bold">{activeInfo.title}</p>
                    <p className="text-zinc-600 mt-0.5">{activeInfo.subtitle}</p>
                  </div>
                </InfoWindow>
              )}
            </GoogleMap>
          )}
        </div>

        {/* D3 Demand & Surge Layer Control + Compact Legend */}
        {hasDemandOverlay && !pickMode && !(gpsNotice || routeError) && (
          <div className="absolute top-3 left-3 z-20 flex flex-wrap items-center gap-2 max-w-[calc(100%-5rem)]">
            <button
              type="button"
              onClick={() => setLayerEnabled((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border shadow-sm transition-colors ${
                d3Visible
                  ? 'bg-[#0D0D10] text-[#D4A017] border-[#0D0D10]'
                  : 'bg-white/95 text-zinc-700 border-zinc-200 hover:bg-white'
              }`}
            >
              {d3Visible ? <Flame className="w-3.5 h-3.5" /> : <Layers className="w-3.5 h-3.5" />}
              <span>
                {demandAudience === 'partner' ? 'Demand Heatmap' : 'Surge Zones'}: {d3Visible ? 'On' : 'Off'}
              </span>
            </button>

            {d3Visible && (
              <div className="hidden sm:inline-flex items-center gap-2.5 rounded-xl bg-white/95 backdrop-blur border border-zinc-200 px-2.5 py-1.5 shadow-sm text-[10px] font-semibold text-[#0D0D10]">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#DC2626] inline-block" />
                  <span className="font-mono">High Surge 1.4x+</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#D4A017] inline-block" />
                  <span className="font-mono">Busy 1.2x</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#16A34A] inline-block" />
                  <span className="font-mono">Standard 1.0x</span>
                </span>
              </div>
            )}
          </div>
        )}

        {/* Selected / Hovered D3 Hotspot Telemetry */}
        {d3Visible && inspectedHotspot && !pickMode && (
          <div className="absolute bottom-4 left-3 z-20 max-w-[280px] rounded-xl bg-[#0D0D10]/95 text-white border border-[#D4A017]/60 px-3.5 py-2.5 shadow-lg text-xs">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-display font-bold text-[#F4C430] leading-tight">
                  {inspectedHotspot.areaName}, {inspectedHotspot.city}
                </div>
                <div className="font-mono text-[11px] text-zinc-200 mt-0.5 tabular-nums">
                  Surge {inspectedHotspot.surgeMultiplier.toFixed(2)}x · Score {inspectedHotspot.demandScore}/100
                </div>
              </div>
              {selectedHotspot && (
                <button
                  type="button"
                  onClick={() => setSelectedHotspot(null)}
                  aria-label="Close hotspot details"
                  className="text-zinc-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className="text-[11px] text-zinc-300 mt-1.5 leading-snug">
              {demandAudience === 'partner'
                ? `${inspectedHotspot.openRequests} open request(s) · ${inspectedHotspot.activeBookings} active trip(s). Position near this zone for priority dispatches.`
                : inspectedHotspot.demandLevel === 'high'
                ? `Peak booking demand (${inspectedHotspot.activeBookings} active trips). Fares may reflect surge demand.`
                : `Moderate-to-normal demand (${inspectedHotspot.activeBookings} active trips). Standard availability.`}
            </p>
          </div>
        )}

        {route && !(d3Visible && inspectedHotspot && !pickMode) && (
          <div className="absolute bottom-4 left-3 z-20 rounded-xl bg-white/95 backdrop-blur border border-[#0D0D10]/20 px-3 py-1.5 shadow text-[11px] font-bold text-[#0D0D10] font-mono tabular-nums">
            {route.distanceKm} km · ~{route.durationMin} min
          </div>
        )}

        {pickMode && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-[#0D0D10] text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-lg border border-[#D4A017]">
            Tap anywhere on the map to set {pickMode === 'pickup' ? 'Pickup' : 'Drop-off'} point
          </div>
        )}

        {(gpsNotice || routeError) && (
          <div className="absolute top-3 left-3 right-16 z-20 bg-white/95 backdrop-blur border border-amber-300 text-amber-900 px-3 py-2 rounded-xl text-xs font-medium shadow">
            {routeError || gpsNotice}
          </div>
        )}

        {/* Map Controls */}
        <div className="absolute right-3 bottom-4 z-20 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => mapActionsRef.current?.zoomIn()}
            aria-label="Zoom in"
            className="w-10 h-10 rounded-xl bg-white border border-zinc-200 shadow-sm flex items-center justify-center text-[#0D0D10] hover:bg-zinc-50"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => mapActionsRef.current?.zoomOut()}
            aria-label="Zoom out"
            className="w-10 h-10 rounded-xl bg-white border border-zinc-200 shadow-sm flex items-center justify-center text-[#0D0D10] hover:bg-zinc-50"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => mapActionsRef.current?.locateMe()}
            aria-label="Locate current GPS position"
            title="Current GPS Location"
            className="w-10 h-10 rounded-xl bg-white border border-zinc-200 shadow-sm flex items-center justify-center text-[#D4A017] hover:bg-zinc-50"
          >
            <Crosshair className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsFullscreen((v) => !v)}
            aria-label="Toggle Fullscreen Map"
            title="Full-Screen Map"
            className="w-10 h-10 rounded-xl bg-[#0D0D10] border border-[#0D0D10] shadow-sm flex items-center justify-center text-white hover:bg-zinc-800"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </ErrorBoundary>
  );
};
