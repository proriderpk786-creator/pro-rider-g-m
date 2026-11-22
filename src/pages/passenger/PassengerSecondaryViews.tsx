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
import { apiRequest } from '../../utils/api';
import { downloadBookingPdf, downloadWalletStatementPdf, shareBookingPdf } from '../../utils/pdfGenerator';
import type {
  AppNotification,
  Booking,
  SupportTicket,
  User,
  WalletTransaction,
} from '../../types';

// Screen 12: My Bookings
export const PassengerBookingsView: React.FC<{
  bookings: Booking[];
  passengerName: string;
  onRefresh: () => Promise<void>;
  onOpenSupport: (bookingId: string) => void;
}> = ({ bookings, passengerName, onRefresh, onOpenSupport }) => {
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
      setDriverPreview({ loading: false, error: err?.message || 'Driver showcase not available offline.' });
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold text-[#0D0D10]">My Bookings</h2>
        <div className="inline-flex rounded-xl bg-zinc-100 p-1 gap-1">
          {(['active', 'upcoming', 'completed', 'cancelled'] as const).map((tb) => (
            <button
              key={tb}
              type="button"
              onClick={() => setTab(tb)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                tab === tb ? 'bg-[#0D0D10] text-white' : 'text-zinc-600 hover:text-[#0D0D10]'
              }`}
            >
              {tb}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
          No {tab} bookings found.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filtered.map((b) => (
            <div key={b.id} className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
                    <span className="font-bold text-[#0D0D10]">{b.id}</span>
                    <span aria-hidden="true">·</span>
                    <span>{b.pickup_date} {b.pickup_time}</span>
                    <span aria-hidden="true">·</span>
                    <span>{b.service_type.replaceAll('_', ' ')}</span>
                  </div>
                  <p className="text-sm font-semibold text-[#0D0D10] mt-1">
                    {b.pickup_address} → {b.dropoff_address}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {b.vehicle_category_name} · {b.distance_km} km · Status: <strong className="uppercase">{b.status.replaceAll('_', ' ')}</strong>
                  </p>
                </div>

                <div className="text-right">
                  <div className="font-mono text-lg font-bold text-[#0D0D10]">
                    Rs. {Number(b.total_bill_pkr).toLocaleString()}
                  </div>
                  <div className="text-[11px] font-semibold text-zinc-500">
                    {b.payment_status} · Paid Rs. {Number(b.amount_paid_pkr).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShareBooking(b)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#D4A017] text-[#0D0D10] text-xs font-bold hover:bg-[#EAB308] transition-colors"
                  title="Share live trip route and ETA"
                >
                  <Radio className="w-3.5 h-3.5 text-[#0D0D10]" />
                  Share Trip Status
                </button>
                <button
                  type="button"
                  onClick={() => downloadBookingPdf(b, 'passenger', passengerName)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0D0D10] text-white text-xs font-semibold hover:bg-zinc-800"
                >
                  <Download className="w-3.5 h-3.5 text-[#D4A017]" />
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => shareBookingPdf(b, 'passenger', passengerName)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-semibold hover:bg-zinc-50"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Share Invoice
                </button>
                <button
                  type="button"
                  onClick={() => onOpenSupport(b.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-semibold hover:bg-zinc-50"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  Contact Support
                </button>
                {b.partner_id && (
                  <button
                    type="button"
                    onClick={() => void openDriverPublicProfile(b.partner_id!)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 text-xs font-semibold hover:bg-zinc-100"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-[#D4A017]" />
                    {b.partner_name ? `${b.partner_name} · Profile` : 'Driver Profile'}
                  </button>
                )}
                {b.status === 'completed' && !b.my_rating && (
                  <button
                    type="button"
                    onClick={() => setRatingTarget(b.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#D4A017] text-[#0D0D10] text-xs font-bold"
                  >
                    <Star className="w-3.5 h-3.5" />
                    Rate Trip
                  </button>
                )}
                {b.my_rating && (
                  <span className="text-xs font-semibold text-emerald-700 inline-flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                    Rated {b.my_rating}/5
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
                      <option key={n} value={n}>{n} Stars</option>
                    ))}
                  </select>
                  <input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Share trip feedback..."
                    className="flex-1 min-w-[180px] px-3 py-1.5 rounded-lg border border-zinc-200 bg-white text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => submitRating(b.id)}
                    className="px-3.5 py-1.5 rounded-lg bg-[#0D0D10] text-white text-xs font-semibold"
                  >
                    Submit Rating
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
        lang="en"
      />

      {driverPreview && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full max-h-[86vh] overflow-y-auto shadow-2xl border border-zinc-200">
            <div className="px-5 py-3.5 border-b border-zinc-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <span className="font-display font-bold text-sm text-[#0D0D10]">Pro Partner Profile</span>
              <button
                type="button"
                onClick={() => setDriverPreview(null)}
                className="p-1.5 rounded-lg hover:bg-zinc-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {driverPreview.loading ? (
              <div className="p-8 text-center text-xs text-zinc-500">Loading Pro Partner profile...</div>
            ) : driverPreview.error ? (
              <div className="p-6 text-center text-xs text-red-700">{driverPreview.error}</div>
            ) : !driverPreview.data?.published ? (
              <div className="p-8 text-center space-y-2">
                <Lock className="w-9 h-9 text-[#D4A017] mx-auto" />
                <h4 className="font-display font-bold text-base text-[#0D0D10]">
                  {driverPreview.data?.full_name || 'Verified Driver'}
                </h4>
                <p className="text-xs text-zinc-600">
                  This driver has set their public showcase photos to Private (Admin Verified).
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
                        <ShieldCheck className="w-3 h-3" /> Verified
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
                    {driverPreview.data.completedTrips || 0} Completed Trips
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
  wallet: {
    balancePkr: number;
    totalPaymentsPkr: number;
    outstandingPkr: number;
    transactions: WalletTransaction[];
  };
  onRefresh: () => Promise<void>;
}> = ({ passengerName, bookings, wallet, onRefresh }) => {
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
      setMsg(`Wallet credited (${res.txRef}).`);
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
      setMsg(`Payment confirmed (${res.txRef}).`);
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
        <h2 className="font-display text-2xl font-bold text-[#0D0D10]">Passenger Digital Wallet</h2>
        <button
          type="button"
          onClick={() => downloadWalletStatementPdf(passengerName, 'Passenger', wallet.balancePkr, wallet.transactions)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0D0D10] text-white text-xs font-semibold hover:bg-zinc-800"
        >
          <Download className="w-3.5 h-3.5 text-[#D4A017]" />
          Download Statement PDF
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-[#0D0D10] text-white p-5">
          <span className="text-xs text-zinc-400">Wallet Balance</span>
          <div className="font-mono text-2xl font-bold text-[#D4A017] mt-1">
            Rs. {wallet.balancePkr.toLocaleString()}
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <span className="text-xs text-zinc-500">Total Confirmed Payments</span>
          <div className="font-mono text-2xl font-bold text-[#0D0D10] mt-1">
            Rs. {wallet.totalPaymentsPkr.toLocaleString()}
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <span className="text-xs text-zinc-500">Outstanding Amount</span>
          <div className="font-mono text-2xl font-bold text-amber-700 mt-1">
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
            <WalletIcon className="w-4 h-4 text-[#D4A017]" /> Add Funds to Wallet
          </h3>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Amount (PKR)</label>
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
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Payment Channel</label>
            <select
              value={topupMethod}
              onChange={(e) => setTopupMethod(e.target.value as any)}
              className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm bg-white"
            >
              <option value="jazzcash">JazzCash</option>
              <option value="easypaisa">EasyPaisa</option>
              <option value="bank_transfer">Bank Transfer / Raast</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold hover:bg-[#EAB308]"
          >
            Confirm Wallet Top-up
          </button>
        </form>

        <div className="lg:col-span-7 rounded-2xl border border-zinc-200 bg-white p-5 space-y-3">
          <h3 className="font-display font-bold text-base flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[#D4A017]" /> Pending Booking Bills
          </h3>
          {unpaidBookings.length === 0 ? (
            <p className="text-xs text-zinc-500 py-4">No outstanding booking balances.</p>
          ) : (
            <div className="space-y-3">
              {unpaidBookings.map((b) => {
                const rem = Math.max(0, Number(b.total_bill_pkr) - Number(b.amount_paid_pkr));
                return (
                  <div key={b.id} className="p-3.5 rounded-xl border border-zinc-200 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-mono text-xs font-bold">{b.id}</div>
                      <div className="text-xs text-zinc-500">
                        Remaining: <strong className="font-mono text-[#0D0D10]">Rs. {rem.toLocaleString()}</strong> ({b.payment_status})
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handlePayBooking(b.id, 'wallet')}
                        className="px-3 py-1.5 rounded-lg bg-[#0D0D10] text-white text-xs font-semibold"
                      >
                        Pay via Wallet
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handlePayBooking(b.id, 'jazzcash')}
                        className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-semibold hover:bg-zinc-50"
                      >
                        JazzCash
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
          Transaction History
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 text-zinc-500 border-b border-zinc-200">
              <tr>
                <th className="px-4 py-3">Transaction ID</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {wallet.transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                    No financial transactions recorded yet.
                  </td>
                </tr>
              ) : (
                wallet.transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-4 py-3 font-mono font-semibold">{tx.tx_ref}</td>
                    <td className="px-4 py-3">{tx.description}</td>
                    <td className="px-4 py-3 uppercase">{tx.payment_method}</td>
                    <td className="px-4 py-3 uppercase font-semibold text-emerald-700">{tx.status}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
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
  onMarkAllRead: () => Promise<void>;
}> = ({ notifications, onMarkAllRead }) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold text-[#0D0D10]">Notifications</h2>
        <button
          type="button"
          onClick={onMarkAllRead}
          className="px-3.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-xs font-semibold hover:bg-zinc-50"
        >
          Mark All Read
        </button>
      </div>
      {notifications.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
          No notifications yet.
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
  onRefresh: () => Promise<void>;
}> = ({ role, tickets, defaultBookingId = '', onRefresh }) => {
  const [category, setCategory] = useState(role === 'passenger' ? 'Booking Complaint' : 'Booking Dispute');
  const [bookingId, setBookingId] = useState(defaultBookingId);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const categories =
    role === 'passenger'
      ? ['Booking Complaint', 'Payment Complaint', 'Safety Complaint', 'General Inquiry']
      : ['Booking Dispute', 'Payment Issue', 'Document Problem', 'Vehicle Verification Issue'];

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
          <h2 className="font-display text-2xl font-bold text-[#0D0D10]">Support Center</h2>
          <p className="text-xs text-zinc-500">Direct communication with PRO RIDER AI Admin Support</p>
        </div>
        <a
          href="https://wa.me/923125007782"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0D0D10] text-white text-xs font-bold"
        >
          <PhoneCall className="w-3.5 h-3.5 text-[#D4A017]" />
          WhatsApp Support: 03125007782
        </a>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form onSubmit={submitTicket} className="lg:col-span-5 rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
          <h3 className="font-display font-bold text-base">Open Support Ticket</h3>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm bg-white"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Booking ID (Optional)</label>
            <input
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
              placeholder="PR-2026-..."
              className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Subject</label>
            <input
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief summary of the issue"
              className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Details</label>
            <textarea
              required
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe the issue clearly..."
              className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold hover:bg-[#EAB308]"
          >
            Submit Ticket to Admin
          </button>
        </form>

        <div className="lg:col-span-7 space-y-3">
          <h3 className="font-display font-bold text-base">Your Tickets</h3>
          {tickets.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-xs text-zinc-500">
              No support tickets submitted yet.
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
                    <strong className="text-[#0D0D10]">Admin Reply:</strong> {tkt.admin_reply}
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

// Screen 16: Passenger Profile
export const PassengerProfileView: React.FC<{
  user: User;
  onUpdated: (u: User) => void;
  onLogout: () => void;
}> = ({ user, onUpdated, onLogout }) => {
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
    setStatusMsg('Profile updated.');
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
      setStatusMsg('Password changed successfully.');
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
        <h2 className="font-display text-2xl font-bold text-[#0D0D10]">Passenger Profile &amp; Account</h2>
        <button
          type="button"
          onClick={onLogout}
          className="px-4 py-2 rounded-xl border border-zinc-200 text-xs font-semibold hover:bg-zinc-100"
        >
          Sign Out
        </button>
      </div>

      {statusMsg && (
        <div className="rounded-xl bg-zinc-900 text-[#F4C430] px-4 py-2.5 text-xs font-semibold">{statusMsg}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <form onSubmit={saveProfile} className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
          <h3 className="font-display font-bold text-base">Personal &amp; Contact Information</h3>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Full Name</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Registered Mobile Number</label>
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-sm font-mono">
              <span>{user.phone}</span>
              <span className={`text-[11px] font-sans font-bold ${user.phone_verified ? 'text-emerald-700' : 'text-amber-700'}`}>
                {user.phone_verified ? 'Verified' : 'Unverified'}
              </span>
            </div>
            {!user.phone_verified && (
              <button type="button" onClick={requestPhoneVerify} className="mt-1.5 text-xs font-semibold text-[#B8860B] hover:underline">
                Verify Mobile via SMS Provider
              </button>
            )}
            {otpNotice && <p className="mt-1 text-[11px] text-amber-700">{otpNotice}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">WhatsApp</label>
            <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Primary City</label>
            <select value={city} onChange={(e) => setCity(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white">
              <option value="Islamabad">Islamabad</option>
              <option value="Rawalpindi">Rawalpindi</option>
              <option value="Lahore">Lahore</option>
              <option value="Karachi">Karachi</option>
            </select>
          </div>
          <div className="space-y-2 pt-1 text-xs">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={notifyPush} onChange={(e) => setNotifyPush(e.target.checked)} className="accent-[#D4A017]" />
              Booking &amp; Driver Offer Notifications
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={notifySms} onChange={(e) => setNotifySms(e.target.checked)} className="accent-[#D4A017]" />
              SMS / WhatsApp Schedule Reminders
            </label>
          </div>
          <button type="submit" className="w-full py-2.5 rounded-xl bg-[#0D0D10] text-white text-xs font-bold">
            Save Changes
          </button>
        </form>

        <div className="space-y-6">
          <form onSubmit={changePassword} className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
            <h3 className="font-display font-bold text-base">Manage Password</h3>
            <input
              type="password"
              required
              placeholder="Current Password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="New Password (min 6 chars)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
            />
            <button type="submit" className="w-full py-2.5 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold">
              Update Password
            </button>
          </form>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3">
            <h3 className="font-display font-bold text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#D4A017]" /> Privacy &amp; Account Deletion
            </h3>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Your Passenger account is isolated from Driver/Pro Partner systems. Financial invoices are retained per Pakistan digital ledger rules.
            </p>
            <button
              type="button"
              onClick={requestDeletion}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 hover:underline"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Request Account Deletion
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
