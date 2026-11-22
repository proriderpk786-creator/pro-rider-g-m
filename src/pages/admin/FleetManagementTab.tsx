import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  Car,
  Check,
  Edit3,
  ImageIcon,
  Plus,
  Power,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { VehicleImage } from '../../components/BrandMark';
import { tr, trService } from '../../i18n/translations';
import { apiRequest } from '../../utils/api';
import { processVehiclePhotoUpload } from '../../utils/imageUpload';
import type { FleetCategory, Language, ServiceType } from '../../types';

interface FleetManagementTabProps {
  fleet: FleetCategory[];
  lang?: Language;
  onReload: () => Promise<void>;
  onShowToast: (msg: string) => void;
}

interface FleetModalData {
  id?: string;
  name: string;
  tagline: string;
  image_url: string;
  seating_capacity: number;
  base_fare_pkr: number;
  per_km_min_pkr: number;
  per_km_max_pkr: number;
  waiting_charge_per_min: number;
  extra_stop_pkr: number;
  commission_pct: number;
  services_eligible: ServiceType[];
  sort_order: number;
  is_active: boolean;
}

const DEFAULT_FLEET_DATA: FleetModalData = {
  name: '',
  tagline: 'Verified AC ride for everyday city travel',
  image_url: '',
  seating_capacity: 4,
  base_fare_pkr: 200,
  per_km_min_pkr: 35,
  per_km_max_pkr: 48,
  waiting_charge_per_min: 5,
  extra_stop_pkr: 50,
  commission_pct: 15,
  services_eligible: ['pick_and_drop', 'ride_sharing', 'fuel_sharing'],
  sort_order: 10,
  is_active: true,
};

