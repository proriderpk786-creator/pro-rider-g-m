import React, { useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Download,
  Edit3,
  Eye,
  EyeOff,
  Globe,
  ImagePlus,
  Landmark,
  Lock,
  LogOut,
  Palette,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  UserCheck,
  X,
} from 'lucide-react';
import { apiRequest, isBackendOfflineError } from '../../utils/api';
import { compressAndReadUploadFile } from '../../utils/imageUpload';
import { downloadWalletStatementPdf } from '../../utils/pdfGenerator';
import type {
  Language,
  PartnerDocument,
  PartnerProfile,
  ShowcaseGalleryItem,
  User,
  WalletTransaction,
} from '../../types';

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

const DOC_FRIENDLY_LABELS: Record<PartnerDocument['doc_type'], { en: string; ur: string; sensitive?: boolean }> = {
  profile_photo: { en: 'Driver Selfie', ur: 'ڈرائیور سیلفی' },
  vehicle_photo: { en: 'Vehicle Photo', ur: 'گاڑی کی تصویر' },
  cnic_front: { en: 'CNIC Front', ur: 'شناختی کارڈ فرنٹ', sensitive: true },
  cnic_back: { en: 'CNIC Back', ur: 'شناختی کارڈ بیک', sensitive: true },
  driving_licence: { en: 'Driving Licence', ur: 'ڈرائیونگ لائسنس', sensitive: true },
  vehicle_registration: { en: 'Vehicle Book', ur: 'گاڑی کی کاپی', sensitive: true },
};

const TEMPLATES: Array<{
  id: 'clean_light' | 'obsidian_gold' | 'emerald_pro';
  label: string;
  cardBg: string;
  textColor: string;
  subText: string;
  borderClass: string;
  buttonBg: string;
  accentHex: string;
}> = [
  {
    id: 'clean_light',
    label: 'Clean Classic',
    cardBg: 'bg-white',
    textColor: 'text-[#0D0D10]',
    subText: 'text-zinc-500',
    borderClass: 'border-zinc-200',
    buttonBg: 'border-zinc-200 bg-white text-[#0D0D10] hover:bg-zinc-50',
    accentHex: '#0284C7',
  },
  {
    id: 'obsidian_gold',
    label: 'Obsidian Gold',
    cardBg: 'bg-[#121318]',
    textColor: 'text-white',
    subText: 'text-zinc-400',
    borderClass: 'border-zinc-800',
    buttonBg: 'border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800',
    accentHex: '#D4A017',
  },
  {
    id: 'emerald_pro',
    label: 'Executive Slate',
    cardBg: 'bg-[#0F2420]',
    textColor: 'text-white',
    subText: 'text-emerald-200/80',
    borderClass: 'border-emerald-900/70',
    buttonBg: 'border-emerald-800 bg-emerald-950/60 text-white hover:bg-emerald-900/70',
    accentHex: '#10B981',
  },
];

