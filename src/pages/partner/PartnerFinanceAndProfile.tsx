import React, { useState } from 'react';
import { Download, Landmark, TrendingUp } from 'lucide-react';
import { apiRequest } from '../../utils/api';
import { downloadWalletStatementPdf } from '../../utils/pdfGenerator';
import type { User, WalletTransaction } from '../../types';

// Screens 24 & 25: Driver Earnings & Driver Wallet (Strictly separated from Passenger wallet!)
export const PartnerFinanceView: React.FC<{
  mode: 'earnings' | 'wallet';
  partnerName: string;
  earnings: {
    grossEarnings: number;
    totalCommission: number;
    netEarnings: number;
    availableBalancePkr: number;
    pendingSettlementsPkr: number;
    paidWithdrawalsPkr: number;
    completedTrips: any[];
    transactions: WalletTransaction[];
  };
  onRefresh: () => Promise<void>;
}> = ({ mode, partnerName, earnings, onRefresh }) => {
  const [withdrawAmount, setWithdrawAmount] = useState('1000');
  const [withdrawMethod, setWithdrawMethod] = useState<'bank_transfer' | 'jazzcash' | 'easypaisa'>('bank_transfer');
  const [accountDetails, setAccountDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiRequest<{ txRef: string }>('/api/partner/wallet/withdraw', {
        method: 'POST',
        role: 'partner',
        body: {
          amountPkr: Number(withdrawAmount),
          method: withdrawMethod,
          accountDetails,
        },
      });
      setMsg(`Withdrawal request submitted (${res.txRef}) for Admin settlement.`);
      setAccountDetails('');
      await onRefresh();
    } catch (err: any) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 w-full min-w-0 overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold text-[#0D0D10]">
          {mode === 'earnings' ? 'Pro Partner Earnings' : 'Pro Partner Digital Wallet'}
        </h2>
        <button
          type="button"
          onClick={() =>
            downloadWalletStatementPdf(
              partnerName,
              'Pro Partner',
              earnings.availableBalancePkr,
              earnings.transactions
            )
          }
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0D0D10] text-white text-xs font-semibold"
        >
          <Download className="w-3.5 h-3.5 text-[#D4A017]" />
          Download Statement PDF
        </button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-[#0D0D10] text-white p-5">
          <span className="text-xs text-zinc-400">Available Wallet Balance</span>
          <div className="font-mono text-2xl font-bold text-[#D4A017] mt-1">
            Rs. {earnings.availableBalancePkr.toLocaleString()}
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <span className="text-xs text-zinc-500">Gross Completed Fares</span>
          <div className="font-mono text-2xl font-bold text-[#0D0D10] mt-1">
            Rs. {earnings.grossEarnings.toLocaleString()}
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <span className="text-xs text-zinc-500">Company Commission</span>
          <div className="font-mono text-2xl font-bold text-amber-700 mt-1">
            Rs. {earnings.totalCommission.toLocaleString()}
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <span className="text-xs text-zinc-500">Net Partner Earnings</span>
          <div className="font-mono text-2xl font-bold text-emerald-700 mt-1">
            Rs. {earnings.netEarnings.toLocaleString()}
          </div>
        </div>
      </div>

      {msg && <div className="rounded-xl bg-[#0D0D10] text-[#F4C430] px-4 py-2.5 text-xs font-semibold">{msg}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form onSubmit={handleWithdraw} className="lg:col-span-5 rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
          <h3 className="font-display font-bold text-base flex items-center gap-2">
            <Landmark className="w-4 h-4 text-[#D4A017]" /> Request Settlement Withdrawal
          </h3>
          <div className="text-xs text-zinc-500 flex justify-between">
            <span>Pending Settlements: <strong className="font-mono text-[#0D0D10]">Rs. {earnings.pendingSettlementsPkr.toLocaleString()}</strong></span>
            <span>Paid Out: <strong className="font-mono text-emerald-700">Rs. {earnings.paidWithdrawalsPkr.toLocaleString()}</strong></span>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Amount (Min Rs. 500)</label>
            <input
              type="number"
              min={500}
              required
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Payout Method</label>
            <select
              value={withdrawMethod}
              onChange={(e) => setWithdrawMethod(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white"
            >
              <option value="bank_transfer">Bank IBAN Transfer</option>
              <option value="jazzcash">JazzCash</option>
              <option value="easypaisa">EasyPaisa</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Account / IBAN / Mobile</label>
            <input
              required
              value={accountDetails}
              onChange={(e) => setAccountDetails(e.target.value)}
              placeholder="PKXX... or 03XXXXXXXXX"
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold hover:bg-[#EAB308]"
          >
            Submit Withdrawal Request
          </button>
        </form>

        <div className="lg:col-span-7 rounded-2xl border border-zinc-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-100 font-display font-bold text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#D4A017]" />
            Driver Wallet Ledger &amp; Commission History
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 text-zinc-500 border-b border-zinc-200">
                <tr>
                  <th className="px-4 py-3">Ref ID</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {earnings.transactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                      No partner wallet transactions recorded yet.
                    </td>
                  </tr>
                ) : (
                  earnings.transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td className="px-4 py-3 font-mono font-semibold">{tx.tx_ref}</td>
                      <td className="px-4 py-3 uppercase">{tx.type}</td>
                      <td className="px-4 py-3">{tx.description}</td>
                      <td className="px-4 py-3 uppercase font-semibold">{tx.status}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold">
                        Rs. {Number(tx.amount_pkr).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// Screen 30: Driver Profile
export const PartnerProfileView: React.FC<{
  user: User;
  onUpdated: (u: User) => void;
  onLogout: () => void;
}> = ({ user, onUpdated, onLogout }) => {
  const [fullName, setFullName] = useState(user.full_name);
  const [whatsapp, setWhatsapp] = useState(user.whatsapp || '');
  const [city, setCity] = useState(user.city || 'Islamabad');
  const [operatingArea, setOperatingArea] = useState(user.operating_area || '');
  const [msg, setMsg] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiRequest<{ user: User }>('/api/auth/profile', {
      method: 'PATCH',
      role: 'partner',
      body: { fullName, whatsapp, city, operatingArea },
    });
    onUpdated(res.user);
    setMsg('Pro Partner profile updated.');
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold text-[#0D0D10]">Pro Partner Profile</h2>
        <button type="button" onClick={onLogout} className="px-4 py-2 rounded-xl border border-zinc-200 text-xs font-semibold hover:bg-zinc-100">
          Sign Out
        </button>
      </div>
      {msg && <div className="rounded-xl bg-[#0D0D10] text-[#F4C430] px-4 py-2.5 text-xs font-semibold">{msg}</div>}
      <form onSubmit={save} className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-zinc-600 mb-1">Full Name</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-zinc-600 mb-1">Mobile Number</label>
          <div className="px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-sm font-mono flex justify-between">
            <span>{user.phone}</span>
            <span className={user.phone_verified ? 'text-emerald-700' : 'text-amber-700'}>
              {user.phone_verified ? 'Verified' : 'Unverified'}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">WhatsApp</label>
            <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">City</label>
            <select value={city} onChange={(e) => setCity(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white">
              <option value="Islamabad">Islamabad</option>
              <option value="Rawalpindi">Rawalpindi</option>
              <option value="Lahore">Lahore</option>
              <option value="Karachi">Karachi</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-zinc-600 mb-1">Operating Area</label>
          <input value={operatingArea} onChange={(e) => setOperatingArea(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
        </div>
        <button type="submit" className="px-6 py-2.5 rounded-xl bg-[#0D0D10] text-white text-xs font-bold">
          Save Pro Partner Info
        </button>
      </form>
    </div>
  );
};
