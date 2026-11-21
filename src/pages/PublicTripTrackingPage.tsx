import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { BrandLogo, LanguageToggle, VehicleImage } from '../components/BrandMark';
import { StreetMap } from '../components/StreetMap';
import { t } from '../i18n/translations';
import type { Language, PublicConfig, PublicTripTracking, RouteResult } from '../types';
import { apiRequest } from '../utils/api';

interface PublicTripTrackingPageProps {
  config: PublicConfig | null;
  lang: Language;
  onChangeLang: (l: Language) => void;
  onNavigate: (path: string) => void;
}

function calculateEtaClock(durationMin: number): string {
  const d = new Date(Date.now() + Math.max(1, durationMin) * 60000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const PublicTripTrackingPage: React.FC<PublicTripTrackingPageProps> = ({
  config,
  lang,
  onChangeLang,
  onNavigate,
}) => {
  const [queryId, setQueryId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const idParam = sp.get('id') || sp.get('track') || '';
      if (idParam) return idParam;
      // also check /track/ID in pathname
      const parts = window.location.pathname.split('/').filter(Boolean);
      if (parts[0] === 'track' && parts[1]) return parts[1];
    }
    return '';
  });

  const [inputSearch, setInputSearch] = useState(queryId);
  const [tracking, setTracking] = useState<PublicTripTracking | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const fetchTracking = useCallback(async (id: string) => {
    if (!id.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ tracking: PublicTripTracking }>(
        `/api/public/track/${encodeURIComponent(id.trim())}`
      );
      setTracking(res.tracking);
      setLastRefreshed(new Date());

      // Compute route coordinates for the map
      if (res.tracking.pickup_lat && res.tracking.dropoff_lat) {
        apiRequest<RouteResult>(
          `/api/map/route?fromLat=${res.tracking.pickup_lat}&fromLng=${res.tracking.pickup_lng}&toLat=${res.tracking.dropoff_lat}&toLng=${res.tracking.dropoff_lng}`
        )
          .then(setRoute)
          .catch(() => setRoute(null));
      }
    } catch (err: any) {
      setError(err.message || 'Unable to find tracking details for this reference ID.');
      setTracking(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (queryId) {
      fetchTracking(queryId);
    }
  }, [queryId, fetchTracking]);

  // Polling every 8 seconds when trip is active
  useEffect(() => {
    if (!tracking || !queryId) return;
    const isActive = ['searching', 'negotiating', 'confirmed', 'on_the_way', 'arrived', 'started'].includes(
      tracking.status
    );
    if (!isActive) return;

    const timer = setInterval(() => {
      apiRequest<{ tracking: PublicTripTracking }>(
        `/api/public/track/${encodeURIComponent(queryId.trim())}`
      )
        .then((res) => {
          setTracking(res.tracking);
          setLastRefreshed(new Date());
        })
        .catch(() => {});
    }, 8000);

    return () => clearInterval(timer);
  }, [tracking?.status, queryId]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputSearch.trim()) return;
    setQueryId(inputSearch.trim());
    if (window.history && window.history.pushState) {
      window.history.pushState({}, '', `/track?id=${encodeURIComponent(inputSearch.trim())}`);
    }
  };

  const steps = [
    { key: 'confirmed', label: lang === 'ur' ? 'بکنگ کنفرم' : 'Confirmed' },
    { key: 'on_the_way', label: lang === 'ur' ? 'ڈرائیور راستے میں' : 'On the Way' },
    { key: 'arrived', label: lang === 'ur' ? 'پک اپ پر پہنچ گیا' : 'Arrived at Pickup' },
    { key: 'started', label: lang === 'ur' ? 'سفر جاری' : 'Trip in Progress' },
    { key: 'completed', label: lang === 'ur' ? 'سفر مکمل' : 'Completed' },
  ];

  const currentStepIndex = tracking
    ? steps.findIndex((s) => s.key === tracking.status)
    : -1;

  const etaClock = tracking ? calculateEtaClock(tracking.duration_min) : '--:--';

  const helpline = config?.supportWhatsapp || '03125007782';

  return (
    <div dir={lang === 'ur' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#F8F8FA] flex flex-col text-left">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-zinc-200 px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="p-2 rounded-xl border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
            title="Go to Welcome Page"
          >
            <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
          </button>
          <BrandLogo />
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
            <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
            <span>{lang === 'ur' ? 'لائیو روٹ ٹریکنگ' : 'Live Safety Tracking'}</span>
          </div>
          <LanguageToggle lang={lang} onChange={onChangeLang} />
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Search Reference Bar */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3 rtl:right-3.5 rtl:left-auto" />
            <input
              type="text"
              placeholder={lang === 'ur' ? 'بکنگ آئی ڈی درج کریں (مثلاً BK-786)...' : 'Enter Booking Reference ID (e.g. BK-XXXX)...'}
              value={inputSearch}
              onChange={(e) => setInputSearch(e.target.value)}
              className="w-full pl-10 pr-4 rtl:pr-10 rtl:pl-4 py-2.5 rounded-2xl border border-zinc-200 bg-white text-xs sm:text-sm font-mono text-[#0D0D10] focus:outline-none focus:ring-1 focus:ring-[#D4A017]"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 rounded-2xl bg-[#0D0D10] text-white text-xs sm:text-sm font-bold hover:bg-zinc-800 disabled:opacity-50"
          >
            {loading ? '...' : lang === 'ur' ? 'ٹریک کریں' : 'Track Ride'}
          </button>
        </form>

        {error && (
          <div className="rounded-2xl bg-red-50 border border-red-200 p-5 text-center space-y-2">
            <AlertTriangle className="w-6 h-6 text-red-600 mx-auto" />
            <p className="text-xs font-semibold text-red-800">{error}</p>
            <p className="text-[11px] text-zinc-500">
              {lang === 'ur'
                ? 'براہ کرم درست بکنگ آئی ڈی چیک کریں جو مسافر نے آپ کے ساتھ شیئر کی ہے۔'
                : 'Please verify the booking ID shared by the passenger.'}
            </p>
          </div>
        )}

        {tracking && (
          <div className="space-y-6">
            {/* Real-time Hero Card */}
            <div className="rounded-3xl bg-[#0D0D10] text-white p-5 sm:p-7 space-y-5 shadow-xl">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 pb-4">
                <div>
                  <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
                    <span className="text-[#D4A017] font-bold">{tracking.id}</span>
                    <span>·</span>
                    <span className="capitalize">{tracking.service_type.replaceAll('_', ' ')}</span>
                    <span>·</span>
                    <span>{tracking.vehicle_category_name}</span>
                  </div>
                  <h1 className="font-display text-xl sm:text-2xl font-bold text-white mt-1">
                    {tracking.status === 'confirmed' && (lang === 'ur' ? 'بکنگ تصدیق شدہ · ڈرائیور تیاری کر رہا ہے' : 'Booking Confirmed · Driver Preparing')}
                    {tracking.status === 'on_the_way' && (lang === 'ur' ? 'پرو پارٹنر پک اپ کی طرف روانہ ہے' : 'Pro Partner On the Way to Pickup')}
                    {tracking.status === 'arrived' && (lang === 'ur' ? 'پرو پارٹنر پک اپ مقام پر پہنچ گیا ہے' : 'Pro Partner Arrived at Pickup')}
                    {tracking.status === 'started' && (lang === 'ur' ? 'سفر جاری ہے · منزل کی طرف گامزن' : 'Trip in Progress · Heading to Destination')}
                    {tracking.status === 'completed' && (lang === 'ur' ? 'سفر بخیر و خوبی مکمل ہو گیا' : 'Trip Safely Completed')}
                  </h1>
                </div>

                <div className="text-right">
                  <span className="text-[11px] uppercase tracking-wider text-zinc-400 block font-semibold">
                    {lang === 'ur' ? 'متوقع وقت آمد' : 'Live ETA'}
                  </span>
                  <div className="font-mono text-xl sm:text-2xl font-extrabold text-[#F4C430] tabular-nums">
                    ~{etaClock}
                  </div>
                  <span className="text-[10px] text-zinc-400 font-mono block">
                    ~{tracking.duration_min} min remaining · {tracking.distance_km} km
                  </span>
                </div>
              </div>

              {/* Progress Stepper */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                  {steps.map((st, i) => {
                    const isPassed = currentStepIndex >= i;
                    const isCurrent = currentStepIndex === i;
                    return (
                      <div
                        key={st.key}
                        className={`p-2.5 rounded-xl border flex items-center gap-2 transition-colors ${
                          isCurrent
                            ? 'bg-[#D4A017] text-[#0D0D10] border-[#D4A017] font-bold shadow'
                            : isPassed
                            ? 'bg-zinc-900 text-zinc-200 border-zinc-700 font-semibold'
                            : 'bg-zinc-900/40 text-zinc-500 border-zinc-800'
                        }`}
                      >
                        <CheckCircle2
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isCurrent ? 'text-[#0D0D10]' : isPassed ? 'text-[#D4A017]' : 'text-zinc-600'
                          }`}
                        />
                        <span className="text-[11px] truncate leading-tight">{st.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Live Status Metas */}
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400 pt-1 border-t border-zinc-800/80">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-ping" />
                  <span>
                    {lang === 'ur' ? 'لائیو جی پی ایس اپ ڈیٹ فعال ہے' : 'Live GPS updates active'}
                    {tracking.partner_lat && tracking.partner_lng ? ' · Real-time vehicle pinned' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span>Updated: {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  <button
                    type="button"
                    onClick={() => fetchTracking(queryId)}
                    aria-label="Refresh"
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-300"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>
            </div>

            {/* Interactive Street Map with Live Route & Driver Pin */}
            <div className="space-y-3">
              <StreetMap
                pickup={{ label: tracking.pickup_address, lat: tracking.pickup_lat, lng: tracking.pickup_lng }}
                dropoff={{ label: tracking.dropoff_address, lat: tracking.dropoff_lat, lng: tracking.dropoff_lng }}
                route={route}
                livePartner={
                  tracking.partner_lat && tracking.partner_lng
                    ? {
                        lat: tracking.partner_lat,
                        lng: tracking.partner_lng,
                        label: tracking.partner_name || 'Pro Partner',
                      }
                    : null
                }
                heightClass="h-[360px] sm:h-[420px] lg:h-[460px]"
              />
            </div>

            {/* Route & Driver Verification Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Route Summary */}
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
                <h3 className="font-display text-sm font-bold text-[#0D0D10] flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-[#D4A017]" />
                  <span>{lang === 'ur' ? 'سفری راستہ اور تفصیلات' : 'Trip Route Details'}</span>
                </h3>

                <div className="space-y-3 text-xs">
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-[10px] uppercase font-bold text-zinc-400 block">
                        {lang === 'ur' ? 'پک اپ مقام' : 'Pickup Location'}
                      </span>
                      <span className="text-zinc-800 font-semibold">{tracking.pickup_address}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Navigation className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-[10px] uppercase font-bold text-zinc-400 block">
                        {lang === 'ur' ? 'منزل کا مقام' : 'Drop-off Destination'}
                      </span>
                      <span className="text-zinc-800 font-semibold">{tracking.dropoff_address}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-zinc-500 font-mono text-[11px]">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                      {tracking.pickup_date} at {tracking.pickup_time}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-zinc-400" />
                      {tracking.distance_km} km ({tracking.duration_min} min)
                    </span>
                  </div>
                </div>
              </div>

              {/* Driver & Safety Verification Card */}
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold text-[#0D0D10] flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>{lang === 'ur' ? 'تصدیق شدہ ڈرائیور و گاڑی' : 'Verified Driver & Vehicle'}</span>
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Pro Verified
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  {tracking.vehicle_image_url && (
                    <VehicleImage
                      src={tracking.vehicle_image_url}
                      alt={tracking.vehicle_category_name || 'Vehicle'}
                      className="w-20 h-14 shrink-0"
                    />
                  )}
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-bold text-[#0D0D10] truncate">
                      {tracking.partner_name || 'Pro Partner Assigned'}
                    </p>
                    <p className="text-xs text-zinc-600 truncate">
                      {tracking.partner_vehicle_name || tracking.vehicle_category_name}
                    </p>
                    {tracking.partner_vehicle_number && (
                      <span className="inline-block px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 font-mono text-xs font-bold text-[#0D0D10]">
                        {tracking.partner_vehicle_number}
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-xs">
                  <span className="text-zinc-500">
                    {lang === 'ur' ? 'مسافر:' : 'Passenger:'}{' '}
                    <strong className="text-[#0D0D10]">{tracking.passenger_display}</strong>
                  </span>
                  <span className="text-[11px] text-zinc-400">Privacy Protected</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <a
                    href={`tel:${helpline}`}
                    className="flex-1 py-2 px-3 rounded-xl bg-zinc-100 border border-zinc-200 text-[#0D0D10] text-xs font-semibold hover:bg-zinc-200 inline-flex items-center justify-center gap-1.5"
                  >
                    <Phone className="w-3.5 h-3.5 text-zinc-600" />
                    <span>{lang === 'ur' ? 'ہیلپ لائن پر کال کریں' : 'Call Helpline'}</span>
                  </a>
                  <a
                    href={`https://api.whatsapp.com/send?phone=92${helpline.replace(/^0/, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2 px-3 rounded-xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 inline-flex items-center justify-center gap-1.5"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-10 py-6 border-t border-zinc-200 bg-white text-center text-xs text-zinc-500 space-y-1">
        <p className="font-semibold text-[#0D0D10]">PRO RIDER AI · Travel with Trust</p>
        <p>Live Safety Tracking for Family and Trusted Contacts across Pakistan</p>
      </footer>
    </div>
  );
};
