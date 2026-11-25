import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  Download,
  Eye,
  FileText,
  HelpCircle,
  Lock,
  PhoneCall,
  Radio,
  RefreshCw,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Star,
  UserCheck,
  Volume2,
  VolumeX,
  Wallet as WalletIcon,
  X,
} from 'lucide-react';
import { InvoiceViewerModal } from '../../components/InvoiceViewerModal';
import { ShareTripStatusModal } from '../../components/ShareTripStatusModal';
import { tr, trBookingStatus, trPaymentStatus, trService } from '../../i18n/translations';
import { apiRequest } from '../../utils/api';
import { downloadBookingPdf, downloadWalletStatementPdf, shareBookingPdf } from '../../utils/pdfGenerator';
import {
  getSavedRideBellSound,
  playRideBell,
  RIDE_BELL_OPTIONS,
  saveRideBellSound,
  type RideBellSoundId,
} from '../../utils/rideBell';
import type {
  AppNotification,
  Booking,
  Language,
  SupportTicket,
  User,
  WalletTransaction,
} from '../../types';

function formatVehicleLabel(rawName: string | undefined, lang: Language): string {
  const clean = String(rawName || 'Economy').trim();
  if (!clean.includes('·')) return clean;
  const parts = clean.split('·').map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return clean;
  return lang === 'ur' ? parts[1] || parts[0] : parts[0];
}

export function isPendingBookingStatus(status?: string): boolean {
  const s = String(status || '').toLowerCase();
  return s === 'searching' || s === 'negotiating' || s === 'pending';
}

export function isActiveBookingStatus(status?: string): boolean {
  const s = String(status || '').toLowerCase();
  return ['confirmed', 'accepted', 'assigned', 'on_the_way', 'arrived', 'started', 'in_progress'].includes(s);
}

