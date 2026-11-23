import React, { useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { Crosshair, Loader2, MapPin, Search, X } from 'lucide-react';
import type { MapPoint } from '../types';
import { apiRequest } from '../utils/api';
import { VoiceTranscribeButton } from './VoiceTranscribeButton';

interface LocationAutocompleteProps {
  label?: string;
  placeholder: string;
  value: MapPoint | null;
  onSelect: (pt: MapPoint | null) => void;
  onRequestMapPick?: () => void;
  pinColor?: 'green' | 'red';
  disabled?: boolean;
  compactBar?: boolean;
}

interface SearchOption {
  id: string;
  label: string;
  lat?: number;
  lng?: number;
  suggestion?: google.maps.places.AutocompleteSuggestion;
}

const PAKISTAN_LANDMARK_FALLBACK: SearchOption[] = [
  { id: 'pk_faizabad', label: 'Faizabad Interchange, Islamabad / Rawalpindi', lat: 33.664963, lng: 73.087013 },
  { id: 'pk_f10', label: 'F-10 Markaz, Islamabad', lat: 33.6968, lng: 73.0125 },
  { id: 'pk_f11', label: 'F-11 Markaz, Islamabad', lat: 33.6844, lng: 72.9888 },
  { id: 'pk_f8', label: 'F-8 Markaz, Islamabad', lat: 33.7107, lng: 73.0389 },
  { id: 'pk_f7', label: 'Jinnah Super Market, F-7 Markaz, Islamabad', lat: 33.7204, lng: 73.0571 },
  { id: 'pk_f6', label: 'Super Market, F-6 Markaz, Islamabad', lat: 33.7294, lng: 73.0764 },
  { id: 'pk_blue', label: 'Blue Area, Jinnah Avenue, Islamabad', lat: 33.7077, lng: 73.0501 },
  { id: 'pk_centaurus', label: 'The Centaurus Mall, F-8 / Blue Area, Islamabad', lat: 33.7079, lng: 73.0499 },
  { id: 'pk_g9', label: 'Karachi Company, G-9 Markaz, Islamabad', lat: 33.6889, lng: 73.0334 },
  { id: 'pk_g10', label: 'G-10 Markaz, Islamabad', lat: 33.6793, lng: 73.0161 },
  { id: 'pk_g11', label: 'G-11 Markaz, Islamabad', lat: 33.6694, lng: 72.9998 },
  { id: 'pk_g13', label: 'G-13, Srinagar Highway, Islamabad', lat: 33.6502, lng: 72.9598 },
  { id: 'pk_e11', label: 'Ameer-e-Millat Road, E-11, Islamabad', lat: 33.7025, lng: 72.9785 },
  { id: 'pk_i8', label: 'I-8 Markaz, Islamabad', lat: 33.6678, lng: 73.0751 },
  { id: 'pk_i10', label: 'I-10 Markaz, Islamabad', lat: 33.6494, lng: 73.0394 },
  { id: 'pk_nust', label: 'NUST H-12 Campus, Islamabad', lat: 33.6425, lng: 72.9905 },
  { id: 'pk_comsats', label: 'COMSATS University, Park Road, Chak Shahzad, Islamabad', lat: 33.6518, lng: 73.1566 },
  { id: 'pk_pwd', label: 'P.W.D. Housing Society, Islamabad Expressway', lat: 33.5718, lng: 73.1449 },
  { id: 'pk_bahria_rwp', label: 'Bahria Town Phase 7, Rawalpindi', lat: 33.5245, lng: 73.0972 },
  { id: 'pk_bahria_1_6', label: 'Bahria Town Phase 4 Civic Center, Rawalpindi', lat: 33.5535, lng: 73.1243 },
  { id: 'pk_dha_isb', label: 'DHA Phase 2 Central Avenue, Islamabad', lat: 33.5284, lng: 73.1582 },
  { id: 'pk_saddar', label: 'Saddar Bazar, Rawalpindi', lat: 33.5973, lng: 73.0479 },
  { id: 'pk_commercial', label: 'Commercial Market, Satellite Town, Rawalpindi', lat: 33.6388, lng: 73.0731 },
  { id: 'pk_chaklala', label: 'Chaklala Scheme III, Rawalpindi', lat: 33.5882, lng: 73.0958 },
  { id: 'pk_isb_airport', label: 'Islamabad International Airport', lat: 33.5607, lng: 72.8516 },
  { id: 'pk_gulberg', label: 'Liberty Market, Gulberg III, Lahore', lat: 31.5102, lng: 74.3441 },
  { id: 'pk_dha_lhr', label: 'DHA Phase 5, Lahore', lat: 31.4622, lng: 74.4092 },
  { id: 'pk_johar_lhr', label: 'Johar Town Emporium Mall, Lahore', lat: 31.4673, lng: 74.2655 },
  { id: 'pk_clifton', label: 'Clifton Block 5, Karachi', lat: 24.8138, lng: 67.0299 },
  { id: 'pk_gulshan_khi', label: 'Gulshan-e-Iqbal Block 13, Karachi', lat: 24.9182, lng: 67.0971 },
];

function haversineKmLocal(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestPakistanLandmarkLabel(lat: number, lng: number): string | null {
  let best: SearchOption | null = null;
  let bestDist = Infinity;
  for (const item of PAKISTAN_LANDMARK_FALLBACK) {
    if (typeof item.lat !== 'number' || typeof item.lng !== 'number') continue;
    const d = haversineKmLocal(lat, lng, item.lat, item.lng);
    if (d < bestDist) {
      bestDist = d;
      best = item;
    }
  }
  if (best && bestDist <= 4) {
    return bestDist < 0.25 ? best.label : `Near ${best.label}`;
  }
  return null;
}

export async function reverseGeocodePakistan(lat: number, lng: number): Promise<string> {
  // 1. Try local backend if online
  try {
    const rev = await apiRequest<{ label: string }>(`/api/map/reverse?lat=${lat}&lng=${lng}`);
    if (rev?.label && !/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(rev.label.trim())) {
      return rev.label;
    }
  } catch {
    // Fallback to direct Photon / OSM in static hosting
  }

  // 2. Fast Photon reverse geocoding
  try {
    const photonRes = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`, {
      signal: AbortSignal.timeout(2500),
    });
    if (photonRes.ok) {
      const data = await photonRes.json();
      const props = data?.features?.[0]?.properties;
      if (props) {
        const parts = [props.name, props.street, props.district || props.suburb || props.locality, props.city]
          .filter(Boolean)
          .filter((v, idx, arr) => arr.indexOf(v) === idx);
        if (parts.length > 0) return parts.join(', ');
      }
    }
  } catch {
    // Fallback to Nominatim
  }

  // 3. OpenStreetMap Nominatim reverse geocoding
  try {
    const nomRes = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=en`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (nomRes.ok) {
      const data = await nomRes.json();
      if (data?.display_name) {
        return String(data.display_name).split(',').slice(0, 4).join(',').trim();
      }
    }
  } catch {
    // Fallback to nearest landmark or coordinate label
  }

  return nearestPakistanLandmarkLabel(lat, lng) || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
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

const RAW_COORDS_RE = /^-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?$/;

const LocationAutocompleteInner: React.FC<
  LocationAutocompleteProps & {
    hasGoogleKey: boolean;
    placesLib: ReturnType<typeof useMapsLibrary>;
  }
> = ({
  label,
  placeholder,
  value,
  onSelect,
  onRequestMapPick,
  pinColor = 'green',
  disabled = false,
  compactBar = false,
  hasGoogleKey,
  placesLib,
}) => {
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  const initialCleanLabel = value?.label && !RAW_COORDS_RE.test(value.label.trim()) ? value.label : '';
  const [query, setQuery] = useState(initialCleanLabel);
  const [results, setResults] = useState<SearchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!value?.label) {
      setQuery('');
      return;
    }
    if (!RAW_COORDS_RE.test(value.label.trim())) {
      setQuery(value.label);
    }
  }, [value?.label, value?.lat, value?.lng]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < 2 || (value && trimmed === value.label)) {
      return;
    }

    // Immediate instant local Pakistan landmarks filter so typing feels instantaneous
    const lower = trimmed.toLowerCase();
    const localMatched = PAKISTAN_LANDMARK_FALLBACK.filter((p) => p.label.toLowerCase().includes(lower));
    if (localMatched.length > 0) {
      setResults(localMatched.slice(0, 5));
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        if (hasGoogleKey && placesLib?.AutocompleteSuggestion && placesLib?.AutocompleteSessionToken) {
          if (!sessionTokenRef.current) {
            sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
          }
          const req: google.maps.places.AutocompleteRequest = {
            input: trimmed,
            sessionToken: sessionTokenRef.current || undefined,
            includedRegionCodes: ['pk'],
          };
          const res = (await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions(req)) as {
            suggestions?: google.maps.places.AutocompleteSuggestion[];
          };
          const list: SearchOption[] = (res?.suggestions || [])
            .filter((s: google.maps.places.AutocompleteSuggestion) => Boolean(s.placePrediction))
            .map((s: google.maps.places.AutocompleteSuggestion, idx: number) => ({
              id: s.placePrediction?.placeId || `gp_${idx}`,
              label: s.placePrediction?.text?.text || '',
              suggestion: s,
            }))
            .filter((x: SearchOption) => x.label.length > 0);
          if (!cancelled && list.length > 0) {
            setResults(list);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      }

      // 1. Try Express backend geocoding search when live backend is running
      try {
        const res = await apiRequest<{ results: Array<{ id: string; label: string; lat: number; lng: number }> }>(
          `/api/map/search?q=${encodeURIComponent(trimmed)}`
        );
        if (!cancelled && Array.isArray(res.results) && res.results.length > 0) {
          setResults(res.results);
          setLoading(false);
          return;
        }
      } catch {
        // Static hosting or offline: continue directly to Photon / Nominatim
      }

      // 2. Fast live Photon API (Pakistan-biased around Islamabad/Lahore/Karachi corridor)
      try {
        const biasLat = value?.lat || 33.6844;
        const biasLng = value?.lng || 73.0479;
        const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed)}&lat=${biasLat}&lon=${biasLng}&limit=7&lang=en`;
        const photonRes = await fetch(photonUrl, { signal: AbortSignal.timeout(4500) });
        if (photonRes.ok) {
          const data = await photonRes.json();
          const features = Array.isArray(data?.features) ? data.features : [];
          const pkOnly = features.filter((f: any) => !f?.properties?.countrycode || f.properties.countrycode === 'PK');
          const picked = (pkOnly.length > 0 ? pkOnly : features).slice(0, 6);
          const mapped: SearchOption[] = picked
            .map((f: any, idx: number) => {
              const p = f.properties || {};
              const coords = f.geometry?.coordinates || [];
              const parts = [p.name, p.street, p.district || p.suburb, p.city || p.state]
                .filter(Boolean)
                .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);
              const labelText = parts.join(', ');
              return {
                id: `ph_${p.osm_id || idx}_${idx}`,
                label: labelText,
                lat: Number(coords[1]),
                lng: Number(coords[0]),
              };
            })
            .filter((item: SearchOption) => item.label.length > 0 && Number.isFinite(item.lat) && Number.isFinite(item.lng));

          if (!cancelled && mapped.length > 0) {
            setResults([...mapped, ...localMatched.slice(0, 2)].slice(0, 7));
            setLoading(false);
            return;
          }
        }
      } catch {
        // Fallback to Nominatim below
      }

      // 3. Fallback OpenStreetMap Nominatim
      try {
        const nomRes = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=pk&addressdetails=1&limit=6&accept-language=en&q=${encodeURIComponent(trimmed)}`,
          { signal: AbortSignal.timeout(6000) }
        );
        if (nomRes.ok) {
          const data = (await nomRes.json()) as Array<{ place_id: number; display_name: string; lat: string; lon: string }>;
          if (!cancelled && Array.isArray(data) && data.length > 0) {
            setResults(
              data.map((item) => ({
                id: String(item.place_id),
                label: String(item.display_name).split(',').slice(0, 4).join(',').trim(),
                lat: Number(item.lat),
                lng: Number(item.lon),
              }))
            );
            setLoading(false);
            return;
          }
        }
      } catch {
        // Keep local landmark matches
      }

      if (!cancelled) {
        setResults(localMatched);
        setLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open, value, placesLib, hasGoogleKey, compactBar]);

  const handleSelectOption = async (item: SearchOption) => {
    if (item.suggestion?.placePrediction) {
      setLoading(true);
      try {
        const place = item.suggestion.placePrediction.toPlace();
        await place.fetchFields({
          fields: ['displayName', 'formattedAddress', 'location'],
        });
        sessionTokenRef.current = null;
        if (place.location) {
          const lat = place.location.lat();
          const lng = place.location.lng();
          const displayLabel = place.formattedAddress || place.displayName || item.label;
          onSelect({ label: displayLabel, lat, lng });
          setQuery(displayLabel);
          setOpen(false);
          setLoading(false);
          return;
        }
      } catch (err) {
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        setErrorMsg('Unable to resolve place details right now.');
      } finally {
        setLoading(false);
      }
    }

    if (typeof item.lat === 'number' && typeof item.lng === 'number') {
      onSelect({ label: item.label, lat: item.lat, lng: item.lng });
      setQuery(item.label);
      setOpen(false);
    }
  };

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      setErrorMsg('Geolocation unavailable in this browser.');
      return;
    }
    setGpsLoading(true);
    setErrorMsg(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        try {
          const resolvedLabel = await reverseGeocodePakistan(lat, lng);
          onSelect({ label: resolvedLabel, lat, lng });
          setQuery(resolvedLabel);
          setOpen(false);
        } finally {
          setGpsLoading(false);
        }
      },
      () => {
        setGpsLoading(false);
        setErrorMsg('GPS permission denied. Please search street name or pick on map.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  if (compactBar) {
    return (
      <div ref={wrapRef} className="relative">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 pointer-events-none" />
          <input
            type="text"
            disabled={disabled}
            value={query}
            placeholder={placeholder}
            onFocus={(e) => {
              setOpen(true);
              if (value?.label && e.currentTarget.value === value.label) {
                e.currentTarget.select();
              }
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            className="w-full pl-10 pr-24 py-2.5 rounded-2xl border border-zinc-200 bg-zinc-50 text-sm text-[#0D0D10] placeholder:text-zinc-400 focus:outline-none focus:bg-white focus:border-[#D4A017]"
          />
          <div className="absolute right-2 flex items-center gap-1">
            {(loading || gpsLoading) && <Loader2 className="w-4 h-4 text-[#D4A017] animate-spin" />}
            <button
              type="button"
              disabled={disabled || gpsLoading}
              onClick={handleUseGps}
              title="Capture Current GPS Location"
              aria-label="Capture Current GPS Location"
              className="p-1.5 rounded-lg text-[#B8860B] hover:bg-amber-50 active:scale-95 disabled:opacity-40"
            >
              <Crosshair className="w-4 h-4" />
            </button>
            <VoiceTranscribeButton
              disabled={disabled}
              title="Speak location name"
              onTranscript={(text) => {
                setQuery(text);
                setOpen(true);
                setErrorMsg(null);
              }}
              onError={(msg) => setErrorMsg(msg)}
            />
            {query && !disabled && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setResults([]);
                }}
                aria-label="Clear search"
                className="p-1 text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {open && (results.length > 0 || (query.trim().length >= 2 && !loading)) && (
          <div className="absolute left-0 right-0 mt-1.5 z-50 rounded-2xl border border-zinc-200 bg-white shadow-2xl max-h-60 overflow-y-auto divide-y divide-zinc-100">
            {results.length === 0 ? (
              <div className="px-4 py-3 text-xs text-zinc-500">
                No matching places found. Drag the map pin to exact spot.
              </div>
            ) : (
              results.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    void handleSelectOption(item);
                    setQuery(item.label);
                    setOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-amber-50/50 flex items-start gap-2.5 transition-colors"
                >
                  <MapPin className="w-4 h-4 text-[#D4A017] mt-0.5 shrink-0" />
                  <span className="text-xs font-medium text-[#0D0D10] leading-snug">{item.label}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center justify-between mb-1">
        {label ? <label className="text-xs font-semibold text-zinc-700">{label}</label> : <span />}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={disabled || gpsLoading}
            onClick={handleUseGps}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#B8860B] hover:text-[#0D0D10] disabled:opacity-40"
          >
            {gpsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Crosshair className="w-3 h-3" />}
            Current GPS
          </button>
          {onRequestMapPick && (
            <button
              type="button"
              disabled={disabled}
              onClick={onRequestMapPick}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-600 hover:text-[#0D0D10] disabled:opacity-40"
            >
              <MapPin className="w-3 h-3" />
              Pick on Map
            </button>
          )}
        </div>
      </div>

      <div className="relative flex items-center">
        <span
          className={`absolute left-3 w-2.5 h-2.5 rounded-full ${
            pinColor === 'green' ? 'bg-emerald-600' : 'bg-red-600'
          }`}
        />
        <input
          type="text"
          disabled={disabled}
          value={query}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (!e.target.value.trim()) {
              onSelect(null);
            }
          }}
          className="w-full pl-8 pr-24 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm text-[#0D0D10] placeholder:text-zinc-400 focus:outline-none focus:border-[#D4A017] disabled:bg-zinc-100 disabled:text-zinc-400"
        />
        <div className="absolute right-2 flex items-center gap-1">
          {loading && <Loader2 className="w-4 h-4 text-[#D4A017] animate-spin" />}
          <VoiceTranscribeButton
            disabled={disabled}
            title="Speak location name"
            onTranscript={(text) => {
              setQuery(text);
              setOpen(true);
              setErrorMsg(null);
            }}
            onError={(msg) => setErrorMsg(msg)}
          />
          {query && !disabled && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                onSelect(null);
                setResults([]);
              }}
              aria-label="Clear address"
              className="p-1 text-zinc-400 hover:text-zinc-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <Search className="w-3.5 h-3.5 text-zinc-400 mr-1" />
        </div>
      </div>

      {errorMsg && <p className="mt-1 text-[11px] text-amber-700">{errorMsg}</p>}

      {open && (results.length > 0 || (query.trim().length >= 2 && !loading)) && (
        <div className="absolute left-0 right-0 mt-1.5 z-40 rounded-xl border border-zinc-200 bg-white shadow-xl max-h-56 overflow-y-auto divide-y divide-zinc-100">
          {results.length === 0 ? (
            <div className="px-3.5 py-3 text-xs text-zinc-500">
              No matching places found in Pakistan. Try sector/landmark name or tap Pick on Map.
            </div>
          ) : (
            results.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectOption(item)}
                className="w-full text-left px-3.5 py-2.5 hover:bg-zinc-50 flex items-start gap-2.5 transition-colors"
              >
                <MapPin className="w-4 h-4 text-[#D4A017] mt-0.5 shrink-0" />
                <span className="text-xs text-[#0D0D10] leading-snug">{item.label}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

const GoogleLocationAutocomplete: React.FC<LocationAutocompleteProps> = (props) => {
  const placesLib = useMapsLibrary('places');
  return <LocationAutocompleteInner {...props} hasGoogleKey placesLib={placesLib} />;
};

export const LocationAutocomplete: React.FC<LocationAutocompleteProps> = (props) => {
  const hasGoogleKey = Boolean((import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim().length > 10);
  if (hasGoogleKey) {
    return <GoogleLocationAutocomplete {...props} />;
  }
  return <LocationAutocompleteInner {...props} hasGoogleKey={false} placesLib={null} />;
};
