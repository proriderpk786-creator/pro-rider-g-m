import React, { useEffect, useState } from 'react';
import {
  Bell,
  Calendar,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Flame,
  Globe,
  Lock,
  LogOut,
  MapPin,
  Navigation,
  Radio,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  Volume2,
  VolumeX,
  Wallet as WalletIcon,
  X,
} from 'lucide-react';
import { InvoiceViewerModal } from '../../components/InvoiceViewerModal';
import { StreetMap, type MapFocusTarget } from '../../components/StreetMap';
import { ProfileThemeRowButton } from '../../components/ThemeSwitcher';
import { useToast } from '../../contexts/ToastContext';
import { formatVehicleLabel, tr, trBookingStatus, trPaymentStatus, trService } from '../../i18n/translations';
import { apiRequest, isBackendOfflineError } from '../../utils/api';
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

const PASSENGER_AVATARS = [
  '/assets/aistudio/1_85f0b054.jpeg',
  '/assets/aistudio/2_3bc3de51.jpeg',
  '/assets/aistudio/3_c134116d.jpeg',
  '/assets/aistudio/4_fddc1c76.jpeg',
  '/assets/aistudio/5_e28e3d3d.jpeg',
  '/assets/aistudio/6_cf0b27ac.jpeg',
  '/assets/aistudio/7_9ac1545a.jpeg',
  '/assets/aistudio/8_0bc58554.jpeg',
  '/assets/aistudio/9_8238dc78.jpeg',
  '/assets/aistudio/10_ae7e31c4.jpeg',
  '/assets/aistudio/11_d4d9cd9e.jpeg',
  '/assets/aistudio/12_d9881a32.jpeg',
];

function getPassengerAvatar(seed?: string): string {
  if (!seed) return PASSENGER_AVATARS[0];
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  const idx = Math.abs(h) % PASSENGER_AVATARS.length;
  return PASSENGER_AVATARS[idx];
}

type CategoryFilterKey = 'all' | 'instant' | 'pick_and_drop' | 'ride_sharing' | 'fuel_sharing';

