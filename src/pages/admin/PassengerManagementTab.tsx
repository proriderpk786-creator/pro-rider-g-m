import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  Mail,
  MapPin,
  Phone,
  Power,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  UserX,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { apiRequest } from '../../utils/api';
import type { PassengerAccount } from '../../types';

interface PassengerManagementTabProps {
  passengers: PassengerAccount[];
  onReload: () => Promise<void>;
  onShowToast: (msg: string) => void;
}

export const PassengerManagementTab: React.FC<PassengerManagementTabProps> = ({
  passengers,
  onReload,
  onShowToast,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [editingPassenger, setEditingPassenger] = useState<PassengerAccount | null>(null);
  const [editForm, setEditForm] = useState<Partial<PassengerAccount>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const filteredPassengers = passengers.filter((p) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      p.full_name.toLowerCase().includes(query) ||
      p.phone.toLowerCase().includes(query) ||
      (p.email || '').toLowerCase().includes(query) ||
      (p.city || '').toLowerCase().includes(query);

    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'active'
        ? p.status !== 'suspended'
        : p.status === 'suspended';

    return matchesSearch && matchesStatus;
  });

  const totalActive = passengers.filter((p) => p.status !== 'suspended').length;
  const totalSuspended = passengers.filter((p) => p.status === 'suspended').length;
  const totalVerified = passengers.filter((p) => p.phone_verified === 1).length;
  const totalBookingsAll = passengers.reduce((sum, p) => sum + (p.total_bookings || 0), 0);

  const handleToggleStatus = async (p: PassengerAccount) => {
    const nextStatus = p.status === 'suspended' ? 'active' : 'suspended';
    setActionBusyId(p.id);
    try {
      await apiRequest(`/api/admin/passengers/${p.id}`, {
        method: 'PATCH',
        role: 'admin',
        body: { status: nextStatus },
      });
      onShowToast(
        `Passenger "${p.full_name}" is now ${nextStatus.toUpperCase()}.`
      );
      await onReload();
    } catch (err: any) {
      onShowToast(`Failed to update passenger status: ${err.message}`);
    } finally {
      setActionBusyId(null);
    }
  };

  const handleTogglePhoneVerified = async (p: PassengerAccount) => {
    const nextVerified = p.phone_verified === 1 ? 0 : 1;
    setActionBusyId(p.id);
    try {
      await apiRequest(`/api/admin/passengers/${p.id}`, {
        method: 'PATCH',
        role: 'admin',
        body: { phone_verified: nextVerified },
      });
      onShowToast(
        `Phone verification for "${p.full_name}" set to ${nextVerified === 1 ? 'VERIFIED' : 'UNVERIFIED'}.`
      );
      await onReload();
    } catch (err: any) {
      onShowToast(`Failed to update phone verification: ${err.message}`);
    } finally {
      setActionBusyId(null);
    }
  };

  const openEditModal = (p: PassengerAccount) => {
    setEditingPassenger(p);
    setEditForm({
      full_name: p.full_name,
      phone: p.phone,
      whatsapp: p.whatsapp,
      email: p.email,
      city: p.city,
      status: p.status,
    });
  };

  const handleSavePassenger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPassenger) return;
    setSavingEdit(true);
    try {
      await apiRequest(`/api/admin/passengers/${editingPassenger.id}`, {
        method: 'PATCH',
        role: 'admin',
        body: editForm,
      });
      onShowToast(`Passenger record for "${editForm.full_name}" saved.`);
      setEditingPassenger(null);
      await onReload();
    } catch (err: any) {
      onShowToast(`Error saving passenger: ${err.message}`);
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#D4A017]/15 text-[#8F6400] text-xs font-bold uppercase tracking-wider mb-2">
            <Users className="w-3.5 h-3.5" />
            Super Admin Passenger Management
          </div>
          <h1 className="font-display text-2xl font-bold text-[#0D0D10]">
            Registered Passengers &amp; Accounts
          </h1>
          <p className="text-xs text-zinc-500 mt-1 max-w-2xl">
            Super Admin can monitor passenger accounts, view total trip history, inspect wallet balances,
            verify phone numbers, and suspend or reactivate access.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onReload()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh List
        </button>
      </div>

      {/* KPI Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white border border-zinc-200 p-4">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
            Total Passengers
          </span>
          <div className="font-mono text-2xl font-bold text-[#0D0D10] mt-1">
            {passengers.length}
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-zinc-200 p-4">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
            Active Accounts
          </span>
          <div className="font-mono text-2xl font-bold text-emerald-700 mt-1">
            {totalActive}
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-zinc-200 p-4">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
            Phone Verified
          </span>
          <div className="font-mono text-2xl font-bold text-[#8F6400] mt-1">
            {totalVerified}
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-zinc-200 p-4">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
            Platform Trips
          </span>
          <div className="font-mono text-2xl font-bold text-indigo-700 mt-1">
            {totalBookingsAll}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, phone, city, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-zinc-200 text-xs font-semibold focus:border-[#D4A017] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto text-xs">
          <span className="text-zinc-500 font-semibold">Status:</span>
          {(['all', 'active', 'suspended'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl font-bold capitalize transition-colors ${
                statusFilter === st
                  ? 'bg-[#0D0D10] text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Passengers Table */}
      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-3.5">Passenger</th>
                <th className="px-4 py-3.5">Phone &amp; WhatsApp</th>
                <th className="px-4 py-3.5">City</th>
                <th className="px-4 py-3.5 text-center">Verified</th>
                <th className="px-4 py-3.5 text-right">Trips</th>
                <th className="px-4 py-3.5 text-right">Wallet Balance</th>
                <th className="px-4 py-3.5 text-center">Status</th>
                <th className="px-5 py-3.5 text-right">Admin Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredPassengers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-zinc-400">
                    No passenger records found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredPassengers.map((p) => {
                  const isSuspended = p.status === 'suspended';
                  const isBusy = actionBusyId === p.id;
                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-zinc-50/70 transition-colors ${
                        isSuspended ? 'bg-red-50/30' : ''
                      }`}
                    >
                      <td className="px-5 py-4">
                        <div className="font-bold text-[#0D0D10] text-sm">{p.full_name}</div>
                        <div className="text-[11px] text-zinc-400 font-mono">
                          ID: {p.id} {p.email ? `· ${p.email}` : ''}
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <div className="font-mono font-bold text-zinc-800">{p.phone}</div>
                        {p.whatsapp && (
                          <div className="text-[11px] text-emerald-700 font-mono">
                            WA: {p.whatsapp}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-4">
                        <div className="font-semibold text-zinc-700">{p.city || 'Islamabad'}</div>
                        {p.operating_area && (
                          <div className="text-[11px] text-zinc-400">{p.operating_area}</div>
                        )}
                      </td>

                      <td className="px-4 py-4 text-center">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleTogglePhoneVerified(p)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase cursor-pointer hover:opacity-80 ${
                            p.phone_verified === 1
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-zinc-100 text-zinc-500'
                          }`}
                          title="Click to toggle phone verification status"
                        >
                          {p.phone_verified === 1 ? (
                            <>
                              <UserCheck className="w-3 h-3 text-emerald-600" /> Verified
                            </>
                          ) : (
                            <>
                              <UserX className="w-3 h-3 text-zinc-400" /> Unverified
                            </>
                          )}
                        </button>
                      </td>

                      <td className="px-4 py-4 text-right font-mono font-bold text-zinc-800">
                        {p.total_bookings || 0}
                      </td>

                      <td className="px-4 py-4 text-right font-mono font-bold">
                        <span
                          className={
                            Number(p.wallet_balance_pkr || 0) < 0
                              ? 'text-red-600'
                              : 'text-emerald-700'
                          }
                        >
                          Rs. {Number(p.wallet_balance_pkr || 0).toLocaleString()}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            isSuspended
                              ? 'bg-red-100 text-red-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {p.status || 'Active'}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleToggleStatus(p)}
                            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-colors ${
                              isSuspended
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                : 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
                            }`}
                          >
                            {isSuspended ? 'Reactivate' : 'Suspend'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(p)}
                            className="p-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700"
                            title="Edit passenger details"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
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

      {/* Edit Passenger Modal */}
      {editingPassenger && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-zinc-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-5 bg-[#0D0D10] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Users className="w-5 h-5 text-[#D4A017]" />
                <h3 className="font-display font-bold text-base">Edit Passenger Profile</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingPassenger(null)}
                className="p-1 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePassenger} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={editForm.full_name ?? ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-semibold"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Mobile Phone</label>
                <input
                  type="tel"
                  required
                  value={editForm.phone ?? ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">WhatsApp Number</label>
                <input
                  type="tel"
                  value={editForm.whatsapp ?? ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, whatsapp: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={editForm.email ?? ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">City</label>
                <input
                  type="text"
                  value={editForm.city ?? ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Account Status</label>
                <select
                  value={editForm.status || 'active'}
                  onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 bg-white font-semibold"
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setEditingPassenger(null)}
                  className="px-4 py-2.5 rounded-xl border border-zinc-300 font-bold text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2.5 rounded-xl bg-[#0D0D10] text-white font-bold hover:bg-zinc-800 disabled:opacity-50"
                >
                  {savingEdit ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
