import React, { useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { Crosshair, Loader2, MapPin, Search, X } from 'lucide-react';
import type { MapPoint } from '../types';
import { apiRequest } from '../utils/api';
import { VoiceTranscribeButton } from './VoiceTranscribeButton';

interface LocationAutocompleteProps {
  label: string;
  placeholder: string;
  value: MapPoint | null;
  onSelect: (pt: MapPoint | null) => void;
  onRequestMapPick?: () => void;
  pinColor?: 'green' | 'red';
  disabled?: boolean;
}

interface SearchOption {
  id: string;
  label: string;
  lat?: number;
  lng?: number;
  suggestion?: google.maps.places.AutocompleteSuggestion;
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

export const LocationAutocomplete: React.FC<LocationAutocompleteProps> = ({
  label,
  placeholder,
  value,
  onSelect,
  onRequestMapPick,
  pinColor = 'green',
  disabled = false,
}) => {
  const placesLib = useMapsLibrary('places');
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  const [query, setQuery] = useState(value?.label || '');
  const [results, setResults] = useState<SearchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setQuery(value?.label || '');
  }, [value]);

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
    if (!open || trimmed.length < 3 || (value && trimmed === value.label)) {
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        if (placesLib?.AutocompleteSuggestion && placesLib?.AutocompleteSessionToken) {
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
          setResults(list);
          setLoading(false);
          return;
        }
      } catch (err) {
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      }

      // Fallback to server geocoding search if Places API is unavailable or quota-limited
      try {
        const res = await apiRequest<{ results: Array<{ id: string; label: string; lat: number; lng: number }> }>(
          `/api/map/search?q=${encodeURIComponent(trimmed)}`
        );
        setResults(res.results || []);
      } catch (err: any) {
        setErrorMsg(err.message || 'Address search unavailable');
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 340);

    return () => clearTimeout(timer);
  }, [query, open, value, placesLib]);

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
        try {
          const rev = await apiRequest<{ label: string; lat: number; lng: number }>(
            `/api/map/reverse?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`
          );
          onSelect({ label: rev.label, lat: rev.lat, lng: rev.lng });
          setQuery(rev.label);
          setOpen(false);
        } catch {
          const fallbackLabel = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
          onSelect({ label: fallbackLabel, lat: pos.coords.latitude, lng: pos.coords.longitude });
          setQuery(fallbackLabel);
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

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-semibold text-zinc-700">{label}</label>
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

      {open && (results.length > 0 || (query.trim().length >= 3 && !loading)) && (
        <div className="absolute left-0 right-0 mt-1.5 z-40 rounded-xl border border-zinc-200 bg-white shadow-xl max-h-56 overflow-y-auto divide-y divide-zinc-100">
          {results.length === 0 ? (
            <div className="px-3.5 py-3 text-xs text-zinc-500">
              No matching places found in Pakistan. Try sector/landmark name or use Pick on Map.
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
