import React, { useState } from 'react';
import {
  AlertCircle,
  Clock,
  Edit3,
  Flame,
  MapPin,
  Plus,
  Power,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { tr } from '../../i18n/translations';
import { apiRequest } from '../../utils/api';
import type { Language, ServiceZone } from '../../types';

interface ZonesManagementTabProps {
  zones: ServiceZone[];
  lang?: Language;
  onReload: () => Promise<void>;
  onShowToast: (msg: string) => void;
}

interface ZoneFormData {
  id?: string;
  city: string;
  area_name: string;
  center_lat: number;
  center_lng: number;
  radius_km: number;
  demand_level: 'low' | 'medium' | 'high';
  rickshaw_enabled: boolean;
  rickshaw_rate_pkr: number;
  rickshaw_hours: string;
  is_active: boolean;
}

const DEFAULT_ZONE_FORM: ZoneFormData = {
  city: 'Islamabad',
  area_name: '',
  center_lat: 33.71,
  center_lng: 73.06,
  radius_km: 10,
  demand_level: 'medium',
  rickshaw_enabled: true,
  rickshaw_rate_pkr: 20,
  rickshaw_hours: '6 AM - 10 PM',
  is_active: true,
};

const ZONE_PRESETS = [
  { city: 'Islamabad', name: 'Blue Area / F-6 / F-7', lat: 33.71, lng: 73.06 },
  { city: 'Rawalpindi', name: 'Saddar / Murree Road', lat: 33.5973, lng: 73.0479 },
  { city: 'Lahore', name: 'Gulberg / MM Alam Road', lat: 31.5204, lng: 74.3587 },
  { city: 'Karachi', name: 'Clifton & DHA', lat: 24.8138, lng: 67.0299 },
  { city: 'Peshawar', name: 'University Town', lat: 34.0086, lng: 71.5126 },
];

export const ZonesManagementTab: React.FC<ZonesManagementTabProps> = ({
  zones,
  lang = 'en',
  onReload,
  onShowToast,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [formData, setFormData] = useState<ZoneFormData>(DEFAULT_ZONE_FORM);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const openCreateModal = () => {
    setModalMode('create');
    setFormData(DEFAULT_ZONE_FORM);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const openEditModal = (z: ServiceZone) => {
    setModalMode('edit');
    setFormData({
      id: z.id,
      city: z.city,
      area_name: z.area_name,
      center_lat: z.center_lat,
      center_lng: z.center_lng,
      radius_km: z.radius_km,
      demand_level: z.demand_level,
      rickshaw_enabled: z.rickshaw_enabled === 1,
      rickshaw_rate_pkr: z.rickshaw_rate_pkr,
      rickshaw_hours: z.rickshaw_hours,
      is_active: z.is_active === 1,
    });
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleApplyPreset = (p: typeof ZONE_PRESETS[0]) => {
    setFormData((prev) => ({
      ...prev,
      city: p.city,
      area_name: p.name,
      center_lat: p.lat,
      center_lng: p.lng,
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.city.trim() || !formData.area_name.trim()) {
      setErrorMsg(tr(lang, 'City and Area Name are required.', 'شہر اور علاقے کا نام درکار ہے۔'));
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      if (modalMode === 'create') {
        await apiRequest('/api/admin/zones', {
          method: 'POST',
          role: 'admin',
          body: formData,
        });
        onShowToast(
          tr(
            lang,
            `Service zone "${formData.area_name}, ${formData.city}" created.`,
            `سروس زون "${formData.area_name}, ${formData.city}" شامل ہو گیا۔`
          )
        );
      } else if (modalMode === 'edit' && formData.id) {
        await apiRequest(`/api/admin/zones/${formData.id}`, {
          method: 'PATCH',
          role: 'admin',
          body: formData,
        });
        onShowToast(tr(lang, `Service zone "${formData.area_name}" updated.`, `سروس زون "${formData.area_name}" اپڈیٹ ہو گیا۔`));
      }
      setModalOpen(false);
      await onReload();
    } catch (err: any) {
      setErrorMsg(err.message || tr(lang, 'Failed to save zone.', 'زون محفوظ کرنے میں ناکامی۔'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteZone = async (id: string, name: string) => {
    if (!window.confirm(tr(lang, `Are you sure you want to delete operating zone "${name}"?`, `کیا آپ واقعی زون "${name}" کو حذف کرنا چاہتے ہیں؟`))) return;
    try {
      await apiRequest(`/api/admin/zones/${id}`, {
        method: 'DELETE',
        role: 'admin',
      });
      onShowToast(tr(lang, `Zone "${name}" removed.`, `زون "${name}" حذف کر دیا گیا۔`));
      await onReload();
    } catch (err: any) {
      onShowToast(tr(lang, `Failed to delete zone: ${err.message}`, `زون حذف کرنے میں خرابی: ${err.message}`));
    }
  };

  const handleDemandChange = async (z: ServiceZone, nextLevel: 'low' | 'medium' | 'high') => {
    try {
      await apiRequest(`/api/admin/zones/${z.id}`, {
        method: 'PATCH',
        role: 'admin',
        body: { demand_level: nextLevel },
      });
      onShowToast(
        tr(
          lang,
          `Demand level for "${z.area_name}" set to ${nextLevel.toUpperCase()}.`,
          `"${z.area_name}" کی ڈیمانڈ سطح ${nextLevel === 'high' ? 'زیادہ' : nextLevel === 'medium' ? 'درمیانی' : 'کم'} کر دی گئی۔`
        )
      );
      await onReload();
    } catch (err: any) {
      onShowToast(tr(lang, `Error updating demand: ${err.message}`, `ڈیمانڈ اپڈیٹ کرنے میں خرابی: ${err.message}`));
    }
  };

  const handleToggleRickshaw = async (z: ServiceZone) => {
    try {
      const nextEnabled = z.rickshaw_enabled !== 1;
      await apiRequest(`/api/admin/zones/${z.id}`, {
        method: 'PATCH',
        role: 'admin',
        body: { rickshaw_enabled: nextEnabled },
      });
      onShowToast(
        tr(
          lang,
          `Rickshaw booking for "${z.area_name}" is now ${nextEnabled ? 'ENABLED' : 'DISABLED'}.`,
          `"${z.area_name}" کے لیے رکشہ بکنگ اب ${nextEnabled ? 'فعال' : 'بند'} ہے۔`
        )
      );
      await onReload();
    } catch (err: any) {
      onShowToast(tr(lang, `Error updating rickshaw status: ${err.message}`, `رکشہ اسٹیٹس اپڈیٹ کرنے میں خرابی: ${err.message}`));
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#D4A017]/15 text-[#8F6400] text-xs font-bold uppercase tracking-wider mb-2">
            <Flame className="w-3.5 h-3.5" />
            {tr(lang, 'Operating Zones & Heat Map Demand', 'آپریٹنگ زونز اور ہیٹ میپ ڈیمانڈ')}
          </div>
          <h1 className="font-display text-2xl font-bold text-[#0D0D10]">
            {tr(lang, 'Operating Zones & Rickshaw Tariffs', 'آپریٹنگ زونز اور رکشہ کرایہ')}
          </h1>
          <p className="text-xs text-zinc-500 mt-1 max-w-2xl">
            {tr(
              lang,
              'Super Admin controls active city zones, sets D3 demand heat map intensity, and configures local Rickshaw rates and operating hours.',
              'سپر ایڈمن شہری زونز، ڈیمانڈ ہیٹ میپ کی شدت اور مقامی رکشہ کے کرایوں اور اوقات کو کنٹرول کرتا ہے۔'
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-[#0D0D10] hover:bg-zinc-800 text-white font-bold text-xs shadow-md transition-all shrink-0 min-h-[44px]"
        >
          <Plus className="w-4 h-4 text-[#D4A017]" />
          {tr(lang, 'Add Service Zone', 'سروس زون شامل کریں')}
        </button>
      </div>

      {/* Zones Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {zones.map((z) => {
          const demandColor =
            z.demand_level === 'high'
              ? 'bg-red-100 text-red-800 border-red-200'
              : z.demand_level === 'medium'
              ? 'bg-amber-100 text-amber-800 border-amber-200'
              : 'bg-emerald-100 text-emerald-800 border-emerald-200';

          return (
            <div
              key={z.id}
              className="rounded-3xl border border-zinc-200 bg-white p-5 space-y-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                      <MapPin className="w-3.5 h-3.5 text-[#D4A017]" />
                      {z.city}
                    </div>
                    <h3 className="font-display font-bold text-lg text-[#0D0D10] mt-0.5">
                      {z.area_name}
                    </h3>
                  </div>

                  {/* Demand Selector */}
                  <select
                    value={z.demand_level}
                    onChange={(e) => handleDemandChange(z, e.target.value as any)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold uppercase font-mono cursor-pointer ${demandColor}`}
                  >
                    <option value="low">{tr(lang, 'Low Demand', 'کم ڈیمانڈ')}</option>
                    <option value="medium">{tr(lang, 'Medium Demand', 'درمیانی ڈیمانڈ')}</option>
                    <option value="high">{tr(lang, 'High Surge Demand', 'زیادہ رش / سرج')}</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-100">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">{tr(lang, 'Radius', 'دائرہ کار')}</span>
                    <span className="font-mono font-bold text-zinc-800">{z.radius_km} {tr(lang, 'km', 'کلومیٹر')}</span>
                  </div>
                  <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-100">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">{tr(lang, 'Center Coordinates', 'مرکزی کوآرڈینیٹس')}</span>
                    <span className="font-mono text-[11px] text-zinc-600 truncate block">
                      {z.center_lat.toFixed(4)}, {z.center_lng.toFixed(4)}
                    </span>
                  </div>
                </div>

                {/* Rickshaw Controls Strip */}
                <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200/80 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#8F6400]">{tr(lang, 'Rickshaw Booking Tariff:', 'رکشہ بُکنگ کرایہ:')}</span>
                    <button
                      type="button"
                      onClick={() => handleToggleRickshaw(z)}
                      className={`px-3 py-1 rounded-lg text-[11px] font-bold uppercase transition-colors ${
                        z.rickshaw_enabled === 1
                          ? 'bg-[#D4A017] text-[#0D0D10]'
                          : 'bg-zinc-200 text-zinc-600'
                      }`}
                    >
                      {z.rickshaw_enabled === 1 ? tr(lang, 'Enabled', 'فعال') : tr(lang, 'Disabled', 'بند')}
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-xs text-zinc-600 font-mono">
                    <span>
                      {tr(lang, 'Rate:', 'ریٹ:')} <strong className="text-zinc-900 font-bold">Rs. {z.rickshaw_rate_pkr}/{tr(lang, 'km', 'کلومیٹر')}</strong>
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px]">
                      <Clock className="w-3 h-3 text-[#D4A017]" /> {z.rickshaw_hours}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Footer */}
              <div className="pt-3 border-t border-zinc-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => openEditModal(z)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold text-xs transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  {tr(lang, 'Edit Zone', 'زون ترمیم کریں')}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteZone(z.id, z.area_name)}
                  className="p-2 rounded-xl text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title={tr(lang, 'Delete zone', 'زون حذف کریں')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Zone Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-zinc-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-5 bg-[#0D0D10] text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#D4A017]/20 border border-[#D4A017]/40 flex items-center justify-center text-[#F4C430]">
                  <Flame className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base">
                    {modalMode === 'create'
                      ? tr(lang, 'Add Operating Service Zone', 'نیا سروس زون شامل کریں')
                      : `${tr(lang, 'Edit:', 'ترمیم:')} ${formData.area_name}`}
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    {tr(
                      lang,
                      'Defines active dispatch radii, demand heat map coloring, and Rickshaw tariffs.',
                      'ڈسپیچ دائرہ کار، ہیٹ میپ رنگ اور رکشہ کرایہ مقرر کرتا ہے۔'
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4 text-xs">
              {errorMsg && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-red-700">
                  {errorMsg}
                </div>
              )}

              {/* Quick Presets */}
              {modalMode === 'create' && (
                <div>
                  <label className="block font-bold text-zinc-500 uppercase tracking-wider text-[10px] mb-1.5">
                    {tr(lang, 'Quick Pakistani City Presets:', 'پاکستانی شہروں کے فوری انتخاب:')}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {ZONE_PRESETS.map((p) => (
                      <button
                        type="button"
                        key={p.name}
                        onClick={() => handleApplyPreset(p)}
                        className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[11px] font-semibold transition-colors"
                      >
                        {p.city}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">{tr(lang, 'City', 'شہر')}</label>
                  <input
                    type="text"
                    required
                    value={formData.city}
                    onChange={(e) => setFormData((f) => ({ ...f, city: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">{tr(lang, 'Area / Sector Name', 'علاقہ / سیکٹر کا نام')}</label>
                  <input
                    type="text"
                    required
                    value={formData.area_name}
                    onChange={(e) => setFormData((f) => ({ ...f, area_name: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-semibold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">{tr(lang, 'Center Latitude', 'مرکزی عرض البلد')}</label>
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={formData.center_lat}
                    onChange={(e) => setFormData((f) => ({ ...f, center_lat: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">{tr(lang, 'Center Longitude', 'مرکزی طول البلد')}</label>
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={formData.center_lng}
                    onChange={(e) => setFormData((f) => ({ ...f, center_lng: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">{tr(lang, 'Radius (km)', 'دائرہ کار (کلومیٹر)')}</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={formData.radius_km}
                    onChange={(e) => setFormData((f) => ({ ...f, radius_km: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">{tr(lang, 'Demand Level', 'ڈیمانڈ کی سطح')}</label>
                  <select
                    value={formData.demand_level}
                    onChange={(e) => setFormData((f) => ({ ...f, demand_level: e.target.value as any }))}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 bg-white font-semibold"
                  >
                    <option value="low">{tr(lang, 'Low Demand', 'کم ڈیمانڈ')}</option>
                    <option value="medium">{tr(lang, 'Medium Demand', 'درمیانی ڈیمانڈ')}</option>
                    <option value="high">{tr(lang, 'High Demand', 'زیادہ ڈیمانڈ')}</option>
                  </select>
                </div>
              </div>

              {/* Rickshaw Settings */}
              <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-zinc-800">{tr(lang, 'Rickshaw Service in this Zone', 'اس زون میں رکشہ سروس')}</label>
                  <input
                    type="checkbox"
                    checked={formData.rickshaw_enabled}
                    onChange={(e) => setFormData((f) => ({ ...f, rickshaw_enabled: e.target.checked }))}
                    className="w-4 h-4 accent-[#D4A017]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-zinc-600 font-semibold mb-1">{tr(lang, 'Rickshaw Rate (PKR/km)', 'رکشہ کرایہ (روپے/کلومیٹر)')}</label>
                    <input
                      type="number"
                      value={formData.rickshaw_rate_pkr}
                      onChange={(e) => setFormData((f) => ({ ...f, rickshaw_rate_pkr: Number(e.target.value) }))}
                      className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-600 font-semibold mb-1">{tr(lang, 'Operating Hours', 'سروس کے اوقات')}</label>
                    <input
                      type="text"
                      value={formData.rickshaw_hours}
                      onChange={(e) => setFormData((f) => ({ ...f, rickshaw_hours: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-zinc-200"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-zinc-300 font-bold text-zinc-700 hover:bg-zinc-50"
                >
                  {tr(lang, 'Cancel', 'منسوخ')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl bg-[#0D0D10] text-white font-bold hover:bg-zinc-800 disabled:opacity-50"
                >
                  {saving
                    ? tr(lang, 'Saving...', 'محفوظ ہو رہا ہے...')
                    : modalMode === 'create'
                    ? tr(lang, 'Create Zone', 'زون بنائیں')
                    : tr(lang, 'Save Changes', 'تبدیلیاں محفوظ کریں')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
