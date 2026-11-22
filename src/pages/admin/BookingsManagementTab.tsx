import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  MapPin,
  RefreshCw,
  Search,
  Sliders,
  X,
  XCircle,
} from 'lucide-react';
import { tr, trBookingStatus, trPaymentStatus, trService } from '../../i18n/translations';
import { apiRequest } from '../../utils/api';
import { downloadBookingPdf } from '../../utils/pdfGenerator';
import type { Booking, Language } from '../../types';

interface BookingsManagementTabProps {
  bookings: Booking[];
  lang?: Language;
  onReload: () => Promise<void>;
  onShowToast: (msg: string) => void;
}

export const BookingsManagementTab: React.FC<BookingsManagementTabProps> = ({
  bookings,
  lang = 'en',
  onReload,
  onShowToast,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const filteredBookings = bookings.filter((b) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      b.id.toLowerCase().includes(q) ||
      (b.passenger_name || '').toLowerCase().includes(q) ||
      (b.partner_name || '').toLowerCase().includes(q) ||
      (b.pickup_address || '').toLowerCase().includes(q) ||
      (b.dropoff_address || '').toLowerCase().includes(q);

    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'active'
        ? ['searching', 'negotiating', 'confirmed', 'on_the_way', 'arrived', 'started'].includes(
            b.status
          )
        : statusFilter === 'completed'
        ? b.status === 'completed'
        : statusFilter === 'cancelled'
        ? b.status === 'cancelled'
        : b.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleUpdatePayment = async (b: Booking, nextPayment: 'paid' | 'unpaid') => {
    setActionBusyId(b.id);
    try {
      await apiRequest(`/api/admin/bookings/${b.id}`, {
        method: 'PATCH',
        role: 'admin',
        body: { payment_status: nextPayment },
      });
      onShowToast(
        tr(
          lang,
          `Booking ${b.id} payment status set to ${nextPayment.toUpperCase()}.`,
          `بُکنگ ${b.id} کی ادائیگی کا اسٹیٹس ${trPaymentStatus(lang, nextPayment.toUpperCase())} کر دیا گیا۔`
        )
      );
      await onReload();
    } catch (err: any) {
      onShowToast(tr(lang, `Error updating payment: ${err.message}`, `ادائیگی اپڈیٹ کرنے میں خرابی: ${err.message}`));
    } finally {
      setActionBusyId(null);
    }
  };

  const handleUpdateTripStatus = async (b: Booking, nextStatus: string) => {
    setActionBusyId(b.id);
    try {
      await apiRequest(`/api/admin/bookings/${b.id}`, {
        method: 'PATCH',
        role: 'admin',
        body: { status: nextStatus },
      });
      onShowToast(
        tr(
          lang,
          `Booking ${b.id} status changed to ${nextStatus.toUpperCase()}.`,
          `بُکنگ ${b.id} کا اسٹیٹس ${trBookingStatus(lang, nextStatus)} کر دیا گیا۔`
        )
      );
      await onReload();
    } catch (err: any) {
      onShowToast(tr(lang, `Error updating trip status: ${err.message}`, `ٹرپ اسٹیٹس اپڈیٹ کرنے میں خرابی: ${err.message}`));
    } finally {
      setActionBusyId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-100 text-emerald-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      case 'started':
      case 'on_the_way':
      case 'arrived':
        return 'bg-blue-100 text-blue-800 animate-pulse';
      case 'confirmed':
        return 'bg-amber-100 text-amber-800';
      default:
        return 'bg-zinc-100 text-zinc-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#D4A017]/15 text-[#8F6400] text-xs font-bold uppercase tracking-wider mb-2">
            <FileText className="w-3.5 h-3.5" />
            {tr(lang, 'Super Admin Bookings & Invoices', 'سپر ایڈمن بکنگز اور انوائسز')}
          </div>
          <h1 className="font-display text-2xl font-bold text-[#0D0D10]">
            {tr(lang, 'Platform Trips, Invoices & Fares', 'پلیٹ فارم ٹرپس، انوائسز اور کرایہ')}
          </h1>
          <p className="text-xs text-zinc-500 mt-1 max-w-2xl">
            {tr(
              lang,
              'Super Admin full control over all bookings: monitor live status, update payment settlement, resolve disputes, and generate official stamped PDF invoices.',
              'تمام بکنگز پر سپر ایڈمن کا مکمل کنٹرول: لائیو صورتحال دیکھیں، ادائیگی اپڈیٹ کریں، مسائل حل کریں اور مہر شدہ پی ڈی ایف انوائس بنائیں۔'
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onReload()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {tr(lang, 'Refresh Bookings', 'بکنگز تازہ کریں')}
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={tr(lang, 'Search booking ID, route, user...', 'بُکنگ آئی ڈی، روٹ یا نام تلاش کریں...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-zinc-200 text-xs font-semibold focus:border-[#D4A017] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {[
            { id: 'all', label: tr(lang, 'All Trips', 'تمام ٹرپس') },
            { id: 'active', label: tr(lang, 'Active Trips', 'فعال ٹرپس') },
            { id: 'completed', label: tr(lang, 'Completed', 'مکمل شدہ') },
            { id: 'cancelled', label: tr(lang, 'Cancelled', 'منسوخ شدہ') },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl font-bold transition-colors ${
                statusFilter === tab.id
                  ? 'bg-[#0D0D10] text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bookings Table */}
      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-3.5">{tr(lang, 'Booking Ref', 'بُکنگ نمبر')}</th>
                <th className="px-4 py-3.5">{tr(lang, 'Passenger', 'مسافر')}</th>
                <th className="px-4 py-3.5">{tr(lang, 'Pro Partner', 'پرو پارٹنر')}</th>
                <th className="px-4 py-3.5">{tr(lang, 'Route', 'روٹ')}</th>
                <th className="px-4 py-3.5 text-right">{tr(lang, 'Fare (PKR)', 'کرایہ (روپے)')}</th>
                <th className="px-4 py-3.5 text-center">{tr(lang, 'Payment', 'ادائیگی')}</th>
                <th className="px-4 py-3.5 text-center">{tr(lang, 'Trip Status', 'ٹرپ اسٹیٹس')}</th>
                <th className="px-5 py-3.5 text-right">{tr(lang, 'Actions', 'کارروائی')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-zinc-400">
                    {tr(lang, 'No bookings found matching filter.', 'فلٹر کے مطابق کوئی بکنگ نہیں ملی۔')}
                  </td>
                </tr>
              ) : (
                filteredBookings.map((b) => {
                  const isBusy = actionBusyId === b.id;
                  const isPaid = (b.payment_status || 'unpaid').toLowerCase() === 'paid';

                  return (
                    <tr key={b.id} className="hover:bg-zinc-50/70 transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-mono font-bold text-[#0D0D10] text-xs">{b.id}</div>
                        <div className="text-[10px] text-zinc-400 font-mono">
                          {trService(lang, b.service_type || '')} ·{' '}
                          {b.created_at ? new Date(b.created_at).toLocaleDateString() : ''}
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <div className="font-bold text-[#0D0D10]">{b.passenger_name}</div>
                        <div className="text-[11px] text-zinc-500 font-mono">{b.passenger_phone}</div>
                      </td>

                      <td className="px-4 py-4">
                        {b.partner_name ? (
                          <>
                            <div className="font-semibold text-zinc-800">{b.partner_name}</div>
                            <div className="text-[11px] text-zinc-500 font-mono">
                              {b.partner_phone} · {b.vehicle_category_name || tr(lang, 'Assigned', 'مقرر شدہ')}
                            </div>
                          </>
                        ) : (
                          <span className="text-zinc-400 italic">{tr(lang, 'Searching nearby partner...', 'قریبی پارٹنر تلاش ہو رہا ہے...')}</span>
                        )}
                      </td>

                      <td className="px-4 py-4 max-w-xs truncate">
                        <div className="flex items-center gap-1 font-semibold text-zinc-800 truncate">
                          <MapPin className="w-3 h-3 text-[#D4A017] shrink-0" />
                          <span className="truncate">{b.pickup_address}</span>
                        </div>
                        <div className="text-zinc-400 text-[11px] truncate mt-0.5">
                          → {b.dropoff_address} ({b.distance_km} {tr(lang, 'km', 'کلومیٹر')})
                        </div>
                      </td>

                      <td className="px-4 py-4 text-right font-mono font-bold text-[#0D0D10] text-sm">
                        Rs. {Number(b.total_bill_pkr).toLocaleString()}
                        <div className="text-[10px] text-emerald-700 font-normal">
                          {tr(lang, 'Comm:', 'کمیشن:')} Rs. {Number(b.commission_pkr || 0).toLocaleString()}
                        </div>
                      </td>

                      <td className="px-4 py-4 text-center">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleUpdatePayment(b, isPaid ? 'unpaid' : 'paid')}
                          className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition-colors ${
                            isPaid
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                          }`}
                          title={tr(lang, 'Click to toggle payment collected status', 'ادائیگی کا اسٹیٹس بدلنے کے لیے کلک کریں')}
                        >
                          {isPaid ? trPaymentStatus(lang, 'PAID') : trPaymentStatus(lang, 'UNPAID')}
                        </button>
                      </td>

                      <td className="px-4 py-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${getStatusBadge(
                            b.status
                          )}`}
                        >
                          {trBookingStatus(lang, b.status)}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedBooking(b)}
                            className="p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700"
                            title={tr(lang, 'View Full Fare Breakdown', 'مکمل کرایہ تفصیل دیکھیں')}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadBookingPdf(b, 'admin', b.passenger_name)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0D0D10] hover:bg-zinc-800 text-white font-bold text-[11px] transition-colors"
                            title={tr(lang, 'Download Stamped PDF Invoice', 'مہر شدہ پی ڈی ایف انوائس ڈاؤن لوڈ کریں')}
                          >
                            <Download className="w-3 h-3 text-[#D4A017]" />
                            PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Booking Details & Fare Breakdown Modal */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-zinc-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-5 bg-[#0D0D10] text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-[#D4A017] tracking-widest">
                  {tr(lang, 'Trip Fare & Audit Breakdown', 'ٹرپ کرایہ اور آڈٹ تفصیل')}
                </span>
                <h3 className="font-display font-bold text-lg">{selectedBooking.id}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="p-1 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {/* Trip Route Details */}
              <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-600 mt-1 shrink-0" />
                  <div>
                    <span className="text-[10px] uppercase font-bold text-zinc-400">{tr(lang, 'Pickup', 'پک اپ')}</span>
                    <p className="font-semibold text-zinc-800">{selectedBooking.pickup_address}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-600 mt-1 shrink-0" />
                  <div>
                    <span className="text-[10px] uppercase font-bold text-zinc-400">{tr(lang, 'Dropoff', 'ڈراپ آف')}</span>
                    <p className="font-semibold text-zinc-800">{selectedBooking.dropoff_address}</p>
                  </div>
                </div>
              </div>

              {/* Financial Calculation Itemization */}
              <div className="space-y-2 border-t border-zinc-100 pt-3">
                <div className="flex justify-between text-zinc-600">
                  <span>{tr(lang, 'Base Booking Fare', 'بنیادی بُکنگ کرایہ')}</span>
                  <span className="font-mono font-bold">Rs. {selectedBooking.base_fare_pkr ?? 200}</span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>
                    {tr(lang, 'Road Distance', 'سڑک کا فاصلہ')} ({selectedBooking.distance_km} {tr(lang, 'km', 'کلومیٹر')} @ Rs. {selectedBooking.rate_per_km_pkr ?? 38}/{tr(lang, 'km', 'کلومیٹر')})
                  </span>
                  <span className="font-mono font-bold">
                    Rs. {Math.round(selectedBooking.distance_km * (selectedBooking.rate_per_km_pkr ?? 38))}
                  </span>
                </div>
                {Boolean(selectedBooking.waiting_charge_pkr && selectedBooking.waiting_charge_pkr > 0) && (
                  <div className="flex justify-between text-zinc-600">
                    <span>{tr(lang, 'Waiting Charges', 'انتظار چارجز')} ({selectedBooking.waiting_minutes ?? 0} {tr(lang, 'mins', 'منٹ')})</span>
                    <span className="font-mono font-bold">Rs. {selectedBooking.waiting_charge_pkr}</span>
                  </div>
                )}
                {Boolean(selectedBooking.extra_stops_count && selectedBooking.extra_stops_count > 0) && (
                  <div className="flex justify-between text-zinc-600">
                    <span>{tr(lang, 'Extra Stops', 'اضافی اسٹاپس')} ({selectedBooking.extra_stops_count})</span>
                    <span className="font-mono font-bold">
                      Rs. {selectedBooking.extra_stops_charge_pkr ?? 0}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-[#0D0D10] pt-2 border-t border-zinc-200">
                  <span>{tr(lang, 'Total Bill (PKR)', 'کل بل (روپے)')}</span>
                  <span className="font-mono text-[#D4A017] text-base">
                    Rs. {Number(selectedBooking.total_bill_pkr).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-600 text-[11px]">
                  <span>{tr(lang, 'Platform Commission', 'پلیٹ فارم کمیشن')} ({selectedBooking.commission_pct ?? 15}%)</span>
                  <span className="font-mono font-bold text-emerald-700">
                    Rs. {Number(selectedBooking.commission_pkr).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-600 text-[11px]">
                  <span>{tr(lang, 'Pro Partner Payout', 'پرو پارٹنر ادائیگی')}</span>
                  <span className="font-mono font-bold text-zinc-800">
                    Rs. {Number(selectedBooking.driver_payout_pkr ?? (selectedBooking.total_bill_pkr - selectedBooking.commission_pkr)).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Admin Override Trip Actions */}
              <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#8F6400]">
                  {tr(lang, 'Super Admin Trip Actions', 'سپر ایڈمن ٹرپ کارروائیاں')}
                </span>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={async () => {
                      await handleUpdateTripStatus(selectedBooking, 'completed');
                      setSelectedBooking(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-700 text-white font-bold"
                  >
                    {tr(lang, 'Mark Completed', 'مکمل قرار دیں')}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await handleUpdateTripStatus(selectedBooking, 'cancelled');
                      setSelectedBooking(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-red-600 text-white font-bold"
                  >
                    {tr(lang, 'Cancel Booking', 'بُکنگ منسوخ کریں')}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadBookingPdf(selectedBooking, 'admin', selectedBooking.passenger_name)}
                    className="px-3 py-1.5 rounded-xl bg-[#0D0D10] text-white font-bold inline-flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5 text-[#D4A017]" /> {tr(lang, 'Download Stamped Invoice', 'مہر شدہ انوائس ڈاؤن لوڈ')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