export const FleetManagementTab: React.FC<FleetManagementTabProps> = ({
  fleet,
  lang = 'en',
  onReload,
  onShowToast,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [formData, setFormData] = useState<FleetModalData>(DEFAULT_FLEET_DATA);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const openCreateModal = () => {
    setModalMode('create');
    setFormData({
      ...DEFAULT_FLEET_DATA,
      sort_order: (fleet.length + 1) * 10,
    });
    setErrorMsg(null);
    setModalOpen(true);
  };

  const openEditModal = (item: FleetCategory) => {
    setModalMode('edit');
    setFormData({
      id: item.id,
      name: item.name,
      tagline: item.tagline || '',
      image_url: item.image_url || '',
      seating_capacity: item.seating_capacity,
      base_fare_pkr: item.base_fare_pkr,
      per_km_min_pkr: item.per_km_min_pkr,
      per_km_max_pkr: item.per_km_max_pkr,
      waiting_charge_per_min: item.waiting_charge_per_min,
      extra_stop_pkr: item.extra_stop_pkr,
      commission_pct: item.commission_pct,
      services_eligible: item.services_eligible || ['pick_and_drop'],
      sort_order: item.sort_order ?? 10,
      is_active: item.is_active === 1,
    });
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setImageUploading(true);
      setErrorMsg(null);
      const dataUrl = await processVehiclePhotoUpload(file, 960, 0.88);
      setFormData((prev) => ({ ...prev, image_url: dataUrl }));
      onShowToast(tr(lang, 'Vehicle photograph uploaded successfully.', 'گاڑی کی تصویر کامیابی سے اپلوڈ ہو گئی۔'));
    } catch (err: any) {
      setErrorMsg(err.message || tr(lang, 'Failed to process vehicle photograph.', 'گاڑی کی تصویر پراسیس کرنے میں ناکامی۔'));
    } finally {
      setImageUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleServiceEligible = (st: ServiceType) => {
    setFormData((prev) => {
      const exists = prev.services_eligible.includes(st);
      const updated = exists
        ? prev.services_eligible.filter((s) => s !== st)
        : [...prev.services_eligible, st];
      return { ...prev, services_eligible: updated.length > 0 ? updated : [st] };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setErrorMsg(tr(lang, 'Vehicle category name is required.', 'گاڑی کی قسم کا نام ضروری ہے۔'));
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      if (modalMode === 'create') {
        await apiRequest('/api/admin/fleet', {
          method: 'POST',
          role: 'admin',
          body: {
            name: formData.name.trim(),
            tagline: formData.tagline.trim(),
            image_url: formData.image_url,
            seating_capacity: Number(formData.seating_capacity),
            base_fare_pkr: Number(formData.base_fare_pkr),
            per_km_min_pkr: Number(formData.per_km_min_pkr),
            per_km_max_pkr: Number(formData.per_km_max_pkr),
            waiting_charge_per_min: Number(formData.waiting_charge_per_min),
            extra_stop_pkr: Number(formData.extra_stop_pkr),
            commission_pct: Number(formData.commission_pct),
            services_eligible: formData.services_eligible,
            sort_order: Number(formData.sort_order),
            is_active: formData.is_active,
          },
        });
        onShowToast(
          tr(
            lang,
            `New vehicle category "${formData.name}" created successfully.`,
            `نئی گاڑی کی قسم "${formData.name}" کامیابی سے شامل کر دی گئی۔`
          )
        );
      } else if (modalMode === 'edit' && formData.id) {
        await apiRequest(`/api/admin/fleet/${formData.id}`, {
          method: 'PATCH',
          role: 'admin',
          body: {
            name: formData.name.trim(),
            tagline: formData.tagline.trim(),
            image_url: formData.image_url,
            seating_capacity: Number(formData.seating_capacity),
            base_fare_pkr: Number(formData.base_fare_pkr),
            per_km_min_pkr: Number(formData.per_km_min_pkr),
            per_km_max_pkr: Number(formData.per_km_max_pkr),
            waiting_charge_per_min: Number(formData.waiting_charge_per_min),
            extra_stop_pkr: Number(formData.extra_stop_pkr),
            commission_pct: Number(formData.commission_pct),
            services_eligible: formData.services_eligible,
            sort_order: Number(formData.sort_order),
            is_active: formData.is_active,
          },
        });
        onShowToast(
          tr(
            lang,
            `Vehicle category "${formData.name}" updated successfully.`,
            `گاڑی کی قسم "${formData.name}" کامیابی سے اپڈیٹ ہو گئی۔`
          )
        );
      }
      setModalOpen(false);
      await onReload();
    } catch (err: any) {
      setErrorMsg(err.message || tr(lang, 'Failed to save vehicle category.', 'گاڑی کی قسم محفوظ کرنے میں ناکامی۔'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: FleetCategory) => {
    try {
      const nextActive = item.is_active !== 1;
      await apiRequest(`/api/admin/fleet/${item.id}`, {
        method: 'PATCH',
        role: 'admin',
        body: { is_active: nextActive },
      });
      onShowToast(
        tr(
          lang,
          `Category "${item.name}" is now ${nextActive ? 'ACTIVE' : 'DISABLED'}.`,
          `"${item.name}" اب ${nextActive ? 'فعال' : 'بند'} ہے۔`
        )
      );
      await onReload();
    } catch (err: any) {
      onShowToast(tr(lang, `Error toggling status: ${err.message}`, `اسٹیٹس تبدیل کرنے میں خرابی: ${err.message}`));
    }
  };

  const handleDeleteCategory = async (id: string) => {
    setDeleteBusy(true);
    try {
      await apiRequest(`/api/admin/fleet/${id}`, {
        method: 'DELETE',
        role: 'admin',
      });
      onShowToast(tr(lang, 'Vehicle category removed from system.', 'گاڑی کی قسم سسٹم سے ہٹا دی گئی۔'));
      setDeleteConfirmId(null);
      await onReload();
    } catch (err: any) {
      onShowToast(tr(lang, `Cannot delete: ${err.message}`, `حذف نہیں کیا جا سکا: ${err.message}`));
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner with Action Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#D4A017]/15 text-[#8F6400] text-xs font-bold uppercase tracking-wider mb-2">
            <Car className="w-3.5 h-3.5" />
            {tr(lang, 'Super Admin Fleet Control', 'سپر ایڈمن گاڑیوں کا کنٹرول')}
          </div>
          <h1 className="font-display text-2xl font-bold text-[#0D0D10]">
            {tr(lang, 'Manage Eligible Vehicle Categories', 'گاڑیوں کی اقسام اور تصاویر')}
          </h1>
          <p className="text-xs text-zinc-500 mt-1 max-w-2xl">
            {tr(
              lang,
              'Admin can add genuine vehicle categories, upload actual vehicle photographs, set seating capacities, customize base and per-km tariffs, and assign service eligibility.',
              'ایڈمن گاڑیوں کی اقسام شامل کر سکتا ہے، اصل تصاویر اپلوڈ کر سکتا ہے، سیٹوں کی گنجائش اور کرایہ مقرر کر سکتا ہے۔'
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-[#0D0D10] hover:bg-zinc-800 text-white font-bold text-xs shadow-md transition-all shrink-0 min-h-[44px]"
        >
          <Plus className="w-4 h-4 text-[#D4A017]" />
          {tr(lang, 'Add Vehicle Category', 'نئی گاڑی کی قسم شامل کریں')}
        </button>
      </div>

      {/* Fleet Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {fleet.map((f) => (
          <div
            key={f.id}
            className={`rounded-3xl border transition-all duration-200 bg-white p-5 flex flex-col justify-between shadow-sm hover:shadow-md ${
              f.is_active === 1 ? 'border-zinc-200' : 'border-zinc-300 bg-zinc-50/70 opacity-80'
            }`}
          >
            <div>
              {/* Image & Header */}
              <div className="relative mb-4 overflow-hidden rounded-2xl bg-zinc-100 border border-zinc-200 aspect-[16/9] flex items-center justify-center">
                {f.image_url ? (
                  <VehicleImage
                    src={f.image_url}
                    alt={f.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-zinc-400 gap-1.5 p-4 text-center">
                    <ImageIcon className="w-8 h-8 text-[#D4A017]" />
                    <span className="text-[11px] font-semibold text-zinc-500">
                      {tr(lang, 'No original photo uploaded', 'کوئی اصل تصویر اپلوڈ نہیں')}
                    </span>
                  </div>
                )}
                {/* Active / Disabled Badge */}
                <div className="absolute top-3 left-3">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider shadow-sm ${
                      f.is_active === 1
                        ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-700 text-zinc-200'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        f.is_active === 1 ? 'bg-emerald-200 animate-pulse' : 'bg-zinc-400'
                      }`}
                    />
                    {f.is_active === 1 ? tr(lang, 'Active Fleet', 'فعال گاڑی') : tr(lang, 'Disabled', 'بند')}
                  </span>
                </div>

                <div className="absolute top-3 right-3 bg-[#0D0D10]/85 backdrop-blur text-white text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg">
                  {tr(lang, 'Order', 'ترتیب')} #{f.sort_order ?? 10}
                </div>
              </div>

              {/* Title & Tagline */}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display font-bold text-base text-[#0D0D10] truncate">
                    {f.name}
                  </h3>
                  <span className="shrink-0 text-xs font-semibold px-2.5 py-0.5 rounded-lg bg-zinc-100 text-zinc-700">
                    {f.seating_capacity} {tr(lang, 'Seats', 'سیٹیں')}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 line-clamp-2 min-h-[32px]">
                  {f.tagline || tr(lang, 'Standard city ride category', 'معیاری شہری سفری کیٹیگری')}
                </p>
              </div>

              {/* Tariff Details Strip */}
              <div className="mt-4 pt-3 border-t border-zinc-100 grid grid-cols-2 gap-2 text-xs">
                <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-100">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block">{tr(lang, 'Base Fare', 'بنیادی کرایہ')}</span>
                  <span className="font-mono font-bold text-[#0D0D10] text-sm">
                    Rs. {Number(f.base_fare_pkr).toLocaleString()}
                  </span>
                </div>
                <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-100">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block">{tr(lang, 'Per-KM Tariff', 'فی کلومیٹر ریٹ')}</span>
                  <span className="font-mono font-bold text-[#8F6400] text-sm">
                    Rs. {f.per_km_min_pkr}–{f.per_km_max_pkr}
                  </span>
                </div>
                <div className="bg-zinc-50 p-2 rounded-xl border border-zinc-100 text-[11px]">
                  <span className="text-zinc-500">{tr(lang, 'Wait:', 'انتظار:')} </span>
                  <strong className="font-mono text-zinc-800">Rs. {f.waiting_charge_per_min}/{tr(lang, 'min', 'منٹ')}</strong>
                </div>
                <div className="bg-zinc-50 p-2 rounded-xl border border-zinc-100 text-[11px]">
                  <span className="text-zinc-500">{tr(lang, 'Comm:', 'کمیشن:')} </span>
                  <strong className="font-mono text-emerald-700">{f.commission_pct}%</strong>
                </div>
              </div>

              {/* Eligible Services */}
              <div className="mt-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                  {tr(lang, 'Eligible Services', 'اہل سروسز')}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(f.services_eligible || []).map((st) => (
                    <span
                      key={st}
                      className="inline-block px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[#8F6400] text-[10px] font-semibold uppercase"
                    >
                      {trService(lang, st)}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Card Action Footer */}
            <div className="mt-5 pt-3 border-t border-zinc-100 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => handleToggleActive(f)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                  f.is_active === 1
                    ? 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
                title={f.is_active === 1 ? tr(lang, 'Disable this category', 'یہ کیٹیگری بند کریں') : tr(lang, 'Enable this category', 'یہ کیٹیگری فعال کریں')}
              >
                <Power className="w-3.5 h-3.5" />
                {f.is_active === 1 ? tr(lang, 'Disable', 'بند کریں') : tr(lang, 'Enable', 'فعال کریں')}
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => openEditModal(f)}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-[#0D0D10] text-white hover:bg-zinc-800 text-xs font-bold transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5 text-[#D4A017]" />
                  {tr(lang, 'Edit', 'ترمیم')}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(f.id)}
                  className="p-2 rounded-xl text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title={tr(lang, 'Delete category', 'کیٹیگری حذف کریں')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 space-y-4 shadow-2xl border border-zinc-200 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-[#0D0D10]">
                {tr(lang, 'Delete Vehicle Category?', 'گاڑی کی قسم حذف کریں؟')}
              </h3>
              <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
                {tr(
                  lang,
                  'Are you sure you want to delete this vehicle category? If there are any active trips using it, the backend will safely prevent deletion to safeguard passenger bookings.',
                  'کیا آپ واقعی اس گاڑی کی قسم کو حذف کرنا چاہتے ہیں؟ اگر اس پر کوئی فعال ٹرپس ہوں تو سسٹم مسافروں کے ریکارڈ کی حفاظت کے لیے حذف روک دے گا۔'
                )}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2.5 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
              >
                {tr(lang, 'Cancel', 'منسوخ')}
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => handleDeleteCategory(deleteConfirmId)}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-sm disabled:opacity-50"
              >
                {deleteBusy ? tr(lang, 'Deleting...', 'حذف ہو رہا ہے...') : tr(lang, 'Confirm Delete', 'حذف کی تصدیق کریں')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Vehicle Category Modal with Genuine Image Upload */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-white my-8 shadow-2xl border border-zinc-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-5 bg-[#0D0D10] text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#D4A017]/20 border border-[#D4A017]/40 flex items-center justify-center text-[#F4C430]">
                  <Car className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold">
                    {modalMode === 'create'
                      ? tr(lang, 'Add New Vehicle Category', 'نئی گاڑی کی قسم شامل کریں')
                      : `${tr(lang, 'Edit:', 'ترمیم:')} ${formData.name}`}
                  </h2>
                  <p className="text-[11px] text-zinc-400">
                    {tr(
                      lang,
                      'Live updates save to the real database and reflect instantly on passenger booking screens.',
                      'تبدیلیاں براہِ راست ڈیٹا بیس میں محفوظ ہو کر مسافر ایپ پر فوری نظر آتی ہیں۔'
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSave} className="p-6 space-y-5 overflow-y-auto flex-1">
              {errorMsg && (
                <div className="rounded-2xl bg-red-50 border border-red-200 p-3.5 flex items-start gap-3 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Photo Upload Section */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-zinc-800 uppercase tracking-wider">
                  {tr(lang, 'Genuine Vehicle Photograph (Original Photo)', 'گاڑی کی اصل تصویر (فوٹو)')}
                </label>
                <div className="flex flex-col sm:flex-row gap-4 items-start">
                  <div className="w-full sm:w-44 aspect-[16/10] rounded-2xl bg-zinc-100 border border-zinc-200 overflow-hidden relative flex items-center justify-center shrink-0">
                    {formData.image_url ? (
                      <img
                        src={formData.image_url}
                        alt={tr(lang, 'Vehicle Preview', 'گاڑی کا پیش منظر')}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center p-3 text-zinc-400">
                        <ImageIcon className="w-7 h-7 mx-auto mb-1 text-zinc-300" />
                        <span className="text-[11px] font-medium">{tr(lang, 'No photo selected', 'کوئی فوٹو منتخب نہیں')}</span>
                      </div>
                    )}
                    {formData.image_url && (
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, image_url: '' }))}
                        className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/70 text-white hover:bg-black"
                        title={tr(lang, 'Remove photograph', 'تصویر ہٹائیں')}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex-1 space-y-2.5">
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={handleImageFileChange}
                      className="hidden"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={imageUploading}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0D0D10] text-white hover:bg-zinc-800 text-xs font-bold transition-colors shadow-sm disabled:opacity-50"
                      >
                        <Upload className="w-3.5 h-3.5 text-[#D4A017]" />
                        {imageUploading
                          ? tr(lang, 'Processing Photo...', 'فوٹو پراسیس ہو رہی ہے...')
                          : tr(lang, 'Upload Actual Vehicle Photo', 'گاڑی کی اصل تصویر اپلوڈ کریں')}
                      </button>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-relaxed">
                      {tr(
                        lang,
                        'Select a genuine photograph from your computer or phone. It is automatically compressed and optimized for high-resolution display on mobile and desktop apps.',
                        'اپنے فون یا کمپیوٹر سے گاڑی کی اصل تصویر منتخب کریں۔ یہ خودکار طور پر موبائل اور ڈیسک ٹاپ کے لیے موزوں ہو جائے گی۔'
                      )}
                    </p>
                    <div className="pt-1">
                      <input
                        type="text"
                        placeholder={tr(lang, 'Or enter image URL / asset path directly...', 'یا تصویر کا لنک / راستہ درج کریں...')}
                        value={formData.image_url}
                        onChange={(e) => setFormData((prev) => ({ ...prev, image_url: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-mono bg-zinc-50 focus:bg-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Basic Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    {tr(lang, 'Category Name', 'کیٹیگری کا نام')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={tr(lang, 'e.g., Comfort Sedan (1300cc)', 'مثلاً: کمفرٹ سیڈان (1300cc)')}
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 text-xs font-semibold text-[#0D0D10]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    {tr(lang, 'Seating Capacity (Passengers)', 'سیٹوں کی گنجائش (مسافر)')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    required
                    value={formData.seating_capacity}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, seating_capacity: Number(e.target.value) }))
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 text-xs font-mono font-bold"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    {tr(lang, 'Marketing Tagline', 'مختصر تفصیل / ٹیگ لائن')}
                  </label>
                  <input
                    type="text"
                    placeholder={tr(lang, 'e.g., Spacious AC Sedan with Leather Seats & Boot Space', 'مثلاً: کشادہ اے سی گاڑی آرام دہ سیٹوں کے ساتھ')}
                    value={formData.tagline}
                    onChange={(e) => setFormData((prev) => ({ ...prev, tagline: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 text-xs"
                  />
                </div>
              </div>

              {/* Fares & Pricing Structure */}
              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-[#8F6400]">
                  {tr(lang, 'Fare Structure & Tariffs (PKR)', 'کرایہ ڈھانچہ اور ریٹس (روپے)')}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-zinc-600 text-[11px] font-semibold mb-1">{tr(lang, 'Base Fare', 'بنیادی کرایہ')}</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-[10px]">
                        Rs.
                      </span>
                      <input
                        type="number"
                        min={0}
                        required
                        value={formData.base_fare_pkr}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, base_fare_pkr: Number(e.target.value) }))
                        }
                        className="w-full pl-8 pr-2.5 py-2 rounded-xl border border-zinc-200 font-mono font-bold text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-zinc-600 text-[11px] font-semibold mb-1">{tr(lang, 'Per-KM Min', 'کم از کم ریٹ/کلومیٹر')}</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-[10px]">
                        Rs.
                      </span>
                      <input
                        type="number"
                        min={0}
                        required
                        value={formData.per_km_min_pkr}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, per_km_min_pkr: Number(e.target.value) }))
                        }
                        className="w-full pl-8 pr-2.5 py-2 rounded-xl border border-zinc-200 font-mono font-bold text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-zinc-600 text-[11px] font-semibold mb-1">{tr(lang, 'Per-KM Max', 'زیادہ سے زیادہ ریٹ/کلومیٹر')}</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-[10px]">
                        Rs.
                      </span>
                      <input
                        type="number"
                        min={0}
                        required
                        value={formData.per_km_max_pkr}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, per_km_max_pkr: Number(e.target.value) }))
                        }
                        className="w-full pl-8 pr-2.5 py-2 rounded-xl border border-zinc-200 font-mono font-bold text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-zinc-600 text-[11px] font-semibold mb-1">{tr(lang, 'Wait Charge / min', 'انتظار / منٹ')}</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-[10px]">
                        Rs.
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={formData.waiting_charge_per_min}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            waiting_charge_per_min: Number(e.target.value),
                          }))
                        }
                        className="w-full pl-8 pr-2.5 py-2 rounded-xl border border-zinc-200 font-mono font-bold text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-zinc-600 text-[11px] font-semibold mb-1">{tr(lang, 'Extra Stop', 'اضافی اسٹاپ')}</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-[10px]">
                        Rs.
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={formData.extra_stop_pkr}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, extra_stop_pkr: Number(e.target.value) }))
                        }
                        className="w-full pl-8 pr-2.5 py-2 rounded-xl border border-zinc-200 font-mono font-bold text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-zinc-600 text-[11px] font-semibold mb-1">{tr(lang, 'Commission (%)', 'کمیشن (%)')}</label>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={50}
                        value={formData.commission_pct}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, commission_pct: Number(e.target.value) }))
                        }
                        className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-mono font-bold text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Service Eligibility Checkboxes */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-2">
                  {tr(lang, 'Eligible Booking Services', 'اہل بُکنگ سروسز')}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {(
                    [
                      {
                        id: 'pick_and_drop',
                        label: tr(lang, 'Pick & Drop', 'پِک اینڈ ڈراپ'),
                        desc: tr(lang, 'Doorstep direct private rides', 'گھر سے براہِ راست پرائیویٹ رائیڈ'),
                      },
                      {
                        id: 'ride_sharing',
                        label: tr(lang, 'Ride Sharing', 'رائیڈ شیئرنگ'),
                        desc: tr(lang, 'Shared per-seat passenger rides', 'فی سیٹ شیئرڈ مسافر رائیڈ'),
                      },
                      {
                        id: 'fuel_sharing',
                        label: tr(lang, 'Fuel Sharing', 'فیول شیئرنگ'),
                        desc: tr(lang, 'Cost-split daily office commutes', 'روزانہ آفس سفر کے لیے کم خرچ'),
                      },
                    ] as const
                  ).map((s) => {
                    const checked = formData.services_eligible.includes(s.id);
                    return (
                      <button
                        type="button"
                        key={s.id}
                        onClick={() => toggleServiceEligible(s.id)}
                        className={`p-3 rounded-2xl border text-left transition-all ${
                          checked
                            ? 'border-[#D4A017] bg-[#D4A017]/10'
                            : 'border-zinc-200 hover:border-zinc-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[#0D0D10]">{s.label}</span>
                          <div
                            className={`w-4 h-4 rounded-md flex items-center justify-center text-white text-[10px] ${
                              checked ? 'bg-[#0D0D10]' : 'border border-zinc-300'
                            }`}
                          >
                            {checked && <Check className="w-3 h-3 text-[#D4A017]" />}
                          </div>
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-1">{s.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sort Order & Active */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-zinc-100">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-zinc-700">{tr(lang, 'Display Sort Order:', 'ڈسپلے ترتیب نمبر:')}</label>
                  <input
                    type="number"
                    value={formData.sort_order}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, sort_order: Number(e.target.value) }))
                    }
                    className="w-20 px-2.5 py-1.5 rounded-xl border border-zinc-200 font-mono font-bold text-xs"
                  />
                </div>

                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, is_active: e.target.checked }))
                    }
                    className="w-4 h-4 rounded text-[#D4A017] focus:ring-0 accent-[#D4A017]"
                  />
                  <span className="text-xs font-bold text-zinc-800">
                    {tr(lang, 'Category Active (Available for bookings)', 'کیٹیگری فعال ہے (بُکنگ کے لیے دستیاب)')}
                  </span>
                </label>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-zinc-300 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
                >
                  {tr(lang, 'Cancel', 'منسوخ')}
                </button>
                <button
                  type="submit"
                  disabled={saving || imageUploading}
                  className="px-6 py-2.5 rounded-xl bg-[#0D0D10] hover:bg-zinc-800 text-white text-xs font-bold shadow-md transition-colors disabled:opacity-50 min-h-[40px]"
                >
                  {saving
                    ? tr(lang, 'Saving to Database...', 'ڈیٹا بیس میں محفوظ ہو رہا ہے...')
                    : modalMode === 'create'
                    ? tr(lang, 'Create Vehicle Category', 'گاڑی کی قسم شامل کریں')
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
