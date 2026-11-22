import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  externalDemandVisible?: boolean;
  onDemandLayerChange?: (enabled: boolean) => void;
  focusTarget?: MapFocusTarget | null;
  onHotspotSelect?: (hotspot: DemandHotspot) => void;
  pickMode?: 'pickup' | 'dropoff' | null;
  centerPinMode?: boolean;
  hideMarkers?: boolean;
  controlsLayout?: 'default' | 'compact-picker';
  onMapPick?: (lat: number, lng: number) => void;
  onCenterChange?: (lat: number, lng: number) => void;
  onLocateUser?: (lat: number, lng: number) => void;
  heightClass?: string;
  fullBleed?: boolean;
  routeError?: string | null;
}

function getHeatTierColor(score: number, openRequests = 0): {
  stroke: string;
  fill: string;
  opacity: number;
  badgeBg: string;
  isHot: boolean;
} {
  if (score >= 82 || openRequests >= 3) {
    return { stroke: '#991B1B', fill: '#DC2626', opacity: 0.34, badgeBg: '#991B1B', isHot: true };
  }
  if (score >= 65 || openRequests >= 1) {
    return { stroke: '#DC2626', fill: '#EF4444', opacity: 0.27, badgeBg: '#DC2626', isHot: true };
  }
  if (score >= 45) {
    return { stroke: '#EA580C', fill: '#F97316', opacity: 0.2, badgeBg: '#C2410C', isHot: false };
  }
  return { stroke: '#16A34A', fill: '#22C55E', opacity: 0.14, badgeBg: '#15803D', isHot: false };
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
  demandPoints: DemandPoint[];
  demandAudience: 'partner' | 'passenger';
  showHotspots: boolean;
  onSelectHotspot?: (hotspot: DemandHotspot) => void;
  pickMode?: 'pickup' | 'dropoff' | null;
  centerPinMode?: boolean;
  hideMarkers?: boolean;
  onMapPick?: (lat: number, lng: number) => void;
  onCenterChange?: (lat: number, lng: number) => void;
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
  demandPoints,
  demandAudience,
  showHotspots,
  onSelectHotspot,
  pickMode,
  centerPinMode,
  hideMarkers,
  onMapPick,
  onCenterChange,
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
  const onCenterChangeRef = useRef(onCenterChange);
  const onLocateUserRef = useRef(onLocateUser);
  const pickModeRef = useRef(pickMode);
  const centerPinModeRef = useRef(centerPinMode);
  const lastProgrammaticCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  const suppressNextMoveEndRef = useRef(false);

  onMapPickRef.current = onMapPick;
  onCenterChangeRef.current = onCenterChange;
  onLocateUserRef.current = onLocateUser;
  pickModeRef.current = pickMode;
  centerPinModeRef.current = centerPinMode;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initCenter: [number, number] = centerPinModeRef.current ? center : pickup ? [pickup.lat, pickup.lng] : center;
    const map = L.map(containerRef.current, {
      center: initCenter,
      zoom,
      zoomControl: false,
    });
    // Crisp Google Street Map tiles matching clean Pakistan sector/road view, with Carto Voyager fallback
    const googleTiles = L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      attribution: 'Map data &copy; Google',
      subdomains: ['0', '1', '2', '3'],
      maxZoom: 20,
    }).addTo(map);

    let switchedFallback = false;
    googleTiles.on('tileerror', () => {
      if (switchedFallback || !mapRef.current) return;
      switchedFallback = true;
      map.removeLayer(googleTiles);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);
    });

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    map.on('click', (ev: L.LeafletMouseEvent) => {
      if (centerPinModeRef.current) {
        map.panTo([ev.latlng.lat, ev.latlng.lng], { animate: true });
        return;
      }
      if (pickModeRef.current && onMapPickRef.current) {
        onMapPickRef.current(ev.latlng.lat, ev.latlng.lng);
      }
    });

    map.on('moveend', () => {
      if (suppressNextMoveEndRef.current) {
        suppressNextMoveEndRef.current = false;
        return;
      }
      if (centerPinModeRef.current && onCenterChangeRef.current) {
        const c = map.getCenter();
        lastProgrammaticCenterRef.current = { lat: c.lat, lng: c.lng };
        onCenterChangeRef.current(c.lat, c.lng);
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
            const { latitude, longitude } = pos.coords;
            suppressNextMoveEndRef.current = true;
            lastProgrammaticCenterRef.current = { lat: latitude, lng: longitude };
            map.flyTo([latitude, longitude], 16, { duration: 0.6 });
            onLocateUserRef.current?.(latitude, longitude);
            if (centerPinModeRef.current) {
              onCenterChangeRef.current?.(latitude, longitude);
            }
          },
          () => setGpsNotice('Location permission denied or GPS unavailable.'),
          { enableHighAccuracy: true, timeout: 8000 }
        );
      },
    };

    // Ensure Leaflet immediately measures container dimensions accurately (prevents blank canvas in flex layouts)
    const initTimer = setTimeout(() => map.invalidateSize(), 60);
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        map.invalidateSize();
      });
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      clearTimeout(initTimer);
      resizeObserver?.disconnect();
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t1 = setTimeout(() => map.invalidateSize({ pan: false }), 40);
    const t2 = setTimeout(() => map.invalidateSize({ pan: false }), 180);
    const t3 = setTimeout(() => map.invalidateSize({ pan: false }), 380);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [isFullscreen]);

  // Smoothly pan map when center changes externally (e.g., Search result or GPS)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !centerPinMode) return;
    const targetLat = center[0];
    const targetLng = center[1];
    const prev = lastProgrammaticCenterRef.current;
    if (
      prev &&
      Math.abs(prev.lat - targetLat) < 0.00015 &&
      Math.abs(prev.lng - targetLng) < 0.00015
    ) {
      return;
    }
    suppressNextMoveEndRef.current = true;
    lastProgrammaticCenterRef.current = { lat: targetLat, lng: targetLng };
    map.flyTo([targetLat, targetLng], Math.max(map.getZoom(), 15), { duration: 0.55 });
  }, [center[0], center[1], centerPinMode]);

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

    if (showHotspots && !centerPinMode) {
      hotspots.forEach((hs) => {
        const tier = getHeatTierColor(hs.demandScore, hs.openRequests);
        const radiusM = Math.max(1200, hs.radiusKm * 320);

        L.circle([hs.lat, hs.lng], {
          radius: radiusM * 1.35,
          color: tier.stroke,
          weight: 0.8,
          opacity: 0.35,
          fillColor: tier.fill,
          fillOpacity: tier.opacity * 0.45,
        }).addTo(group);

        const coreCircle = L.circle([hs.lat, hs.lng], {
          radius: radiusM * 0.78,
          color: tier.stroke,
          weight: tier.isHot ? 2 : 1.4,
          dashArray: tier.isHot ? undefined : '5 4',
          fillColor: tier.fill,
          fillOpacity: tier.opacity,
        }).addTo(group);
        coreCircle.on('click', () => onSelectHotspot?.(hs));

        const label =
          demandAudience === 'partner' && hs.openRequests > 0
            ? `${hs.surgeMultiplier.toFixed(1)}x · ${hs.openRequests} req`
            : `${hs.surgeMultiplier.toFixed(1)}x · ${hs.areaName.split('/')[0].trim().slice(0, 13)}`;
        const badgeIcon = L.divIcon({
          className: 'pr-heat-badge',
          html: `<div style="display:inline-flex;align-items:center;gap:4px;padding:3px 7px;border-radius:8px;background:${tier.badgeBg};color:#FFFFFF;border:1.5px solid #FFFFFF;font-size:10px;font-weight:800;font-family:ui-monospace,monospace;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,0.3);">${label}</div>`,
          iconSize: [110, 22],
          iconAnchor: [55, 11],
        });
        L.marker([hs.lat, hs.lng], { icon: badgeIcon })
          .on('click', () => onSelectHotspot?.(hs))
          .addTo(group);
      });

      demandPoints
        .filter((pt) => pt.isLiveBooking)
        .forEach((pt) => {
          L.circleMarker([pt.lat, pt.lng], {
            radius: 6,
            color: '#FFFFFF',
            weight: 2,
            fillColor: '#DC2626',
            fillOpacity: 0.95,
          })
            .bindPopup(`<b>Live Demand:</b> ${pt.areaName}`)
            .addTo(group);
        });
    }

    if (hideMarkers) {
      return;
    }

    const boundsPts: [number, number][] = [];

    if (route && route.coordinates.length >= 2) {
      L.polyline(route.coordinates, { color: '#111827', weight: 5, opacity: 0.92 }).addTo(group);
    }

    if (pickup) {
      const iconA = L.divIcon({
        className: 'pr-marker-a',
        html: `<div style="width:28px;height:28px;border-radius:9999px;background:#F4C430;border:2.5px solid #FFFFFF;color:#0D0D10;font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,0.35);">A</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      L.marker([pickup.lat, pickup.lng], { icon: iconA })
        .bindPopup(`<b>Pickup (A):</b> ${pickup.label}`)
        .addTo(group);
      boundsPts.push([pickup.lat, pickup.lng]);
    }

    if (dropoff && !centerPinMode) {
      const iconB = L.divIcon({
        className: 'pr-marker-b',
        html: `<div style="width:28px;height:28px;border-radius:9999px;background:#DC2626;border:2.5px solid #FFFFFF;color:#FFFFFF;font-weight:800;font-size:13px;display:flex;align-items:center;justify-center;box-shadow:0 3px 10px rgba(0,0,0,0.35);">B</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      L.marker([dropoff.lat, dropoff.lng], { icon: iconB })
        .bindPopup(`<b>Drop-off (B):</b> ${dropoff.label}`)
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

    if (!centerPinMode) {
      if (route && route.coordinates.length >= 2) {
        map.fitBounds(route.coordinates as L.LatLngBoundsExpression, { padding: [46, 46] });
      } else if (boundsPts.length >= 2) {
        map.fitBounds(boundsPts as L.LatLngBoundsExpression, { padding: [46, 46] });
      } else if (boundsPts.length === 1) {
        map.setView(boundsPts[0], 15);
      }
    }
  }, [pickup, dropoff, route, livePartner, partnerMarkers, hotspots, demandPoints, demandAudience, showHotspots, centerPinMode, hideMarkers, onSelectHotspot]);

  return <div ref={containerRef} className="absolute inset-0 w-full h-full z-10" />;
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
  externalDemandVisible,
  onDemandLayerChange,
  focusTarget = null,
  onHotspotSelect,
  pickMode = null,
  centerPinMode = false,
  hideMarkers = false,
  controlsLayout = 'default',
  onMapPick,
  onCenterChange,
  onLocateUser,
  heightClass = 'h-[360px] md:h-[420px]',
  fullBleed = false,
  routeError = null,
}) => {
  const hasGoogleKey = Boolean((import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim().length > 10);
  const [useFallbackMap, setUseFallbackMap] = useState(!hasGoogleKey);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [gpsNotice, setGpsNotice] = useState<string | null>(null);
  const [internalLayerEnabled, setInternalLayerEnabled] = useState(showDemandLayer);
  const layerEnabled = externalDemandVisible !== undefined ? externalDemandVisible : internalLayerEnabled;
  const setLayerEnabled = (next: boolean | ((v: boolean) => boolean)) => {
    const val = typeof next === 'function' ? next(layerEnabled) : next;
    setInternalLayerEnabled(val);
    onDemandLayerChange?.(val);
  };
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

  useEffect(() => {
    if (!isFullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [isFullscreen]);

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

  const peakHotspot = React.useMemo(() => {
    if (resolvedHotspots.length === 0) return null;
    return [...resolvedHotspots].sort(
      (a, b) => b.demandScore + b.openRequests * 12 - (a.demandScore + a.openRequests * 12)
    )[0];
  }, [resolvedHotspots]);

  const peakHeatScore = peakHotspot ? peakHotspot.demandScore + peakHotspot.openRequests * 10 : 0;

  const hasDemandOverlay = resolvedHotspots.length > 0 || resolvedPoints.length > 0;
  const d3Visible = Boolean(layerEnabled && hasDemandOverlay);
  const inspectedHotspot = selectedHotspot || hoveredHotspot;

  const mapNode = (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-[9990] w-screen h-[100dvh] bg-zinc-100 flex flex-col overflow-hidden'
          : `relative overflow-hidden bg-zinc-100 ${
              fullBleed ? `w-full ${heightClass}` : `rounded-2xl border border-zinc-200 ${heightClass}`
            }`
      }
    >
      {isFullscreen && (
        <div className="bg-[#0D0D10] text-white px-3 sm:px-4 h-12 flex items-center justify-between gap-2 shrink-0 border-b border-zinc-800 z-30">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="font-display text-xs sm:text-sm font-bold truncate">
              PRO RIDER · Full Map {peakHotspot ? `· 🔥 ${peakHotspot.areaName.split('/')[0].trim()}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {hasDemandOverlay && (
              <button
                type="button"
                onClick={() => setLayerEnabled((v) => !v)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                  d3Visible
                    ? peakHeatScore >= 65
                      ? 'bg-red-600 text-white'
                      : 'bg-[#D4A017] text-[#0D0D10]'
                    : 'bg-zinc-800 text-zinc-200'
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                <span>{d3Visible ? 'Heat On' : 'Heat Off'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsFullscreen(false)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white text-[#0D0D10] text-[11px] font-bold"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span>Close</span>
            </button>
          </div>
        </div>
      )}

      <div className={`relative flex-1 w-full h-full ${pickMode ? 'cursor-crosshair' : ''}`}>
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
            demandPoints={resolvedPoints}
            demandAudience={demandAudience}
            showHotspots={d3Visible}
            onSelectHotspot={(hs) => {
              setSelectedHotspot(hs);
              onHotspotSelect?.(hs);
            }}
            pickMode={pickMode}
            centerPinMode={centerPinMode}
            hideMarkers={hideMarkers}
            onMapPick={onMapPick}
            onCenterChange={onCenterChange}
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

        {/* D3 Demand & Surge Layer Control + Live Heat Banner */}
        {hasDemandOverlay && !pickMode && !(gpsNotice || routeError) && (
          <div className="absolute top-3 left-3 z-20 flex flex-wrap items-center gap-2 max-w-[calc(100%-5.5rem)]">
            <button
              type="button"
              onClick={() => setLayerEnabled((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border shadow-sm transition-colors ${
                d3Visible
                  ? peakHeatScore >= 80
                    ? 'bg-[#991B1B] text-white border-red-400 animate-pulse'
                    : peakHeatScore >= 65
                    ? 'bg-red-600 text-white border-red-400'
                    : 'bg-[#0D0D10] text-[#D4A017] border-[#0D0D10]'
                  : 'bg-white/95 text-zinc-700 border-zinc-200 hover:bg-white'
              }`}
            >
              {d3Visible ? <Flame className="w-3.5 h-3.5" /> : <Layers className="w-3.5 h-3.5" />}
              <span>
                {demandAudience === 'partner' ? 'Heatmap' : 'Surge Zones'}: {d3Visible ? 'Live' : 'Off'}
              </span>
            </button>

            {d3Visible && (
              <div className="hidden sm:inline-flex items-center gap-2.5 rounded-xl bg-white/95 backdrop-blur border border-zinc-200 px-2.5 py-1.5 shadow-sm text-[10px] font-semibold text-[#0D0D10]">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#DC2626] inline-block" />
                  <span className="font-mono">High Red 1.4x+</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#EA580C] inline-block" />
                  <span className="font-mono">Warm 1.2x</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#16A34A] inline-block" />
                  <span className="font-mono">Normal 1.0x</span>
                </span>
              </div>
            )}
          </div>
        )}

        {/* Selected / Hovered D3 Hotspot Telemetry */}
        {d3Visible && inspectedHotspot && !pickMode && (
          <div className="absolute bottom-4 left-3 z-20 max-w-[270px] rounded-xl bg-[#0D0D10]/95 text-white border border-red-500/60 px-3.5 py-2.5 shadow-lg text-xs">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-display font-bold text-[#F4C430] leading-tight">
                  {inspectedHotspot.areaName}, {inspectedHotspot.city}
                </div>
                <div className="font-mono text-[11px] text-zinc-200 mt-0.5 tabular-nums">
                  Surge {inspectedHotspot.surgeMultiplier.toFixed(2)}x · Heat {inspectedHotspot.demandScore}/100
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
                ? `${inspectedHotspot.openRequests} open request(s) · ${inspectedHotspot.activeBookings} active trip(s). Move toward this red zone for faster ride dispatches.`
                : inspectedHotspot.demandLevel === 'high'
                ? `Peak booking demand (${inspectedHotspot.activeBookings} active trips). Fares reflect live demand.`
                : `Moderate-to-normal demand (${inspectedHotspot.activeBookings} active trips). Standard availability.`}
            </p>
          </div>
        )}

        {route && controlsLayout !== 'compact-picker' && !(d3Visible && inspectedHotspot && !pickMode) && (
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
        {controlsLayout === 'compact-picker' ? (
          <>
            {centerPinMode && (
              <button
                type="button"
                onClick={() => mapActionsRef.current?.locateMe()}
                aria-label="Locate current GPS position"
                title="Current GPS Location"
                className="absolute left-3 bottom-3 z-20 w-11 h-11 rounded-full bg-white border border-zinc-200 shadow-lg flex items-center justify-center text-[#0D0D10] hover:bg-zinc-50 active:scale-95"
              >
                <Crosshair className="w-5 h-5" />
              </button>
            )}
            <div className={`absolute ${centerPinMode ? 'right-3 bottom-3' : 'left-3 top-3'} z-20 flex flex-col gap-1.5`}>
              <button
                type="button"
                onClick={() => mapActionsRef.current?.zoomIn()}
                aria-label="Zoom in"
                className="w-10 h-10 rounded-xl bg-white border border-zinc-200 shadow-md flex items-center justify-center text-[#0D0D10] hover:bg-zinc-50 font-bold"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => mapActionsRef.current?.zoomOut()}
                aria-label="Zoom out"
                className="w-10 h-10 rounded-xl bg-white border border-zinc-200 shadow-md flex items-center justify-center text-[#0D0D10] hover:bg-zinc-50 font-bold"
              >
                <Minus className="w-4 h-4" />
              </button>
            </div>
          </>
        ) : (
          <div className="absolute right-3 bottom-4 z-20 flex flex-col gap-1.5">
            {hasDemandOverlay && (
              <button
                type="button"
                onClick={() => setLayerEnabled((v) => !v)}
                aria-label="Toggle Live Heatmap"
                title={d3Visible ? 'Live Red Heatmap Active' : 'Show Live Heatmap'}
                className={`w-10 h-10 rounded-xl border shadow-md flex items-center justify-center transition-all ${
                  d3Visible
                    ? peakHeatScore >= 80
                      ? 'bg-[#B91C1C] border-red-300 text-white animate-pulse'
                      : peakHeatScore >= 65
                      ? 'bg-red-600 border-red-300 text-white'
                      : 'bg-orange-500 border-orange-300 text-white'
                    : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                <Flame className="w-4 h-4" />
              </button>
            )}
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
        )}
      </div>
    </div>
  );

  return (
    <ErrorBoundary
      fallback={
        <div className={`rounded-2xl border border-zinc-200 bg-zinc-100 flex items-center justify-center p-6 text-xs text-zinc-600 ${heightClass}`}>
          Interactive Map view could not initialize cleanly. Pickup and drop-off inputs above remain active.
        </div>
      }
    >
      {isFullscreen && typeof document !== 'undefined' ? createPortal(mapNode, document.body) : mapNode}
    </ErrorBoundary>
  );
};
