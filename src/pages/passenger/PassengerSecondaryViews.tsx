import React, { useState } from 'react';
import {
  Bell,
  CheckCircle2,
  CreditCard,
  Download,
  HelpCircle,
  Lock,
  PhoneCall,
  Radio,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Star,
  UserCheck,
  Wallet as WalletIcon,
  X,
} from 'lucide-react';
import { ShareTripStatusModal } from '../../components/ShareTripStatusModal';
import { ThemePreferencesPanel } from '../../components/ThemeSwitcher';
import { tr, trBookingStatus, trPaymentStatus, trService } from '../../i18n/translations';
import { apiRequest } from '../../utils/api';
import { downloadBookingPdf, downloadWalletStatementPdf, shareBookingPdf } from '../../utils/pdfGenerator';
import type {
  AppNotification,
  Booking,
  Language,
  SupportTicket,
  User,
  WalletTransaction,
} from '../../types';

// Screen 12: My Bookings
export const PassengerBookingsView: React.FC<{
  bookings: Booking[];
  passengerName: string;
  lang?: Language;
  onRefresh: () => Promise<void>;
  onOpenSupport: (bookingId: string) => void;
}> = ({ bookings, passengerName, lang = 'en', onRefresh, onOpenSupport }) => {
  const [tab, setTab] = useState<'upcoming' | 'active' | 'completed' | 'cancelled'>('active');
  const [ratingTarget, setRatingTarget] = useState<string | null>(null);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');
  const [shareBooking, setShareBooking] = useState<Booking | null>(null);
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

  const filtered = bookings.filter((b) => {
    if (tab === 'upcoming') return b.booking_mode === 'schedule' && ['searching', 'negotiating', 'confirmed'].includes(b.status);
    if (tab === 'active') return ['searching', 'negotiating', 'confirmed', 'on_the_way', 'arrived', 'started'].includes(b.status);
    if (tab === 'completed') return b.status === 'completed';
    return b.status === 'cancelled';
  });

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

  const tabLabels: Record<'active' | 'upcoming' | 'completed' | 'cancelled', string> = {
    active: tr(lang, 'Active', 'جاری'),
    upcoming: tr(lang, 'Upcoming', 'آنے والی'),
    completed: tr(lang, 'Completed', 'مکمل'),
    cancelled: tr(lang, 'Cancelled', 'منسوخ'),
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold text-[#0D0D10]">
          {tr(lang, 'My Bookings', 'میری بکنگز')}
        </h2>
        <div className="inline-flex rounded-xl bg-zinc-100 p-1 gap-1">
          {(['active', 'upcoming', 'completed', 'cancelled'] as const).map((tb) => (
            <button
              key={tb}
              type="button"
              onClick={() => setTab(tb)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === tb ? 'bg-[#0D0D10] text-white' : 'text-zinc-600 hover:text-[#0D0D10]'
              }`}
            >
              {tabLabels[tb]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
          {tr(lang, `No ${tab} bookings found.`, `${tabLabels[tab]} بکنگز موجود نہیں ہیں۔`)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filtered.map((b) => (
            <div key={b.id} className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 font-mono">
                    <span className="font-bold text-[#0D0D10]">{b.id}</span>
                    <span aria-hidden="true">·</span>
                    <span>{b.pickup_date} {b.pickup_time}</span>
                    <span aria-hidden="true">·</span>
                    <span>{trService(lang, b.service_type)}</span>
                  </div>
                  <p className="text-sm font-semibold text-[#0D0D10] mt-1">
                    {b.pickup_address} → {b.dropoff_address}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {b.vehicle_category_name} · {b.distance_km} km · {tr(lang, 'Status:', 'حالت:')}{' '}
                    <strong className="uppercase">{trBookingStatus(lang, b.status)}</strong>
                  </p>
                </div>

                <div className="text-right">
                  <div className="font-mono text-lg font-bold text-[#0D0D10]">
                    Rs. {Number(b.total_bill_pkr).toLocaleString()}
                  </div>
                  <div className="text-[11px] font-semibold text-zinc-500">
                    {trPaymentStatus(lang, b.payment_status)} · {tr(lang, 'Paid', 'ادا شدہ')} Rs. {Number(b.amount_paid_pkr).toLocaleString()}
                  </div>
                </div>
              </div>

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
          ))}
        </div>
      )}

      <ShareTripStatusModal
        isOpen={Boolean(shareBooking)}
        onClose={() => setShareBooking(null)}
        booking={shareBooking}
        passengerName={passengerName}
        lang={lang}
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

// Screen 14: Notifications
export const NotificationsView: React.FC<{
  notifications: AppNotification[];
  lang?: Language;
  onMarkAllRead: () => Promise<void>;
}> = ({ notifications, lang = 'en', onMarkAllRead }) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold text-[#0D0D10]">
          {tr(lang, 'Notifications', 'نوٹیفکیشنز')}
        </h2>
        <button
          type="button"
          onClick={onMarkAllRead}
          className="px-3.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-xs font-semibold hover:bg-zinc-50"
        >
          {tr(lang, 'Mark All Read', 'سب پڑھے ہوئے نشان زد کریں')}
        </button>
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

// Screen 16: Passenger Profile (with integrated Theme Studio, Notifications & App Permissions)
export const PassengerProfileView: React.FC<{
  user: User;
  lang?: Language;
  unreadNotifications?: number;
  onOpenNotifications?: () => void;
  onUpdated: (u: User) => void;
  onLogout: () => void;
}> = ({ user, lang = 'en', unreadNotifications = 0, onOpenNotifications, onUpdated, onLogout }) => {
  const [fullName, setFullName] = useState(user.full_name);
  const [whatsapp, setWhatsapp] = useState(user.whatsapp || '');
  const [email, setEmail] = useState(user.email || '');
  const [city, setCity] = useState(user.city || 'Islamabad');
  const [notifyPush, setNotifyPush] = useState(Boolean(user.notify_push));
  const [notifySms, setNotifySms] = useState(Boolean(user.notify_sms));
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [otpNotice, setOtpNotice] = useState<string | null>(null);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiRequest<{ user: User }>('/api/auth/profile', {
      method: 'PATCH',
      role: 'passenger',
      body: { fullName, whatsapp, email, city, notifyPush, notifySms },
    });
    onUpdated(res.user);
    setStatusMsg(tr(lang, 'Profile updated.', 'پروفائل اپڈیٹ ہو گئی۔'));
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
    const res = await apiRequest<{ message: string }>('/api/auth/delete-request', {
      method: 'POST',
      role: 'passenger',
    });
    setStatusMsg(res.message);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
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

      {/* Quick Profile Controls: Notifications & App Permissions */}
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
                  {tr(lang, 'Notifications', 'نوٹیفکیشنز')}
                </div>
                <p className="text-[11px] text-zinc-500">
                  {tr(lang, 'View ride & system alerts', 'سفر اور سسٹم کی اطلاعات دیکھیں')}
                </p>
              </div>
            </div>
            {unreadNotifications > 0 && (
              <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-red-600 text-white shrink-0">
                {unreadNotifications}
              </span>
            )}
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
              <p className="text-[11px] text-zinc-500">
                {tr(lang, 'Location, Camera, Mic & Alerts', 'لوکیشن، کیمرہ، مائیک اور الرٹس')}
              </p>
            </div>
          </div>
        </button>
      </div>

      {/* Embedded Personal Color Theme Selector inside Profile Settings */}
      <ThemePreferencesPanel lang={lang} />

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
              {tr(lang, 'Registered Mobile Number', 'رجسٹرڈ موبائل نمبر')}
            </label>
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-sm font-mono">
              <span>{user.phone}</span>
              <span className={`text-[11px] font-sans font-bold ${user.phone_verified ? 'text-emerald-700' : 'text-amber-700'}`}>
                {user.phone_verified ? tr(lang, 'Verified', 'تصدیق شدہ') : tr(lang, 'Unverified', 'غیر تصدیق شدہ')}
              </span>
            </div>
            {!user.phone_verified && (
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
            <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
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
