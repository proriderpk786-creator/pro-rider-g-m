import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Printer,
  Share2,
  X,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { tr, trBookingStatus, trPaymentStatus, trService } from '../i18n/translations';
import type { Booking, Language } from '../types';
import {
  downloadBookingPdf,
  formatPkr,
  getInvoiceFinancialBreakdown,
  shareBookingPdf,
} from '../utils/pdfGenerator';

interface InvoiceViewerModalProps {
  booking: Booking | null;
  viewerRole: 'passenger' | 'partner' | 'admin';
  passengerName?: string;
  lang?: Language;
  onClose: () => void;
}

function formatCleanCategory(rawName: string | undefined, lang: Language): string {
  const clean = String(rawName || 'Economy').trim();
  if (!clean.includes('·')) return clean;
  const parts = clean
    .split('·')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 1) return clean;
  return lang === 'ur' ? parts[1] || parts[0] : parts[0];
}

export const InvoiceViewerModal: React.FC<InvoiceViewerModalProps> = ({
  booking,
  viewerRole,
  passengerName,
  lang = 'en',
  onClose,
}) => {
  const { isDark } = useTheme();
  const toast = useToast();
  const [sharing, setSharing] = useState(false);

  if (!booking) return null;

  const fin = getInvoiceFinancialBreakdown(booking);
  const isPaid = String(booking.payment_status || '').toUpperCase() === 'PAID';
  const confirmedTxs = (booking.transactions || []).filter((t) => t.status === 'confirmed');
  const categoryLabel = formatCleanCategory(booking.vehicle_category_name || booking.vehicle_category_id, lang);
  const issuedDate = (booking.created_at || new Date().toISOString()).slice(0, 10);
  const osmUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${booking.pickup_lat},${booking.pickup_lng};${booking.dropoff_lat},${booking.dropoff_lng}`;

  const handleShare = async () => {
    setSharing(true);
    try {
      const result = await shareBookingPdf(booking, viewerRole, passengerName);
      toast.success(
        result === 'shared'
          ? tr(lang, 'Invoice shared successfully.', 'انوائس شیئر کر دی گئی۔')
          : tr(lang, 'PDF invoice downloaded for sharing.', 'شیئر کرنے کے لیے پی ڈی ایف انوائس ڈاؤن لوڈ ہو گئی۔')
      );
    } catch {
      downloadBookingPdf(booking, viewerRole, passengerName);
      toast.info(tr(lang, 'PDF invoice downloaded.', 'پی ڈی ایف انوائس ڈاؤن لوڈ ہو گئی۔'));
    } finally {
      setSharing(false);
    }
  };

  return (
    <div
      dir={lang === 'ur' ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-5 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`pr-print-sheet w-full max-w-2xl max-h-[92dvh] flex flex-col rounded-3xl overflow-hidden shadow-2xl border transition-colors ${
          isDark
            ? 'bg-[#131419] border-[#D4A017]/40 text-zinc-100'
            : 'bg-white border-zinc-200 text-[#0D0D10]'
        }`}
      >
        {/* Top Action Bar (hidden when printing) */}
        <div className="pr-no-print px-5 py-3.5 bg-[#0D0D10] text-white border-b-2 border-[#D4A017] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full border-2 border-[#D4A017] flex items-center justify-center text-[#F4C430] font-display font-extrabold text-xs shrink-0">
              PR
            </div>
            <div className="min-w-0">
              <div className="font-display font-bold text-sm sm:text-base text-white truncate">
                {tr(lang, 'PRO RIDER AI — Digital Invoice', 'پرو رائیڈر اے آئی — ڈیجیٹل انوائس')}
              </div>
              <div className="text-[11px] font-mono text-[#F4C430] truncate">
                {booking.invoice_number || booking.id} · {issuedDate}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={tr(lang, 'Close Invoice', 'بند کریں')}
            className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Executive Invoice Document Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-xs">
          {/* Document Identity Strip */}
          <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-zinc-200">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#9A6E08]">
                {tr(lang, 'Official Tax & Fare Receipt', 'آفیشل کرایہ اور بکنگ رسید')}
              </p>
              <h3 className="font-display text-xl font-extrabold mt-0.5 text-[#0D0D10]">
                {booking.invoice_number || booking.id}
              </h3>
              <p className="text-[11px] font-mono text-zinc-500 mt-0.5">
                {tr(lang, 'Booking Reference:', 'بکنگ حوالہ:')} {booking.id} · {issuedDate}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase border ${
                  isPaid
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-amber-100 text-amber-900 border-amber-300'
                }`}
              >
                {isPaid ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                {trPaymentStatus(lang, booking.payment_status)}
              </span>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold uppercase bg-zinc-100 text-zinc-800 border border-zinc-200">
                {trBookingStatus(lang, booking.status)}
              </span>
            </div>
          </div>

          {/* Two-Column Parties & Vehicle Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="space-y-2.5">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#9A6E08]">
                {tr(lang, 'Passenger & Service Details', 'مسافر اور سروس کی تفصیلات')}
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-zinc-500">
                  {tr(lang, 'Passenger Name', 'مسافر کا نام')}
                </div>
                <div className="font-bold text-sm text-[#0D0D10]">
                  {passengerName || booking.passenger_name || tr(lang, 'Verified Passenger', 'تصدیق شدہ مسافر')}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-zinc-500">
                  {tr(lang, 'Service & Seats', 'سروس اور سیٹیں')}
                </div>
                <div className="font-bold text-[#0D0D10]">
                  {trService(lang, booking.service_type)} ·{' '}
                  {booking.booking_mode === 'go_now'
                    ? tr(lang, 'Instant Ride', 'فوری رائیڈ')
                    : tr(lang, 'Monthly Package', 'ماہانہ پیکیج')}{' '}
                  ({booking.seats_requested || 1} {tr(lang, 'Seats', 'سیٹیں')})
                </div>
              </div>
            </div>

            <div className="space-y-2.5 sm:border-s sm:border-zinc-200 sm:ps-4">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#9A6E08]">
                {tr(lang, 'Pro Partner & Vehicle', 'پرو پارٹنر اور گاڑی')}
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-zinc-500">
                  {tr(lang, 'Assigned Partner', 'مقرر شدہ ڈرائیور')}
                </div>
                <div className="font-bold text-sm text-[#0D0D10]">
                  {booking.partner_name || tr(lang, 'Pending Assignment', 'تقرری زیر التواء')}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-zinc-500">
                  {tr(lang, 'Vehicle Category & Plate', 'گاڑی کی کیٹیگری اور نمبر')}
                </div>
                <div className="font-bold text-[#0D0D10]">
                  {categoryLabel}
                  {booking.partner_vehicle_name ? ` · ${booking.partner_vehicle_name}` : ''}
                  {booking.partner_vehicle_number ? (
                    <span className="font-mono ms-1.5 text-zinc-600">({booking.partner_vehicle_number})</span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {/* Bordered Route & Schedule Ledger Table */}
          <div className="rounded-2xl border border-zinc-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-[#0D0D10] text-white flex items-center justify-between gap-2">
              <span className="font-display font-bold text-xs tracking-wide text-[#F4C430] uppercase">
                {tr(lang, 'Route & Schedule Details', 'راستہ اور وقت کی تفصیلات')}
              </span>
              <a
                href={osmUrl}
                target="_blank"
                rel="noreferrer"
                className="pr-no-print inline-flex items-center gap-1 text-[11px] font-bold text-blue-300 hover:text-blue-200"
              >
                <span>{tr(lang, 'OpenStreetMap', 'میپ دیکھیں')}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <table className="w-full text-xs border-collapse">
              <tbody className="divide-y divide-zinc-200">
                <tr className="bg-white">
                  <th className="w-36 sm:w-44 px-4 py-2.5 text-start font-bold text-zinc-600 uppercase text-[10px] align-top">
                    {tr(lang, 'Pickup Location', 'پِک اپ مقام')}
                  </th>
                  <td dir="auto" className="px-4 py-2.5 font-semibold text-[#0D0D10]">
                    {booking.pickup_address}
                  </td>
                </tr>
                <tr className="bg-zinc-50">
                  <th className="w-36 sm:w-44 px-4 py-2.5 text-start font-bold text-zinc-600 uppercase text-[10px] align-top">
                    {tr(lang, 'Drop-off Location', 'ڈراپ آف مقام')}
                  </th>
                  <td dir="auto" className="px-4 py-2.5 font-semibold text-[#0D0D10]">
                    {booking.dropoff_address}
                  </td>
                </tr>
                <tr className="bg-white">
                  <th className="w-36 sm:w-44 px-4 py-2.5 text-start font-bold text-zinc-600 uppercase text-[10px]">
                    {tr(lang, 'Pickup Schedule', 'پِک اپ وقت')}
                  </th>
                  <td dir="ltr" className="px-4 py-2.5 font-mono font-semibold text-[#0D0D10]">
                    {booking.pickup_date} · {booking.pickup_time}
                  </td>
                </tr>
                <tr className="bg-zinc-50">
                  <th className="w-36 sm:w-44 px-4 py-2.5 text-start font-bold text-zinc-600 uppercase text-[10px]">
                    {tr(lang, 'Distance & Duration', 'فاصلہ اور دورانیہ')}
                  </th>
                  <td dir="ltr" className="px-4 py-2.5 font-mono font-semibold text-[#0D0D10]">
                    {booking.distance_km} km ({booking.duration_min} min est.)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Itemized Financial Summary Table */}
          <div className="rounded-2xl border border-zinc-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-[#F4C430] text-[#0D0D10] flex items-center justify-between font-display font-extrabold text-xs uppercase tracking-wide pr-on-accent">
              <span>{tr(lang, 'Financial Breakdown (PKR)', 'مالی تفصیلات (روپے)')}</span>
              <span>{tr(lang, 'Amount', 'رقم')}</span>
            </div>
            <table className="w-full text-xs border-collapse">
              <tbody className="divide-y divide-zinc-200">
                {fin.baseFarePkr > 0 && (
                  <tr className="bg-white">
                    <td className="px-4 py-2.5 text-zinc-700">{tr(lang, 'Base Booking Fare', 'بنیادی بُکنگ کرایہ')}</td>
                    <td dir="ltr" className="px-4 py-2.5 text-end font-mono font-bold text-[#0D0D10]">
                      {formatPkr(fin.baseFarePkr)}
                    </td>
                  </tr>
                )}
                <tr className="bg-white">
                  <td className="px-4 py-2.5 text-zinc-700">
                    {fin.isPackageOrCustom
                      ? tr(lang, `Agreed Ride / Package Fare (${booking.distance_km} km)`, `طے شدہ رائیڈ / پیکیج کرایہ (${booking.distance_km} کلومیٹر)`)
                      : tr(lang, `Road Distance (${booking.distance_km} km @ Rs. ${booking.rate_per_km_pkr}/km)`, `سفری فاصلہ (${booking.distance_km} کلومیٹر @ Rs. ${booking.rate_per_km_pkr}/کلومیٹر)`)}
                  </td>
                  <td dir="ltr" className="px-4 py-2.5 text-end font-mono font-bold text-[#0D0D10]">
                    {formatPkr(fin.distanceChargePkr)}
                  </td>
                </tr>
                {fin.waitingChargePkr > 0 && (
                  <tr className="bg-zinc-50">
                    <td className="px-4 py-2.5 text-zinc-700">
                      {tr(lang, `Waiting Charges (${booking.waiting_minutes || 0} mins)`, `انتظار چارجز (${booking.waiting_minutes || 0} منٹ)`)}
                    </td>
                    <td dir="ltr" className="px-4 py-2.5 text-end font-mono font-bold text-[#0D0D10]">
                      {formatPkr(fin.waitingChargePkr)}
                    </td>
                  </tr>
                )}
                {fin.extraStopsChargePkr > 0 && (
                  <tr className="bg-zinc-50">
                    <td className="px-4 py-2.5 text-zinc-700">
                      {tr(lang, `Extra Stops (${booking.extra_stops_count || 0})`, `اضافی اسٹاپس (${booking.extra_stops_count || 0})`)}
                    </td>
                    <td dir="ltr" className="px-4 py-2.5 text-end font-mono font-bold text-[#0D0D10]">
                      {formatPkr(fin.extraStopsChargePkr)}
                    </td>
                  </tr>
                )}
                <tr className="bg-zinc-50 font-bold">
                  <td className="px-4 py-3 text-[#0D0D10]">{tr(lang, 'Total Invoice Bill', 'کل بل')}</td>
                  <td dir="ltr" className="px-4 py-3 text-end font-mono text-sm font-extrabold text-[#0D0D10]">
                    {formatPkr(fin.totalBillPkr)}
                  </td>
                </tr>
                <tr className="bg-white">
                  <td className="px-4 py-2.5 text-zinc-700">{tr(lang, 'Confirmed Amount Paid', 'تصدیق شدہ ادا رقم')}</td>
                  <td dir="ltr" className="px-4 py-2.5 text-end font-mono font-bold text-emerald-700">
                    {formatPkr(fin.amountPaidPkr)}
                  </td>
                </tr>
                {viewerRole !== 'passenger' && fin.commissionPkr > 0 && (
                  <>
                    <tr className="bg-zinc-50">
                      <td className="px-4 py-2.5 text-zinc-600">
                        {tr(lang, `Platform Commission (${fin.commissionPct}%)`, `پلیٹ فارم کمیشن (${fin.commissionPct}%)`)}
                      </td>
                      <td dir="ltr" className="px-4 py-2.5 text-end font-mono font-bold text-amber-800">
                        {formatPkr(fin.commissionPkr)}
                      </td>
                    </tr>
                    <tr className="bg-zinc-50 font-bold">
                      <td className="px-4 py-2.5 text-[#0D0D10]">
                        {tr(lang, 'Net Pro Partner Payout', 'پرو پارٹنر خالص ادائیگی')}
                      </td>
                      <td dir="ltr" className="px-4 py-2.5 text-end font-mono font-bold text-emerald-700">
                        {formatPkr(fin.driverPayoutPkr)}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>

            {/* Generously Padded Executive Settlement Footer Strip */}
            <div className="bg-[#0D0D10] text-white px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#D4A017]/50">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#F4C430] block">
                  {tr(lang, 'Remaining Balance Due', 'باقی واجب الادا رقم')}
                </span>
                <div dir="ltr" className="font-mono text-xl font-extrabold text-white mt-0.5 tabular-nums">
                  {formatPkr(fin.remainingPkr)}
                </div>
              </div>
              <span
                className={`px-4 py-1.5 rounded-xl text-xs font-extrabold uppercase tracking-wide ${
                  isPaid
                    ? 'bg-emerald-500 text-white'
                    : 'bg-[#F4C430] text-[#0D0D10] pr-on-accent'
                }`}
              >
                {tr(lang, 'Payment:', 'ادائیگی:')} {trPaymentStatus(lang, booking.payment_status)}
              </span>
            </div>
          </div>

          {/* Confirmed Transactions Table */}
          {confirmedTxs.length > 0 && (
            <div className="rounded-2xl border border-zinc-200 overflow-hidden">
              <div className="px-4 py-2 bg-zinc-50 border-b border-zinc-200 font-display font-bold text-xs text-[#0D0D10]">
                {tr(lang, 'Confirmed Payment Transactions', 'تصدیق شدہ ادائیگی کا ریکارڈ')}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500">
                    <tr>
                      <th className="px-3 py-2 text-start">{tr(lang, 'Ref', 'حوالہ')}</th>
                      <th className="px-3 py-2 text-start">{tr(lang, 'Method', 'طریقہ')}</th>
                      <th className="px-3 py-2 text-start">{tr(lang, 'Date', 'تاریخ')}</th>
                      <th className="px-3 py-2 text-end">{tr(lang, 'Amount', 'رقم')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {confirmedTxs.map((tx) => (
                      <tr key={tx.id}>
                        <td className="px-3 py-2 font-mono font-bold text-[#0D0D10]">{tx.tx_ref}</td>
                        <td className="px-3 py-2 uppercase">{tx.payment_method}</td>
                        <td className="px-3 py-2 font-mono text-zinc-500">{tx.created_at.slice(0, 16)}</td>
                        <td dir="ltr" className="px-3 py-2 text-end font-mono font-bold text-emerald-700">
                          {formatPkr(tx.amount_pkr)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Sticky Modal Action Footer */}
        <div className="pr-no-print px-5 py-3.5 border-t border-zinc-200 bg-zinc-50 flex flex-wrap items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-300 bg-white text-xs font-bold text-[#0D0D10] hover:bg-zinc-100"
          >
            <Printer className="w-3.5 h-3.5" />
            {tr(lang, 'Print', 'پرنٹ')}
          </button>
          <button
            type="button"
            disabled={sharing}
            onClick={() => void handleShare()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-300 bg-white text-xs font-bold text-[#0D0D10] hover:bg-zinc-100 disabled:opacity-50"
          >
            <Share2 className="w-3.5 h-3.5" />
            {tr(lang, 'Share PDF', 'شیئر کریں')}
          </button>
          <button
            type="button"
            onClick={() => downloadBookingPdf(booking, viewerRole, passengerName)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl pr-gold-cta text-xs font-extrabold shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            {tr(lang, 'Download Clean PDF', 'صاف پی ڈی ایف ڈاؤن لوڈ')}
          </button>
        </div>
      </div>
    </div>
  );
};
