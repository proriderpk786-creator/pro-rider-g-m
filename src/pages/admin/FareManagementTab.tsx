import React, { useState } from 'react';
import {
  AlertCircle,
  Car,
  CheckCircle2,
  DollarSign,
  Edit3,
  Percent,
  RefreshCw,
  Save,
  Sliders,
  TrendingUp,
  X,
} from 'lucide-react';
import { apiRequest } from '../../utils/api';
import type { FleetCategory } from '../../types';

interface FareManagementTabProps {
  fleet: FleetCategory[];
  settings: Record<string, string>;
  onReload: () => Promise<void>;
  onShowToast: (msg: string) => void;
}

export const FareManagementTab: React.FC<FareManagementTabProps> = ({
  fleet,
  settings,
  onReload,
  onShowToast,
}) => {
  // Editing a single vehicle's tariff
  const [editingFleet, setEditingFleet] = useState<FleetCategory | null>(null);
  const [editTariffForm, setEditTariffForm] = useState<Partial<FleetCategory>>({});
  const [savingTariff, setSavingTariff] = useState(false);

  // Global settings form
  const [localSettings, setLocalSettings] = useState<Record<string, string>>(() => ({
    go_now_min_offer_pct: settings.go_now_min_offer_pct || '80',
    go_now_max_offer_pct: settings.go_now_max_offer_pct || '135',
    return_journey_multiplier: settings.return_journey_multiplier || '1.85',
    ride_sharing_seat_discount_pct: settings.ride_sharing_seat_discount_pct || '20',
    fuel_sharing_rate_factor: settings.fuel_sharing_rate_factor || '0.75',
    schedule_rate_per_km: settings.schedule_rate_per_km || '38',
    schedule_default_pickup: settings.schedule_default_pickup || '08:00 AM',
    schedule_default_drop: settings.schedule_default_drop || '05:30 PM',
    surge_multiplier_low: settings.surge_multiplier_low || '1.0',
    surge_multiplier_medium: settings.surge_multiplier_medium || '1.25',
    surge_multiplier_high: settings.surge_multiplier_high || '1.50',
    min_cancellation_fee_pkr: settings.min_cancellation_fee_pkr || '100',
  }));
  const [savingSettings, setSavingSettings] = useState(false);

  const openEditTariff = (f: FleetCategory) => {
    setEditingFleet(f);
    setEditTariffForm({
      base_fare_pkr: f.base_fare_pkr,
      per_km_min_pkr: f.per_km_min_pkr,
      per_km_max_pkr: f.per_km_max_pkr,
      waiting_charge_per_min: f.waiting_charge_per_min,
      extra_stop_pkr: f.extra_stop_pkr,
      commission_pct: f.commission_pct,
    });
  };

  const handleSaveTariff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFleet) return;
    setSavingTariff(true);
    try {
      await apiRequest(`/api/admin/fleet/${editingFleet.id}`, {
        method: 'PATCH',
        role: 'admin',
        body: {
          base_fare_pkr: Number(editTariffForm.base_fare_pkr),
          per_km_min_pkr: Number(editTariffForm.per_km_min_pkr),
          per_km_max_pkr: Number(editTariffForm.per_km_max_pkr),
          waiting_charge_per_min: Number(editTariffForm.waiting_charge_per_min),
          extra_stop_pkr: Number(editTariffForm.extra_stop_pkr),
          commission_pct: Number(editTariffForm.commission_pct),
        },
      });
      onShowToast(`Fare tariff updated for ${editingFleet.name}.`);
      setEditingFleet(null);
      await onReload();
    } catch (err: any) {
      onShowToast(`Error saving tariff: ${err.message}`);
    } finally {
      setSavingTariff(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await apiRequest('/api/admin/settings', {
        method: 'PUT',
        role: 'admin',
        body: localSettings,
      });
      onShowToast('Global fare rules and negotiation bounds saved successfully.');
      await onReload();
    } catch (err: any) {
      onShowToast(`Error saving fare rules: ${err.message}`);
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#D4A017]/15 text-[#8F6400] text-xs font-bold uppercase tracking-wider mb-2">
            <Sliders className="w-3.5 h-3.5" />
            Super Admin Fare Controls
          </div>
          <h1 className="font-display text-2xl font-bold text-[#0D0D10]">
            Fare Structure &amp; Tariff Management
          </h1>
          <p className="text-xs text-zinc-500 mt-1 max-w-2xl">
            Super Admin independently controls base fares, per-km rates, extra stops, waiting charges,
            commissions, and passenger offer negotiation bounds. Zero hardcoded tariffs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onReload()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Fares
        </button>
      </div>

      {/* SECTION 1: PER-VEHICLE FARE TARIFF TABLE */}
      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-display font-bold text-base text-[#0D0D10]">
              Vehicle Category Tariff Matrix
            </h2>
            <p className="text-xs text-zinc-500">
              Live rates used to compute OSRM distance-based fares across Pakistan.
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-zinc-600 bg-zinc-100 px-3 py-1 rounded-lg">
            {fleet.length} Categories Configured
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-3.5">Category</th>
                <th className="px-4 py-3.5 text-right">Base Fare</th>
                <th className="px-4 py-3.5 text-right">Min Rate/km</th>
                <th className="px-4 py-3.5 text-right">Max Rate/km</th>
                <th className="px-4 py-3.5 text-right">Wait / min</th>
                <th className="px-4 py-3.5 text-right">Extra Stop</th>
                <th className="px-4 py-3.5 text-right">Commission</th>
                <th className="px-4 py-3.5 text-center">Status</th>
                <th className="px-5 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {fleet.map((f) => (
                <tr key={f.id} className="hover:bg-zinc-50/70 transition-colors">
                  <td className="px-5 py-4">
                    <div className="font-bold text-[#0D0D10] text-sm">{f.name}</div>
                    <div className="text-[11px] text-zinc-400 font-mono">
                      {f.seating_capacity} Seats · Order #{f.sort_order ?? 10}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right font-mono font-bold text-[#0D0D10]">
                    Rs. {Number(f.base_fare_pkr).toLocaleString()}
                  </td>
                  <td className="px-4 py-4 text-right font-mono font-bold text-[#8F6400]">
                    Rs. {f.per_km_min_pkr}
                  </td>
                  <td className="px-4 py-4 text-right font-mono font-bold text-[#8F6400]">
                    Rs. {f.per_km_max_pkr}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-zinc-700">
                    Rs. {f.waiting_charge_per_min}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-zinc-700">
                    Rs. {f.extra_stop_pkr}
                  </td>
                  <td className="px-4 py-4 text-right font-mono font-bold text-emerald-700">
                    {f.commission_pct}%
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        f.is_active === 1
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-zinc-200 text-zinc-600'
                      }`}
                    >
                      {f.is_active === 1 ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => openEditTariff(f)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#0D0D10] hover:bg-zinc-800 text-white font-bold text-xs transition-colors"
                    >
                      <Edit3 className="w-3 h-3 text-[#D4A017]" />
                      Edit Tariff
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 2: GLOBAL FARE RULES, PASSENGER NEGOTIATION & COMMUTE MULTIPLIERS */}
      <form onSubmit={handleSaveSettings} className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-6 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
          <div>
            <h2 className="font-display font-bold text-lg text-[#0D0D10]">
              Global Multipliers, Commute Tariffs &amp; Offer Bounds
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Rules governing Passenger price counter-offers, shared seating splits, and round trips.
            </p>
          </div>
          <button
            type="submit"
            disabled={savingSettings}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#D4A017] hover:bg-[#EAB308] text-[#0D0D10] font-bold text-xs shadow-sm transition-colors min-h-[40px]"
          >
            <Save className="w-4 h-4" />
            {savingSettings ? 'Saving Settings...' : 'Save All Rules'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 text-xs">
          {/* Passenger Offer Negotiation Bounds */}
          <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#8F6400]">
              <DollarSign className="w-4 h-4" />
              Passenger Offer Bounds
            </div>
            <div>
              <label className="block text-zinc-600 font-semibold mb-1">
                Go Now Min Offer (% of base fare)
              </label>
              <input
                type="number"
                min={50}
                max={100}
                value={localSettings.go_now_min_offer_pct}
                onChange={(e) =>
                  setLocalSettings((s) => ({ ...s, go_now_min_offer_pct: e.target.value }))
                }
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-mono font-bold text-xs"
              />
              <span className="text-[10px] text-zinc-400 mt-1 block">
                Default: 80% (Prevents unfair under-bidding)
              </span>
            </div>
            <div>
              <label className="block text-zinc-600 font-semibold mb-1">
                Go Now Max Offer (% of base fare)
              </label>
              <input
                type="number"
                min={100}
                max={250}
                value={localSettings.go_now_max_offer_pct}
                onChange={(e) =>
                  setLocalSettings((s) => ({ ...s, go_now_max_offer_pct: e.target.value }))
                }
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-mono font-bold text-xs"
              />
              <span className="text-[10px] text-zinc-400 mt-1 block">
                Default: 135% (Max passenger tip/surge cap)
              </span>
            </div>
          </div>

          {/* Service Multipliers */}
          <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#8F6400]">
              <Percent className="w-4 h-4" />
              Service Multipliers
            </div>
            <div>
              <label className="block text-zinc-600 font-semibold mb-1">
                Return Journey Multiplier (Round Trip)
              </label>
              <input
                type="text"
                value={localSettings.return_journey_multiplier}
                onChange={(e) =>
                  setLocalSettings((s) => ({ ...s, return_journey_multiplier: e.target.value }))
                }
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-mono font-bold text-xs"
              />
              <span className="text-[10px] text-zinc-400 mt-1 block">
                Default: 1.85x (15% discount vs two single trips)
              </span>
            </div>
            <div>
              <label className="block text-zinc-600 font-semibold mb-1">
                Ride Sharing Per-Seat Discount (%)
              </label>
              <input
                type="number"
                min={0}
                max={50}
                value={localSettings.ride_sharing_seat_discount_pct}
                onChange={(e) =>
                  setLocalSettings((s) => ({ ...s, ride_sharing_seat_discount_pct: e.target.value }))
                }
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-mono font-bold text-xs"
              />
              <span className="text-[10px] text-zinc-400 mt-1 block">
                Default: 20% discount for shared seats
              </span>
            </div>
          </div>

          {/* Schedule Commute Defaults */}
          <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#8F6400]">
              <TrendingUp className="w-4 h-4" />
              Schedule Commute Defaults
            </div>
            <div>
              <label className="block text-zinc-600 font-semibold mb-1">
                Schedule Rate (PKR / km)
              </label>
              <input
                type="number"
                value={localSettings.schedule_rate_per_km}
                onChange={(e) =>
                  setLocalSettings((s) => ({ ...s, schedule_rate_per_km: e.target.value }))
                }
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-mono font-bold text-xs"
              />
              <span className="text-[10px] text-zinc-400 mt-1 block">
                Default: Rs. 38/km for daily recurring rides
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-zinc-600 text-[11px] font-semibold mb-1">Pickup Time</label>
                <input
                  type="text"
                  value={localSettings.schedule_default_pickup}
                  onChange={(e) =>
                    setLocalSettings((s) => ({ ...s, schedule_default_pickup: e.target.value }))
                  }
                  className="w-full px-2.5 py-1.5 rounded-xl border border-zinc-200 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-zinc-600 text-[11px] font-semibold mb-1">Drop Time</label>
                <input
                  type="text"
                  value={localSettings.schedule_default_drop}
                  onChange={(e) =>
                    setLocalSettings((s) => ({ ...s, schedule_default_drop: e.target.value }))
                  }
                  className="w-full px-2.5 py-1.5 rounded-xl border border-zinc-200 text-xs font-mono"
                />
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* TARIFF EDIT MODAL */}
      {editingFleet && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-zinc-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-5 bg-[#0D0D10] text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#D4A017]/20 border border-[#D4A017]/40 flex items-center justify-center text-[#F4C430]">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base">
                    Edit Tariff: {editingFleet.name}
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Saves directly to database and takes effect immediately for new bookings.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingFleet(null)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTariff} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Base Fare (PKR)</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={editTariffForm.base_fare_pkr ?? ''}
                    onChange={(e) =>
                      setEditTariffForm((t) => ({ ...t, base_fare_pkr: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Commission (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    required
                    value={editTariffForm.commission_pct ?? ''}
                    onChange={(e) =>
                      setEditTariffForm((t) => ({ ...t, commission_pct: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-mono font-bold text-emerald-700"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Per-KM Min (PKR)</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={editTariffForm.per_km_min_pkr ?? ''}
                    onChange={(e) =>
                      setEditTariffForm((t) => ({ ...t, per_km_min_pkr: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-mono font-bold text-[#8F6400]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Per-KM Max (PKR)</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={editTariffForm.per_km_max_pkr ?? ''}
                    onChange={(e) =>
                      setEditTariffForm((t) => ({ ...t, per_km_max_pkr: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-mono font-bold text-[#8F6400]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Waiting Charge / min (PKR)</label>
                  <input
                    type="number"
                    min={0}
                    value={editTariffForm.waiting_charge_per_min ?? ''}
                    onChange={(e) =>
                      setEditTariffForm((t) => ({
                        ...t,
                        waiting_charge_per_min: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Extra Stop Charge (PKR)</label>
                  <input
                    type="number"
                    min={0}
                    value={editTariffForm.extra_stop_pkr ?? ''}
                    onChange={(e) =>
                      setEditTariffForm((t) => ({ ...t, extra_stop_pkr: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setEditingFleet(null)}
                  className="px-4 py-2.5 rounded-xl border border-zinc-300 font-bold text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingTariff}
                  className="px-6 py-2.5 rounded-xl bg-[#0D0D10] text-white font-bold hover:bg-zinc-800 disabled:opacity-50"
                >
                  {savingTariff ? 'Saving Tariff...' : 'Save Tariff Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