// Screen 30: Pro Partner Showcase Profile & Privacy Studio
export const PartnerProfileView: React.FC<{
  user: User;
  profile: PartnerProfile;
  documents: PartnerDocument[];
  tripsCount?: number;
  lang?: Language;
  onUpdated: (u: User) => void;
  onProfileUpdated: (p: PartnerProfile) => void;
  onLocalDocumentSaved?: (doc: PartnerDocument) => void;
  onToggleDocVisibility?: (docType: PartnerDocument['doc_type'], isPublic: boolean) => Promise<void> | void;
  onRefresh: () => Promise<void>;
  onLogout: () => void;
}> = ({
  user,
  profile,
  documents,
  tripsCount = 0,
  lang = 'en',
  onUpdated,
  onProfileUpdated,
  onLocalDocumentSaved,
  onToggleDocVisibility,
  onRefresh,
  onLogout,
}) => {
  const defaultHandle = (user.full_name || 'partner')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 20) || 'driver';

  const [fullName, setFullName] = useState(user.full_name || '');
  const [handle, setHandle] = useState(profile.handle || defaultHandle);
  const [bio, setBio] = useState(
    profile.bio ||
      `${profile.vehicle_name || 'Verified Transport Partner'} · ${profile.operating_city || user.city || 'Islamabad'}`
  );
  const [whatsapp, setWhatsapp] = useState(user.whatsapp || '');
  const [city, setCity] = useState(user.city || profile.operating_city || 'Islamabad');
  const [operatingArea, setOperatingArea] = useState(user.operating_area || '');

  const profilePhotoDoc = documents.find((d) => d.doc_type === 'profile_photo');
  const vehiclePhotoDoc = documents.find((d) => d.doc_type === 'vehicle_photo');

  const [coverPhotoUrl, setCoverPhotoUrl] = useState(profile.cover_photo_url || '');
  const [coverIsPublic, setCoverIsPublic] = useState(profile.cover_is_public !== 0);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || profilePhotoDoc?.file_data_url || '');
  const [avatarIsPublic, setAvatarIsPublic] = useState(
    typeof profile.avatar_is_public === 'number' ? profile.avatar_is_public === 1 : true
  );
  const [profilePublished, setProfilePublished] = useState(profile.profile_published === 1);
  const [templateId, setTemplateId] = useState<'clean_light' | 'obsidian_gold' | 'emerald_pro'>(
    profile.profile_template || 'clean_light'
  );
  const [gallery, setGallery] = useState<ShowcaseGalleryItem[]>(
    Array.isArray(profile.showcase_gallery) ? profile.showcase_gallery : []
  );

  const [editingOpen, setEditingOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const selfieInputRef = useRef<HTMLInputElement | null>(null);
  const vehicleInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const activeTemplate = useMemo(
    () => TEMPLATES.find((item) => item.id === templateId) || TEMPLATES[0],
    [templateId]
  );

  const resolvedAvatar = avatarUrl || profilePhotoDoc?.file_data_url || '';
  const resolvedCover = coverPhotoUrl || vehiclePhotoDoc?.file_data_url || '';

  const publicDocsCount = documents.filter((d) => d.is_public === 1).length;
  const publicGalleryCount = gallery.filter((g) => g.is_public === 1).length;
  const totalPublicItems =
    publicDocsCount +
    publicGalleryCount +
    (resolvedCover && coverIsPublic ? 1 : 0) +
    (resolvedAvatar && avatarIsPublic ? 1 : 0);

  const persistShowcase = async (overrides?: {
    fullName?: string;
    handle?: string;
    bio?: string;
    coverPhotoUrl?: string;
    coverIsPublic?: boolean;
    avatarUrl?: string;
    avatarIsPublic?: boolean;
    profilePublished?: boolean;
    profileTemplate?: 'clean_light' | 'obsidian_gold' | 'emerald_pro';
    showcaseGallery?: ShowcaseGalleryItem[];
  }) => {
    const nextFullName = overrides?.fullName ?? fullName;
    const nextHandle = (overrides?.handle ?? handle).replace(/^@+/, '');
    const nextBio = overrides?.bio ?? bio;
    const nextCoverUrl = overrides?.coverPhotoUrl ?? coverPhotoUrl;
    const nextCoverPublic = overrides?.coverIsPublic ?? coverIsPublic;
    const nextAvatarUrl = overrides?.avatarUrl ?? avatarUrl;
    const nextAvatarPublic = overrides?.avatarIsPublic ?? avatarIsPublic;
    const nextPublished = overrides?.profilePublished ?? profilePublished;
    const nextTemplate = overrides?.profileTemplate ?? templateId;
    const nextGallery = overrides?.showcaseGallery ?? gallery;

    const optimisticProfile: PartnerProfile = {
      ...profile,
      handle: nextHandle,
      bio: nextBio,
      cover_photo_url: nextCoverUrl,
      cover_is_public: nextCoverPublic ? 1 : 0,
      avatar_url: nextAvatarUrl,
      avatar_is_public: nextAvatarPublic ? 1 : 0,
      profile_published: nextPublished ? 1 : 0,
      profile_template: nextTemplate,
      showcase_gallery: nextGallery,
    };
    onProfileUpdated(optimisticProfile);

    try {
      const res = await apiRequest<{ user: User; partnerProfile: PartnerProfile }>('/api/partner/showcase', {
        method: 'PUT',
        role: 'partner',
        body: {
          fullName: nextFullName,
          handle: nextHandle,
          bio: nextBio,
          coverPhotoUrl: nextCoverUrl,
          coverIsPublic: nextCoverPublic,
          avatarUrl: nextAvatarUrl,
          avatarIsPublic: nextAvatarPublic,
          profilePublished: nextPublished,
          profileTemplate: nextTemplate,
          showcaseGallery: nextGallery,
        },
      });
      if (res.user) onUpdated(res.user);
      if (res.partnerProfile) onProfileUpdated(res.partnerProfile);
    } catch (err: any) {
      if (!isBackendOfflineError(err)) {
        setMsg(err?.message || 'Could not sync showcase to server.');
      }
    }
  };

  const handleUploadAsset = async (
    slot: 'cover' | 'selfie' | 'vehicle' | 'gallery',
    file: File
  ) => {
    setBusySlot(slot);
    setMsg(null);
    try {
      const { dataUrl, fileName } = await compressAndReadUploadFile(file, 1280, 0.82);

      if (slot === 'cover') {
        setCoverPhotoUrl(dataUrl);
        await persistShowcase({ coverPhotoUrl: dataUrl });
        setMsg(lang === 'ur' ? 'کور فوٹو اپڈیٹ ہو گیا۔' : 'Cover photo updated.');
        return;
      }

      if (slot === 'selfie') {
        setAvatarUrl(dataUrl);
        const docRecord: PartnerDocument = {
          id: profilePhotoDoc?.id || `DOC-${Date.now()}`,
          partner_id: profile.user_id,
          doc_type: 'profile_photo',
          file_name: fileName,
          file_data_url: dataUrl,
          status: 'pending',
          expiry_date: '',
          review_notes: '',
          is_public: avatarIsPublic ? 1 : 0,
          uploaded_at: new Date().toISOString(),
        };
        onLocalDocumentSaved?.(docRecord);
        try {
          const docRes = await apiRequest<{ document?: PartnerDocument }>('/api/partner/documents', {
            method: 'POST',
            role: 'partner',
            body: {
              docType: 'profile_photo',
              fileName,
              fileDataUrl: dataUrl,
              isPublic: avatarIsPublic,
            },
          });
          if (docRes.document) onLocalDocumentSaved?.(docRes.document);
        } catch (apiErr) {
          if (!isBackendOfflineError(apiErr)) throw apiErr;
        }
        await persistShowcase({ avatarUrl: dataUrl });
        setMsg(lang === 'ur' ? 'پروفائل فوٹو اپڈیٹ ہو گیا۔' : 'Profile selfie updated.');
        return;
      }

      const category: ShowcaseGalleryItem['category'] = slot === 'vehicle' ? 'vehicle' : 'gallery';
      const newItem: ShowcaseGalleryItem = {
        id: `GAL-${Date.now()}`,
        url: dataUrl,
        caption:
          slot === 'vehicle'
            ? profile.vehicle_name || 'Verified Partner Vehicle'
            : `Pro Partner Showcase · ${user.city || 'Pakistan'}`,
        category,
        is_public: 1,
        created_at: new Date().toISOString(),
      };
      const updatedGallery = [newItem, ...gallery].slice(0, 12);
      setGallery(updatedGallery);

      if (slot === 'vehicle') {
        const vehicleDoc: PartnerDocument = {
          id: vehiclePhotoDoc?.id || `DOC-${Date.now()}`,
          partner_id: profile.user_id,
          doc_type: 'vehicle_photo',
          file_name: fileName,
          file_data_url: dataUrl,
          status: 'pending',
          expiry_date: '',
          review_notes: '',
          is_public: 1,
          uploaded_at: new Date().toISOString(),
        };
        onLocalDocumentSaved?.(vehicleDoc);
        apiRequest('/api/partner/documents', {
          method: 'POST',
          role: 'partner',
          body: { docType: 'vehicle_photo', fileName, fileDataUrl: dataUrl, isPublic: true },
        }).catch(() => {});
      }

      await persistShowcase({ showcaseGallery: updatedGallery });
      await onRefresh();
      setMsg(
        slot === 'vehicle'
          ? lang === 'ur'
            ? 'گاڑی کی تصویر پروفائل میں شامل ہو گئی۔'
            : 'Vehicle showcase photo added.'
          : lang === 'ur'
          ? 'نئی ڈسپلے تصویر شامل ہو گئی۔'
          : 'Display photo added to your showcase.'
      );
    } catch (err: any) {
      setMsg(err?.message || 'Photo upload failed.');
    } finally {
      setBusySlot(null);
    }
  };

  const handleSaveProfileDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      try {
        const res = await apiRequest<{ user: User }>('/api/auth/profile', {
          method: 'PATCH',
          role: 'partner',
          body: { fullName, whatsapp, city, operatingArea },
        });
        if (res.user) onUpdated(res.user);
      } catch (err) {
        if (!isBackendOfflineError(err)) throw err;
        onUpdated({ ...user, full_name: fullName, whatsapp, city, operating_area: operatingArea });
      }
      await persistShowcase({ fullName, handle, bio });
      setEditingOpen(false);
      setMsg(lang === 'ur' ? 'پروفائل اور ڈسپلے کی معلومات محفوظ ہو گئیں۔' : 'Profile & showcase settings saved.');
    } catch (err: any) {
      setMsg(err?.message || 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  };

  const toggleGalleryVisibility = async (itemId: string) => {
    const nextGallery = gallery.map((item) =>
      item.id === itemId ? { ...item, is_public: item.is_public === 1 ? 0 : 1 } : item
    );
    setGallery(nextGallery);
    await persistShowcase({ showcaseGallery: nextGallery });
  };

  const removeGalleryItem = async (itemId: string) => {
    const nextGallery = gallery.filter((item) => item.id !== itemId);
    setGallery(nextGallery);
    await persistShowcase({ showcaseGallery: nextGallery });
  };

  const handleTogglePublish = async () => {
    const next = !profilePublished;
    setProfilePublished(next);
    await persistShowcase({ profilePublished: next });
    setMsg(
      next
        ? lang === 'ur'
          ? 'آپ کی پروفائل اب پبلش ہو چکی ہے۔ مسافر صرف آپ کی پبلک تصاویر دیکھ سکیں گے۔'
          : 'Profile published! Passengers can now view only your photos marked Public.'
        : lang === 'ur'
        ? 'پروفائل پرائیویٹ کر دی گئی ہے — اب صرف ایڈمن اور آپ خود دیکھ سکتے ہیں۔'
        : 'Profile switched to Private — only you and Super Admin can view your profile.'
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5 w-full min-w-0 overflow-x-clip pb-8">
      {/* Hidden File Pickers */}
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void handleUploadAsset('cover', f);
        }}
      />
      <input
        ref={selfieInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void handleUploadAsset('selfie', f);
        }}
      />
      <input
        ref={vehicleInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void handleUploadAsset('vehicle', f);
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void handleUploadAsset('gallery', f);
        }}
      />

      {/* Top Publish Visibility Mode Bar */}
      <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          {profilePublished ? (
            <Globe className="w-4 h-4 text-emerald-700 shrink-0" />
          ) : (
            <Lock className="w-4 h-4 text-[#B8860B] shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#0D0D10]">
              {profilePublished
                ? lang === 'ur'
                  ? 'پروفائل پبلش ہے (مسافر پبلک تصاویر دیکھ سکتے ہیں)'
                  : 'Published to Passengers (Only Public Photos Shown)'
                : lang === 'ur'
                ? 'پرائیویٹ موڈ (صرف آپ اور ایڈمن دیکھ سکتے ہیں)'
                : 'Private Mode · Admin & Self Only'}
            </p>
            <p className="text-[11px] text-zinc-500">
              {lang === 'ur'
                ? 'نیچے ہر تصویر پر اپنا پرائیویسی بٹن موجود ہے'
                : 'Control visibility per photo below; CNIC & licence default to Admin-Only.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 text-xs font-semibold text-[#0D0D10] hover:bg-zinc-50"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{lang === 'ur' ? 'پبلک پریویو' : 'Preview'}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleTogglePublish()}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
              profilePublished
                ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                : 'bg-[#0D0D10] text-[#F4C430] hover:bg-zinc-800'
            }`}
          >
            {profilePublished ? <Globe className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            <span>
              {profilePublished
                ? lang === 'ur'
                  ? 'پبلش آن'
                  : 'Published'
                : lang === 'ur'
                ? 'پبلش کریں'
                : 'Publish'}
            </span>
          </button>
        </div>
      </div>

      {msg && (
        <div className="rounded-xl bg-[#0D0D10] text-[#F4C430] px-4 py-2.5 text-xs font-semibold flex items-center justify-between gap-2">
          <span>{msg}</span>
          <button type="button" onClick={() => setMsg(null)} className="text-zinc-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Social-Style Showcase Card (Matching User Reference Screenshot) */}
      <div className={`rounded-3xl border ${activeTemplate.borderClass} ${activeTemplate.cardBg} shadow-sm overflow-hidden`}>
        {/* Cover Banner */}
        <div className="relative h-44 sm:h-48 w-full bg-gradient-to-br from-[#0D0D10] via-[#1C1E26] to-[#2B2210] overflow-hidden">
          {resolvedCover ? (
            <img
              src={resolvedCover}
              alt="Partner Cover"
              className={`w-full h-full object-cover transition-opacity ${!coverIsPublic ? 'opacity-70' : ''}`}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-start justify-center px-6 bg-[radial-gradient(circle_at_top_right,_rgba(212,160,23,0.32),_transparent_55%)]">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#D4A017]">PRO RIDER AI PARTNER</p>
              <p className="font-display text-xl sm:text-2xl font-bold text-white mt-1 leading-tight">
                {profile.vehicle_name || 'Verified Chauffeur & Fleet Showcase'}
              </p>
              <p className="text-xs text-zinc-300 mt-1">
                {profile.operating_city || city} · {profile.vehicle_number || 'Add Cover Photo'}
              </p>
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/25" />

          {/* Top-Left Per-Photo Privacy Lock Toggle on Cover Photo */}
          <button
            type="button"
            onClick={async () => {
              const next = !coverIsPublic;
              setCoverIsPublic(next);
              await persistShowcase({ coverIsPublic: next });
            }}
            className={`absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold backdrop-blur shadow-sm ${
              coverIsPublic ? 'bg-emerald-700/90 text-white' : 'bg-[#0D0D10]/90 text-[#F4C430]'
            }`}
          >
            {coverIsPublic ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>{coverIsPublic ? (lang === 'ur' ? 'کور پبلک' : 'Cover Public') : lang === 'ur' ? 'کور بند' : 'Cover Locked'}</span>
          </button>

          {/* Top-Right "+ Cover" Upload Button */}
          <button
            type="button"
            disabled={busySlot === 'cover'}
            onClick={() => coverInputRef.current?.click()}
            className="absolute top-3 right-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/95 hover:bg-white text-[#0D0D10] text-xs font-bold shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{busySlot === 'cover' ? '...' : lang === 'ur' ? 'کور فوٹو' : 'Cover'}</span>
          </button>
        </div>

        {/* Profile Info & Floating "+" Bar */}
        <div className="px-5 sm:px-6 pb-6">
          <div className="flex items-end justify-between -mt-12 sm:-mt-14 relative z-10">
            {/* Circular Overlapping Selfie / Avatar + Lock Toggle */}
            <div className="relative group">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-white bg-[#0D0D10] shadow-md overflow-hidden flex items-center justify-center">
                {resolvedAvatar ? (
                  <img
                    src={resolvedAvatar}
                    alt={fullName}
                    className={`w-full h-full object-cover ${!avatarIsPublic ? 'opacity-75' : ''}`}
                  />
                ) : (
                  <span className="font-display text-2xl font-bold text-[#D4A017]">
                    {(fullName || 'PR').slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => selfieInputRef.current?.click()}
                title={lang === 'ur' ? 'پروفائل فوٹو اپ لوڈ' : 'Upload Selfie'}
                aria-label="Upload Profile Photo"
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#0D0D10] text-[#D4A017] border-2 border-white flex items-center justify-center shadow hover:bg-zinc-800"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={async () => {
                  const next = !avatarIsPublic;
                  setAvatarIsPublic(next);
                  if (profilePhotoDoc) {
                    await onToggleDocVisibility?.('profile_photo', next);
                  }
                  await persistShowcase({ avatarIsPublic: next });
                }}
                title={avatarIsPublic ? 'Selfie is Public — Click to Hide' : 'Selfie Hidden — Click to Make Public'}
                className={`absolute -top-1 -left-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border border-white shadow ${
                  avatarIsPublic ? 'bg-emerald-700 text-white' : 'bg-[#0D0D10] text-[#F4C430]'
                }`}
              >
                {avatarIsPublic ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              </button>
            </div>

            {/* Right-aligned Circular "+" Quick Add Button */}
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              title={lang === 'ur' ? 'نئی تصویر شامل کریں' : 'Add Display Photo'}
              aria-label="Add Display Photo"
              style={{ backgroundColor: activeTemplate.accentHex }}
              className="w-11 h-11 rounded-full text-white flex items-center justify-center shadow-md hover:opacity-90 transition-opacity mb-1"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {/* Identity Block */}
          <div className="mt-3 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className={`font-display text-2xl font-bold ${activeTemplate.textColor}`}>
                {fullName || user.full_name}
              </h2>
              {profile.verification_status === 'approved' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                  <ShieldCheck className="w-3 h-3" /> Verified Pro
                </span>
              )}
            </div>
            <p className={`text-sm font-mono ${activeTemplate.subText}`}>@{handle || defaultHandle}</p>
            {bio && <p className={`text-xs leading-relaxed pt-1 ${activeTemplate.subText}`}>{bio}</p>}
          </div>

          {/* Action Buttons Row matching Screenshot Layout */}
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setEditingOpen((v) => !v)}
              className={`min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border text-xs font-semibold transition-colors ${activeTemplate.buttonBg}`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{lang === 'ur' ? 'پروفائل ایڈٹ' : 'Edit profile'}</span>
            </button>

            <button
              type="button"
              onClick={() => setTemplatePickerOpen((v) => !v)}
              className={`min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border text-xs font-semibold transition-colors ${activeTemplate.buttonBg}`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>{lang === 'ur' ? 'ٹیمپلیٹ' : 'Template'}</span>
            </button>

            <button
              type="button"
              onClick={onLogout}
              className={`min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border text-xs font-semibold transition-colors ${activeTemplate.buttonBg}`}
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{lang === 'ur' ? 'لاگ آؤٹ' : 'Sign out'}</span>
            </button>
          </div>

          {/* Inline Template Picker */}
          {templatePickerOpen && (
            <div className="mt-3 p-3 rounded-2xl border border-zinc-200 bg-zinc-50 text-[#0D0D10] grid grid-cols-3 gap-2">
              {TEMPLATES.map((tpl) => {
                const selected = tpl.id === templateId;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={async () => {
                      setTemplateId(tpl.id);
                      setTemplatePickerOpen(false);
                      await persistShowcase({ profileTemplate: tpl.id });
                    }}
                    className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 ${
                      selected
                        ? 'border-[#D4A017] bg-[#0D0D10] text-[#F4C430]'
                        : 'border-zinc-200 bg-white text-[#0D0D10] hover:bg-zinc-100'
                    }`}
                  >
                    {selected && <Check className="w-3.5 h-3.5" />}
                    <span>{tpl.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Genuine Driver Metrics Grid (Divided cleanly like Screenshot) */}
          <div className={`mt-5 pt-5 border-t ${activeTemplate.borderClass} grid grid-cols-4 gap-2 text-center`}>
            <div>
              <div className={`font-mono text-lg font-bold ${activeTemplate.textColor}`}>{tripsCount}</div>
              <div className={`text-[11px] ${activeTemplate.subText}`}>{lang === 'ur' ? 'ٹرپس' : 'Trips'}</div>
            </div>
            <div>
              <div className={`font-mono text-lg font-bold ${activeTemplate.textColor}`}>
                {profile.seating_capacity || 4}
              </div>
              <div className={`text-[11px] ${activeTemplate.subText}`}>{lang === 'ur' ? 'سیٹیں' : 'Seats'}</div>
            </div>
            <div>
              <div className={`font-mono text-lg font-bold ${activeTemplate.textColor}`}>{documents.length}</div>
              <div className={`text-[11px] ${activeTemplate.subText}`}>{lang === 'ur' ? 'دستاویزات' : 'Docs'}</div>
            </div>
            <div>
              <div className={`font-mono text-lg font-bold ${activeTemplate.textColor}`}>{totalPublicItems}</div>
              <div className={`text-[11px] ${activeTemplate.subText}`}>{lang === 'ur' ? 'پبلک فوٹوز' : 'Public'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Profile Form Drawer */}
      {editingOpen && (
        <form onSubmit={handleSaveProfileDetails} className="rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-base text-[#0D0D10]">
              {lang === 'ur' ? 'ذاتی اور ڈسپلے معلومات ایڈٹ کریں' : 'Edit Profile & Showcase Info'}
            </h3>
            <button type="button" onClick={() => setEditingOpen(false)} className="text-zinc-500 hover:text-black">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">Full Name</label>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">Handle (@username)</label>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9._-]/g, ''))}
                placeholder="asif.pro"
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Profile Bio / Tagline</label>
            <textarea
              rows={2}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="e.g. Punctual Pick & Drop · AC Chauffeur · Islamabad & Rawalpindi"
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">WhatsApp</label>
              <input
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">City</label>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white"
              >
                <option value="Islamabad">Islamabad</option>
                <option value="Rawalpindi">Rawalpindi</option>
                <option value="Lahore">Lahore</option>
                <option value="Karachi">Karachi</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">Operating Area</label>
              <input
                value={operatingArea}
                onChange={(e) => setOperatingArea(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditingOpen(false)}
              className="px-4 py-2 rounded-xl border border-zinc-200 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-[#0D0D10] text-white text-xs font-bold hover:bg-zinc-800"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}

      {/* "Add more" 4-Tile Upload Grid (Matching Screenshot Bottom Action Tiles) */}
      <div className="space-y-2.5">
        <h3 className="font-display text-lg font-bold text-[#0D0D10]">
          {lang === 'ur' ? 'مزید شامل کریں' : 'Add more'}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              key: 'selfie',
              label: lang === 'ur' ? 'سیلفی شامل' : 'Add Selfie',
              icon: Camera,
              onClick: () => selfieInputRef.current?.click(),
            },
            {
              key: 'cover',
              label: lang === 'ur' ? 'کور شامل' : 'Add Cover',
              icon: Sparkles,
              onClick: () => coverInputRef.current?.click(),
            },
            {
              key: 'vehicle',
              label: lang === 'ur' ? 'گاڑی کی تصویر' : 'Add Vehicle',
              icon: ImagePlus,
              onClick: () => vehicleInputRef.current?.click(),
            },
            {
              key: 'gallery',
              label: lang === 'ur' ? 'ڈسپلے فوٹو' : 'Add Photos',
              icon: ImagePlus,
              onClick: () => galleryInputRef.current?.click(),
            },
          ].map((tile) => {
            const Icon = tile.icon;
            const isBusy = busySlot === tile.key;
            return (
              <button
                key={tile.key}
                type="button"
                disabled={Boolean(busySlot)}
                onClick={tile.onClick}
                className="rounded-2xl border border-zinc-200 bg-white hover:border-[#D4A017] hover:bg-[#FFFDF5] p-4 min-h-[88px] flex flex-col items-center justify-center gap-2 text-center transition-colors shadow-2xs"
              >
                <Icon className={`w-5 h-5 ${isBusy ? 'animate-pulse text-[#D4A017]' : 'text-[#0284C7]'}`} />
                <span className="text-xs font-semibold text-[#0D0D10]">
                  {isBusy ? 'Uploading...' : tile.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Showcase Display & Document Photos Privacy Grid (On-image Lock Toggle on EVERY Photo) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-lg font-bold text-[#0D0D10]">
              {lang === 'ur' ? 'ڈسپلے اور دستاویزات پرائیویسی کنٹرول' : 'Display & Document Visibility Controls'}
            </h3>
            <p className="text-xs text-zinc-500">
              {lang === 'ur'
                ? 'ہر فوٹو کے اوپر موجود بٹن سے طے کریں کہ مسافر کیا دیکھ سکیں اور کیا صرف ایڈمن کے لیے بند رہے۔'
                : 'Toggle visibility directly on any image. Locked photos stay visible only to you and Super Admin.'}
            </p>
          </div>
        </div>

        {/* Showcase Display Gallery */}
        {gallery.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {gallery.map((item) => {
              const isPublic = item.is_public === 1;
              return (
                <div key={item.id} className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
                  <div className="relative h-44 bg-zinc-100">
                    <img
                      src={item.url}
                      alt={item.caption || 'Driver Showcase'}
                      className={`w-full h-full object-cover transition-opacity ${!isPublic ? 'opacity-70' : ''}`}
                    />
                    <button
                      type="button"
                      onClick={() => void toggleGalleryVisibility(item.id)}
                      className={`absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold shadow backdrop-blur ${
                        isPublic ? 'bg-emerald-700/95 text-white' : 'bg-[#0D0D10]/90 text-[#F4C430]'
                      }`}
                    >
                      {isPublic ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      <span>{isPublic ? (lang === 'ur' ? 'پبلک آن' : 'Public') : lang === 'ur' ? 'بند · ایڈمن' : 'Locked · Admin Only'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeGalleryItem(item.id)}
                      title="Delete Photo"
                      className="absolute top-2.5 left-2.5 p-1.5 rounded-xl bg-black/70 text-white hover:bg-red-700"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[#0D0D10] truncate">{item.caption}</span>
                    <span className="uppercase text-[10px] font-mono text-zinc-500 shrink-0">{item.category || 'gallery'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Uploaded Verification Documents with On-Image Visibility Toggle */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-display font-bold text-sm text-[#0D0D10]">
              {lang === 'ur' ? 'تصدیقی تصاویر (شناختی کارڈ، لائسنس، گاڑی)' : 'Verification & ID Documents'}
            </h4>
            <span className="text-[11px] text-zinc-500">
              {documents.length} / 6 Uploaded
            </span>
          </div>

          {documents.length === 0 ? (
            <p className="text-xs text-zinc-500 py-3">
              {lang === 'ur'
                ? 'ابھی تک کوئی دستاویز اپ لوڈ نہیں ہوئی۔ اوپر Add Selfie / Add Vehicle استعمال کریں یا Docs ٹیب سے CNIC و لائسنس اپ لوڈ کریں۔'
                : 'No documents uploaded yet. Upload via "Add more" above or open the Docs tab for CNIC & Licence.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {documents.map((doc) => {
                const labelObj = DOC_FRIENDLY_LABELS[doc.doc_type] || { en: doc.doc_type, ur: doc.doc_type };
                const isPublic = doc.is_public === 1;
                return (
                  <div key={doc.id} className="rounded-xl border border-zinc-200 overflow-hidden bg-zinc-50">
                    <div className="relative h-32 bg-zinc-200">
                      <img
                        src={doc.file_data_url}
                        alt={labelObj.en}
                        className={`w-full h-full object-cover transition-opacity ${!isPublic ? 'opacity-75' : ''}`}
                      />
                      <button
                        type="button"
                        onClick={() => void onToggleDocVisibility?.(doc.doc_type, !isPublic)}
                        className={`absolute top-2 right-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold shadow ${
                          isPublic ? 'bg-emerald-700/95 text-white' : 'bg-[#0D0D10]/90 text-[#F4C430]'
                        }`}
                      >
                        {isPublic ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        <span>{isPublic ? (lang === 'ur' ? 'پبلک آن' : 'Public') : lang === 'ur' ? 'بند · ایڈمن' : 'Locked · Admin Only'}</span>
                      </button>
                    </div>
                    <div className="px-3 py-2 flex items-center justify-between text-xs bg-white">
                      <span className="font-semibold text-[#0D0D10]">
                        {lang === 'ur' ? labelObj.ur : labelObj.en}
                      </span>
                      <span
                        className={`uppercase font-mono text-[10px] font-bold ${
                          doc.status === 'approved'
                            ? 'text-emerald-700'
                            : doc.status === 'rejected'
                            ? 'text-red-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {doc.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Passenger Public Preview Modal */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full max-h-[88vh] overflow-y-auto shadow-2xl border border-zinc-200">
            <div className="px-5 py-3.5 border-b border-zinc-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <span className="font-display font-bold text-sm text-[#0D0D10]">
                {lang === 'ur' ? 'مسافر کو نظر آنے والی پروفائل' : 'Passenger Public View Preview'}
              </span>
              <button type="button" onClick={() => setPreviewOpen(false)} className="p-1.5 rounded-lg hover:bg-zinc-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            {!profilePublished ? (
              <div className="p-8 text-center space-y-3">
                <Lock className="w-10 h-10 text-[#D4A017] mx-auto" />
                <h4 className="font-display font-bold text-lg text-[#0D0D10]">
                  {lang === 'ur' ? 'پروفائل پرائیویٹ ہے' : 'Profile Is Currently Private'}
                </h4>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  {lang === 'ur'
                    ? 'آپ نے ابھی پروفائل پبلش نہیں کی۔ صرف آپ اور ایڈمن آپ کی تصاویر دیکھ سکتے ہیں — مسافر کچھ نہیں دیکھ سکیں گے۔'
                    : 'Only you and Super Admin can see your photos right now. Tap "Publish" to display your selected public photos to Passengers.'}
                </p>
              </div>
            ) : (
              <div className="pb-6">
                <div className="relative h-36 bg-[#0D0D10]">
                  {resolvedCover && coverIsPublic ? (
                    <img src={resolvedCover} alt="Public Cover" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-zinc-400">
                      {lang === 'ur' ? 'کور فوٹو پرائیویٹ ہے' : 'Cover Photo Hidden by Driver'}
                    </div>
                  )}
                </div>
                <div className="px-5 -mt-10">
                  <div className="w-20 h-20 rounded-full border-4 border-white bg-[#0D0D10] overflow-hidden flex items-center justify-center shadow">
                    {resolvedAvatar && avatarIsPublic ? (
                      <img src={resolvedAvatar} alt={fullName} className="w-full h-full object-cover" />
                    ) : (
                      <UserCheck className="w-7 h-7 text-[#D4A017]" />
                    )}
                  </div>
                  <h4 className="font-display font-bold text-lg mt-2 text-[#0D0D10]">{fullName}</h4>
                  <p className="text-xs font-mono text-zinc-500">@{handle || defaultHandle}</p>
                  {bio && <p className="text-xs text-zinc-600 mt-1">{bio}</p>}

                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-bold text-[#0D0D10]">
                      {lang === 'ur' ? 'پبلک ڈسپلے تصاویر' : 'Visible Public Photos'}
                    </p>
                    {gallery.filter((g) => g.is_public === 1).length === 0 &&
                    documents.filter((d) => d.is_public === 1).length === 0 ? (
                      <p className="text-xs text-zinc-500">
                        No public photos enabled yet. Sensitive ID docs stay hidden unless unlocked.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {gallery
                          .filter((g) => g.is_public === 1)
                          .map((g) => (
                            <img
                              key={g.id}
                              src={g.url}
                              alt={g.caption}
                              className="w-full h-24 object-cover rounded-xl border border-zinc-200"
                            />
                          ))}
                        {documents
                          .filter((d) => d.is_public === 1 && d.doc_type !== 'profile_photo')
                          .map((d) => (
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
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