// Screen 12: My Bookings
export const PassengerBookingsView: React.FC<{
  bookings: Booking[];
  passengerName: string;
  lang?: Language;
  initialTab?: 'pending' | 'active' | 'completed' | 'cancelled';
  onRefresh: () => Promise<void>;
  onOpenSupport: (bookingId: string) => void;
}> = ({ bookings, passengerName, lang = 'en', initialTab, onRefresh, onOpenSupport }) => {
  const pendingList = bookings.filter((b) => isPendingBookingStatus(b.status));
  const activeList = bookings.filter((b) => isActiveBookingStatus(b.status));
  const completedList = bookings.filter((b) => String(b.status || '').toLowerCase() === 'completed');
  const cancelledList = bookings.filter((b) => String(b.status || '').toLowerCase() === 'cancelled');

  const [tab, setTab] = useState<'pending' | 'active' | 'completed' | 'cancelled'>(() => {
    if (initialTab) return initialTab;
    if (activeList.length > 0) return 'active';
    return 'pending';
  });
  const manualTabSelectedRef = useRef(Boolean(initialTab));
  const [refreshing, setRefreshing] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  useEffect(() => {
    if (initialTab) {
      setTab(initialTab);
      manualTabSelectedRef.current = true;
    }
  }, [initialTab]);

  useEffect(() => {
    if (!manualTabSelectedRef.current && activeList.length > 0 && pendingList.length === 0) {
      setTab('active');
    }
  }, [activeList.length, pendingList.length]);

  const [ratingTarget, setRatingTarget] = useState<string | null>(null);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');
  const [shareBooking, setShareBooking] = useState<Booking | null>(null);
  const [invoiceBooking, setInvoiceBooking] = useState<Booking | null>(null);
  const [driverPreview, setDriverPreview] = useState<{
    loading: boolean;
    error?: string;
    data?: any;
  } | null>(null);

  const openDriverPublicProfile = async (partnerId: string) => {
    setDriverPreview({ loading: true });
    try {
      const data = await apiRequest<any>(`/api/partners/${partnerId}/public-profile`);
      setDriverPreview({ loading: false, data });
    } catch (err: any) {
      setDriverPreview({
        loading: false,
        error: err?.message || tr(lang, 'Driver showcase not available offline.', 'آف لائن حالت میں ڈرائیور پروفائل دستیاب نہیں ہے۔'),
      });
    }
  };

  const filtered =
    tab === 'pending'
      ? pendingList
      : tab === 'active'
      ? activeList
      : tab === 'completed'
      ? completedList
      : cancelledList;

  const counts: Record<'pending' | 'active' | 'completed' | 'cancelled', number> = {
    pending: pendingList.length,
    active: activeList.length,
    completed: completedList.length,
    cancelled: cancelledList.length,
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const handleAcceptOffer = async (bookingId: string, offerId: string) => {
    setActionBusyId(offerId);
    setActionMsg(null);
    try {
      await apiRequest(`/api/passenger/bookings/${bookingId}/accept-offer`, {
        method: 'POST',
        role: 'passenger',
        body: { offerId },
      });
      await onRefresh();
      setTab('active');
      setActionMsg(tr(lang, 'Offer accepted! Your ride is now Active.', 'آفر قبول کر لی گئی! آپ کی رائیڈ اب ایکٹیو ٹیب میں ہے۔'));
    } catch (err: any) {
      setActionMsg(err?.message || 'Unable to accept offer.');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleRejectOffer = async (bookingId: string, offerId: string) => {
    setActionBusyId(offerId);
    try {
      await apiRequest(`/api/passenger/bookings/${bookingId}/reject-offer`, {
        method: 'POST',
        role: 'passenger',
        body: { offerId },
      });
      await onRefresh();
    } finally {
      setActionBusyId(null);
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    setActionBusyId(bookingId);
    setActionMsg(null);
    try {
      await apiRequest(`/api/passenger/bookings/${bookingId}/cancel`, {
        method: 'POST',
        role: 'passenger',
      });
      await onRefresh();
      setTab('cancelled');
    } catch (err: any) {
      setActionMsg(err?.message || 'Unable to cancel booking.');
    } finally {
      setActionBusyId(null);
    }
  };

  const submitRating = async (bookingId: string) => {
    await apiRequest(`/api/passenger/bookings/${bookingId}/rate`, {
      method: 'POST',
      role: 'passenger',
      body: { rating: stars, comment },
    });
    setRatingTarget(null);
    setComment('');
    await onRefresh();
  };

  const tabLabels: Record<'pending' | 'active' | 'completed' | 'cancelled', string> = {
    pending: tr(lang, 'Pending', 'پینڈنگ'),
    active: tr(lang, 'Active', 'ایکٹیو'),
    completed: tr(lang, 'Completed', 'مکمل'),
    cancelled: tr(lang, 'Cancelled', 'منسوخ'),
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold text-[#0D0D10]">
          {tr(lang, 'My Bookings', 'میری بکنگز')}
        </h2>
        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 bg-white text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 shadow-2xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#D4A017]' : ''}`} />
          <span>{tr(lang, 'Refresh', 'ریفریش')}</span>
        </button>
      </div>

      {/* Single Clean 4-Tab Bar with Continuous Accent Bottom Line (No Duplicate Summary Cards) */}
      <div className="border-b border-zinc-200">
        <div className="grid grid-cols-4 gap-1">
          {(['pending', 'active', 'completed', 'cancelled'] as const).map((tb) => {
            const count = counts[tb];
            const isSelected = tab === tb;
            return (
              <button
                key={tb}
                type="button"
                onClick={() => {
                  manualTabSelectedRef.current = true;
                  setTab(tb);
                }}
                className={`relative pb-3 pt-2 px-1 text-[11px] sm:text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1 whitespace-nowrap ${
                  isSelected
                    ? 'text-[#0D0D10] font-bold'
                    : 'text-zinc-500 hover:text-[#0D0D10]'
                }`}
              >
                <span className="truncate">{tabLabels[tb]}</span>
                <span
                  className={`font-mono text-[10px] px-1.5 py-0.5 rounded-full leading-none tabular-nums shrink-0 ${
                    isSelected
                      ? tb === 'pending'
                        ? 'bg-amber-400 text-[#0D0D10]'
                        : tb === 'active'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-[#0D0D10] text-[#F4C430]'
                      : count > 0 && tb === 'pending'
                      ? 'bg-amber-100 text-amber-900'
                      : count > 0 && tb === 'active'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-zinc-100 text-zinc-600'
                  }`}
                >
                  {count}
                </span>
                {isSelected && (
                  <span className="absolute left-1 right-1 -bottom-[1px] h-[2.5px] rounded-full bg-[#D4A017]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {actionMsg && (
        <div className="rounded-xl bg-[#0D0D10] text-[#F4C430] px-4 py-2.5 text-xs font-semibold">
          {actionMsg}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center space-y-2.5">
          <Clock className="w-8 h-8 text-zinc-300 mx-auto" />
          <p className="text-sm font-semibold text-zinc-600">
            {tr(lang, `No ${tab} bookings found.`, `${tabLabels[tab]} بکنگز موجود نہیں ہیں۔`)}
          </p>
          {tab === 'pending' && activeList.length > 0 && (
            <button
              type="button"
              onClick={() => {
                manualTabSelectedRef.current = true;
                setTab('active');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
            >
              {tr(lang, `View ${activeList.length} Active Ride(s)`, `${activeList.length} ایکٹیو رائیڈ دیکھیں`)}
            </button>
          )}
          {tab === 'active' && pendingList.length > 0 && (
            <button
              type="button"
              onClick={() => {
                manualTabSelectedRef.current = true;
                setTab('pending');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-400 text-[#0D0D10] text-xs font-bold"
            >
              {tr(lang, `View ${pendingList.length} Pending Request(s)`, `${pendingList.length} پینڈنگ درخواستیں دیکھیں`)}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {filtered.map((b) => {
            const isPending = isPendingBookingStatus(b.status);
            const isActive = isActiveBookingStatus(b.status);
            const pendingOffers = (Array.isArray(b.offers) ? b.offers : []).filter(
              (o) => o.status === 'pending' && o.sender_role === 'partner'
            );
            const vehicleLabel = formatVehicleLabel(b.vehicle_category_name, lang);

            return (
              <div key={b.id} className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 space-y-3.5 shadow-xs">
                <div className="flex flex-wrap items-start justify-between gap-2.5">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
                      <span className="font-mono font-bold text-[#0D0D10] bg-zinc-100 px-2 py-0.5 rounded-md">
                        {b.id}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          isPending
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : isActive
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : b.status === 'completed'
                            ? 'bg-zinc-900 text-[#F4C430]'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {trBookingStatus(lang, b.status)}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-zinc-50 border border-zinc-200 text-zinc-700 font-semibold">
                        {b.booking_mode === 'go_now'
                          ? tr(lang, 'Instant Ride', 'فوری رائیڈ')
                          : trService(lang, b.service_type)}
                      </span>
                      {b.booking_mode === 'schedule' && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 font-bold text-[10px]">
                          {tr(lang, 'Monthly Package', 'ماہانہ پیکیج')}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-mono text-zinc-500 tabular-nums">
                      {b.pickup_date} · {b.pickup_time}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono text-lg sm:text-xl font-extrabold text-[#0D0D10] tabular-nums leading-none">
                      Rs. {Number(b.total_bill_pkr).toLocaleString()}
                    </div>
                    <div className="text-[10px] font-semibold text-zinc-500 mt-1">
                      {trPaymentStatus(lang, b.payment_status)} · {tr(lang, 'Paid', 'ادا شدہ')} Rs.{' '}
                      {Number(b.amount_paid_pkr).toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Clean Structured Pickup -> Drop-off Route Block */}
                <div className="rounded-xl bg-zinc-50/90 border border-zinc-200/80 p-3 space-y-2">
                  <div className="flex items-start gap-2.5 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 mt-1 shrink-0 ring-2 ring-emerald-200" />
                    <span className="font-semibold text-[#0D0D10] leading-snug">{b.pickup_address}</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600 mt-1 shrink-0 ring-2 ring-red-200" />
                    <span className="font-semibold text-[#0D0D10] leading-snug">{b.dropoff_address}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[#0D0D10]">{vehicleLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span dir="ltr" className="font-mono font-semibold tabular-nums">
                      {b.distance_km} km
                    </span>
                  </div>
                  {b.partner_name ? (
                    <span>
                      {tr(lang, 'Driver:', 'ڈرائیور:')}{' '}
                      <strong className="text-[#0D0D10]">{b.partner_name}</strong>
                    </span>
                  ) : isPending ? (
                    <span className="text-amber-700 font-semibold">
                      {b.booking_mode === 'schedule' && (b.total_applicants_count || 0) > 0
                        ? tr(
                            lang,
                            `${b.total_applicants_count} Pro Partner(s) Applied · Awaiting Admin Approval`,
                            `${b.total_applicants_count} ڈرائیورز نے اپلائی کیا · ایڈمن منظوری کا انتظار`
                          )
                        : tr(lang, 'Waiting for Pro Partner', 'ڈرائیور کی تصدیق کا انتظار')}
                    </span>
                  ) : null}
                </div>

                {/* Incoming Pro Partner Fare Offers on Pending Requests */}
                {isPending && pendingOffers.length > 0 && (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-2">
                    <p className="text-xs font-bold text-amber-900">
                      {tr(lang, 'Driver Fare Offer(s) Received:', 'ڈرائیور کی جانب سے کرایہ آفر موصول ہوئی:')}
                    </p>
                    {pendingOffers.map((offer) => (
                      <div key={offer.id} className="flex flex-wrap items-center justify-between gap-2 bg-white rounded-lg p-2.5 border border-amber-200">
                        <div className="text-xs">
                          <span className="font-bold text-[#0D0D10]">
                            {offer.partner_name || tr(lang, 'Pro Partner', 'پرو پارٹنر')}
                          </span>
                          {offer.partner_vehicle_name ? ` (${offer.partner_vehicle_name})` : ''} —{' '}
                          <strong className="font-mono text-emerald-700">Rs. {Number(offer.amount_pkr).toLocaleString()}</strong>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={actionBusyId === offer.id}
                            onClick={() => handleAcceptOffer(b.id, offer.id)}
                            className="px-3 py-1 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 disabled:opacity-50"
                          >
                            {tr(lang, 'Accept Offer', 'قبول کریں')}
                          </button>
                          <button
                            type="button"
                            disabled={actionBusyId === offer.id}
                            onClick={() => handleRejectOffer(b.id, offer.id)}
                            className="px-2.5 py-1 rounded-lg border border-zinc-200 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                          >
                            {tr(lang, 'Decline', 'مسترد')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={() => setShareBooking(b)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#D4A017] text-[#0D0D10] text-xs font-bold hover:bg-[#EAB308] transition-colors"
                    title={tr(lang, 'Share live trip route and ETA', 'لائیو روٹ اور آمد کا وقت شیئر کریں')}
                  >
                    <Radio className="w-3.5 h-3.5 text-[#0D0D10]" />
                    {tr(lang, 'Share Trip Status', 'سفر کا احوال شیئر کریں')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvoiceBooking(b)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 bg-white text-[#0D0D10] text-xs font-bold hover:bg-zinc-50"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#D4A017]" />
                    {tr(lang, 'View Invoice', 'انوائس دیکھیں')}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadBookingPdf(b, 'passenger', passengerName)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0D0D10] text-white text-xs font-semibold hover:bg-zinc-800"
                  >
                    <Download className="w-3.5 h-3.5 text-[#D4A017]" />
                    {tr(lang, 'Download PDF', 'پی ڈی ایف ڈاؤن لوڈ')}
                  </button>
                  <button
                    type="button"
                    onClick={() => shareBookingPdf(b, 'passenger', passengerName)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-semibold hover:bg-zinc-50"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    {tr(lang, 'Share Invoice', 'انوائس شیئر')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenSupport(b.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-semibold hover:bg-zinc-50"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    {tr(lang, 'Contact Support', 'سپورٹ سے رابطہ')}
                  </button>
                  {isPending && (
                    <button
                      type="button"
                      disabled={actionBusyId === b.id}
                      onClick={() => handleCancelBooking(b.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                      {tr(lang, 'Cancel Request', 'منسوخ کریں')}
                    </button>
                  )}
                  {b.partner_id && (
                    <button
                      type="button"
                      onClick={() => void openDriverPublicProfile(b.partner_id!)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 text-xs font-semibold hover:bg-zinc-100"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-[#D4A017]" />
                      {b.partner_name
                        ? `${b.partner_name} · ${tr(lang, 'Profile', 'پروفائل')}`
                        : tr(lang, 'Driver Profile', 'ڈرائیور پروفائل')}
                    </button>
                  )}
                  {b.status === 'completed' && !b.my_rating && (
                    <button
                      type="button"
                      onClick={() => setRatingTarget(b.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#D4A017] text-[#0D0D10] text-xs font-bold"
                    >
                      <Star className="w-3.5 h-3.5" />
                      {tr(lang, 'Rate Trip', 'ریٹنگ دیں')}
                    </button>
                  )}
                  {b.my_rating && (
                    <span className="text-xs font-semibold text-emerald-700 inline-flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                      {tr(lang, `Rated ${b.my_rating}/5`, `ریٹنگ ${b.my_rating}/5`)}
                    </span>
                  )}
                </div>

                {ratingTarget === b.id && (
                  <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 flex flex-wrap items-center gap-3">
                    <select
                      value={stars}
                      onChange={(e) => setStars(Number(e.target.value))}
                      className="px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-xs"
                    >
                      {[5, 4, 3, 2, 1].map((n) => (
                        <option key={n} value={n}>
                          {n} {tr(lang, 'Stars', 'اسٹارز')}
                        </option>
                      ))}
                    </select>
                    <input
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder={tr(lang, 'Share trip feedback...', 'سفر کے بارے میں اپنی رائے لکھیں...')}
                      className="flex-1 min-w-[180px] px-3 py-1.5 rounded-lg border border-zinc-200 bg-white text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => submitRating(b.id)}
                      className="px-3.5 py-1.5 rounded-lg bg-[#0D0D10] text-white text-xs font-semibold"
                    >
                      {tr(lang, 'Submit Rating', 'ریٹنگ جمع کریں')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ShareTripStatusModal
        isOpen={Boolean(shareBooking)}
        onClose={() => setShareBooking(null)}
        booking={shareBooking}
        passengerName={passengerName}
        lang={lang}
      />

      <InvoiceViewerModal
        booking={invoiceBooking}
        viewerRole="passenger"
        passengerName={passengerName}
        lang={lang}
        onClose={() => setInvoiceBooking(null)}
      />

      {driverPreview && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full max-h-[86vh] overflow-y-auto shadow-2xl border border-zinc-200">
            <div className="px-5 py-3.5 border-b border-zinc-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <span className="font-display font-bold text-sm text-[#0D0D10]">
                {tr(lang, 'Pro Partner Profile', 'پرو پارٹنر پروفائل')}
              </span>
              <button
                type="button"
                onClick={() => setDriverPreview(null)}
                className="p-1.5 rounded-lg hover:bg-zinc-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {driverPreview.loading ? (
              <div className="p-8 text-center text-xs text-zinc-500">
                {tr(lang, 'Loading Pro Partner profile...', 'ڈرائیور کی پروفائل لوڈ ہو رہی ہے...')}
              </div>
            ) : driverPreview.error ? (
              <div className="p-6 text-center text-xs text-red-700">{driverPreview.error}</div>
            ) : !driverPreview.data?.published ? (
              <div className="p-8 text-center space-y-2">
                <Lock className="w-9 h-9 text-[#D4A017] mx-auto" />
                <h4 className="font-display font-bold text-base text-[#0D0D10]">
                  {driverPreview.data?.full_name || tr(lang, 'Verified Driver', 'تصدیق شدہ ڈرائیور')}
                </h4>
                <p className="text-xs text-zinc-600">
                  {tr(
                    lang,
                    'This driver has set their public showcase photos to Private (Admin Verified).',
                    'اس ڈرائیور نے اپنی تصاویر پرائیویٹ رکھی ہوئی ہیں (ایڈمن سے تصدیق شدہ)۔'
                  )}
                </p>
              </div>
            ) : (
              <div className="pb-6">
                <div className="h-36 bg-[#0D0D10]">
                  {driverPreview.data.cover_photo_url ? (
                    <img
                      src={driverPreview.data.cover_photo_url}
                      alt="Driver Cover"
                      className="w-full h-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="px-5 -mt-10">
                  <div className="w-20 h-20 rounded-full border-4 border-white bg-[#0D0D10] overflow-hidden flex items-center justify-center shadow">
                    {driverPreview.data.avatar_url ? (
                      <img
                        src={driverPreview.data.avatar_url}
                        alt={driverPreview.data.full_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <UserCheck className="w-7 h-7 text-[#D4A017]" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <h4 className="font-display font-bold text-lg text-[#0D0D10]">
                      {driverPreview.data.full_name}
                    </h4>
                    {driverPreview.data.verification_status === 'approved' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        <ShieldCheck className="w-3 h-3" /> {tr(lang, 'Verified', 'تصدیق شدہ')}
                      </span>
                    )}
                  </div>
                  {driverPreview.data.handle && (
                    <p className="text-xs font-mono text-zinc-500">@{driverPreview.data.handle}</p>
                  )}
                  {driverPreview.data.bio && (
                    <p className="text-xs text-zinc-600 mt-1">{driverPreview.data.bio}</p>
                  )}
                  <p className="text-xs text-zinc-500 mt-2">
                    {driverPreview.data.vehicle_name} · {driverPreview.data.vehicle_number} ·{' '}
                    {driverPreview.data.completedTrips || 0} {tr(lang, 'Completed Trips', 'مکمل ٹرپس')}
                  </p>
                  {((driverPreview.data.gallery && driverPreview.data.gallery.length > 0) ||
                    (driverPreview.data.publicDocuments && driverPreview.data.publicDocuments.length > 0)) && (
                    <div className="grid grid-cols-2 gap-2 mt-4">
                      {(driverPreview.data.gallery || []).map((g: any) => (
                        <img
                          key={g.id}
                          src={g.url}
                          alt={g.caption || 'Showcase'}
                          className="w-full h-24 object-cover rounded-xl border border-zinc-200"
                        />
                      ))}
                      {(driverPreview.data.publicDocuments || [])
                        .filter((d: any) => d.doc_type !== 'profile_photo')
                        .map((d: any) => (
                          <img
                            key={d.id}
                            src={d.file_data_url}
                            alt={d.doc_type}
                            className="w-full h-24 object-cover rounded-xl border border-zinc-200"
                          />
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Screen 13: Passenger Wallet
export const PassengerWalletView: React.FC<{
  passengerName: string;
  bookings: Booking[];
  lang?: Language;
  wallet: {
    balancePkr: number;
    totalPaymentsPkr: number;
    outstandingPkr: number;
    transactions: WalletTransaction[];
  };
  onRefresh: () => Promise<void>;
}> = ({ passengerName, bookings, lang = 'en', wallet, onRefresh }) => {
  const [topupAmount, setTopupAmount] = useState('2000');
  const [topupMethod, setTopupMethod] = useState<'jazzcash' | 'easypaisa' | 'bank_transfer'>('jazzcash');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const unpaidBookings = bookings.filter(
    (b) => ['confirmed', 'on_the_way', 'arrived', 'started', 'completed'].includes(b.status) && b.payment_status !== 'PAID'
  );

  const handleTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiRequest<{ txRef: string }>('/api/passenger/wallet/topup', {
        method: 'POST',
        role: 'passenger',
        body: { amountPkr: Number(topupAmount), method: topupMethod },
      });
      setMsg(tr(lang, `Wallet credited (${res.txRef}).`, `والیٹ میں رقم شامل ہو گئی (${res.txRef})۔`));
      await onRefresh();
    } catch (err: any) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handlePayBooking = async (bookingId: string, method: 'wallet' | 'jazzcash' | 'easypaisa') => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiRequest<{ txRef: string }>(`/api/passenger/bookings/${bookingId}/pay`, {
        method: 'POST',
        role: 'passenger',
        body: { method },
      });
      setMsg(tr(lang, `Payment confirmed (${res.txRef}).`, `ادائیگی مکمل ہو گئی (${res.txRef})۔`));
      await onRefresh();
    } catch (err: any) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold text-[#0D0D10]">
          {tr(lang, 'Passenger Digital Wallet', 'مسافر ڈیجیٹل والیٹ')}
        </h2>
        <button
          type="button"
          onClick={() => downloadWalletStatementPdf(passengerName, 'Passenger', wallet.balancePkr, wallet.transactions)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0D0D10] text-white text-xs font-semibold hover:bg-zinc-800"
        >
          <Download className="w-3.5 h-3.5 text-[#D4A017]" />
          {tr(lang, 'Download Statement PDF', 'اسٹیٹمنٹ پی ڈی ایف ڈاؤن لوڈ')}
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-[#0D0D10] text-white p-5">
          <span className="text-xs text-zinc-400">{tr(lang, 'Wallet Balance', 'والیٹ بیلنس')}</span>
          <div className="font-mono text-2xl font-bold text-[#D4A017] mt-1 tabular-nums">
            Rs. {wallet.balancePkr.toLocaleString()}
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <span className="text-xs text-zinc-500">{tr(lang, 'Total Confirmed Payments', 'کل تصدیق شدہ ادائیگیاں')}</span>
          <div className="font-mono text-2xl font-bold text-[#0D0D10] mt-1 tabular-nums">
            Rs. {wallet.totalPaymentsPkr.toLocaleString()}
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <span className="text-xs text-zinc-500">{tr(lang, 'Outstanding Amount', 'واجب الادا رقم')}</span>
          <div className="font-mono text-2xl font-bold text-amber-700 mt-1 tabular-nums">
            Rs. {wallet.outstandingPkr.toLocaleString()}
          </div>
        </div>
      </div>

      {msg && (
        <div className="rounded-xl bg-zinc-900 text-[#F4C430] px-4 py-2.5 text-xs font-semibold">{msg}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form onSubmit={handleTopup} className="lg:col-span-5 rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
          <h3 className="font-display font-bold text-base flex items-center gap-2">
            <WalletIcon className="w-4 h-4 text-[#D4A017]" /> {tr(lang, 'Add Funds to Wallet', 'والیٹ میں رقم شامل کریں')}
          </h3>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              {tr(lang, 'Amount (PKR)', 'رقم (پاکستانی روپے)')}
            </label>
            <input
              type="number"
              min={100}
              required
              value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              {tr(lang, 'Payment Channel', 'ادائیگی کا ذریعہ')}
            </label>
            <select
              value={topupMethod}
              onChange={(e) => setTopupMethod(e.target.value as any)}
              className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm bg-white"
            >
              <option value="jazzcash">{tr(lang, 'JazzCash', 'جاز کیش (JazzCash)')}</option>
              <option value="easypaisa">{tr(lang, 'EasyPaisa', 'ایزی پیسہ (EasyPaisa)')}</option>
              <option value="bank_transfer">{tr(lang, 'Bank Transfer / Raast', 'بینک ٹرانسفر / راست')}</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold hover:bg-[#EAB308]"
          >
            {tr(lang, 'Confirm Wallet Top-up', 'والیٹ ٹاپ اپ کی تصدیق کریں')}
          </button>
        </form>

        <div className="lg:col-span-7 rounded-2xl border border-zinc-200 bg-white p-5 space-y-3">
          <h3 className="font-display font-bold text-base flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[#D4A017]" /> {tr(lang, 'Pending Booking Bills', 'بقایا بکنگ بل')}
          </h3>
          {unpaidBookings.length === 0 ? (
            <p className="text-xs text-zinc-500 py-4">
              {tr(lang, 'No outstanding booking balances.', 'کوئی بقایا بل باقی نہیں ہے۔')}
            </p>
          ) : (
            <div className="space-y-3">
              {unpaidBookings.map((b) => {
                const rem = Math.max(0, Number(b.total_bill_pkr) - Number(b.amount_paid_pkr));
                return (
                  <div key={b.id} className="p-3.5 rounded-xl border border-zinc-200 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-mono text-xs font-bold">{b.id}</div>
                      <div className="text-xs text-zinc-500">
                        {tr(lang, 'Remaining:', 'باقی:')} <strong className="font-mono text-[#0D0D10]">Rs. {rem.toLocaleString()}</strong> ({trPaymentStatus(lang, b.payment_status)})
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handlePayBooking(b.id, 'wallet')}
                        className="px-3 py-1.5 rounded-lg bg-[#0D0D10] text-white text-xs font-semibold"
                      >
                        {tr(lang, 'Pay via Wallet', 'والیٹ سے ادا کریں')}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handlePayBooking(b.id, 'jazzcash')}
                        className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-semibold hover:bg-zinc-50"
                      >
                        {tr(lang, 'JazzCash', 'جاز کیش')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Real Transaction Ledger */}
      <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-100 font-display font-bold text-sm">
          {tr(lang, 'Transaction History', 'لین دین کی تفصیل')}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 text-zinc-500 border-b border-zinc-200">
              <tr>
                <th className="px-4 py-3">{tr(lang, 'Transaction ID', 'ٹرانزیکشن آئی ڈی')}</th>
                <th className="px-4 py-3">{tr(lang, 'Description', 'تفصیل')}</th>
                <th className="px-4 py-3">{tr(lang, 'Method', 'طریقہ')}</th>
                <th className="px-4 py-3">{tr(lang, 'Status', 'حالت')}</th>
                <th className="px-4 py-3 text-right">{tr(lang, 'Amount', 'رقم')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {wallet.transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                    {tr(lang, 'No financial transactions recorded yet.', 'ابھی تک کوئی لین دین ریکارڈ نہیں ہوا۔')}
                  </td>
                </tr>
              ) : (
                wallet.transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-4 py-3 font-mono font-semibold">{tx.tx_ref}</td>
                    <td className="px-4 py-3">{tx.description}</td>
                    <td className="px-4 py-3 uppercase">{tx.payment_method}</td>
                    <td className="px-4 py-3 uppercase font-semibold text-emerald-700">{tx.status}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold tabular-nums">
                      {tx.type === 'credit' ? '+' : '-'}Rs. {Number(tx.amount_pkr).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Screen 14: Notifications & Ride Bell Tone Settings
export const NotificationsView: React.FC<{
  notifications: AppNotification[];
  lang?: Language;
  role?: 'passenger' | 'partner';
  bellSound?: RideBellSoundId;
  onChangeBellSound?: (sound: RideBellSoundId) => void;
  onMarkAllRead: () => Promise<void>;
}> = ({ notifications, lang = 'en', role = 'passenger', bellSound, onChangeBellSound, onMarkAllRead }) => {
  const [localBell, setLocalBell] = useState<RideBellSoundId>(() => bellSound ?? getSavedRideBellSound(role));

  useEffect(() => {
    if (bellSound) setLocalBell(bellSound);
  }, [bellSound]);

  const activeBell = bellSound ?? localBell;

  const updateBell = (next: RideBellSoundId) => {
    setLocalBell(next);
    saveRideBellSound(next, role);
    onChangeBellSound?.(next);
    window.dispatchEvent(new CustomEvent('pr:bell-updated', { detail: { role, sound: next } }));
    if (next !== 'muted') {
      playRideBell(next);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold text-[#0D0D10]">
          {tr(lang, 'Notifications & Ride Bell', 'نوٹیفکیشنز اور رائیڈ بیل')}
        </h2>
        <button
          type="button"
          onClick={onMarkAllRead}
          className="px-3.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-xs font-semibold hover:bg-zinc-50"
        >
          {tr(lang, 'Mark All Read', 'سب پڑھے ہوئے نشان زد کریں')}
        </button>
      </div>

      {/* Dedicated Ride Bell Tone & Mute Controller */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#0D0D10] text-[#F4C430] flex items-center justify-center shrink-0">
              {activeBell === 'muted' ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="font-display text-sm font-bold text-[#0D0D10]">
                {tr(lang, 'Ride Bell Tone', 'رائیڈ بیل اور گھنٹی کی آواز')}
              </h3>
              <p className="text-[11px] text-zinc-500">
                {tr(lang, 'Choose notification tone for booking updates & confirmations', 'بُکنگ کنفرم ہونے پر بجنے والی ٹون منتخب کریں')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => playRideBell(activeBell === 'muted' ? 'soft_gold' : activeBell)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0D0D10] text-[#F4C430] text-xs font-bold hover:bg-zinc-800"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>{tr(lang, 'Test Bell', 'بیل ٹیسٹ')}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {RIDE_BELL_OPTIONS.map((opt) => {
            const selected = activeBell === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => updateBell(opt.id)}
                className={`px-3 py-2 rounded-xl border text-start transition-colors ${
                  selected
                    ? 'bg-[#F4C430] border-[#B8860B] text-[#0D0D10] font-bold shadow-2xs'
                    : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                }`}
              >
                <div className="text-xs font-bold">{lang === 'ur' ? opt.labelUr : opt.labelEn}</div>
                <div className="text-[10px] opacity-75 truncate">{opt.descriptionEn}</div>
              </button>
            );
          })}
        </div>
      </div>
      {notifications.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
          {tr(lang, 'No notifications yet.', 'ابھی کوئی نوٹیفکیشن موجود نہیں ہے۔')}
        </div>
      ) : (
        <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white overflow-hidden">
          {notifications.map((n) => (
            <div key={n.id} className={`p-4 flex items-start gap-3 ${n.is_read === 0 ? 'bg-[#FCFBF7]' : 'bg-white'}`}>
              <Bell className={`w-4 h-4 mt-1 shrink-0 ${n.is_read === 0 ? 'text-[#D4A017]' : 'text-zinc-400'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                  <span>{n.category}</span>
                  <span className="font-mono">{n.created_at.slice(0, 16)}</span>
                </div>
                <p className="font-semibold text-sm text-[#0D0D10] mt-0.5">{n.title}</p>
                <p className="text-xs text-zinc-600 mt-0.5">{n.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Screen 15: Support
export const SupportView: React.FC<{
  role: 'passenger' | 'partner';
  tickets: SupportTicket[];
  defaultBookingId?: string;
  lang?: Language;
  onRefresh: () => Promise<void>;
}> = ({ role, tickets, defaultBookingId = '', lang = 'en', onRefresh }) => {
  const categories =
    role === 'passenger'
      ? [
          { value: 'Booking Complaint', label: tr(lang, 'Booking Complaint', 'بُکنگ شکایت') },
          { value: 'Payment Complaint', label: tr(lang, 'Payment Complaint', 'ادائیگی شکایت') },
          { value: 'Safety Complaint', label: tr(lang, 'Safety Complaint', 'سیفٹی شکایت') },
          { value: 'General Inquiry', label: tr(lang, 'General Inquiry', 'عام معلومات') },
        ]
      : [
          { value: 'Booking Dispute', label: tr(lang, 'Booking Dispute', 'بُکنگ تنازعہ') },
          { value: 'Payment Issue', label: tr(lang, 'Payment Issue', 'ادائیگی کا مسئلہ') },
          { value: 'Document Problem', label: tr(lang, 'Document Problem', 'دستاویزات کا مسئلہ') },
          { value: 'Vehicle Verification Issue', label: tr(lang, 'Vehicle Verification Issue', 'گاڑی تصدیق کا مسئلہ') },
        ];

  const [category, setCategory] = useState(categories[0].value);
  const [bookingId, setBookingId] = useState(defaultBookingId);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiRequest(`/api/${role}/support`, {
        method: 'POST',
        role,
        body: { category, bookingId: bookingId || null, subject, message },
      });
      setSubject('');
      setMessage('');
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#0D0D10]">
            {tr(lang, 'Support Center', 'سپورٹ سینٹر')}
          </h2>
          <p className="text-xs text-zinc-500">
            {tr(lang, 'Direct communication with PRO RIDER AI Admin Support', 'پرو رائیڈر اے آئی ایڈمن سپورٹ سے براہ راست رابطہ')}
          </p>
        </div>
        <a
          href="https://wa.me/923125007782"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0D0D10] text-white text-xs font-bold"
        >
          <PhoneCall className="w-3.5 h-3.5 text-[#D4A017]" />
          {tr(lang, 'WhatsApp Support: 03125007782', 'واٹس ایپ سپورٹ: 03125007782')}
        </a>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form onSubmit={submitTicket} className="lg:col-span-5 rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
          <h3 className="font-display font-bold text-base">
            {tr(lang, 'Open Support Ticket', 'نیا سپورٹ ٹکٹ کھولیں')}
          </h3>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              {tr(lang, 'Category', 'زمرہ')}
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm bg-white"
            >
              {categories.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              {tr(lang, 'Booking ID (Optional)', 'بکنگ آئی ڈی (اختیاری)')}
            </label>
            <input
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
              placeholder="PR-2026-..."
              className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              {tr(lang, 'Subject', 'عنوان')}
            </label>
            <input
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={tr(lang, 'Brief summary of the issue', 'مسئلے کا مختصر خلاصہ')}
              className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              {tr(lang, 'Details', 'تفصیلات')}
            </label>
            <textarea
              required
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={tr(lang, 'Describe the issue clearly...', 'مسئلے کی واضح تفصیل لکھیں...')}
              className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold hover:bg-[#EAB308]"
          >
            {tr(lang, 'Submit Ticket to Admin', 'ٹکٹ ایڈمن کو بھیجیں')}
          </button>
        </form>

        <div className="lg:col-span-7 space-y-3">
          <h3 className="font-display font-bold text-base">
            {tr(lang, 'Your Tickets', 'آپ کے ٹکٹس')}
          </h3>
          {tickets.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-xs text-zinc-500">
              {tr(lang, 'No support tickets submitted yet.', 'ابھی کوئی سپورٹ ٹکٹ جمع نہیں کروایا گیا۔')}
            </div>
          ) : (
            tickets.map((tkt) => (
              <div key={tkt.id} className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span className="font-mono font-bold text-[#0D0D10]">{tkt.id} · {tkt.category}</span>
                  <span className="uppercase font-semibold">{tkt.status}</span>
                </div>
                <p className="font-semibold text-sm">{tkt.subject}</p>
                <p className="text-xs text-zinc-600">{tkt.message}</p>
                {tkt.admin_reply && (
                  <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 text-xs">
                    <strong className="text-[#0D0D10]">{tr(lang, 'Admin Reply:', 'ایڈمن کا جواب:')}</strong> {tkt.admin_reply}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const isSyntheticPhone = (val?: string | null) => !val || /^[GER]-/i.test(val.trim());

// Screen 16: Passenger Profile (with integrated Theme Studio, Notifications & App Permissions)
export const PassengerProfileView: React.FC<{
  user: User;
  lang?: Language;
  unreadNotifications?: number;
  bellSound?: RideBellSoundId;
  onChangeBellSound?: (sound: RideBellSoundId) => void;
  onOpenNotifications?: () => void;
  onUpdated: (u: User) => void;
  onLogout: () => void;
}> = ({ user, lang = 'en', unreadNotifications = 0, bellSound, onChangeBellSound, onOpenNotifications, onUpdated, onLogout }) => {
  const [fullName, setFullName] = useState(user.full_name);
  const [phoneInput, setPhoneInput] = useState(isSyntheticPhone(user.phone) ? '' : user.phone);
  const [whatsapp, setWhatsapp] = useState(isSyntheticPhone(user.whatsapp) ? '' : (user.whatsapp || ''));
  const [email, setEmail] = useState(user.email || '');
  const [city, setCity] = useState(user.city || 'Islamabad');
  const [notifyPush, setNotifyPush] = useState(Boolean(user.notify_push));
  const [notifySms, setNotifySms] = useState(Boolean(user.notify_sms));
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [otpNotice, setOtpNotice] = useState<string | null>(null);

  useEffect(() => {
    setFullName(user.full_name);
    setPhoneInput(isSyntheticPhone(user.phone) ? '' : user.phone);
    setWhatsapp(isSyntheticPhone(user.whatsapp) ? '' : (user.whatsapp || ''));
    setEmail(user.email || '');
    setCity(user.city || 'Islamabad');
  }, [user.id, user.full_name, user.phone, user.whatsapp, user.email, user.city]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    try {
      const cleanPhone = phoneInput.trim();
      const res = await apiRequest<{ user: User }>('/api/auth/profile', {
        method: 'PATCH',
        role: 'passenger',
        body: {
          fullName,
          phone: cleanPhone || undefined,
          whatsapp: whatsapp.trim(),
          email,
          city,
          notifyPush,
          notifySms,
        },
      });
      onUpdated(res.user);
      setStatusMsg(tr(lang, 'Profile updated.', 'پروفائل اپڈیٹ ہو گئی۔'));
    } catch (err: any) {
      setStatusMsg(err?.message || tr(lang, 'Unable to update profile.', 'پروفائل محفوظ نہیں ہو سکی۔'));
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        role: 'passenger',
        body: { currentPassword, newPassword },
      });
      setCurrentPassword('');
      setNewPassword('');
      setStatusMsg(tr(lang, 'Password changed successfully.', 'پاس ورڈ کامیابی سے تبدیل ہو گیا۔'));
    } catch (err: any) {
      setStatusMsg(err.message);
    }
  };

  const requestPhoneVerify = async () => {
    setOtpNotice(null);
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/otp/request', {
        method: 'POST',
        role: 'passenger',
      });
      setOtpNotice(res.message);
    } catch (err: any) {
      setOtpNotice(err.message);
    }
  };

  const requestDeletion = async () => {
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/delete-request', {
        method: 'POST',
        role: 'passenger',
      });
      setStatusMsg(res.message);
    } catch (err: any) {
      setStatusMsg(err?.message || tr(lang, 'Could not submit deletion request.', 'درخواست جمع نہیں ہو سکی۔'));
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-2xl font-bold text-[#0D0D10]">
          {tr(lang, 'Passenger Profile & Settings', 'مسافر پروفائل اور سیٹنگز')}
        </h2>
        <button
          type="button"
          onClick={onLogout}
          className="px-4 py-2 rounded-xl border border-zinc-200 text-xs font-semibold hover:bg-zinc-100"
        >
          {tr(lang, 'Sign Out', 'لاگ آؤٹ')}
        </button>
      </div>

      {statusMsg && (
        <div className="rounded-xl bg-zinc-900 text-[#F4C430] px-4 py-2.5 text-xs font-semibold">{statusMsg}</div>
      )}

      {/* Quick Profile Controls: Notifications + Bell Tone (Next Page) & App Permissions (ON/OFF Modal) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {onOpenNotifications && (
          <button
            type="button"
            onClick={onOpenNotifications}
            className="rounded-2xl border border-zinc-200 bg-white hover:border-[#D4A017] p-4 flex items-center justify-between gap-3 text-start transition-colors min-h-[64px]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#0D0D10] text-[#D4A017] flex items-center justify-center shrink-0">
                <Bell className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="font-display font-bold text-sm text-[#0D0D10]">
                  {tr(lang, 'Notifications & Bell Tone', 'نوٹیفکیشنز اور بیل ٹون')}
                </div>
                <p className="text-[11px] text-zinc-500 truncate">
                  {(() => {
                    const currentToneId = bellSound ?? getSavedRideBellSound('passenger');
                    const meta = RIDE_BELL_OPTIONS.find((o) => o.id === currentToneId);
                    const toneLabel = meta ? (lang === 'ur' ? meta.labelUr : meta.labelEn) : 'Soft Chime';
                    return tr(lang, `Alerts & Tone (${toneLabel})`, `الرٹس اور آواز (${toneLabel})`);
                  })()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {unreadNotifications > 0 && (
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg bg-red-600 text-white">
                  {unreadNotifications}
                </span>
              )}
              <ChevronRight className={`w-4 h-4 text-zinc-400 ${lang === 'ur' ? 'rotate-180' : ''}`} />
            </div>
          </button>
        )}

        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('open-prorider-permissions'))}
          className="rounded-2xl border border-zinc-200 bg-white hover:border-[#D4A017] p-4 flex items-center justify-between gap-3 text-start transition-colors min-h-[64px]"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="font-display font-bold text-sm text-[#0D0D10]">
                {tr(lang, 'App Permissions', 'ایپ پرمیشنز')}
              </div>
              <p className="text-[11px] text-zinc-500 truncate">
                {tr(lang, 'GPS, Bell Tone, Camera, Mic & Calls (ON/OFF)', 'لوکیشن، بیل ٹون، کیمرہ، مائیک اور کال (آن/آف)')}
              </p>
            </div>
          </div>
          <ChevronRight className={`w-4 h-4 text-zinc-400 shrink-0 ${lang === 'ur' ? 'rotate-180' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <form onSubmit={saveProfile} className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
          <h3 className="font-display font-bold text-base">
            {tr(lang, 'Personal & Contact Information', 'ذاتی اور رابطہ کی معلومات')}
          </h3>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              {tr(lang, 'Full Name', 'پورا نام')}
            </label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              {tr(lang, 'Mobile Number', 'موبائل نمبر')}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder={tr(lang, '03XX-XXXXXXX (Add mobile number)', '03XX-XXXXXXX (موبائل نمبر درج کریں)')}
                className="flex-1 px-3 py-2 rounded-xl border border-zinc-200 text-sm font-mono"
              />
              <span
                className={`text-[11px] font-sans font-bold px-2.5 py-2 rounded-xl border shrink-0 ${
                  user.phone_verified
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-amber-50 border-amber-200 text-amber-700'
                }`}
              >
                {user.phone_verified
                  ? tr(lang, 'Verified', 'تصدیق شدہ')
                  : isSyntheticPhone(user.phone)
                  ? tr(lang, 'Optional', 'اختیاری')
                  : tr(lang, 'Unverified', 'غیر تصدیق شدہ')}
              </span>
            </div>
            {!user.phone_verified && !isSyntheticPhone(phoneInput) && (
              <button type="button" onClick={requestPhoneVerify} className="mt-1.5 text-xs font-semibold text-[#B8860B] hover:underline">
                {tr(lang, 'Verify Mobile via SMS Provider', 'موبائل نمبر تصدیق کروائیں')}
              </button>
            )}
            {otpNotice && <p className="mt-1 text-[11px] text-amber-700">{otpNotice}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              {tr(lang, 'WhatsApp', 'واٹس ایپ')}
            </label>
            <input
              type="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="03XX-XXXXXXX"
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              {tr(lang, 'Email', 'ای میل')}
            </label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              {tr(lang, 'Primary City', 'بنیادی شہر')}
            </label>
            <select value={city} onChange={(e) => setCity(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white">
              <option value="Islamabad">{tr(lang, 'Islamabad', 'اسلام آباد')}</option>
              <option value="Rawalpindi">{tr(lang, 'Rawalpindi', 'راولپنڈی')}</option>
              <option value="Lahore">{tr(lang, 'Lahore', 'لاہور')}</option>
              <option value="Karachi">{tr(lang, 'Karachi', 'کراچی')}</option>
            </select>
          </div>
          <div className="space-y-2 pt-1 text-xs">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={notifyPush} onChange={(e) => setNotifyPush(e.target.checked)} className="accent-[#D4A017]" />
              {tr(lang, 'Booking & Driver Offer Notifications', 'بُکنگ اور ڈرائیور آفر نوٹیفکیشنز')}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={notifySms} onChange={(e) => setNotifySms(e.target.checked)} className="accent-[#D4A017]" />
              {tr(lang, 'SMS / WhatsApp Schedule Reminders', 'ایس ایم ایس / واٹس ایپ شیڈول یاد دہانیاں')}
            </label>
          </div>
          <button type="submit" className="w-full py-2.5 rounded-xl bg-[#0D0D10] text-white text-xs font-bold">
            {tr(lang, 'Save Changes', 'تبدیلیاں محفوظ کریں')}
          </button>
        </form>

        <div className="space-y-6">
          <form onSubmit={changePassword} className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
            <h3 className="font-display font-bold text-base">
              {tr(lang, 'Manage Password', 'پاس ورڈ تبدیل کریں')}
            </h3>
            <input
              type="password"
              required
              placeholder={tr(lang, 'Current Password', 'موجودہ پاس ورڈ')}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder={tr(lang, 'New Password (min 6 chars)', 'نیا پاس ورڈ (کم از کم 6 حروف)')}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
            />
            <button type="submit" className="w-full py-2.5 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold">
              {tr(lang, 'Update Password', 'پاس ورڈ اپڈیٹ کریں')}
            </button>
          </form>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3">
            <h3 className="font-display font-bold text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#D4A017]" /> {tr(lang, 'Privacy & Account Deletion', 'پرائیویسی اور اکاؤنٹ حذف کرنے کی درخواست')}
            </h3>
            <p className="text-xs text-zinc-600 leading-relaxed">
              {tr(
                lang,
                'Your Passenger account is isolated from Driver/Pro Partner systems. Financial invoices are retained per Pakistan digital ledger rules.',
                'آپ کا مسافر اکاؤنٹ ڈرائیور سسٹم سے مکمل طور پر الگ ہے۔ مالیاتی انوائسز پاکستانی ڈیجیٹل قوانین کے مطابق محفوظ رہتی ہیں۔'
              )}
            </p>
            <button
              type="button"
              onClick={requestDeletion}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 hover:underline"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              {tr(lang, 'Request Account Deletion', 'اکاؤنٹ حذف کرنے کی درخواست دیں')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
