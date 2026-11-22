import React, { useEffect, useState } from 'react';
import {
  Bell,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Flame,
  Lock,
  MapPin,
  Navigation,
  Radio,
  ShieldCheck,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { StreetMap, type MapFocusTarget } from '../../components/StreetMap';
import { tr, trBookingStatus, trPaymentStatus, trService } from '../../i18n/translations';
import { apiRequest } from '../../utils/api';
import { downloadBookingPdf } from '../../utils/pdfGenerator';
import { RIDE_BELL_OPTIONS, type RideBellSoundId } from '../../utils/rideBell';
import type { Booking, DemandMapData, Language, PartnerProfile, RouteResult, ServiceZone } from '../../types';

function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Screens 20 & 21: Clean Pro Partner Home Radar Screen
export const PartnerRequestsView: React.FC<{
  lang?: Language;
  approved: boolean;
  profile: PartnerProfile;
  requests: Booking[];
  demandData?: DemandMapData | null;
  zones?: ServiceZone[];
  bellSound: RideBellSoundId;
  onChangeBellSound: (sound: RideBellSoundId) => void;
  onTestBell: () => void;
  incomingRideNotice?: Booking | null;
  onDismissIncomingNotice?: () => void;
  onRefresh: () => Promise<void>;
  onGoToDocs: () => void;
}> = ({
  lang = 'en',
  approved,
  profile,
  requests,
  demandData = null,
  zones = [],
  bellSound,
  onChangeBellSound,
  onTestBell,
  incomingRideNotice = null,
  onDismissIncomingNotice,
  onRefresh,
  onGoToDocs,
}) => {
  const [detailsRequest, setDetailsRequest] = useState<Booking | null>(null);
  const [heatmapModalOpen, setHeatmapModalOpen] = useState(false);
  const [bellMenuOpen, setBellMenuOpen] = useState(false);
  const [previewRoute, setPreviewRoute] = useState<RouteResult | null>(null);
  const [focusTarget, setFocusTarget] = useState<MapFocusTarget | null>(null);
  const [offerDrafts, setOfferDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locallySkippedIds, setLocallySkippedIds] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [driverGps, setDriverGps] = useState<{ lat: number; lng: number } | null>(() =>
    profile.current_lat && profile.current_lng
      ? { lat: profile.current_lat, lng: profile.current_lng }
      : null
  );

  // Capture driver GPS once cleanly so Details shows how far pickup is from driver
  useEffect(() => {
    if (driverGps || typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setDriverGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 6000 }
    );
  }, [driverGps]);

  useEffect(() => {
    if (!detailsRequest) {
      setPreviewRoute(null);
      return;
    }
    let cancelled = false;
    apiRequest<RouteResult>(
      `/api/map/route?fromLat=${detailsRequest.pickup_lat}&fromLng=${detailsRequest.pickup_lng}&toLat=${detailsRequest.dropoff_lat}&toLng=${detailsRequest.dropoff_lng}`
    )
      .then((res) => {
        if (!cancelled) setPreviewRoute(res);
      })
      .catch(() => {
        if (!cancelled) setPreviewRoute(null);
      });
    return () => {
      cancelled = true;
    };
  }, [detailsRequest?.id]);

  const visibleRequests = requests.filter((r) => !locallySkippedIds.includes(r.id));
  const safeIndex = visibleRequests.length > 0 ? Math.min(activeIndex, visibleRequests.length - 1) : 0;
  const currentRide = visibleRequests[safeIndex] || null;

  useEffect(() => {
    if (incomingRideNotice) {
      const idx = visibleRequests.findIndex((r) => r.id === incomingRideNotice.id);
      if (idx >= 0) setActiveIndex(idx);
    }
  }, [incomingRideNotice?.id]);

  const handleAccept = async (bookingId: string) => {
    if (!approved) {
      setError(
        lang === 'ur'
          ? 'رائیڈ قبول کرنے کے لیے ڈاکومنٹس کی تصدیق لازمی ہے۔ آپ کو ڈاکومنٹس پیج پر لے جایا جا رہا ہے...'
          : 'Document verification is required to accept rides. Redirecting you to complete your documents...'
      );
      onGoToDocs();
      return;
    }
    setBusyId(bookingId);
    setError(null);
    try {
      await apiRequest(`/api/partner/requests/${bookingId}/accept`, {
        method: 'POST',
        role: 'partner',
      });
      setDetailsRequest(null);
      onDismissIncomingNotice?.();
      await onRefresh();
    } catch (err: any) {
      setError(err.message);
      if (err?.status === 403) onGoToDocs();
    } finally {
      setBusyId(null);
    }
  };

  const handleCounter = async (bookingId: string) => {
    if (!approved) {
      setError(
        lang === 'ur'
          ? 'آفر بھیجنے کے لیے ڈاکومنٹس کی تصدیق ضروری ہے۔'
          : 'Document verification is required to send fare offers. Please upload your documents first.'
      );
      onGoToDocs();
      return;
    }
    const amt = Number(offerDrafts[bookingId]);
    if (!Number.isFinite(amt) || amt <= 0) return;
    setBusyId(bookingId);
    setError(null);
    try {
      await apiRequest(`/api/partner/requests/${bookingId}/offer`, {
        method: 'POST',
        role: 'partner',
        body: { amountPkr: amt },
      });
      await onRefresh();
    } catch (err: any) {
      setError(err.message);
      if (err?.status === 403) onGoToDocs();
    } finally {
      setBusyId(null);
    }
  };

  const handleCancelDecline = async (bookingId: string) => {
    setBusyId(bookingId);
    setLocallySkippedIds((prev) => (prev.includes(bookingId) ? prev : [...prev, bookingId]));
    if (detailsRequest?.id === bookingId) setDetailsRequest(null);
    if (incomingRideNotice?.id === bookingId) onDismissIncomingNotice?.();
    try {
      await apiRequest(`/api/partner/requests/${bookingId}/skip`, {
        method: 'POST',
        role: 'partner',
      });
      await onRefresh();
    } catch {
      // Keep locally dismissed cleanly on static/offline mode
    } finally {
      setBusyId(null);
    }
  };

  const topHotspots = demandData?.hotspots || [];
  const sortedHotspots = [...topHotspots].sort(
    (a, b) => b.demandScore + b.openRequests * 12 - (a.demandScore + a.openRequests * 12)
  );
  const hottestZone = sortedHotspots[0] || null;
  const peakHeatScore = hottestZone ? hottestZone.demandScore + hottestZone.openRequests * 10 : 0;

  const topHeatButtonClass =
    peakHeatScore >= 82
      ? 'bg-[#B91C1C] border-red-400 text-white shadow-md shadow-red-600/35 animate-pulse'
      : peakHeatScore >= 65
      ? 'bg-red-600 border-red-400 text-white shadow-sm'
      : peakHeatScore >= 45
      ? 'bg-orange-600 border-orange-400 text-white shadow-sm'
      : 'bg-emerald-700 border-emerald-500 text-white shadow-sm';

  const pickupDistanceFromDriver =
    currentRide && driverGps
      ? haversineDistanceKm(driverGps.lat, driverGps.lng, currentRide.pickup_lat, currentRide.pickup_lng).toFixed(1)
      : null;

  const detailsPickupDistance =
    detailsRequest && driverGps
      ? haversineDistanceKm(driverGps.lat, driverGps.lng, detailsRequest.pickup_lat, detailsRequest.pickup_lng).toFixed(1)
      : null;

  return (
    <div className="relative flex flex-col w-full min-w-0 overflow-x-clip space-y-3.5 pt-1 pb-4">
      {/* Top Command Row: Status/Verification + Bell Tone + Live Demand Heatmap */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {!approved ? (
            <button
              type="button"
              onClick={onGoToDocs}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FEF3C7] border-2 border-[#D4A017] text-[#0D0D10] text-xs font-extrabold shadow-xs hover:bg-[#FDE68A] whitespace-nowrap"
            >
              <Lock className="w-3.5 h-3.5 text-[#9E730B] shrink-0" />
              <span className="truncate">
                {lang === 'ur' ? 'تصدیق باقی · دستاویزات مکمل کریں' : 'Docs Pending · Tap to Verify'}
              </span>
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0D0D10] border border-[#D4A017]/50 text-xs font-extrabold text-white shadow-xs whitespace-nowrap">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  profile.is_online ? 'bg-emerald-400' : 'bg-zinc-400'
                }`}
              />
              <span>
                {profile.is_online
                  ? lang === 'ur'
                    ? 'ڈرائیور آن لائن · ریڈار فعال'
                    : 'Online · Radar Active'
                  : lang === 'ur'
                  ? 'آف لائن پریویو'
                  : 'Offline Preview'}
              </span>
            </div>
          )}
        </div>

        {/* Right Top Controls: Bell Tone + Heatmap */}
        <div className="relative flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setBellMenuOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border-2 border-zinc-300 text-[#0D0D10] text-xs font-extrabold shadow-2xs hover:border-[#0D0D10] whitespace-nowrap"
          >
            {bellSound === 'muted' ? (
              <VolumeX className="w-3.5 h-3.5 text-zinc-600" />
            ) : (
              <Bell className="w-3.5 h-3.5 text-[#B8860B]" />
            )}
            <span>{lang === 'ur' ? 'بیل' : 'Bell'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setHeatmapModalOpen(true);
              if (hottestZone) {
                setFocusTarget({ lat: hottestZone.lat, lng: hottestZone.lng, zoom: 13, ts: Date.now() });
              }
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-extrabold transition-all whitespace-nowrap ${topHeatButtonClass}`}
          >
            <Flame className="w-3.5 h-3.5 shrink-0" />
            <span>{lang === 'ur' ? 'ہیٹ میپ' : 'Heatmap'}</span>
            {hottestZone && (
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-black/30 leading-none tabular-nums">
                {hottestZone.surgeMultiplier.toFixed(1)}x
              </span>
            )}
          </button>

          {/* Bell Ringtone Selector Popover */}
          {bellMenuOpen && (
            <div className="absolute right-0 top-12 z-40 w-64 rounded-2xl border-2 border-[#0D0D10] bg-white shadow-2xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-[#0D0D10]">
                  {lang === 'ur' ? 'رائیڈ بیل ٹون منتخب کریں' : 'Select Ride Bell Tone'}
                </span>
                <button
                  type="button"
                  onClick={() => setBellMenuOpen(false)}
                  className="text-zinc-500 hover:text-[#0D0D10]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-1.5">
                {RIDE_BELL_OPTIONS.map((opt) => {
                  const active = bellSound === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onChangeBellSound(opt.id)}
                      className={`w-full px-2.5 py-2 rounded-xl border text-left transition-colors ${
                        active
                          ? 'bg-[#0D0D10] border-[#0D0D10] text-[#F4C430]'
                          : 'bg-zinc-50 border-zinc-200 text-[#0D0D10] hover:bg-zinc-100'
                      }`}
                    >
                      <div className="text-[11px] font-bold">{lang === 'ur' ? opt.labelUr : opt.labelEn}</div>
                      <div className={`text-[10px] ${active ? 'text-zinc-300' : 'text-zinc-600'}`}>
                        {opt.descriptionEn}
                      </div>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={onTestBell}
                className="w-full py-2 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-extrabold flex items-center justify-center gap-1.5 hover:bg-[#EAB308]"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>{lang === 'ur' ? 'بیل ٹیسٹ کریں' : 'Test Sound'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Authoritative Dispatch Strip — Eliminates pale void & anchors driver workspace */}
      <div className="w-full max-w-lg mx-auto rounded-2xl bg-[#FAF6EC] border-2 border-[#0D0D10] px-4 py-2.5 flex items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative w-10 h-10 rounded-xl bg-[#0D0D10] border border-[#D4A017] flex items-center justify-center shrink-0 overflow-hidden">
            <div
              className="absolute inset-0.5 rounded-full animate-spin"
              style={{
                animationDuration: '3s',
                background:
                  'conic-gradient(from 0deg, rgba(244,196,48,0.5) 0deg, transparent 90deg, transparent 360deg)',
              }}
            />
            <Car className="w-4 h-4 text-[#F4C430] relative z-10" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#9E730B]">
              {lang === 'ur' ? 'پرو پارٹنر ڈسپیچ سسٹم' : 'PRO PARTNER DISPATCH'}
            </p>
            <p className="text-xs sm:text-sm font-extrabold text-[#0D0D10] truncate">
              {profile.vehicle_name || tr(lang, 'Verified Fleet Unit', 'فلیٹ گاڑی')} ·{' '}
              {profile.operating_city || 'Islamabad'}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0D0D10] text-[#F4C430] font-mono text-[11px] font-bold tabular-nums">
            {visibleRequests.length}{' '}
            {visibleRequests.length === 1
              ? tr(lang, 'Ride', 'رائیڈ')
              : tr(lang, 'Rides', 'رائیڈز')}
          </span>
        </div>
      </div>

      {error && (
        <div className="w-full max-w-lg mx-auto rounded-xl bg-red-50 border-2 border-red-300 px-3.5 py-2.5 text-xs text-red-800 font-bold text-center">
          {error}
        </div>
      )}

      {/* Main Content Stage: Top-Anchored, High-Contrast Broadsheet Dispatch Card or Radar */}
      <div className="w-full max-w-lg mx-auto">
        {!currentRide ? (
          /* Clean Executive Scanning Radar Panel */
          <div className="rounded-3xl border-2 border-[#0D0D10] bg-white overflow-hidden shadow-[0_14px_34px_-12px_rgba(13,13,16,0.2)]">
            <div className="bg-[#0D0D10] px-5 py-3 flex items-center justify-between border-b border-[#D4A017]/40">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#F4C430]">
                {lang === 'ur' ? 'لائیو ریڈار اسکیننگ' : 'LIVE ZONE RADAR'}
              </span>
              <span className="text-[11px] font-mono font-bold text-zinc-300">
                {profile.operating_city || 'Islamabad'}
              </span>
            </div>

            <div className="px-5 py-8 flex flex-col items-center text-center space-y-5 bg-gradient-to-b from-[#FAF7EE] to-white">
              <div className="relative w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-2 border-[#0D0D10]/15 bg-[#0D0D10]/[0.03]" />
                <div className="absolute inset-5 rounded-full border border-[#D4A017]/45" />
                <div className="absolute inset-11 rounded-full border border-dashed border-[#0D0D10]/25" />
                <div className="absolute inset-16 rounded-full border border-[#D4A017]/60" />

                <div className="absolute inset-x-0 top-1/2 h-px bg-[#0D0D10]/15" />
                <div className="absolute inset-y-0 left-1/2 w-px bg-[#0D0D10]/15" />

                <div
                  className="absolute inset-1 rounded-full animate-spin"
                  style={{
                    animationDuration: '3.2s',
                    background:
                      'conic-gradient(from 0deg, rgba(212,160,23,0.45) 0deg, rgba(212,160,23,0.08) 58deg, transparent 90deg, transparent 360deg)',
                  }}
                />

                <div className="relative z-10 w-16 h-16 rounded-full bg-[#0D0D10] border-2 border-[#F4C430] shadow-xl flex items-center justify-center text-[#F4C430]">
                  <Car className="w-7 h-7" />
                </div>
              </div>

              <div className="space-y-1.5 max-w-xs">
                <h2 className="font-display text-xl font-black text-[#0D0D10] tracking-tight">
                  {lang === 'ur' ? 'نئی مسافر رائیڈز تلاش کی جا رہی ہیں' : 'Scanning for Passenger Rides'}
                </h2>
                <p className="text-xs font-semibold text-zinc-700 leading-relaxed">
                  {lang === 'ur'
                    ? 'مسافر کی درخواست آتے ہی بیل بجے گی اور مکمل تفصیل یہاں نمودار ہوگی۔'
                    : 'Incoming passenger requests will ring your bell and lock straight onto this dispatch console.'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* High-Contrast Solid "Pukka" Incoming Ride Console (Bold Ink + Obsidian Header + 3 Tactile Buttons) */
          <div className="space-y-3">
            <div className="rounded-3xl border-2 border-[#0D0D10] bg-white overflow-hidden shadow-[0_16px_38px_-12px_rgba(13,13,16,0.28)]">
              {/* Solid Obsidian Masthead Band */}
              <div className="bg-[#0D0D10] text-white px-4 sm:px-5 py-3 flex items-center justify-between gap-2 border-b-2 border-[#D4A017]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[#D4A017] text-[#0D0D10] flex items-center justify-center shrink-0">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#F4C430] leading-none">
                      {lang === 'ur' ? 'نئی مسافر رائیڈ دستیاب' : 'INCOMING PASSENGER RIDE'}
                    </p>
                    <p className="font-mono text-xs font-extrabold text-white mt-1 truncate">
                      {currentRide.id} <span className="text-[#D4A017]">·</span> {trService(lang, currentRide.service_type)}
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-[#1C1D24] border border-[#D4A017]/50 text-[#F4C430] text-[11px] font-extrabold font-mono uppercase whitespace-nowrap shrink-0 tabular-nums">
                  {currentRide.seats_requested} {tr(lang, currentRide.seats_requested > 1 ? 'Seats' : 'Seat', 'سیٹ')}
                </span>
              </div>

              {/* Bold Fare & Passenger Meta Summary Band */}
              <div className="bg-[#FAF6EC] px-4 sm:px-5 py-3.5 border-b-2 border-[#0D0D10]/10 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-600">
                    {tr(lang, 'Passenger Request', 'مسافر کی تفصیل')}
                  </p>
                  <p className="text-sm font-black text-[#0D0D10] mt-0.5 truncate">
                    {currentRide.passenger_display || tr(lang, 'Passenger', 'مسافر')}
                  </p>
                  <p className="text-[11px] font-bold text-zinc-700 mt-0.5 font-mono">
                    {currentRide.pickup_date} · {currentRide.pickup_time}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#9E730B] block">
                    {tr(lang, 'Offered Fare', 'مقررہ کرایہ')}
                  </span>
                  <div className="font-display text-2xl sm:text-[28px] font-black text-[#0D0D10] leading-none tracking-tight tabular-nums mt-0.5">
                    Rs. {Number(currentRide.proposed_fare_pkr).toLocaleString()}
                  </div>
                  <div className="text-xs font-extrabold text-[#0D0D10] font-mono mt-1 tabular-nums">
                    {currentRide.distance_km} km · ~{currentRide.duration_min} {tr(lang, 'min', 'منٹ')}
                  </div>
                </div>
              </div>

              {/* Crisp Structured Route Ledger */}
              <div className="p-4 sm:p-5 space-y-4">
                <div className="rounded-2xl border-2 border-zinc-200 bg-[#F9F9FB] p-3.5 space-y-3">
                  {/* Pickup */}
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 w-6 h-6 rounded-lg bg-emerald-700 text-white flex items-center justify-center shrink-0">
                      <MapPin className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
                          {tr(lang, 'Pickup Location', 'پِک اپ مقام')}
                        </span>
                        {pickupDistanceFromDriver && (
                          <span className="font-mono text-[11px] font-extrabold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md tabular-nums whitespace-nowrap">
                            {pickupDistanceFromDriver} {tr(lang, 'km away', 'کلومیٹر دور')}
                          </span>
                        )}
                      </div>
                      <p dir="auto" className="text-[13px] font-extrabold text-[#0D0D10] leading-snug mt-0.5">
                        {currentRide.pickup_address}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-dashed border-zinc-300" />

                  {/* Dropoff */}
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 w-6 h-6 rounded-lg bg-red-600 text-white flex items-center justify-center shrink-0">
                      <Navigation className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-red-700 block">
                        {tr(lang, 'Dropoff Destination', 'منزلِ مقصود')}
                      </span>
                      <p dir="auto" className="text-[13px] font-extrabold text-[#0D0D10] leading-snug mt-0.5">
                        {currentRide.dropoff_address}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Exact 3 High-Contrast Action Buttons: Accept (Left) · Details (Middle) · Cancel (Right) */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={busyId === currentRide.id}
                    onClick={() => handleAccept(currentRide.id)}
                    className="min-h-[48px] py-2.5 px-2 rounded-xl bg-emerald-700 text-white text-xs sm:text-[13px] font-extrabold hover:bg-emerald-800 border border-emerald-900/30 inline-flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-60 whitespace-nowrap"
                  >
                    <Check className="w-4 h-4 shrink-0" />
                    <span>{lang === 'ur' ? 'قبول' : 'Accept'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDetailsRequest(currentRide)}
                    className="min-h-[48px] py-2.5 px-2 rounded-xl bg-[#0D0D10] text-[#F4C430] text-xs sm:text-[13px] font-extrabold hover:bg-zinc-900 border border-[#D4A017]/50 inline-flex items-center justify-center gap-1.5 shadow-sm whitespace-nowrap"
                  >
                    <Eye className="w-4 h-4 shrink-0" />
                    <span>{lang === 'ur' ? 'تفصیل' : 'Details'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={busyId === currentRide.id}
                    onClick={() => handleCancelDecline(currentRide.id)}
                    className="min-h-[48px] py-2.5 px-2 rounded-xl border-2 border-red-300 bg-white text-red-700 text-xs sm:text-[13px] font-extrabold hover:bg-red-50 inline-flex items-center justify-center gap-1.5 disabled:opacity-60 whitespace-nowrap"
                  >
                    <X className="w-4 h-4 shrink-0" />
                    <span>{lang === 'ur' ? 'کینسل' : 'Cancel'}</span>
                  </button>
                </div>
              </div>
            </div>

            {visibleRequests.length > 1 && (
              <div className="flex items-center justify-center gap-3 text-xs font-extrabold text-[#0D0D10]">
                <button
                  type="button"
                  onClick={() => setActiveIndex((i) => (i - 1 + visibleRequests.length) % visibleRequests.length)}
                  className="p-2 rounded-xl border-2 border-[#0D0D10]/20 bg-white hover:border-[#0D0D10]"
                  aria-label="Previous ride"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-mono text-xs tabular-nums">
                  {safeIndex + 1} / {visibleRequests.length}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveIndex((i) => (i + 1) % visibleRequests.length)}
                  className="p-2 rounded-xl border-2 border-[#0D0D10]/20 bg-white hover:border-[#0D0D10]"
                  aria-label="Next ride"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Demand Summary Footer Strip */}
        {hottestZone && (
          <button
            type="button"
            onClick={() => {
              setHeatmapModalOpen(true);
              setFocusTarget({ lat: hottestZone.lat, lng: hottestZone.lng, zoom: 13, ts: Date.now() });
            }}
            className="mt-3 w-full rounded-2xl border border-zinc-300 bg-white px-4 py-2.5 flex items-center justify-between gap-2 text-left hover:border-[#0D0D10] transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Flame className="w-4 h-4 text-red-600 shrink-0" />
              <span className="text-xs font-extrabold text-[#0D0D10] truncate">
                {tr(lang, 'Hot Demand Zone:', 'زیادہ ڈیمانڈ زون:')} {hottestZone.areaName} ({hottestZone.city})
              </span>
            </div>
            <span className="font-mono text-xs font-extrabold text-[#0D0D10] bg-[#FAF6EC] border border-[#D4A017]/50 px-2 py-0.5 rounded-md shrink-0 tabular-nums">
              {hottestZone.surgeMultiplier.toFixed(1)}x
            </span>
          </button>
        )}
      </div>

      {/* Ride Details + Interactive Distance/Route Map Modal (Opened from middle Details button) */}
      {detailsRequest && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl bg-white border border-zinc-200 shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
            <div className="bg-[#0D0D10] text-white px-4 sm:px-5 py-3.5 flex items-center justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <p className="text-[11px] font-mono text-[#D4A017] font-bold">{detailsRequest.id}</p>
                <h3 className="font-display text-sm sm:text-base font-bold truncate">
                  {lang === 'ur' ? 'رائیڈ کی مکمل تفصیل اور میپ' : 'Full Ride Details & Route Map'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailsRequest(null)}
                className="p-2 rounded-xl hover:bg-zinc-800 text-zinc-300"
                aria-label="Close ride details"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
              <StreetMap
                pickup={{
                  label: detailsRequest.pickup_address,
                  lat: detailsRequest.pickup_lat,
                  lng: detailsRequest.pickup_lng,
                }}
                dropoff={{
                  label: detailsRequest.dropoff_address,
                  lat: detailsRequest.dropoff_lat,
                  lng: detailsRequest.dropoff_lng,
                }}
                livePartner={driverGps ? { lat: driverGps.lat, lng: driverGps.lng, label: 'You' } : null}
                route={previewRoute}
                zones={zones}
                demandData={demandData}
                demandAudience="partner"
                showDemandLayer={false}
                heightClass="h-[240px] sm:h-[280px]"
              />

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-2.5">
                  <span className="text-[10px] text-zinc-500 block">{tr(lang, 'Proposed Fare', 'تجویز کردہ کرایہ')}</span>
                  <strong className="font-mono text-sm text-[#0D0D10]">
                    Rs. {Number(detailsRequest.proposed_fare_pkr).toLocaleString()}
                  </strong>
                </div>
                <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-2.5">
                  <span className="text-[10px] text-zinc-500 block">{tr(lang, 'Trip Distance', 'سفر کا فاصلہ')}</span>
                  <strong className="font-mono text-sm text-[#0D0D10]">
                    {detailsRequest.distance_km} km (~{detailsRequest.duration_min}m)
                  </strong>
                </div>
                <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-2.5">
                  <span className="text-[10px] text-zinc-500 block">{tr(lang, 'From Your Location', 'آپ کے مقام سے')}</span>
                  <strong className="font-mono text-sm text-emerald-700">
                    {detailsPickupDistance ? `${detailsPickupDistance} km` : tr(lang, 'GPS ready', 'جی پی ایس تیار')}
                  </strong>
                </div>
                <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-2.5">
                  <span className="text-[10px] text-zinc-500 block">{tr(lang, 'Seats · Vehicle', 'سیٹیں · گاڑی')}</span>
                  <strong className="text-xs text-[#0D0D10] truncate block">
                    {detailsRequest.seats_requested} · {detailsRequest.vehicle_category_name}
                  </strong>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2 text-zinc-600">
                  <span>
                    {tr(lang, 'Passenger:', 'مسافر:')} <strong className="text-[#0D0D10]">{detailsRequest.passenger_display}</strong>
                  </span>
                  <span className="font-mono">
                    {detailsRequest.pickup_date} · {detailsRequest.pickup_time}
                  </span>
                </div>
                <div className="flex items-start gap-2 pt-1 border-t border-zinc-100">
                  <MapPin className="w-3.5 h-3.5 text-emerald-700 mt-0.5 shrink-0" />
                  <span>{detailsRequest.pickup_address}</span>
                </div>
                <div className="flex items-start gap-2">
                  <Navigation className="w-3.5 h-3.5 text-red-600 mt-0.5 shrink-0" />
                  <span>{detailsRequest.dropoff_address}</span>
                </div>
                {detailsRequest.notes && (
                  <p className="text-[11px] text-zinc-500 pt-1 border-t border-zinc-100">
                    {tr(lang, 'Note:', 'ہدایت:')} {detailsRequest.notes}
                  </p>
                )}
              </div>

              {/* Optional Counter Offer inside Details */}
              <div className="flex items-center gap-2 min-w-0">
                <input
                  type="number"
                  placeholder={tr(lang, 'Counter Offer Rs.', 'جوابی کرایہ آفر (روپے)')}
                  value={offerDrafts[detailsRequest.id] || ''}
                  onChange={(e) => setOfferDrafts((d) => ({ ...d, [detailsRequest.id]: e.target.value }))}
                  className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-zinc-200 text-xs font-mono"
                />
                <button
                  type="button"
                  disabled={busyId === detailsRequest.id}
                  onClick={() => handleCounter(detailsRequest.id)}
                  className="px-4 py-2.5 rounded-xl bg-[#0D0D10] text-white text-xs font-bold hover:bg-zinc-800 whitespace-nowrap shrink-0"
                >
                  {approved ? tr(lang, 'Send Offer', 'آفر بھیجیں') : tr(lang, 'Offer (Docs)', 'آفر (دستاویزات)')}
                </button>
              </div>
            </div>

            <div className="p-4 border-t border-zinc-200 bg-zinc-50 grid grid-cols-2 gap-2 shrink-0">
              <button
                type="button"
                disabled={busyId === detailsRequest.id}
                onClick={() => handleAccept(detailsRequest.id)}
                className="py-3 px-4 rounded-2xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{lang === 'ur' ? 'رائیڈ قبول کریں' : 'Accept Ride'}</span>
              </button>
              <button
                type="button"
                disabled={busyId === detailsRequest.id}
                onClick={() => handleCancelDecline(detailsRequest.id)}
                className="py-3 px-4 rounded-2xl border border-red-200 bg-red-50 text-red-700 text-xs font-bold hover:bg-red-100 flex items-center justify-center gap-1.5"
              >
                <X className="w-4 h-4" />
                <span>{lang === 'ur' ? 'کینسل کریں' : 'Cancel / Decline'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Demand Heatmap Modal (Opened cleanly from top-right Heatmap button) */}
      {heatmapModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-3xl rounded-t-3xl sm:rounded-3xl bg-white border border-zinc-200 shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
            <div className="bg-[#0D0D10] text-white px-4 sm:px-5 py-3.5 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Flame className={`w-5 h-5 ${peakHeatScore >= 65 ? 'text-red-500 animate-pulse' : 'text-[#D4A017]'}`} />
                <div className="min-w-0">
                  <h3 className="font-display text-sm sm:text-base font-bold truncate">
                    {lang === 'ur' ? 'لائیو ڈیمانڈ ہیٹ میپ' : 'Live Demand Heatmap'}
                  </h3>
                  <p className="text-[11px] text-zinc-400 truncate">
                    {hottestZone
                      ? `${tr(lang, 'Peak Heat:', 'سب سے زیادہ رش:')} ${hottestZone.areaName} (${hottestZone.surgeMultiplier.toFixed(1)}x)`
                      : tr(lang, 'Real-time city demand & red zones', 'شہر میں لائیو ڈیمانڈ اور ریڈ زونز')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHeatmapModalOpen(false)}
                className="p-2 rounded-xl hover:bg-zinc-800 text-zinc-300"
                aria-label={tr(lang, 'Close heatmap modal', 'ہیٹ میپ بند کریں')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
              <StreetMap
                zones={zones}
                demandData={demandData}
                demandAudience="partner"
                showDemandLayer={true}
                focusTarget={focusTarget}
                heightClass="h-[290px] sm:h-[340px]"
              />

              {sortedHotspots.length > 0 && (
                <div className="rounded-2xl border border-zinc-200 overflow-hidden divide-y divide-zinc-100">
                  {sortedHotspots.slice(0, 5).map((hs) => {
                    const score = Math.min(100, hs.demandScore + hs.openRequests * 10);
                    const barColor =
                      score >= 82
                        ? 'bg-[#991B1B]'
                        : score >= 65
                        ? 'bg-red-600'
                        : score >= 45
                        ? 'bg-orange-500'
                        : 'bg-emerald-600';
                    return (
                      <button
                        key={hs.id}
                        type="button"
                        onClick={() =>
                          setFocusTarget({ lat: hs.lat, lng: hs.lng, zoom: 13, ts: Date.now() })
                        }
                        className="w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-red-50/40 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-[#0D0D10] truncate">{hs.areaName}</div>
                          <div className="text-[11px] text-zinc-500">
                            {hs.city} · {hs.openRequests} {tr(lang, 'open', 'اوپن')} · {hs.activeBookings}{' '}
                            {tr(lang, 'active', 'جاری')}
                          </div>
                          <div className="mt-1.5 h-1.5 w-full max-w-[180px] rounded-full bg-zinc-100 overflow-hidden">
                            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(15, score)}%` }} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              score >= 80
                                ? 'bg-[#991B1B] text-white border border-red-700'
                                : score >= 65
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : score >= 45
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {score >= 80
                              ? tr(lang, 'Red Hot', 'انتہائی مصروف')
                              : score >= 65
                              ? tr(lang, 'High Heat', 'زیادہ رش')
                              : score >= 45
                              ? tr(lang, 'Busy', 'مصروف')
                              : tr(lang, 'Normal', 'معمول')}
                          </span>
                          <span className="font-mono text-xs font-bold text-[#0D0D10] tabular-nums w-11 text-right">
                            {hs.surgeMultiplier.toFixed(2)}x
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Screens 22 & 23: Driver My Trips & Strict Sequential Trip Management
export const PartnerTripsView: React.FC<{
  lang?: Language;
  trips: Booking[];
  gpsSharing: boolean;
  onToggleGpsSharing: () => void;
  onRefresh: () => Promise<void>;
}> = ({ lang = 'en', trips, gpsSharing, onToggleGpsSharing, onRefresh }) => {
  const [tab, setTab] = useState<'active' | 'upcoming' | 'completed' | 'cancelled'>('active');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const filtered = trips.filter((tItem) => {
    if (tab === 'upcoming') return tItem.booking_mode === 'schedule' && tItem.status === 'confirmed';
    if (tab === 'active') return ['confirmed', 'on_the_way', 'arrived', 'started'].includes(tItem.status);
    if (tab === 'completed') return tItem.status === 'completed';
    return tItem.status === 'cancelled';
  });

  const nextStepMap: Record<string, { next: string; label: string }> = {
    confirmed: {
      next: 'on_the_way',
      label: tr(lang, 'Start Heading to Pickup (On the Way)', 'پِک اپ کے لیے روانہ ہوں'),
    },
    on_the_way: {
      next: 'arrived',
      label: tr(lang, 'Mark Arrived at Pickup', 'پِک اپ پر پہنچنے کی تصدیق'),
    },
    arrived: {
      next: 'started',
      label: tr(lang, 'Start Trip', 'سفر شروع کریں'),
    },
    started: {
      next: 'completed',
      label: tr(lang, 'Complete Trip', 'سفر مکمل کریں'),
    },
  };

  const tabLabels: Record<'active' | 'upcoming' | 'completed' | 'cancelled', string> = {
    active: tr(lang, 'Active', 'جاری'),
    upcoming: tr(lang, 'Upcoming', 'آنے والے'),
    completed: tr(lang, 'Completed', 'مکمل'),
    cancelled: tr(lang, 'Cancelled', 'منسوخ'),
  };

  const handleTransition = async (id: string, nextStatus: string) => {
    setBusyId(id);
    setErr(null);
    try {
      await apiRequest(`/api/partner/trips/${id}/transition`, {
        method: 'POST',
        role: 'partner',
        body: { nextStatus },
      });
      await onRefresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleRecordCash = async (id: string) => {
    setBusyId(id);
    setErr(null);
    try {
      await apiRequest(`/api/partner/trips/${id}/record-cash-payment`, {
        method: 'POST',
        role: 'partner',
      });
      await onRefresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5 w-full min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="font-display text-2xl font-bold text-[#0D0D10]">
            {tr(lang, 'My Trips', 'میرے ٹرپس')}
          </h2>
          <button
            type="button"
            onClick={onToggleGpsSharing}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
              gpsSharing
                ? 'bg-emerald-700 text-white border-emerald-700'
                : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            {gpsSharing
              ? tr(lang, 'Live GPS Sharing Active', 'لائیو جی پی ایس شیئرنگ فعال')
              : tr(lang, 'Share Live GPS', 'لائیو جی پی ایس شیئر کریں')}
          </button>
        </div>

        <div className="flex flex-wrap rounded-xl bg-zinc-100 p-1 gap-1 w-full sm:w-auto">
          {(['active', 'upcoming', 'completed', 'cancelled'] as const).map((tb) => (
            <button
              key={tb}
              type="button"
              onClick={() => setTab(tb)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
                tab === tb ? 'bg-[#0D0D10] text-white' : 'text-zinc-600'
              }`}
            >
              {tabLabels[tb]}
            </button>
          ))}
        </div>
      </div>

      {err && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2 text-xs text-red-700">{err}</div>}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
          {lang === 'ur' ? `کوئی ${tabLabels[tab]} ٹرپ موجود نہیں۔` : `No ${tab} trips found.`}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((trip) => {
            const action = nextStepMap[trip.status];
            return (
              <div key={trip.id} className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
                      <span className="font-bold text-[#0D0D10]">{trip.id}</span>
                      <span aria-hidden="true">·</span>
                      <span>{tr(lang, 'Passenger:', 'مسافر:')} {trip.passenger_name}</span>
                      <span aria-hidden="true">·</span>
                      <span className="uppercase font-bold text-[#B8860B]">
                        {trBookingStatus(lang, trip.status)}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-[#0D0D10] mt-1">
                      {trip.pickup_address} → {trip.dropoff_address}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {trip.pickup_date} {trip.pickup_time} · {trip.distance_km} km
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="font-mono text-lg font-bold text-[#0D0D10]">
                      Rs. {Number(trip.agreed_fare_pkr || trip.total_bill_pkr).toLocaleString()}
                    </div>
                    <div className="text-[11px] text-zinc-500 font-mono">
                      {tr(lang, 'Commission:', 'کمیشن:')} Rs. {Number(trip.commission_pkr).toLocaleString()} ·{' '}
                      {trPaymentStatus(lang, trip.payment_status)}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-zinc-100">
                  {action && (
                    <button
                      type="button"
                      disabled={busyId === trip.id}
                      onClick={() => handleTransition(trip.id, action.next)}
                      className="px-4 py-2 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold hover:bg-[#EAB308]"
                    >
                      {action.label}
                    </button>
                  )}
                  {trip.status === 'completed' && trip.payment_status !== 'PAID' && (
                    <button
                      type="button"
                      disabled={busyId === trip.id}
                      onClick={() => handleRecordCash(trip.id)}
                      className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800"
                    >
                      {tr(lang, 'Record Cash Payment Collected', 'نقد وصولی درج کریں')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => downloadBookingPdf(trip, 'partner', trip.passenger_name)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0D0D10] text-white text-xs font-semibold"
                  >
                    <Download className="w-3.5 h-3.5 text-[#D4A017]" />
                    {tr(lang, 'Trip PDF Invoice', 'ٹرپ پی ڈی ایف بل')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
