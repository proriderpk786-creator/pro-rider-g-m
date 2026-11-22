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
  Users,
  X,
} from 'lucide-react';
import { tr } from '../../i18n/translations';
import { apiRequest } from '../../utils/api';
import type { FleetCategory, Language } from '../../types';

interface FareManagementTabProps {
  fleet: FleetCategory[];
  settings: Record<string, string>;
  lang?: Language;
  onReload: () => Promise<void>;
  onShowToast: (msg: string) => void;
}

export const FareManagementTab: React.FC<FareManagementTabProps> = ({
  fleet,
  settings,
  lang = 'en',
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
    schedule_default_pickup: settings.schedule_default_pickup || '09:15 AM',
    schedule_default_drop: settings.schedule_default_drop || '06:00 PM',
    surge_multiplier_low: settings.surge_multiplier_low || '1.0',
    surge_multiplier_medium: settings.surge_multiplier_medium || '1.25',
    surge_multiplier_high: settings.surge_multiplier_high || '1.50',
    min_cancellation_fee_pkr: settings.min_cancellation_fee_pkr || '100',
    // Exact user-specified cross-calculation tariff rules
    rate_economy_pick_drop_min: settings.rate_economy_pick_drop_min || '35',
    rate_economy_pick_drop_max: settings.rate_economy_pick_drop_max || '45',
    rate_economy_ride_share_min: settings.rate_economy_ride_share_min || '30',
    rate_economy_ride_share_max: settings.rate_economy_ride_share_max || '40',
    rate_economy_fuel_share_min: settings.rate_economy_fuel_share_min || '20',
    rate_economy_fuel_share_max: settings.rate_economy_fuel_share_max || '30',
    rate_comfort_addon_per_km: settings.rate_comfort_addon_per_km || '5',
    rate_sedan_addon_per_km: settings.rate_sedan_addon_per_km || '20',
    rate_luxury_multiplier_pct: settings.rate_luxury_multiplier_pct || '10',
    rate_van_7_min: settings.rate_van_7_min || '20',
    rate_van_7_max: settings.rate_van_7_max || '30',
    rate_van_15_min: settings.rate_van_15_min || '15',
    rate_van_15_max: settings.rate_van_15_max || '25',
    rate_coaster_min: settings.rate_coaster_min || '12',
    rate_coaster_max: settings.rate_coaster_max || '25',
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
      onShowToast(
        tr(
          lang,
          `Fare tariff updated for ${editingFleet.name}.`,
          `${editingFleet.name} کا کرایہ ریٹ اپڈیٹ کر دیا گیا۔`
        )
      );
      setEditingFleet(null);
      await onReload();
    } catch (err: any) {
      onShowToast(tr(lang, `Error saving tariff: ${err.message}`, `کرایہ محفوظ کرنے میں خرابی: ${err.message}`));
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
      onShowToast(
        tr(
          lang,
          'Global fare rules and negotiation bounds saved successfully.',
          'عالمی کرایہ قوانین اور بات چیت کی حدود کامیابی سے محفوظ ہو گئیں۔'
        )
      );
      await onReload();
    } catch (err: any) {
      onShowToast(tr(lang, `Error saving fare rules: ${err.message}`, `کرایہ قوانین محفوظ کرنے میں خرابی: ${err.message}`));
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
            {tr(lang, 'Super Admin Fare Controls', 'سپر ایڈمن کرایہ کنٹرول')}
          </div>
          <h1 className="font-display text-2xl font-bold text-[#0D0D10]">
            {tr(lang, 'Fare Structure & Tariff Management', 'کرایہ ڈھانچہ اور ریٹس کا انتظام')}
          </h1>
          <p className="text-xs text-zinc-500 mt-1 max-w-2xl">
            {tr(
              lang,
              'Super Admin independently controls base fares, per-km rates, extra stops, waiting charges, commissions, and passenger offer negotiation bounds.',
              'سپر ایڈمن بنیادی کرایہ، فی کلومیٹر ریٹ، اضافی اسٹاپس، انتظار چارجز، کمیشن اور مسافر آفر کی حدود خود کنٹرول کرتا ہے۔'
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onReload()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {tr(lang, 'Refresh Fares', 'کرایے تازہ کریں')}
        </button>
      </div>

      {/* SECTION 1: PER-VEHICLE FARE TARIFF TABLE */}
      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-display font-bold text-base text-[#0D0D10]">
              {tr(lang, 'Vehicle Category Tariff Matrix', 'گاڑی کی اقسام کا کرایہ چارٹ')}
            </h2>
            <p className="text-xs text-zinc-500">
              {tr(lang, 'Live rates used to compute distance-based fares across Pakistan.', 'پاکستان بھر میں فاصلے کے مطابق کرایہ حساب کرنے کے لائیو ریٹس۔')}
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-zinc-600 bg-zinc-100 px-3 py-1 rounded-lg">
            {fleet.length} {tr(lang, 'Categories Configured', 'اقسام شامل ہیں')}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-3.5">{tr(lang, 'Category', 'کیٹیگری')}</th>
                <th className="px-4 py-3.5 text-right">{tr(lang, 'Base Fare', 'بنیادی کرایہ')}</th>
                <th className="px-4 py-3.5 text-right">{tr(lang, 'Min Rate/km', 'کم از کم ریٹ/کلومیٹر')}</th>
                <th className="px-4 py-3.5 text-right">{tr(lang, 'Max Rate/km', 'زیادہ سے زیادہ ریٹ/کلومیٹر')}</th>
                <th className="px-4 py-3.5 text-right">{tr(lang, 'Wait / min', 'انتظار / منٹ')}</th>
                <th className="px-4 py-3.5 text-right">{tr(lang, 'Extra Stop', 'اضافی اسٹاپ')}</th>
                <th className="px-4 py-3.5 text-right">{tr(lang, 'Commission', 'کمیشن')}</th>
                <th className="px-4 py-3.5 text-center">{tr(lang, 'Status', 'حالت')}</th>
                <th className="px-5 py-3.5 text-right">{tr(lang, 'Action', 'کارروائی')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {fleet.map((f) => (
                <tr key={f.id} className="hover:bg-zinc-50/70 transition-colors">
                  <td className="px-5 py-4">
                    <div className="font-bold text-[#0D0D10] text-sm">{f.name}</div>
                    <div className="text-[11px] text-zinc-400 font-mono">
                      {f.seating_capacity} {tr(lang, 'Seats', 'سیٹیں')} · {tr(lang, 'Order', 'ترتیب')} #{f.sort_order ?? 10}
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
                      {f.is_active === 1 ? tr(lang, 'Active', 'فعال') : tr(lang, 'Disabled', 'بند')}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => openEditTariff(f)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#0D0D10] hover:bg-zinc-800 text-white font-bold text-xs transition-colors"
                    >
                      <Edit3 className="w-3 h-3 text-[#D4A017]" />
                      {tr(lang, 'Edit Tariff', 'کرایہ ترمیم')}
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
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-100">
          <div>
            <h2 className="font-display font-bold text-lg text-[#0D0D10]">
              {tr(lang, 'Global Multipliers, Commute Tariffs & Offer Bounds', 'عالمی ریٹس، کمیوٹ قوانین اور آفر کی حدود')}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {tr(
                lang,
                'Rules governing Passenger price counter-offers, shared seating splits, and round trips.',
                'مسافر کرایہ آفر، شیئرڈ سیٹوں اور دو طرفہ سفر کے قوانین۔'
              )}
            </p>
          </div>
          <button
            type="submit"
            disabled={savingSettings}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#D4A017] hover:bg-[#EAB308] text-[#0D0D10] font-bold text-xs shadow-sm transition-colors min-h-[40px]"
          >
            <Save className="w-4 h-4" />
            {savingSettings ? tr(lang, 'Saving Settings...', 'محفوظ ہو رہا ہے...') : tr(lang, 'Save All Rules', 'تمام قوانین محفوظ کریں')}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 text-xs">
          {/* Passenger Offer Negotiation Bounds */}
          <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#8F6400]">
              <DollarSign className="w-4 h-4" />
              {tr(lang, 'Passenger Offer Bounds', 'مسافر آفر کی حدود')}
            </div>
            <div>
              <label className="block text-zinc-600 font-semibold mb-1">
                {tr(lang, 'Go Now Min Offer (% of base fare)', 'گو ناؤ کم از کم آفر (بنیادی کرایہ کا ٪)')}
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
                {tr(lang, 'Default: 80% (Prevents unfair under-bidding)', 'ڈیفالٹ: 80% (بہت کم کرایہ روکنے کے لیے)')}
              </span>
            </div>
            <div>
              <label className="block text-zinc-600 font-semibold mb-1">
                {tr(lang, 'Go Now Max Offer (% of base fare)', 'گو ناؤ زیادہ سے زیادہ آفر (بنیادی کرایہ کا ٪)')}
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
                {tr(lang, 'Default: 135% (Max passenger tip/surge cap)', 'ڈیفالٹ: 135% (زیادہ سے زیادہ آفر کی حد)')}
              </span>
            </div>
          </div>

          {/* Service Multipliers */}
          <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#8F6400]">
              <Percent className="w-4 h-4" />
              {tr(lang, 'Service Multipliers', 'سروس ملٹی پلائرز')}
            </div>
            <div>
              <label className="block text-zinc-600 font-semibold mb-1">
                {tr(lang, 'Return Journey Multiplier (Round Trip)', 'دو طرفہ واپسی ملٹی پلائر')}
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
                {tr(lang, 'Default: 1.85x (15% discount vs two single trips)', 'ڈیفالٹ: 1.85x (دو الگ رائیڈز کے مقابلے 15% رعایت)')}
              </span>
            </div>
            <div>
              <label className="block text-zinc-600 font-semibold mb-1">
                {tr(lang, 'Ride Sharing Per-Seat Discount (%)', 'رائیڈ شیئرنگ فی سیٹ رعایت (%)')}
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
                {tr(lang, 'Default: 20% discount for shared seats', 'ڈیفالٹ: شیئرڈ سیٹوں کے لیے 20% رعایت')}
              </span>
            </div>
          </div>

          {/* Schedule Commute Defaults */}
          <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#8F6400]">
              <TrendingUp className="w-4 h-4" />
              {tr(lang, 'Schedule Commute Defaults', 'شیڈول سفر کے ڈیفالٹ ریٹس')}
            </div>
            <div>
              <label className="block text-zinc-600 font-semibold mb-1">
                {tr(lang, 'Schedule Rate (PKR / km)', 'شیڈول ریٹ (روپے / کلومیٹر)')}
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
                {tr(lang, 'Default: Rs. 38/km for daily recurring rides', 'ڈیفالٹ: روزانہ شیڈول سفر کے لیے 38 روپے/کلومیٹر')}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-zinc-600 text-[11px] font-semibold mb-1">{tr(lang, 'Pickup Time', 'پک اپ وقت')}</label>
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
                <label className="block text-zinc-600 text-[11px] font-semibold mb-1">{tr(lang, 'Drop Time', 'ڈراپ وقت')}</label>
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

          {/* CROSS-CALCULATION RULES: ECONOMY BASE MODES */}
          <div className="p-4 rounded-2xl bg-amber-50/60 border border-[#D4A017]/40 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#8F6400]">
              <Car className="w-4 h-4 text-[#D4A017]" />
              {tr(lang, 'Small Economy Car — Service Rates', 'چھوٹی اکانومی گاڑی — سروس ریٹس')}
            </div>
            <p className="text-[11px] text-zinc-600">
              {tr(
                lang,
                'Economy Car (Alto / Mira) per-km rate ranges across all 3 mobility modes:',
                'اکانومی گاڑی (آلٹو / میرا) کے تینوں سروس موڈز کے فی کلومیٹر ریٹس:'
              )}
            </p>
            <div className="space-y-2">
              <div>
                <label className="block text-zinc-700 font-semibold mb-1">
                  {tr(lang, 'Pick & Drop: PKR / km', 'پِک اینڈ ڈراپ: روپے / کلومیٹر')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={localSettings.rate_economy_pick_drop_min}
                    onChange={(e) =>
                      setLocalSettings((s) => ({ ...s, rate_economy_pick_drop_min: e.target.value }))
                    }
                    placeholder={tr(lang, 'Min 35', 'کم از کم 35')}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 font-mono text-xs"
                  />
                  <input
                    type="number"
                    value={localSettings.rate_economy_pick_drop_max}
                    onChange={(e) =>
                      setLocalSettings((s) => ({ ...s, rate_economy_pick_drop_max: e.target.value }))
                    }
                    placeholder={tr(lang, 'Max 45', 'زیادہ سے زیادہ 45')}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 font-mono text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="block text-zinc-700 font-semibold mb-1">
                  {tr(lang, 'Ride Sharing: PKR / km', 'رائیڈ شیئرنگ: روپے / کلومیٹر')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={localSettings.rate_economy_ride_share_min}
                    onChange={(e) =>
                      setLocalSettings((s) => ({ ...s, rate_economy_ride_share_min: e.target.value }))
                    }
                    placeholder={tr(lang, 'Min 30', 'کم از کم 30')}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 font-mono text-xs"
                  />
                  <input
                    type="number"
                    value={localSettings.rate_economy_ride_share_max}
                    onChange={(e) =>
                      setLocalSettings((s) => ({ ...s, rate_economy_ride_share_max: e.target.value }))
                    }
                    placeholder={tr(lang, 'Max 40', 'زیادہ سے زیادہ 40')}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 font-mono text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="block text-zinc-700 font-semibold mb-1">
                  {tr(lang, 'Fuel Sharing: PKR / km', 'فیول شیئرنگ: روپے / کلومیٹر')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={localSettings.rate_economy_fuel_share_min}
                    onChange={(e) =>
                      setLocalSettings((s) => ({ ...s, rate_economy_fuel_share_min: e.target.value }))
                    }
                    placeholder={tr(lang, 'Min 20', 'کم از کم 20')}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 font-mono text-xs"
                  />
                  <input
                    type="number"
                    value={localSettings.rate_economy_fuel_share_max}
                    onChange={(e) =>
                      setLocalSettings((s) => ({ ...s, rate_economy_fuel_share_max: e.target.value }))
                    }
                    placeholder={tr(lang, 'Max 30', 'زیادہ سے زیادہ 30')}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 font-mono text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* CROSS-CALCULATION RULES: CATEGORY UPGRADES */}
          <div className="p-4 rounded-2xl bg-amber-50/60 border border-[#D4A017]/40 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#8F6400]">
              <TrendingUp className="w-4 h-4 text-[#D4A017]" />
              {tr(lang, 'Category Upgrades — Comfort / Sedan / Luxury', 'کیٹیگری اضافہ — کمفرٹ / سیڈان / لگژری')}
            </div>
            <p className="text-[11px] text-zinc-600">
              {tr(lang, 'Cross-calculation tier markups added on top of the base rate:', 'بنیادی ریٹ پر شامل ہونے والا کیٹیگری اضافہ:')}
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-zinc-700 font-semibold mb-1">
                  {tr(lang, 'Comfort Add-on (PKR/km)', 'کمفرٹ کیٹیگری اضافہ (روپے/کلومیٹر)')}
                </label>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-zinc-500">+</span>
                  <input
                    type="number"
                    value={localSettings.rate_comfort_addon_per_km}
                    onChange={(e) =>
                      setLocalSettings((s) => ({ ...s, rate_comfort_addon_per_km: e.target.value }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 font-mono text-xs font-bold"
                  />
                  <span className="text-zinc-500 font-mono text-xs">PKR</span>
                </div>
                <span className="text-[10px] text-zinc-400 mt-0.5 block">{tr(lang, 'Standard: +5 Rs/km', 'معیاری: +5 روپے/کلومیٹر')}</span>
              </div>

              <div>
                <label className="block text-zinc-700 font-semibold mb-1">
                  {tr(lang, 'Sedan Add-on (PKR/km)', 'سیڈان کیٹیگری اضافہ (روپے/کلومیٹر)')}
                </label>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-zinc-500">+</span>
                  <input
                    type="number"
                    value={localSettings.rate_sedan_addon_per_km}
                    onChange={(e) =>
                      setLocalSettings((s) => ({ ...s, rate_sedan_addon_per_km: e.target.value }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 font-mono text-xs font-bold"
                  />
                  <span className="text-zinc-500 font-mono text-xs">PKR</span>
                </div>
                <span className="text-[10px] text-zinc-400 mt-0.5 block">{tr(lang, 'Standard: +20 Rs/km', 'معیاری: +20 روپے/کلومیٹر')}</span>
              </div>

              <div>
                <label className="block text-zinc-700 font-semibold mb-1">
                  {tr(lang, 'Luxury Vehicle Multiplier (%)', 'لگژری گاڑیوں پر فیصد اضافہ (%)')}
                </label>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-zinc-500">+</span>
                  <input
                    type="number"
                    value={localSettings.rate_luxury_multiplier_pct}
                    onChange={(e) =>
                      setLocalSettings((s) => ({ ...s, rate_luxury_multiplier_pct: e.target.value }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 font-mono text-xs font-bold"
                  />
                  <span className="text-zinc-500 font-mono text-xs">%</span>
                </div>
                <span className="text-[10px] text-zinc-400 mt-0.5 block">{tr(lang, 'Standard: +10% over rate', 'معیاری: +10% اضافی')}</span>
              </div>
            </div>
          </div>

          {/* CROSS-CALCULATION RULES: VANS & COASTERS */}
          <div className="p-4 rounded-2xl bg-amber-50/60 border border-[#D4A017]/40 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#8F6400]">
              <Users className="w-4 h-4 text-[#D4A017]" />
              {tr(lang, 'Vans & Coasters — Group Rates', 'وین اور کوسٹر — وین ریٹس')}
            </div>
            <p className="text-[11px] text-zinc-600">
              {tr(lang, 'Vans and Group Transport per-km calculations:', 'وین اور گروپ ٹرانسپورٹ کے فی کلومیٹر ریٹس:')}
            </p>
            <div className="space-y-2">
              <div>
                <label className="block text-zinc-700 font-semibold mb-1">
                  {tr(lang, '7-Seater Van: PKR / km', '7 سیٹر وین: روپے / کلومیٹر')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={localSettings.rate_van_7_min}
                    onChange={(e) =>
                      setLocalSettings((s) => ({ ...s, rate_van_7_min: e.target.value }))
                    }
                    placeholder={tr(lang, 'Min 20', 'کم از کم 20')}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 font-mono text-xs"
                  />
                  <input
                    type="number"
                    value={localSettings.rate_van_7_max}
                    onChange={(e) =>
                      setLocalSettings((s) => ({ ...s, rate_van_7_max: e.target.value }))
                    }
                    placeholder={tr(lang, 'Max 30', 'زیادہ سے زیادہ 30')}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-700 font-semibold mb-1">
                  {tr(lang, '15-Seater Van: PKR / km', '15 سیٹر وین: روپے / کلومیٹر')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={localSettings.rate_van_15_min}
                    onChange={(e) =>
                      setLocalSettings((s) => ({ ...s, rate_van_15_min: e.target.value }))
                    }
                    placeholder={tr(lang, 'Min 15', 'کم از کم 15')}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 font-mono text-xs"
                  />
                  <input
                    type="number"
                    value={localSettings.rate_van_15_max}
                    onChange={(e) =>
                      setLocalSettings((s) => ({ ...s, rate_van_15_max: e.target.value }))
                    }
                    placeholder={tr(lang, 'Max 25', 'زیادہ سے زیادہ 25')}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-700 font-semibold mb-1">
                  {tr(lang, 'Coaster (28-Seater): PKR / km', 'کوسٹر (28 سیٹر): روپے / کلومیٹر')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={localSettings.rate_coaster_min}
                    onChange={(e) =>
                      setLocalSettings((s) => ({ ...s, rate_coaster_min: e.target.value }))
                    }
                    placeholder={tr(lang, 'Min 12', 'کم از کم 12')}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 font-mono text-xs"
                  />
                  <input
                    type="number"
                    value={localSettings.rate_coaster_max}
                    onChange={(e) =>
                      setLocalSettings((s) => ({ ...s, rate_coaster_max: e.target.value }))
                    }
                    placeholder={tr(lang, 'Max 25', 'زیادہ سے زیادہ 25')}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 font-mono text-xs"
                  />
                </div>
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
                    {tr(lang, 'Edit Tariff:', 'کرایہ ترمیم:')} {editingFleet.name}
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    {tr(
                      lang,
                      'Saves directly to database and takes effect immediately for new bookings.',
                      'براہِ راست ڈیٹا بیس میں محفوظ ہوتا ہے اور نئی بکنگز پر فوری لاگو ہوتا ہے۔'
                    )}
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
                  <label className="block font-semibold text-zinc-700 mb-1">{tr(lang, 'Base Fare (PKR)', 'بنیادی کرایہ (روپے)')}</label>
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
                  <label className="block font-semibold text-zinc-700 mb-1">{tr(lang, 'Commission (%)', 'کمیشن (%)')}</label>
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
                  <label className="block font-semibold text-zinc-700 mb-1">{tr(lang, 'Per-KM Min (PKR)', 'کم از کم ریٹ/کلومیٹر (روپے)')}</label>
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
                  <label className="block font-semibold text-zinc-700 mb-1">{tr(lang, 'Per-KM Max (PKR)', 'زیادہ سے زیادہ ریٹ/کلومیٹر (روپے)')}</label>
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
                  <label className="block font-semibold text-zinc-700 mb-1">{tr(lang, 'Waiting Charge / min (PKR)', 'انتظار چارجز / منٹ (روپے)')}</label>
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
                  <label className="block font-semibold text-zinc-700 mb-1">{tr(lang, 'Extra Stop Charge (PKR)', 'اضافی اسٹاپ چارج (روپے)')}</label>
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
                  {tr(lang, 'Cancel', 'منسوخ')}
                </button>
                <button
                  type="submit"
                  disabled={savingTariff}
                  className="px-6 py-2.5 rounded-xl bg-[#0D0D10] text-white font-bold hover:bg-zinc-800 disabled:opacity-50"
                >
                  {savingTariff ? tr(lang, 'Saving Tariff...', 'محفوظ ہو رہا ہے...') : tr(lang, 'Save Tariff Changes', 'تبدیلیاں محفوظ کریں')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
