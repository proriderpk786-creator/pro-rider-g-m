import React, { useState } from 'react';
import {
  ArrowLeft,
  CarFront,
  CheckCircle2,
  FileCheck2,
  Lock,
  Phone,
  ShieldAlert,
  Upload,
  User as UserIcon,
} from 'lucide-react';
import { BrandLogo, LanguageToggle } from '../../components/BrandMark';
import { useFirebase } from '../../contexts/FirebaseContext';
import { apiRequest, setRoleToken } from '../../utils/api';
import type {
  Language,
  PartnerDocument,
  PartnerProfile,
  PublicConfig,
  ServiceType,
  User,
} from '../../types';

// Screen 17: Pro Partner Login / Registration
export const PartnerAuth: React.FC<{
  lang: Language;
  onChangeLang: (l: Language) => void;
  onAuthenticated: (token: string, user: User, profile: PartnerProfile) => void;
  onBackWelcome: () => void;
}> = ({ lang, onChangeLang, onAuthenticated, onBackWelcome }) => {
  const { signInWithGooglePopup } = useFirebase();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('Islamabad');
  const [operatingArea, setOperatingArea] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const { idToken } = await signInWithGooglePopup('partner', city, lang);
      const res = await apiRequest<{ token: string; user: User; partnerProfile: PartnerProfile }>(
        '/api/auth/google/firebase',
        { method: 'POST', body: { idToken, role: 'partner', city } }
      );
      setRoleToken('partner', res.token);
      onAuthenticated(res.token, res.user, res.partnerProfile);
    } catch (err: any) {
      setError(err?.message || 'Google sign-in failed or was cancelled.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await apiRequest<{ token: string; user: User; partnerProfile: PartnerProfile }>(
          '/api/auth/partner/login',
          { method: 'POST', body: { identifier: phone, password } }
        );
        setRoleToken('partner', res.token);
        onAuthenticated(res.token, res.user, res.partnerProfile);
      } else if (mode === 'register') {
        const res = await apiRequest<{ token: string; user: User; partnerProfile: PartnerProfile }>(
          '/api/auth/partner/register',
          { method: 'POST', body: { fullName, phone, whatsapp, email, city, operatingArea, password } }
        );
        setRoleToken('partner', res.token);
        onAuthenticated(res.token, res.user, res.partnerProfile);
      } else {
        const res = await apiRequest<{ message: string }>('/api/auth/forgot-password', {
          method: 'POST',
          body: { phone, role: 'partner' },
        });
        setInfo(res.message);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir={lang === 'ur' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#0D0D10] text-white flex flex-col">
      <header className="border-b border-zinc-800 bg-[#0D0D10] px-4 sm:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBackWelcome} className="p-2 rounded-lg hover:bg-zinc-900 text-zinc-400">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <BrandLogo dark compact />
        </div>
        <LanguageToggle lang={lang} onChange={onChangeLang} dark />
      </header>

      <main className="flex-1 flex items-center justify-center p-4 py-10">
        <div className="w-full max-w-md rounded-3xl bg-[#16171C] border border-zinc-800 p-6 sm:p-8 space-y-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#D4A017]">Pro Partner Portal</p>
            <h1 className="font-display text-2xl font-bold mt-1">
              {mode === 'login' ? 'Pro Partner Sign In' : mode === 'register' ? 'Become a Pro Partner' : 'Reset Password'}
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Receive verified Passenger ride requests, manage trips, and track PKR earnings.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-zinc-900 text-xs font-semibold">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(null); }}
              className={`py-2 rounded-lg ${mode === 'login' ? 'bg-[#D4A017] text-[#0D0D10] font-bold' : 'text-zinc-400'}`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(null); }}
              className={`py-2 rounded-lg ${mode === 'register' ? 'bg-[#D4A017] text-[#0D0D10] font-bold' : 'text-zinc-400'}`}
            >
              Register
            </button>
          </div>

          {error && <div className="rounded-xl bg-red-950/60 border border-red-800 px-3.5 py-2.5 text-xs text-red-200">{error}</div>}
          {info && <div className="rounded-xl bg-amber-950/60 border border-amber-800 px-3.5 py-2.5 text-xs text-amber-200">{info}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Full Name (as per CNIC)</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                  <input
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Asif Ali"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                {mode === 'login' ? 'Mobile Number or Email' : 'Mobile Number'}
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                <input
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="03XXXXXXXXX"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white"
                />
              </div>
            </div>

            {mode === 'register' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">WhatsApp</label>
                    <input
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      placeholder="03XXXXXXXXX"
                      className="w-full px-3 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">City</label>
                    <select
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white"
                    >
                      <option value="Islamabad">Islamabad</option>
                      <option value="Rawalpindi">Rawalpindi</option>
                      <option value="Lahore">Lahore</option>
                      <option value="Karachi">Karachi</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">Operating Area</label>
                    <input
                      value={operatingArea}
                      onChange={(e) => setOperatingArea(e.target.value)}
                      placeholder="e.g. F-10 / Blue Area"
                      className="w-full px-3 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">Email (Optional)</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="driver@email.com"
                      className="w-full px-3 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white"
                    />
                  </div>
                </div>
              </>
            )}

            {mode !== 'forgot' && (
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                  <input
                    required
                    type="password"
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-[#D4A017] text-[#0D0D10] text-sm font-bold hover:bg-[#EAB308]"
            >
              {loading ? 'Processing...' : mode === 'login' ? 'Sign In as Pro Partner' : mode === 'register' ? 'Register as Pro Partner' : 'Request Reset'}
            </button>
          </form>

          {mode !== 'forgot' && (
            <div className="space-y-2.5">
              <div className="relative flex items-center justify-center text-[11px] text-zinc-500">
                <span className="h-px bg-zinc-800 flex-1" />
                <span className="px-2">or continue with Google</span>
                <span className="h-px bg-zinc-800 flex-1" />
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={handleGoogleSignIn}
                className="w-full py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.9 1.5l2.7-2.6C16.9 3.3 14.7 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
                </svg>
                Continue as Pro Partner with Google
              </button>
            </div>
          )}

          <div className="flex justify-between text-xs text-zinc-400 pt-2 border-t border-zinc-800">
            <button type="button" onClick={() => setMode(mode === 'forgot' ? 'login' : 'forgot')} className="hover:text-white">
              {mode === 'forgot' ? 'Back to Login' : 'Forgot Password?'}
            </button>
            <span>Driver-Only Session</span>
          </div>
        </div>
      </main>
    </div>
  );
};

const DOC_SLOTS: Array<{ type: PartnerDocument['doc_type']; label: string; hasExpiry?: boolean }> = [
  { type: 'profile_photo', label: 'Partner Profile Photo' },
  { type: 'cnic_front', label: 'CNIC Front Copy', hasExpiry: true },
  { type: 'cnic_back', label: 'CNIC Back Copy' },
  { type: 'driving_licence', label: 'Valid Driving Licence', hasExpiry: true },
  { type: 'vehicle_registration', label: 'Vehicle Registration Book / Smart Card' },
  { type: 'vehicle_photo', label: 'Vehicle Exterior Photo (with Number Plate)' },
];

// Screens 18, 19, 26, 27: Partner Registration, Vehicle Management & Document Verification
export const PartnerVerificationAndVehicleView: React.FC<{
  mode: 'documents' | 'vehicle';
  profile: PartnerProfile;
  documents: PartnerDocument[];
  config: PublicConfig | null;
  onRefresh: () => Promise<void>;
}> = ({ mode, profile, documents, config, onRefresh }) => {
  const [cnicNumber, setCnicNumber] = useState(profile.cnic_number || '');
  const [cnicExpiry, setCnicExpiry] = useState(profile.cnic_expiry || '');
  const [licenceNumber, setLicenceNumber] = useState(profile.licence_number || '');
  const [licenceExpiry, setLicenceExpiry] = useState(profile.licence_expiry || '');
  const [vehicleCategoryId, setVehicleCategoryId] = useState(profile.vehicle_category_id || config?.fleet?.[0]?.id || 'fleet-sedan');
  const [vehicleName, setVehicleName] = useState(profile.vehicle_name || '');
  const [vehicleNumber, setVehicleNumber] = useState(profile.vehicle_number || '');
  const [seatingCapacity, setSeatingCapacity] = useState(profile.seating_capacity || 4);
  const [fuelType, setFuelType] = useState(profile.fuel_type || 'Petrol');
  const [operatingCity, setOperatingCity] = useState(profile.operating_city || 'Islamabad');
  const [services, setServices] = useState<ServiceType[]>(
    profile.service_eligibility?.length ? profile.service_eligibility : ['pick_and_drop']
  );

  const [expiryDrafts, setExpiryDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const statusLabels: Record<string, { label: string; color: string }> = {
    not_registered: { label: 'Not Registered', color: 'text-zinc-600' },
    incomplete: { label: 'Registration Incomplete', color: 'text-amber-700' },
    documents_pending: { label: 'Documents Pending', color: 'text-amber-700' },
    under_review: { label: 'Under Admin Review', color: 'text-blue-700' },
    approved: { label: 'Approved', color: 'text-emerald-700' },
    rejected: { label: 'Rejected', color: 'text-red-700' },
    suspended: { label: 'Suspended', color: 'text-red-700' },
  };
  const st = statusLabels[profile.verification_status] || statusLabels.incomplete;

  const saveVehicleAndDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await apiRequest<{ message?: string }>('/api/partner/registration', {
        method: 'PUT',
        role: 'partner',
        body: {
          cnicNumber,
          cnicExpiry,
          licenceNumber,
          licenceExpiry,
          vehicleCategoryId,
          vehicleName,
          vehicleNumber,
          seatingCapacity,
          fuelType,
          operatingCity,
          serviceEligibility: services,
        },
      });
      setMsg(res.message || 'Registration & vehicle details saved.');
      await onRefresh();
    } catch (err: any) {
      setMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = (docType: PartnerDocument['doc_type'], file: File) => {
    if (file.size > 2_000_000) {
      setMsg('Please choose an image smaller than 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await apiRequest('/api/partner/documents', {
          method: 'POST',
          role: 'partner',
          body: {
            docType,
            fileName: file.name,
            fileDataUrl: reader.result,
            expiryDate: expiryDrafts[docType] || '',
          },
        });
        setMsg(`${docType.replaceAll('_', ' ')} uploaded for Admin review.`);
        await onRefresh();
      } catch (err: any) {
        setMsg(err.message);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      {/* Verification Status Banner */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Verification Status</p>
          <div className="flex items-center gap-2">
            {profile.verification_status === 'approved' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-700" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-amber-600" />
            )}
            <span className={`font-display text-xl font-bold ${st.color}`}>{st.label}</span>
          </div>
          {profile.admin_notes && (
            <p className="text-xs text-zinc-600">Admin Note: {profile.admin_notes}</p>
          )}
        </div>
        <div className="text-xs text-zinc-500 font-mono">
          Uploaded Docs: {documents.length} / {DOC_SLOTS.length}
        </div>
      </div>

      {msg && (
        <div className="rounded-xl bg-[#0D0D10] text-[#F4C430] px-4 py-2.5 text-xs font-semibold">{msg}</div>
      )}

      {/* Vehicle & Identity Details Form */}
      <form onSubmit={saveVehicleAndDetails} className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 space-y-5">
        <h3 className="font-display text-lg font-bold flex items-center gap-2">
          <CarFront className="w-5 h-5 text-[#D4A017]" />
          {mode === 'vehicle' ? 'Vehicle Management & Service Eligibility' : 'Personal Identity & Vehicle Registration'}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">CNIC Number</label>
            <input
              required
              value={cnicNumber}
              onChange={(e) => setCnicNumber(e.target.value)}
              placeholder="61101-XXXXXXX-X"
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">CNIC Expiry</label>
            <input type="date" value={cnicExpiry} onChange={(e) => setCnicExpiry(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Driving Licence No.</label>
            <input
              required
              value={licenceNumber}
              onChange={(e) => setLicenceNumber(e.target.value)}
              placeholder="ISB-XXXXXX"
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Licence Expiry</label>
            <input type="date" value={licenceExpiry} onChange={(e) => setLicenceExpiry(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Vehicle Category</label>
            <select
              value={vehicleCategoryId}
              onChange={(e) => setVehicleCategoryId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white"
            >
              {(config?.fleet || []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Vehicle Make &amp; Model</label>
            <input
              required
              value={vehicleName}
              onChange={(e) => setVehicleName(e.target.value)}
              placeholder="e.g. Toyota Corolla GLi 2022"
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Registration Plate Number</label>
            <input
              required
              value={vehicleNumber}
              onChange={(e) => setVehicleNumber(e.target.value)}
              placeholder="e.g. LEA-4512"
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm font-mono uppercase"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Seating Capacity</label>
            <input
              type="number"
              min={1}
              max={20}
              value={seatingCapacity}
              onChange={(e) => setSeatingCapacity(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Fuel Type</label>
            <select value={fuelType} onChange={(e) => setFuelType(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white">
              <option value="Petrol">Petrol</option>
              <option value="Hybrid">Hybrid</option>
              <option value="CNG">CNG</option>
              <option value="Diesel">Diesel</option>
              <option value="Electric">Electric</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Operating City</label>
            <select value={operatingCity} onChange={(e) => setOperatingCity(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white">
              <option value="Islamabad">Islamabad</option>
              <option value="Rawalpindi">Rawalpindi</option>
              <option value="Lahore">Lahore</option>
              <option value="Karachi">Karachi</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold text-zinc-600">Service Eligibility Preferences</label>
          <div className="flex flex-wrap gap-3 text-xs">
            {(
              [
                { id: 'pick_and_drop', label: 'Pick & Drop' },
                { id: 'ride_sharing', label: 'Ride Sharing' },
                { id: 'fuel_sharing', label: 'Fuel Sharing' },
              ] as const
            ).map((srv) => {
              const checked = services.includes(srv.id);
              return (
                <label key={srv.id} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-zinc-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setServices((prev) =>
                        checked ? prev.filter((x) => x !== srv.id) : [...prev, srv.id]
                      )
                    }
                    className="accent-[#D4A017]"
                  />
                  <span className="font-semibold">{srv.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-[#0D0D10] text-white text-xs font-bold hover:bg-zinc-800"
        >
          {saving ? 'Saving...' : 'Save Vehicle & Registration Details'}
        </button>
      </form>

      {/* Screen 27: Document Upload Slots */}
      {mode === 'documents' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {DOC_SLOTS.map((slot) => {
            const uploaded = documents.find((d) => d.doc_type === slot.type);
            return (
              <div key={slot.type} className="rounded-2xl border border-zinc-200 bg-white p-4 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-[#0D0D10]">{slot.label}</span>
                    {uploaded ? (
                      <span
                        className={`font-semibold uppercase ${
                          uploaded.status === 'approved'
                            ? 'text-emerald-700'
                            : uploaded.status === 'rejected'
                            ? 'text-red-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {uploaded.status}
                      </span>
                    ) : (
                      <span className="text-zinc-400">Missing</span>
                    )}
                  </div>

                  {uploaded?.file_data_url && (
                    <img
                      src={uploaded.file_data_url}
                      alt={slot.label}
                      className="mt-2.5 w-full h-28 object-cover rounded-xl border border-zinc-200"
                    />
                  )}
                  {uploaded?.review_notes && (
                    <p className="mt-1.5 text-[11px] text-red-700">Note: {uploaded.review_notes}</p>
                  )}
                </div>

                <div className="space-y-2 pt-2 border-t border-zinc-100">
                  {slot.hasExpiry && (
                    <input
                      type="date"
                      value={expiryDrafts[slot.type] ?? uploaded?.expiry_date ?? ''}
                      onChange={(e) => setExpiryDrafts((d) => ({ ...d, [slot.type]: e.target.value }))}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs"
                    />
                  )}
                  <label className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-xs font-semibold text-[#0D0D10] cursor-pointer transition-colors">
                    {uploaded ? <FileCheck2 className="w-3.5 h-3.5 text-[#D4A017]" /> : <Upload className="w-3.5 h-3.5" />}
                    {uploaded ? 'Re-upload Document' : 'Upload File'}
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(slot.type, file);
                      }}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
