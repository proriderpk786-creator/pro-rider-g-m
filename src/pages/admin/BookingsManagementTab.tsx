import React, { useState } from 'react';
import {
  Award,
  Car,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  Star,
  Users,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { InvoiceViewerModal } from '../../components/InvoiceViewerModal';
import { tr, trBookingStatus, trPaymentStatus, trService } from '../../i18n/translations';
import { apiRequest } from '../../utils/api';
import { downloadBookingPdf } from '../../utils/pdfGenerator';
import type { Booking, BookingApplication, Language } from '../../types';

interface BookingsManagementTabProps {
  bookings: Booking[];
  lang?: Language;
  onReload: () => Promise<void>;
  onShowToast: (msg: string) => void;
}

type CategoryFilter =
  | 'all'
  | 'go_now'
  | 'pick_and_drop'
  | 'ride_sharing'
  | 'fuel_sharing'
  | 'monthly_applicants';

export const BookingsManagementTab: React.FC<BookingsManagementTabProps> = ({
  bookings,
  lang = 'en',
  onReload,
  onShowToast,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [invoiceBooking, setInvoiceBooking] = useState<Booking | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const activeSelectedBooking = selectedBooking
    ? bookings.find((b) => b.id === selectedBooking.id) || selectedBooking
    : null;

  const categoryCounts = {
    all: bookings.length,
    go_now: bookings.filter((b) => b.booking_mode === 'go_now').length,
    pick_and_drop: bookings.filter((b) => b.booking_mode === 'schedule' && b.service_type === 'pick_and_drop').length,
    ride_sharing: bookings.filter((b) => b.booking_mode === 'schedule' && b.service_type === 'ride_sharing').length,
    fuel_sharing: bookings.filter((b) => b.booking_mode === 'schedule' && b.service_type === 'fuel_sharing').length,
    monthly_applicants: bookings.filter(
      (b) =>
        b.booking_mode === 'schedule' &&
        !b.partner_id &&
        ['searching', 'negotiating'].includes(b.status) &&
        ((b.total_applicants_count || 0) > 0 ||
          (b.applications || []).some((a) => a.status === 'pending'))
    ).length,
  };

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

    const matchesCategory =
      categoryFilter === 'all'
        ? true
        : categoryFilter === 'go_now'
        ? b.booking_mode === 'go_now'
        : categoryFilter === 'pick_and_drop'
        ? b.booking_mode === 'schedule' && b.service_type === 'pick_and_drop'
        : categoryFilter === 'ride_sharing'
        ? b.booking_mode === 'schedule' && b.service_type === 'ride_sharing'
        : categoryFilter === 'fuel_sharing'
        ? b.booking_mode === 'schedule' && b.service_type === 'fuel_sharing'
        : categoryFilter === 'monthly_applicants'
        ? b.booking_mode === 'schedule' &&
          !b.partner_id &&
          ['searching', 'negotiating'].includes(b.status) &&
          ((b.total_applicants_count || 0) > 0 ||
            (b.applications || []).some((a) => a.status === 'pending'))
        : true;

    return matchesSearch && matchesStatus && matchesCategory;
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

  const handleApprovePartner = async (b: Booking, app: BookingApplication) => {
    setActionBusyId(app.id);
    try {
      await apiRequest(`/api/admin/bookings/${b.id}/approve-partner`, {
        method: 'POST',
        role: 'admin',
        body: {
          applicationId: app.id,
          partnerId: app.partner_id,
          agreedFarePkr: app.proposed_fare_pkr || b.total_bill_pkr,
        },
      });
      onShowToast(
        tr(
          lang,
          `Approved ${app.partner_name || 'Pro Partner'} for ${b.id}.`,
          `${app.partner_name || 'پرو پارٹنر'} کو بکنگ ${b.id} کے لیے منظور کر لیا گیا۔`
        )
      );
      await onReload();
    } catch (err: any) {
      onShowToast(tr(lang, `Approval failed: ${err.message}`, `منظوری میں خرابی: ${err.message}`));
    } finally {
      setActionBusyId(null);
    }
  };

  const handleRejectApplication = async (b: Booking, app: BookingApplication) => {
    setActionBusyId(app.id);
    try {
      await apiRequest(`/api/admin/bookings/${b.id}/applications/${app.id}/reject`, {
        method: 'POST',
        role: 'admin',
      });
      onShowToast(
        tr(
          lang,
          `Application from ${app.partner_name || 'driver'} declined.`,
          `${app.partner_name || 'ڈرائیور'} کی درخواست مسترد کر دی گئی۔`
        )
      );
      await onReload();
    } catch (err: any) {
      onShowToast(tr(lang, `Reject failed: ${err.message}`, `مسترد کرنے میں خرابی: ${err.message}`));
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
        return 'bg-blue-100 text-blue-800';
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
            {tr(lang, 'Super Admin Bookings, Approvals & Invoices', 'سپر ایڈمن بکنگز، منظوریاں اور انوائسز')}
          </div>
          <h1 className="font-display text-2xl font-bold text-[#0D0D10]">
            {tr(lang, 'Platform Trips, Monthly Approvals & Fares', 'پلیٹ فارم ٹرپس، ماہانہ منظوریاں اور کرایہ')}
          </h1>
          <p className="text-xs text-zinc-500 mt-1 max-w-2xl">
            {tr(
              lang,
              'Instant rides match automatically with nearest Pro Partners. Monthly requests collect driver applications here for Super Admin review and final assignment.',
              'فوری رائیڈز قریبی پارٹنر کو براہِ راست ملتی ہیں۔ ماہانہ بکنگز پر ڈرائیورز کی درخواستیں یہاں سپر ایڈمن کی حتمی منظوری کے لیے آتی ہیں۔'
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

      {/* Category Filter Strip with Live Counters */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { id: 'all', label: tr(lang, 'All Categories', 'تمام اقسام'), count: categoryCounts.all },
            { id: 'go_now', label: tr(lang, 'Instant Booking', 'فوری بکنگ'), count: categoryCounts.go_now },
            { id: 'pick_and_drop', label: tr(lang, 'Pick & Drop', 'پک اینڈ ڈراپ'), count: categoryCounts.pick_and_drop },
            { id: 'ride_sharing', label: tr(lang, 'Ride Sharing', 'رائیڈ شیئرنگ'), count: categoryCounts.ride_sharing },
            { id: 'fuel_sharing', label: tr(lang, 'Fuel Sharing', 'فیول شیئرنگ'), count: categoryCounts.fuel_sharing },
            {
              id: 'monthly_applicants',
              label: tr(lang, 'Pending Partner Approval', 'پارٹنر منظوری درکار'),
              count: categoryCounts.monthly_applicants,
              highlight: true,
            },
          ] as Array<{ id: CategoryFilter; label: string; count: number; highlight?: boolean }>
        ).map((cat) => {
          const active = categoryFilter === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryFilter(cat.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors border ${
                active
                  ? 'bg-[#0D0D10] text-white border-[#0D0D10]'
                  : cat.highlight && cat.count > 0
                  ? 'bg-amber-50 text-[#8F6400] border-[#D4A017] hover:bg-amber-100'
                  : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              <span>{cat.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  active
                    ? 'bg-[#D4A017] text-[#0D0D10]'
                    : cat.highlight && cat.count > 0
                    ? 'bg-[#D4A017] text-[#0D0D10]'
                    : 'bg-zinc-100 text-zinc-700'
                }`}
              >
                {cat.count}
              </span>
            </button>
          );
        })}
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
                <th className="px-4 py-3.5">{tr(lang, 'Pro Partner / Applicants', 'پرو پارٹنر / درخواستیں')}</th>
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
                  const pendingApplicants =
                    b.applications?.filter((a) => a.status === 'pending').length ??
                    b.total_applicants_count ??
                    0;

                  return (
                    <tr key={b.id} className="hover:bg-zinc-50/70 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-[#0D0D10] text-xs">{b.id}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                              b.booking_mode === 'go_now'
                                ? 'bg-amber-100 text-[#8F6400]'
                                : 'bg-indigo-100 text-indigo-800'
                            }`}
                          >
                            {b.booking_mode === 'go_now'
                              ? tr(lang, 'INSTANT', 'فوری')
                              : tr(lang, 'MONTHLY', 'ماہانہ')}
                          </span>
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
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
                        ) : pendingApplicants > 0 ? (
                          <button
                            type="button"
                            onClick={() => setSelectedBooking(b)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#D4A017] hover:bg-[#EAB308] text-[#0D0D10] font-bold text-[11px] shadow-sm"
                          >
                            <Users className="w-3.5 h-3.5" />
                            {tr(
                              lang,
                              `${pendingApplicants} Applied · Approve`,
                              `${pendingApplicants} درخواستیں · منظور کریں`
                            )}
                          </button>
                        ) : (
                          <span className="text-zinc-400 italic">
                            {b.booking_mode === 'schedule'
                              ? tr(lang, 'Awaiting driver applications...', 'ڈرائیورز کی درخواستوں کا انتظار...')
                              : tr(lang, 'Searching nearby partner...', 'قریبی پارٹنر تلاش ہو رہا ہے...')}
                          </span>
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
                            title={tr(lang, 'Inspect Booking & Driver Applicants', 'تفصیل اور ڈرائیور درخواستیں دیکھیں')}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setInvoiceBooking(b)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-[#0D0D10] font-bold text-[11px] transition-colors"
                            title={tr(lang, 'View & Print Executive Invoice', 'انوائس دیکھیں اور پرنٹ کریں')}
                          >
                            <FileText className="w-3 h-3 text-[#D4A017]" />
                            {tr(lang, 'Invoice', 'انوائس')}
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

      {/* Booking Details, Driver Applicants Approval & Fare Breakdown Modal */}
      {activeSelectedBooking && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl bg-white shadow-2xl border border-zinc-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-5 bg-[#0D0D10] text-white flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-[#D4A017] tracking-widest">
                    {activeSelectedBooking.booking_mode === 'go_now'
                      ? tr(lang, 'Instant Ride · Audit Breakdown', 'فوری رائیڈ · کرایہ اور آڈٹ تفصیل')
                      : tr(lang, 'Monthly Package · Partner Approval & Fare', 'ماہانہ پیکیج · پارٹنر منظوری اور کرایہ')}
                  </span>
                </div>
                <h3 className="font-display font-bold text-lg">
                  {activeSelectedBooking.id} · {trService(lang, activeSelectedBooking.service_type || '')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="p-1 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs overflow-y-auto">
              {/* Passenger + Route Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-zinc-50 p-4 rounded-2xl border border-zinc-200">
                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-400">{tr(lang, 'Passenger', 'مسافر')}</span>
                  <p className="font-bold text-[#0D0D10]">{activeSelectedBooking.passenger_name}</p>
                  <p className="font-mono text-zinc-600">{activeSelectedBooking.passenger_phone}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-400">{tr(lang, 'Assigned Pro Partner', 'مقرر شدہ پرو پارٹنر')}</span>
                  {activeSelectedBooking.partner_name ? (
                    <>
                      <p className="font-bold text-emerald-800">{activeSelectedBooking.partner_name}</p>
                      <p className="font-mono text-zinc-600">{activeSelectedBooking.partner_phone}</p>
                    </>
                  ) : (
                    <p className="text-amber-700 font-semibold">
                      {activeSelectedBooking.booking_mode === 'schedule'
                        ? tr(lang, 'Awaiting Admin Approval', 'ایڈمن کی منظوری درکار ہے')
                        : tr(lang, 'Not Assigned Yet', 'ابھی مقرر نہیں ہوا')}
                    </p>
                  )}
                </div>
              </div>

              <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-600 mt-1 shrink-0" />
                  <div>
                    <span className="text-[10px] uppercase font-bold text-zinc-400">{tr(lang, 'Pickup', 'پک اپ')}</span>
                    <p className="font-semibold text-zinc-800">{activeSelectedBooking.pickup_address}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-600 mt-1 shrink-0" />
                  <div>
                    <span className="text-[10px] uppercase font-bold text-zinc-400">{tr(lang, 'Dropoff', 'ڈراپ آف')}</span>
                    <p className="font-semibold text-zinc-800">{activeSelectedBooking.dropoff_address}</p>
                  </div>
                </div>
              </div>

              {/* Monthly Driver Applicants Section */}
              {(activeSelectedBooking.booking_mode === 'schedule' ||
                (activeSelectedBooking.applications && activeSelectedBooking.applications.length > 0)) && (
                <div className="rounded-2xl border-2 border-[#D4A017]/50 bg-amber-50/40 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4 text-[#B8860B]" />
                      <h4 className="font-display font-bold text-sm text-[#0D0D10]">
                        {tr(lang, 'Driver Applications for Monthly Assignment', 'ماہانہ بکنگ کے لیے ڈرائیور درخواستیں')}
                      </h4>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-[#D4A017] text-[#0D0D10] font-mono font-bold text-[10px]">
                      {(activeSelectedBooking.applications || []).length}{' '}
                      {tr(lang, 'Total', 'کل')}
                    </span>
                  </div>

                  {!activeSelectedBooking.applications || activeSelectedBooking.applications.length === 0 ? (
                    <div className="rounded-xl bg-white border border-zinc-200 p-4 text-center text-zinc-500">
                      {tr(
                        lang,
                        'No Pro Partners have applied to this monthly booking yet. Once drivers tap Accept & Send to Admin, they will appear here with phone numbers and vehicle specs.',
                        'ابھی تک کسی پرو پارٹنر نے اس ماہانہ بکنگ پر درخواست نہیں دی۔ ڈرائیور کے قبول کرنے پر ان کا نمبر اور گاڑی کی تفصیل یہاں ظاہر ہو گی۔'
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {activeSelectedBooking.applications.map((app) => {
                        const isAppBusy = actionBusyId === app.id;
                        const isApproved = app.status === 'approved';
                        const isRejected = app.status === 'rejected';
                        return (
                          <div
                            key={app.id}
                            className={`rounded-2xl border p-3.5 bg-white space-y-2 ${
                              isApproved
                                ? 'border-emerald-400 bg-emerald-50/40'
                                : isRejected
                                ? 'border-zinc-200 opacity-65'
                                : 'border-amber-200'
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-display font-bold text-sm text-[#0D0D10]">
                                    {app.partner_name || app.partner_id}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                      isApproved
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : isRejected
                                        ? 'bg-red-100 text-red-700'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}
                                  >
                                    {app.status}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-600 font-mono mt-1">
                                  <span className="inline-flex items-center gap-1">
                                    <Phone className="w-3 h-3 text-[#D4A017]" />
                                    {app.partner_phone || 'N/A'}
                                  </span>
                                  {app.partner_whatsapp && (
                                    <span>WA: {app.partner_whatsapp}</span>
                                  )}
                                  {app.partner_operating_city && (
                                    <span>{app.partner_operating_city}</span>
                                  )}
                                </div>
                              </div>

                              <div className="text-right font-mono">
                                <div className="text-xs font-bold text-[#0D0D10]">
                                  Rs. {Number(app.proposed_fare_pkr || activeSelectedBooking.total_bill_pkr).toLocaleString()}
                                </div>
                                <div className="text-[10px] text-zinc-500 inline-flex items-center gap-1">
                                  <Wallet className="w-3 h-3 text-emerald-700" />
                                  {tr(lang, 'Wallet:', 'والیٹ:')} Rs.{' '}
                                  {Number(app.wallet_balance_pkr ?? app.wallet_balance_snapshot_pkr ?? 0).toLocaleString()}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-600 pt-1 border-t border-zinc-100">
                              <span className="inline-flex items-center gap-1">
                                <Car className="w-3.5 h-3.5 text-zinc-400" />
                                <strong>{app.partner_vehicle_name || 'N/A'}</strong> ({app.partner_vehicle_number || '—'})
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3 h-3 text-zinc-400" />
                                {app.completed_trips ?? 0} {tr(lang, 'trips', 'ٹرپس')}
                              </span>
                              {app.avg_rating && (
                                <span className="inline-flex items-center gap-0.5 text-amber-600 font-bold">
                                  <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                                  {app.avg_rating}
                                </span>
                              )}
                              {app.distance_to_pickup_km !== null && app.distance_to_pickup_km !== undefined && (
                                <span className="font-mono text-emerald-700 font-semibold">
                                  {app.distance_to_pickup_km} {tr(lang, 'km away', 'کلومیٹر دور')}
                                </span>
                              )}
                            </div>

                            {app.note && (
                              <p className="text-[11px] text-zinc-600 italic bg-zinc-50 px-2.5 py-1.5 rounded-lg">
                                &ldquo;{app.note}&rdquo;
                              </p>
                            )}

                            {app.status === 'pending' &&
                              !['completed', 'cancelled'].includes(activeSelectedBooking.status) && (
                                <div className="flex flex-wrap gap-2 pt-1">
                                  <button
                                    type="button"
                                    disabled={isAppBusy}
                                    onClick={() => handleApprovePartner(activeSelectedBooking, app)}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs disabled:opacity-50"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    {tr(lang, 'Approve & Assign Partner', 'منظور اور مقرر کریں')}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isAppBusy}
                                    onClick={() => handleRejectApplication(activeSelectedBooking, app)}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 font-bold text-xs disabled:opacity-50"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                    {tr(lang, 'Decline', 'مسترد کریں')}
                                  </button>
                                </div>
                              )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Financial Calculation Itemization */}
              <div className="space-y-2 border-t border-zinc-100 pt-3">
                <div className="flex justify-between text-zinc-600">
                  <span>{tr(lang, 'Base Booking Fare', 'بنیادی بُکنگ کرایہ')}</span>
                  <span className="font-mono font-bold">Rs. {activeSelectedBooking.base_fare_pkr ?? 200}</span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>
                    {tr(lang, 'Road Distance', 'سڑک کا فاصلہ')} ({activeSelectedBooking.distance_km}{' '}
                    {tr(lang, 'km', 'کلومیٹر')} @ Rs. {activeSelectedBooking.rate_per_km_pkr ?? 38}/
                    {tr(lang, 'km', 'کلومیٹر')})
                  </span>
                  <span className="font-mono font-bold">
                    Rs.{' '}
                    {Math.round(
                      activeSelectedBooking.distance_km * (activeSelectedBooking.rate_per_km_pkr ?? 38)
                    )}
                  </span>
                </div>
                {Boolean(activeSelectedBooking.waiting_charge_pkr && activeSelectedBooking.waiting_charge_pkr > 0) && (
                  <div className="flex justify-between text-zinc-600">
                    <span>
                      {tr(lang, 'Waiting Charges', 'انتظار چارجز')} ({activeSelectedBooking.waiting_minutes ?? 0}{' '}
                      {tr(lang, 'mins', 'منٹ')})
                    </span>
                    <span className="font-mono font-bold">Rs. {activeSelectedBooking.waiting_charge_pkr}</span>
                  </div>
                )}
                {Boolean(activeSelectedBooking.extra_stops_count && activeSelectedBooking.extra_stops_count > 0) && (
                  <div className="flex justify-between text-zinc-600">
                    <span>
                      {tr(lang, 'Extra Stops', 'اضافی اسٹاپس')} ({activeSelectedBooking.extra_stops_count})
                    </span>
                    <span className="font-mono font-bold">
                      Rs. {activeSelectedBooking.extra_stops_charge_pkr ?? 0}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-[#0D0D10] pt-2 border-t border-zinc-200">
                  <span>{tr(lang, 'Total Bill (PKR)', 'کل بل (روپے)')}</span>
                  <span className="font-mono text-[#D4A017] text-base">
                    Rs. {Number(activeSelectedBooking.total_bill_pkr).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-600 text-[11px]">
                  <span>
                    {tr(lang, 'Platform Commission', 'پلیٹ فارم کمیشن')} ({activeSelectedBooking.commission_pct ?? 15}%)
                  </span>
                  <span className="font-mono font-bold text-emerald-700">
                    Rs. {Number(activeSelectedBooking.commission_pkr).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-600 text-[11px]">
                  <span>{tr(lang, 'Pro Partner Payout', 'پرو پارٹنر ادائیگی')}</span>
                  <span className="font-mono font-bold text-zinc-800">
                    Rs.{' '}
                    {Number(
                      activeSelectedBooking.driver_payout_pkr ??
                        activeSelectedBooking.total_bill_pkr - activeSelectedBooking.commission_pkr
                    ).toLocaleString()}
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
                      await handleUpdateTripStatus(activeSelectedBooking, 'completed');
                      setSelectedBooking(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-700 text-white font-bold"
                  >
                    {tr(lang, 'Mark Completed', 'مکمل قرار دیں')}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await handleUpdateTripStatus(activeSelectedBooking, 'cancelled');
                      setSelectedBooking(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-red-600 text-white font-bold"
                  >
                    {tr(lang, 'Cancel Booking', 'بُکنگ منسوخ کریں')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvoiceBooking(activeSelectedBooking)}
                    className="px-3 py-1.5 rounded-xl border border-zinc-300 bg-white text-[#0D0D10] font-bold inline-flex items-center gap-1"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#D4A017]" />{' '}
                    {tr(lang, 'View Invoice', 'انوائس دیکھیں')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadBookingPdf(activeSelectedBooking, 'admin', activeSelectedBooking.passenger_name)
                    }
                    className="px-3 py-1.5 rounded-xl bg-[#0D0D10] text-white font-bold inline-flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5 text-[#D4A017]" />{' '}
                    {tr(lang, 'Download Stamped Invoice', 'مہر شدہ انوائس ڈاؤن لوڈ')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <InvoiceViewerModal
        booking={invoiceBooking}
        viewerRole="admin"
        passengerName={invoiceBooking?.passenger_name}
        lang={lang}
        onClose={() => setInvoiceBooking(null)}
      />
    </div>
  );
};