export const PartnerRequestsView: React.FC<{
  lang?: Language;
  approved: boolean;
  profile: PartnerProfile;
  requests: Booking[];
  walletBalancePkr?: number;
  minRequiredWalletPkr?: number;
  instantCommissionPct?: number;
  demandData?: DemandMapData | null;
  zones?: ServiceZone[];
  bellSound: RideBellSoundId;
  onChangeBellSound: (sound: RideBellSoundId) => void;
  onTestBell: () => void;
  incomingRideNotice?: Booking | null;
  onDismissIncomingNotice?: () => void;
  onRefresh: () => Promise<void>;
  onGoToDocs: () => void;
  onGoToWallet?: () => void;
  onToggleOnline?: () => Promise<void> | void;
  onChangeLang?: (l: Language) => void;
  onLogout?: () => void;
}> = ({
  lang = 'en',
  approved,
  profile,
  requests,
  walletBalancePkr = 0,
  minRequiredWalletPkr = 500,
  instantCommissionPct = 15,
  demandData = null,
  zones = [],
  bellSound,
  onChangeBellSound,
  onTestBell,
  incomingRideNotice = null,
  onDismissIncomingNotice,
  onRefresh,
  onGoToDocs,
  onGoToWallet,
  onToggleOnline,
  onChangeLang,
  onLogout,
}) => {
  const [detailsRequest, setDetailsRequest] = useState<Booking | null>(null);
  const [heatmapModalOpen, setHeatmapModalOpen] = useState(false);
  const [bellMenuOpen, setBellMenuOpen] = useState(false);
  const [previewRoute, setPreviewRoute] = useState<RouteResult | null>(null);
  const [focusTarget, setFocusTarget] = useState<MapFocusTarget | null>(null);
  const toast = useToast();
  const [offerDrafts, setOfferDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [locallySkippedIds, setLocallySkippedIds] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterKey>('all');
  const categoryScrollRef = React.useRef<HTMLDivElement | null>(null);
  const [driverGps, setDriverGps] = useState<{ lat: number; lng: number } | null>(() =>
    profile.current_lat && profile.current_lng
      ? { lat: profile.current_lat, lng: profile.current_lng }
      : null
  );

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

  const visibleRequests = React.useMemo(() => {
    const seen = new Set<string>();
    const list: Booking[] = [];
    for (const r of requests) {
      if (!r?.id || seen.has(r.id) || locallySkippedIds.includes(r.id)) continue;
      seen.add(r.id);
      list.push(r);
    }
    return list.sort((a, b) => {
      if (Boolean(a.is_priority_for_me) !== Boolean(b.is_priority_for_me)) {
        return a.is_priority_for_me ? -1 : 1;
      }
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
  }, [requests, locallySkippedIds]);

  const categoryCounts = React.useMemo(() => {
    const counts = { all: 0, instant: 0, pick_and_drop: 0, ride_sharing: 0, fuel_sharing: 0 };
    for (const r of visibleRequests) {
      counts.all += 1;
      if (r.booking_mode === 'go_now') counts.instant += 1;
      else if (r.service_type === 'pick_and_drop') counts.pick_and_drop += 1;
      else if (r.service_type === 'ride_sharing') counts.ride_sharing += 1;
      else if (r.service_type === 'fuel_sharing') counts.fuel_sharing += 1;
    }
    return counts;
  }, [visibleRequests]);

  const filteredRequests = React.useMemo(() => {
    if (categoryFilter === 'all') return visibleRequests;
    if (categoryFilter === 'instant') return visibleRequests.filter((r) => r.booking_mode === 'go_now');
    return visibleRequests.filter((r) => r.booking_mode === 'schedule' && r.service_type === categoryFilter);
  }, [visibleRequests, categoryFilter]);

  const handleAccept = async (bookingId: string) => {
    if (!approved) {
      toast.warning(
        lang === 'ur'
          ? 'رائیڈ قبول کرنے کے لیے ڈاکومنٹس کی تصدیق لازمی ہے۔ آپ کو ڈاکومنٹس پیج پر لے جایا جا رہا ہے...'
          : 'Document verification is required to accept rides. Redirecting you to complete your documents...'
      );
      onGoToDocs();
      return;
    }
    setBusyId(bookingId);
    try {
      const res = await apiRequest<{
        confirmed?: boolean;
        applied?: boolean;
        alreadyApplied?: boolean;
        awaitingAdminApproval?: boolean;
        commissionDeductedPkr?: number;
        availableBalancePkr?: number;
      }>(`/api/partner/requests/${bookingId}/accept`, {
        method: 'POST',
        role: 'partner',
      });
      setDetailsRequest(null);
      onDismissIncomingNotice?.();
      if (res.confirmed) {
        toast.success(
          tr(
            lang,
            `Instant Booking ${bookingId} confirmed!${res.commissionDeductedPkr ? ` Commission Rs. ${res.commissionDeductedPkr.toLocaleString()} deducted.` : ''} Open My Trips to head to pickup.`,
            `فوری رائیڈ ${bookingId} کنفرم ہو گئی!${res.commissionDeductedPkr ? ` کمیشن ${res.commissionDeductedPkr.toLocaleString()} روپے کٹ گئے۔` : ''} ٹرپ شروع کرنے کے لیے مائی ٹرپس کھولیں۔`
          )
        );
      } else if (res.applied || res.awaitingAdminApproval) {
        toast.success(
          tr(
            lang,
            `Application sent to Admin for ${bookingId}. Your phone & vehicle details are queued for Admin approval.`,
            `ماہانہ بُکنگ ${bookingId} کے لیے آپ کی درخواست اور نمبر ایڈمن کو بھیج دیا گیا ہے۔ ایڈمن کی منظوری کا انتظار کریں۔`
          )
        );
      }
      await onRefresh();
    } catch (err: any) {
      if (isBackendOfflineError(err)) {
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k || !k.startsWith('pr_local_bookings_passenger')) continue;
            const raw = localStorage.getItem(k);
            if (!raw) continue;
            const parsed = JSON.parse(raw) as Booking[];
            if (Array.isArray(parsed)) {
              const updated = parsed.map((b) => {
                if (b.id === bookingId) {
                  const isSchedule = b.booking_mode === 'schedule' || ['pick_and_drop', 'ride_sharing', 'fuel_sharing'].includes(b.service_type);
                  if (isSchedule) {
                    toast.success(tr(lang, 'Application submitted for Super Admin review.', 'ماہانہ بکنگ کی درخواست سپر ایڈمن کو بھیج دی گئی ہے۔'));
                    return b;
                  }
                  toast.success(tr(lang, `Booking ${bookingId} confirmed!`, `بُکنگ ${bookingId} کنفرم ہو گئی!`));
                  return { ...b, status: 'confirmed' as const, partner_id: profile.user_id };
                }
                return b;
              });
              localStorage.setItem(k, JSON.stringify(updated));
            }
          }
          setDetailsRequest(null);
          onDismissIncomingNotice?.();
          await onRefresh();
          return;
        } catch {
          // ignore localStorage errors
        }
      }
      toast.error(err.message || tr(lang, 'Could not accept ride request.', 'رائیڈ قبول نہیں ہو سکی۔'));
      if (err?.status === 403) onGoToDocs();
    } finally {
      setBusyId(null);
    }
  };

  const handleCounter = async (bookingId: string) => {
    if (!approved) {
      toast.warning(
        lang === 'ur'
          ? 'آفر بھیجنے کے لیے ڈاکومنٹس کی تصدیق ضروری ہے۔'
          : 'Document verification is required to send fare offers. Please upload your documents first.'
      );
      onGoToDocs();
      return;
    }
    const amt = Number(offerDrafts[bookingId]);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.warning(tr(lang, 'Please enter a valid fare offer amount.', 'براہ کرم درست کرایہ رقم درج کریں۔'));
      return;
    }
    setBusyId(bookingId);
    try {
      await apiRequest(`/api/partner/requests/${bookingId}/offer`, {
        method: 'POST',
        role: 'partner',
        body: { amountPkr: amt },
      });
      toast.success(tr(lang, `Fare offer of Rs. ${amt.toLocaleString()} sent to passenger.`, `Rs. ${amt.toLocaleString()} کی آفر مسافر کو بھیج دی گئی۔`));
      await onRefresh();
    } catch (err: any) {
      toast.error(err.message || tr(lang, 'Could not send fare offer.', 'آفر نہیں بھیجی جا سکی۔'));
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
      toast.info(tr(lang, 'Ride request skipped.', 'رائیڈ کی درخواست ہٹا دی گئی۔'));
      await onRefresh();
    } catch {
      toast.info(tr(lang, 'Ride request dismissed.', 'رائیڈ کی درخواست ہٹا دی گئی۔'));
    } finally {
      setBusyId(null);
    }
  };

  const topHotspots = Array.isArray(demandData?.hotspots)
    ? demandData.hotspots.filter((h): h is NonNullable<typeof h> => Boolean(h))
    : [];
  const sortedHotspots = [...topHotspots].sort(
    (a, b) => (b.demandScore || 0) + (b.openRequests || 0) * 12 - ((a.demandScore || 0) + (a.openRequests || 0) * 12)
  );
  const hottestZone = sortedHotspots[0] || null;
  const peakHeatScore = hottestZone ? (hottestZone.demandScore || 0) + (hottestZone.openRequests || 0) * 10 : 0;

  const detailsPickupDistance =
    detailsRequest && driverGps
      ? haversineDistanceKm(driverGps.lat, driverGps.lng, detailsRequest.pickup_lat, detailsRequest.pickup_lng).toFixed(1)
      : null;

  const walletEligibleForInstant = walletBalancePkr >= minRequiredWalletPkr;

  return (
    <div className="relative flex flex-col w-full min-w-0 overflow-x-clip space-y-2 pt-0.5 pb-6 max-w-xl mx-auto">
      {/* 1. Compact Header (~35-40% smaller): Circular PR Logo + Slim Single-Line Auto Online Bar */}
      <div className="flex items-center gap-2 w-full">
        <div className="w-8 h-8 rounded-full bg-[#0D0D10] border border-[#D4A017] p-0.5 flex items-center justify-center shrink-0 shadow-xs">
          <img
            src="/assets/aistudio/pmg_3_88102afb.png"
            alt="PRO RIDER"
            className="w-full h-full object-contain"
          />
        </div>

        <div className="flex-1 rounded-full bg-[#FAF6EC] border border-[#D4A017]/80 px-2.5 py-1 flex items-center justify-between gap-1.5 shadow-2xs min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-5 h-5 rounded-full bg-white border border-[#D4A017]/60 flex items-center justify-center text-[#9E730B] shrink-0">
              <Calendar className="w-3 h-3" />
            </div>
            <span className="text-[11px] font-black text-[#0D0D10] tracking-tight truncate">
              {lang === 'ur' ? 'آن لائن' : 'Auto Online'}
            </span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[8.5px] font-black uppercase leading-none shrink-0 ${
                profile.is_online
                  ? 'bg-emerald-500/20 text-emerald-800 border border-emerald-400'
                  : 'bg-zinc-200 text-zinc-600'
              }`}
            >
              {profile.is_online ? (lang === 'ur' ? 'ON •' : 'ON •') : 'OFF'}
            </span>
          </div>

          <span className="text-[9px] font-bold text-zinc-600 hidden xs:inline truncate px-1">
            8am–10pm
          </span>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[9.5px] font-extrabold text-[#0D0D10]">
              {lang === 'ur' ? 'مینول' : 'Manual'}
            </span>
            <button
              type="button"
              onClick={onToggleOnline}
              className={`relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                profile.is_online ? 'bg-[#D4A017]' : 'bg-zinc-300'
              }`}
              role="switch"
              aria-checked={Boolean(profile.is_online)}
            >
              <span
                className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  profile.is_online ? 'translate-x-3.5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Compact Action Pills Row (Mobile Only; desktop already shows Sidebar & Header) */}
      <div className="grid grid-cols-4 gap-1.5 w-full md:hidden">
        <button
          type="button"
          onClick={onGoToDocs}
          className="h-7 px-1.5 rounded-full border border-[#D4A017]/80 bg-white hover:bg-amber-50/50 flex items-center justify-center gap-1 shadow-2xs transition-all min-w-0"
        >
          {approved ? (
            <>
              <ShieldCheck className="w-3 h-3 text-emerald-600 shrink-0" />
              <span className="text-[10px] font-extrabold text-[#0D0D10] truncate">
                {lang === 'ur' ? 'تصدیق' : 'Verified'}
              </span>
            </>
          ) : (
            <>
              <Lock className="w-3 h-3 text-amber-700 shrink-0" />
              <span className="text-[10px] font-extrabold text-[#0D0D10] truncate">
                {lang === 'ur' ? 'دستاویز' : 'Docs'}
              </span>
            </>
          )}
        </button>

        <ProfileThemeRowButton lang={lang} headerCompact pillStyle />

        <button
          type="button"
          onClick={() => onChangeLang?.(lang === 'ur' ? 'en' : 'ur')}
          className="h-7 px-1.5 rounded-full border border-[#D4A017]/80 bg-white hover:bg-amber-50/50 flex items-center justify-center gap-1 shadow-2xs transition-all min-w-0"
        >
          <Globe className="w-3 h-3 text-zinc-700 shrink-0" />
          <span className="text-[10px] font-extrabold text-[#0D0D10] truncate">
            EN <span className="font-normal font-sans">اردو</span>
          </span>
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="h-7 px-1.5 rounded-full border border-[#D4A017]/80 bg-white hover:bg-red-50 flex items-center justify-center gap-1 shadow-2xs transition-all min-w-0"
        >
          <LogOut className="w-3 h-3 text-red-600 shrink-0" />
          <span className="text-[10px] font-extrabold text-[#0D0D10] truncate">
            {lang === 'ur' ? 'لاگ آؤٹ' : 'Logout'}
          </span>
        </button>
      </div>

      {/* 3. Compact Dispatch Ribbon Ticker */}
      <div className="w-full rounded-xl bg-[#FAF6EC] border border-[#D4A017]/70 px-2.5 py-1.5 flex items-center justify-between gap-2 shadow-2xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <Car className="w-3.5 h-3.5 text-[#9E730B] shrink-0" />
          <p className="text-[9.5px] sm:text-[10.5px] font-bold text-[#0D0D10] truncate">
            <span className="font-extrabold uppercase tracking-wider text-[#9E730B]">DISPATCH</span>
            {' • '}
            <span>{profile.vehicle_name || tr(lang, 'Verified Fleet', 'فلیٹ گاڑی')}</span>
            {' • '}
            <span>{profile.operating_city || 'Islamabad'}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={onGoToWallet}
          className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[#0D0D10] hover:text-[#9E730B] shrink-0 whitespace-nowrap pl-2 border-l border-[#D4A017]/40"
        >
          <span>Rs. {Number(walletBalancePkr).toLocaleString()}</span>
          <span className="text-[#9E730B] font-extrabold text-[9.5px] uppercase">
            {tr(lang, 'Top Up', 'ریچارج')}
          </span>
        </button>
      </div>

      {/* 4. Compact Single-Line Horizontal Category Pills (~35-40% smaller) with Visible Scrollbar & Arrow Indicators */}
      <div className="relative flex items-center gap-1 w-full">
        <button
          type="button"
          onClick={() => categoryScrollRef.current?.scrollBy({ left: -120, behavior: 'smooth' })}
          aria-label="Scroll categories left"
          className="h-6 w-5 rounded-full border border-[#D4A017]/60 bg-white/90 text-[#9E730B] flex items-center justify-center shrink-0 hover:bg-amber-50 shadow-2xs"
        >
          <ChevronLeft className="w-3 h-3" />
        </button>

        <div
          ref={categoryScrollRef}
          className="flex-1 min-w-0 overflow-x-auto pr-category-scroll pb-1.5 pt-0.5"
        >
          <div className="flex flex-nowrap items-center gap-1.5 min-w-max">
            {[
              { key: 'all' as CategoryFilterKey, en: 'All', ur: 'تمام', count: categoryCounts.all },
              { key: 'instant' as CategoryFilterKey, en: 'Instant', ur: 'انسٹنٹ', count: categoryCounts.instant },
              { key: 'pick_and_drop' as CategoryFilterKey, en: 'Pick & Drop', ur: 'پک اینڈ ڈراپ', count: categoryCounts.pick_and_drop },
              { key: 'ride_sharing' as CategoryFilterKey, en: 'Ride Share', ur: 'رائیڈ شیئر', count: categoryCounts.ride_sharing },
              { key: 'fuel_sharing' as CategoryFilterKey, en: 'Fuel Share', ur: 'فیول شیئر', count: categoryCounts.fuel_sharing },
            ].map((cat) => {
              const active = categoryFilter === cat.key;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setCategoryFilter(cat.key)}
                  className={`h-6.5 px-2.5 py-0.5 rounded-full border text-[10px] font-bold inline-flex items-center gap-1 transition-all shrink-0 whitespace-nowrap ${
                    active
                      ? 'bg-[#0D0D10] border-[#D4A017] text-[#F4C430] shadow-2xs'
                      : 'bg-white border-[#D4A017]/70 text-[#0D0D10] hover:bg-amber-50/40'
                  }`}
                >
                  <span>{tr(lang, cat.en, cat.ur)}</span>
                  <span
                    className={`font-mono text-[9.5px] font-extrabold leading-none ${
                      active ? 'text-[#F4C430]' : 'text-[#9E730B]'
                    }`}
                  >
                    {cat.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => categoryScrollRef.current?.scrollBy({ left: 120, behavior: 'smooth' })}
          aria-label="Scroll categories right"
          className="h-6 w-5 rounded-full border border-[#D4A017]/60 bg-white/90 text-[#9E730B] flex items-center justify-center shrink-0 hover:bg-amber-50 shadow-2xs"
        >
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {/* 5. Section Title: ✨ NEW RIDE REQUESTS (Left) + View All > (Right) */}
      <div className="flex items-center justify-between pt-1 px-1">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#D4A017]" />
          <h2 className="font-display text-sm sm:text-base font-black tracking-tight text-[#0D0D10] uppercase">
            {lang === 'ur' ? 'نئی رائیڈ درخواستیں' : 'NEW RIDE REQUESTS'}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setCategoryFilter('all')}
          className="text-xs font-bold text-zinc-600 hover:text-[#0D0D10] flex items-center gap-0.5"
        >
          <span>{lang === 'ur' ? 'تمام دیکھیں' : 'View All'}</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 6. Feed of Ride Request Cards */}
      <div className="space-y-4 w-full">
        {filteredRequests.length === 0 ? (
          <div className="rounded-3xl border-2 border-[#D4A017]/70 bg-white overflow-hidden shadow-sm p-6 text-center space-y-4">
            <div className="relative w-36 h-36 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-2 border-[#D4A017]/25" />
              <div className="absolute inset-4 rounded-full border border-[#D4A017]/45" />
              <div className="absolute inset-8 rounded-full border border-dashed border-[#D4A017]/60" />
              <div
                className="absolute inset-1 rounded-full animate-spin"
                style={{
                  animationDuration: '3.2s',
                  background:
                    'conic-gradient(from 0deg, rgba(212,160,23,0.45) 0deg, rgba(212,160,23,0.08) 58deg, transparent 90deg, transparent 360deg)',
                }}
              />
              <div className="relative z-10 w-14 h-14 rounded-full bg-[#0D0D10] border-2 border-[#F4C430] flex items-center justify-center text-[#F4C430] shadow-md">
                <Car className="w-6 h-6" />
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="font-display text-base font-black text-[#0D0D10]">
                {categoryFilter === 'all'
                  ? tr(lang, 'Scanning for New Passenger Rides', 'نئی مسافر رائیڈز تلاش کی جا رہی ہیں')
                  : tr(lang, 'No Requests in This Category', 'اس کیٹگری میں فی الحال کوئی رائیڈ نہیں')}
              </h3>
              <p className="text-xs text-zinc-600">
                {lang === 'ur'
                  ? 'جیسے ہی کوئی مسافر بکنگ کرے گا، رائیڈ سب سے اوپر ظاہر ہوگی۔'
                  : 'New incoming passenger requests will arrive at the top automatically.'}
              </p>
            </div>
          </div>
        ) : (
          filteredRequests.map((ride) => {
            const isInstant = ride.booking_mode === 'go_now';
            const isMonthly = !isInstant;
            const alreadyApplied = isMonthly && ride.my_application?.status === 'pending';
            const etaMinutes = ride.duration_min || 6;
            const timingText = isInstant
              ? tr(lang, `Immediate · ~${etaMinutes} min`, `فوری روانگی · ~${etaMinutes} منٹ`)
              : `${ride.pickup_date || tr(lang, 'Scheduled', 'طے شدہ')} · ${ride.pickup_time || tr(lang, 'Flexible', 'مقررہ وقت')}`;

            const categoryTagLabel = isInstant
              ? tr(lang, 'INSTANT BOOKING', 'انسٹنٹ بکنگ')
              : ride.service_type === 'pick_and_drop'
              ? tr(lang, 'PICK & DROP', 'پک اینڈ ڈراپ')
              : ride.service_type === 'ride_sharing'
              ? tr(lang, 'RIDE SHARING', 'رائیڈ شیئرنگ')
              : tr(lang, 'FUEL SHARING', 'فیول شیئرنگ');

            return (
              <div
                key={ride.id}
                className="rounded-2xl border-2 border-amber-300/80 bg-white p-4 sm:p-5 shadow-[0_6px_18px_rgba(212,160,23,0.1)] space-y-3 transition-all"
              >
                {/* Top Row: Category Label + Proposed Fare */}
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-zinc-100">
                  <span className="text-[11px] font-extrabold tracking-wider uppercase text-[#8C6200]">
                    {categoryTagLabel}
                  </span>

                  <div className="font-display text-lg sm:text-xl font-black text-[#0D0D10] tracking-tight tabular-nums">
                    Rs. {Number(ride.proposed_fare_pkr).toLocaleString()}
                  </div>
                </div>

                {/* Essentials Only: Pickup, Drop-off & Timing */}
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-start gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-600 mt-1 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="font-extrabold text-emerald-800 text-[11px] block leading-none mb-0.5">
                        {tr(lang, 'Pickup Point', 'پِک اپ مقام')}
                      </span>
                      <p dir="auto" className="text-xs sm:text-sm font-bold text-[#0D0D10] leading-snug line-clamp-1">
                        {ride.pickup_address}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-600 mt-1 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="font-extrabold text-red-700 text-[11px] block leading-none mb-0.5">
                        {tr(lang, 'Drop-off Point', 'ڈراپ آف مقام')}
                      </span>
                      <p dir="auto" className="text-xs sm:text-sm font-bold text-[#0D0D10] leading-snug line-clamp-1">
                        {ride.dropoff_address}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 text-xs font-bold text-zinc-700">
                    <span>
                      {tr(lang, 'Timing:', 'وقت:')} <strong className="text-[#0D0D10]">{timingText}</strong>
                    </span>
                  </div>
                </div>

                {/* Bottom Row: Decline | View Details | Accept */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busyId === ride.id}
                    onClick={() => handleCancelDecline(ride.id)}
                    className="min-h-[42px] py-2 px-2.5 rounded-xl border border-zinc-300 bg-white hover:bg-red-50 text-[#0D0D10] text-xs font-extrabold flex items-center justify-center gap-1 disabled:opacity-60 transition-all whitespace-nowrap"
                  >
                    <X className="w-3.5 h-3.5 text-red-600 shrink-0" />
                    <span>{lang === 'ur' ? 'رد کریں' : 'Decline'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDetailsRequest(ride)}
                    className="min-h-[42px] py-2 px-2.5 rounded-xl border border-[#D4A017] bg-amber-50/50 hover:bg-amber-50 text-[#0D0D10] text-xs font-extrabold flex items-center justify-center gap-1 transition-all whitespace-nowrap"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#8C6200] shrink-0" />
                    <span>{lang === 'ur' ? 'مکمل تفصیل' : 'View Details'}</span>
                  </button>

                  {alreadyApplied ? (
                    <button
                      type="button"
                      disabled
                      className="min-h-[42px] py-2 px-2.5 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 text-xs font-extrabold flex items-center justify-center gap-1 whitespace-nowrap"
                    >
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>{lang === 'ur' ? 'درخواست جمع' : 'Applied'}</span>
                    </button>
                  ) : !walletEligibleForInstant && isInstant && onGoToWallet ? (
                    <button
                      type="button"
                      onClick={onGoToWallet}
                      className="min-h-[42px] py-2 px-2.5 rounded-xl bg-amber-500 text-[#0D0D10] text-xs font-extrabold flex items-center justify-center gap-1 whitespace-nowrap"
                    >
                      <WalletIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>{lang === 'ur' ? 'والیٹ بھریں' : 'Top Up'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === ride.id}
                      onClick={() => handleAccept(ride.id)}
                      className="min-h-[42px] py-2 px-2.5 rounded-xl bg-[#0D0D10] text-[#F4C430] border border-[#D4A017] hover:brightness-110 active:scale-98 text-xs font-extrabold flex items-center justify-center gap-1 shadow-xs disabled:opacity-60 transition-all whitespace-nowrap"
                    >
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{lang === 'ur' ? 'قبول کریں' : 'Accept'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 7. Floating Bottom-Right Concentric Gold Radar Button with Surge Badge */}
      <div className="fixed bottom-20 right-4 sm:bottom-8 sm:right-8 z-40 pointer-events-auto">
        <button
          type="button"
          onClick={() => {
            setHeatmapModalOpen(true);
            if (hottestZone) {
              setFocusTarget({ lat: hottestZone.lat, lng: hottestZone.lng, zoom: 13, ts: Date.now() });
            }
          }}
          className="relative group p-2 flex items-center justify-center focus:outline-hidden"
          aria-label={lang === 'ur' ? 'ہیٹ میپ اور سرج دیکھیں' : 'View Heatmap & Surge'}
        >
          {/* Concentric golden pulse rings matching reference image */}
          <div className="absolute inset-0 rounded-full border border-[#D4A017]/30 animate-ping opacity-60" />
          <div className="absolute -inset-1 rounded-full border border-[#D4A017]/40" />
          <div className="absolute -inset-2.5 rounded-full border border-[#D4A017]/25" />
          <div className="absolute -inset-4 rounded-full border border-dashed border-[#D4A017]/20" />

          <div className="relative w-16 h-16 rounded-full bg-gradient-to-b from-[#1E1708] via-[#0D0D10] to-[#2B2107] border-2 border-[#F4C430] shadow-[0_8px_25px_rgba(212,160,23,0.45)] flex items-center justify-center text-[#F4C430] active:scale-95 transition-transform">
            <Car className="w-7 h-7 text-[#F4C430]" />

            {/* Surge Badge */}
            <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-[#D4A017] text-[#0D0D10] text-[10px] font-black tracking-tight flex items-center gap-0.5 shadow-sm">
              <span>⚡</span>
              <span>{hottestZone ? `${hottestZone.surgeMultiplier.toFixed(1)}x` : '1.4x'}</span>
            </span>
          </div>
        </button>
      </div>

      {/* Ride Details & Map Modal */}
      {detailsRequest && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl bg-white border border-zinc-200 shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
            <div className="bg-[#0D0D10] text-white px-4 sm:px-5 py-3.5 flex items-center justify-between gap-2 shrink-0 border-b border-[#D4A017]/50">
              <div className="min-w-0">
                <p className="text-[11px] font-mono text-[#D4A017] font-bold">{detailsRequest.id}</p>
                <h3 className="font-display text-sm sm:text-base font-bold truncate">
                  {lang === 'ur' ? 'رائیڈ کی مکمل تفصیل اور روٹ' : 'Full Ride Details & Route Map'}
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

              <div className="rounded-2xl border border-zinc-200 p-3.5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-zinc-100">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={getPassengerAvatar(detailsRequest.passenger_id || detailsRequest.passenger_name || detailsRequest.id)}
                      alt={detailsRequest.passenger_display || 'Passenger'}
                      className="w-9 h-9 rounded-full object-cover ring-2 ring-[#D4A017] shrink-0"
                    />
                    <div className="min-w-0">
                      <strong className="text-sm font-extrabold text-[#0D0D10] block truncate">
                        {detailsRequest.passenger_display || detailsRequest.passenger_name}
                      </strong>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-600">
                        <Star className="w-3 h-3 fill-[#D4A017] text-[#D4A017]" />
                        {(detailsRequest as any).passenger_rating || '4.80'} · {trService(lang, detailsRequest.service_type)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono font-bold text-[#0D0D10] block">
                      {detailsRequest.pickup_date || tr(lang, 'Immediate', 'فوری')} · {detailsRequest.pickup_time || tr(lang, 'Now', 'ابھی')}
                    </span>
                    <span className="text-[10px] font-bold text-zinc-500">
                      {detailsRequest.booking_mode === 'go_now'
                        ? tr(lang, 'Instant Dispatch', 'فوری روانگی')
                        : detailsRequest.return_journey
                        ? tr(lang, 'Two-Way Commute', 'آنا جانا')
                        : tr(lang, 'One-Way Commute', 'یک طرفہ')}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-emerald-700 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[10px] font-bold text-emerald-800 block">{tr(lang, 'Pickup', 'پِک اپ')}</span>
                    <span className="font-semibold text-[#0D0D10]">{detailsRequest.pickup_address}</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Navigation className="w-3.5 h-3.5 text-red-600 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[10px] font-bold text-red-700 block">{tr(lang, 'Drop-off', 'منزل')}</span>
                    <span className="font-semibold text-[#0D0D10]">{detailsRequest.dropoff_address}</span>
                  </div>
                </div>
                {detailsRequest.notes && (
                  <p className="text-[11px] font-semibold text-zinc-600 pt-1.5 border-t border-zinc-100">
                    {tr(lang, 'Passenger Note:', 'مسافر کی ہدایت:')} {detailsRequest.notes}
                  </p>
                )}
              </div>

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
                  className="px-4 py-2.5 rounded-xl bg-[#0D0D10] text-[#F4C430] border border-[#D4A017] text-xs font-bold hover:bg-zinc-800 whitespace-nowrap shrink-0"
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
                className="py-3 px-4 rounded-2xl bg-gradient-to-r from-[#0D0D10] to-[#201A09] text-[#F4C430] border border-[#D4A017] text-xs font-bold hover:brightness-110 flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4 text-emerald-400" />
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

      {/* Live Demand Heatmap Modal */}
      {heatmapModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-3xl rounded-t-3xl sm:rounded-3xl bg-white border border-zinc-200 shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
            <div className="bg-[#0D0D10] text-white px-4 sm:px-5 py-3.5 flex items-center justify-between gap-2 shrink-0 border-b border-[#D4A017]/50">
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
                            {hs?.city || 'Islamabad'} · {hs?.openRequests ?? 0} {tr(lang, 'open', 'اوپن')} · {hs?.activeBookings ?? 0}{' '}
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
  const toast = useToast();
  const [tab, setTab] = useState<'active' | 'upcoming' | 'completed' | 'cancelled'>('active');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [invoiceBooking, setInvoiceBooking] = useState<Booking | null>(null);

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
    try {
      await apiRequest(`/api/partner/trips/${id}/transition`, {
        method: 'POST',
        role: 'partner',
        body: { nextStatus },
      });
      toast.success(
        tr(
          lang,
          `Trip status updated to ${trBookingStatus('en', nextStatus)}.`,
          `ٹرپ اسٹیٹس "${trBookingStatus('ur', nextStatus)}" اپڈیٹ ہو گیا۔`
        )
      );
      await onRefresh();
    } catch (e: any) {
      toast.error(e?.message || tr(lang, 'Could not update trip status.', 'ٹرپ اسٹیٹس اپڈیٹ نہیں ہو سکا۔'));
    } finally {
      setBusyId(null);
    }
  };

  const handleRecordCash = async (id: string) => {
    setBusyId(id);
    try {
      await apiRequest(`/api/partner/trips/${id}/record-cash-payment`, {
        method: 'POST',
        role: 'partner',
      });
      toast.success(tr(lang, 'Cash payment recorded cleanly.', 'نقد ادائیگی کامیابی سے درج ہو گئی۔'));
      await onRefresh();
    } catch (e: any) {
      toast.error(e?.message || tr(lang, 'Could not record cash payment.', 'نقد ادائیگی درج نہیں ہو سکی۔'));
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

        <div className="w-full border-b border-zinc-200">
          <div className="grid grid-cols-4 gap-1">
            {(['active', 'upcoming', 'completed', 'cancelled'] as const).map((tb) => {
              const count = trips.filter((tItem) => {
                if (tb === 'upcoming') return tItem.booking_mode === 'schedule' && tItem.status === 'confirmed';
                if (tb === 'active') return ['confirmed', 'on_the_way', 'arrived', 'started'].includes(tItem.status);
                if (tb === 'completed') return tItem.status === 'completed';
                return tItem.status === 'cancelled';
              }).length;
              const isSelected = tab === tb;
              return (
                <button
                  key={tb}
                  type="button"
                  onClick={() => setTab(tb)}
                  className={`relative pb-3 pt-2 px-1 text-[11px] sm:text-xs font-semibold inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors ${
                    isSelected ? 'text-[#0D0D10] font-bold' : 'text-zinc-500 hover:text-[#0D0D10]'
                  }`}
                >
                  <span className="truncate">{tabLabels[tb]}</span>
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.5 rounded-full leading-none tabular-nums shrink-0 ${
                      isSelected ? 'bg-[#0D0D10] text-[#F4C430]' : 'bg-zinc-100 text-zinc-600'
                    }`}
                  >
                    {count}
                  </span>
                  {isSelected && <span className="absolute left-1 right-1 -bottom-[1px] h-[2.5px] rounded-full bg-[#D4A017]" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

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
                    onClick={() => setInvoiceBooking(trip)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200 bg-white text-[#0D0D10] text-xs font-bold hover:bg-zinc-50"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#D4A017]" />
                    {tr(lang, 'View Invoice', 'انوائس دیکھیں')}
                  </button>
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

      <InvoiceViewerModal
        booking={invoiceBooking}
        viewerRole="partner"
        passengerName={invoiceBooking?.passenger_name}
        lang={lang}
        onClose={() => setInvoiceBooking(null)}
      />
    </div>
  );
};
