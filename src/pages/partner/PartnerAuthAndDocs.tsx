import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CarFront,
  CheckCircle2,
  Eye,
  EyeOff,
  FileCheck2,
  Loader2,
  Lock,
  Phone,
  ShieldAlert,
  Upload,
  User as UserIcon,
} from 'lucide-react';
import { BrandLogo, LanguageToggle, VehicleImage } from '../../components/BrandMark';
import { DEFAULT_PUBLIC_CONFIG } from '../../config/defaultConfig';
import { formatFirebaseAuthError, useFirebase } from '../../contexts/FirebaseContext';
import { apiRequest, isBackendOfflineError, setRoleToken, setStoredRoleUser } from '../../utils/api';
import { compressAndReadUploadFile } from '../../utils/imageUpload';
import type {
  Language,
  PartnerDocument,
  PartnerProfile,
  PublicConfig,
  ServiceType,
  User,
} from '../../types';

// Screen 17: Pro Partner Login / Registration (Google & Email Active; Facebook & Phone OTP Coming Soon)
export const PartnerAuth: React.FC<{
  lang: Language;
  onChangeLang: (l: Language) => void;
  onAuthenticated: (token: string, user: User, profile: PartnerProfile) => void;
  onBackWelcome: () => void;
}> = ({ lang, onChangeLang, onAuthenticated, onBackWelcome }) => {
  const {
    signInWithGooglePopup,
    registerWithFirebaseEmail,
    signInWithFirebaseEmail,
    resendFirebaseEmailVerification,
    reloadFirebaseUser,
    sendFirebasePasswordReset,
    redirectAuthUser,
    redirectError,
    clearRedirectState,
  } = useFirebase();

  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('Islamabad');
  const [operatingArea, setOperatingArea] = useState('');
  const [vehicleCategoryId, setVehicleCategoryId] = useState('fleet-sedan');
  const [password, setPassword] = useState('');
  const [emailVerificationPending, setEmailVerificationPending] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const buildLocalPartnerSession = (
    fbUser: { uid: string; displayName: string | null; email: string | null; phoneNumber: string | null },
    fallbackName?: string
  ): { user: User; profile: PartnerProfile } => {
    const user: User = {
      id: fbUser.uid,
      role: 'partner',
      full_name: fbUser.displayName || fallbackName || fbUser.email?.split('@')[0] || 'Pro Partner',
      phone: fbUser.phoneNumber || phone || '',
      whatsapp: whatsapp || fbUser.phoneNumber || phone || '',
      email: fbUser.email || email || `${fbUser.uid}@prorider.pk`,
      city,
      operating_area: operatingArea || 'City Center',
      phone_verified: 1,
      status: 'active',
      created_at: new Date().toISOString(),
    };
    const selectedRegisterFleet =
      DEFAULT_PUBLIC_CONFIG.fleet.find((f) => f.id === vehicleCategoryId) || DEFAULT_PUBLIC_CONFIG.fleet[3];
    const profile: PartnerProfile = {
      user_id: fbUser.uid,
      verification_status: 'incomplete',
      cnic_number: '',
      cnic_expiry: '',
      licence_number: '',
      licence_expiry: '',
      vehicle_category_id: selectedRegisterFleet.id,
      vehicle_name: '',
      vehicle_number: '',
      seating_capacity: selectedRegisterFleet.seating_capacity || 4,
      fuel_type: 'Petrol',
      operating_city: city,
      service_eligibility: ['pick_and_drop'],
      is_online: 0,
      current_lat: null,
      current_lng: null,
      last_location_at: null,
      admin_notes: '',
    };
    return { user, profile };
  };

  const finalizePartnerSession = async (
    idToken: string,
    fbUser: { uid: string; displayName: string | null; email: string | null; phoneNumber: string | null },
    fallbackName?: string
  ) => {
    const selectedRegisterFleet =
      DEFAULT_PUBLIC_CONFIG.fleet.find((f) => f.id === vehicleCategoryId) || DEFAULT_PUBLIC_CONFIG.fleet[3];
    try {
      const res = await apiRequest<{ token: string; user: User; partnerProfile: PartnerProfile }>(
        '/api/auth/google/firebase',
        {
          method: 'POST',
          body: {
            idToken,
            role: 'partner',
            city,
            vehicleCategoryId: selectedRegisterFleet.id,
            seatingCapacity: selectedRegisterFleet.seating_capacity,
          },
        }
      );
      setRoleToken('partner', res.token);
      setStoredRoleUser('partner', res.user);
      try {
        localStorage.setItem('pr_profile_partner', JSON.stringify(res.partnerProfile));
      } catch {
        // ignore
      }
      onAuthenticated(res.token, res.user, res.partnerProfile);
      return;
    } catch (err) {
      if (!isBackendOfflineError(err)) throw err;
      const firebaseToken = `pr_fb_${idToken.slice(0, 32)}`;
      const local = buildLocalPartnerSession(fbUser, fallbackName);
      setRoleToken('partner', firebaseToken);
      setStoredRoleUser('partner', local.user);
      try {
        localStorage.setItem('pr_profile_partner', JSON.stringify(local.profile));
      } catch {
        // ignore
      }
      onAuthenticated(firebaseToken, local.user, local.profile);
    }
  };

  useEffect(() => {
    if (redirectError) {
      setError(redirectError);
      clearRedirectState();
    }
  }, [redirectError, clearRedirectState]);

  useEffect(() => {
    if (!redirectAuthUser) return;
    let active = true;
    setLoading(true);
    redirectAuthUser
      .getIdToken()
      .then((tk) => (active ? finalizePartnerSession(tk, redirectAuthUser) : undefined))
      .catch((err) => {
        if (active) setError(formatFirebaseAuthError(err, 'Google'));
      })
      .finally(() => {
        clearRedirectState();
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [redirectAuthUser]);

  const handleGoogleSignIn = async () => {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const { idToken, user: fbUser } = await signInWithGooglePopup('partner', city, lang);
      await finalizePartnerSession(idToken, fbUser);
    } catch (err: any) {
      setError(formatFirebaseAuthError(err, 'Google'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError(
        lang === 'ur'
          ? 'درست ای میل ایڈریس درج کریں۔'
          : 'Please enter the email address associated with your Pro Partner account.'
      );
      return;
    }

    if (mode === 'forgot') {
      setLoading(true);
      try {
        await sendFirebasePasswordReset(cleanEmail);
        setInfo(
          lang === 'ur'
            ? `پاس ورڈ ری سیٹ لنک ${cleanEmail} پر بھیجا گیا ہے۔`
            : `Password reset link sent to ${cleanEmail}. Check your inbox and Spam folder.`
        );
      } catch (err: any) {
        try {
          const fallback = await apiRequest<{ message: string }>('/api/auth/forgot-password', {
            method: 'POST',
            body: { phone: phone || cleanEmail, role: 'partner' },
          });
          setInfo(fallback.message);
        } catch {
          setError(formatFirebaseAuthError(err, 'Password Reset'));
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!password || password.length < 6) {
      setError(lang === 'ur' ? 'پاس ورڈ کم از کم 6 حروف کا ہونا ضروری ہے۔' : 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        try {
          const res = await apiRequest<{ token: string; user: User; partnerProfile: PartnerProfile }>(
            '/api/auth/partner/login',
            { method: 'POST', body: { identifier: cleanEmail, password } }
          );
          setRoleToken('partner', res.token);
          setStoredRoleUser('partner', res.user);
          try {
            localStorage.setItem('pr_profile_partner', JSON.stringify(res.partnerProfile));
          } catch {
            // ignore
          }
          onAuthenticated(res.token, res.user, res.partnerProfile);
          return;
        } catch (apiErr: any) {
          if (!isBackendOfflineError(apiErr) && apiErr?.status !== 401) throw apiErr;
          const fbRes = await signInWithFirebaseEmail({
            email: cleanEmail,
            password,
            role: 'partner',
            city,
            lang,
          });
          if (!fbRes.emailVerified) {
            setEmailVerificationPending(true);
            setInfo(
              lang === 'ur'
                ? `براہ کرم ${cleanEmail} کی تصدیق لنک کے ذریعے مکمل کریں۔`
                : `Verification email sent to ${cleanEmail}. Please click the link and tap "I've Verified — Continue".`
            );
            return;
          }
          await finalizePartnerSession(fbRes.idToken, fbRes.user);
        }
      } else {
        const selectedRegisterFleet =
          DEFAULT_PUBLIC_CONFIG.fleet.find((f) => f.id === vehicleCategoryId) || DEFAULT_PUBLIC_CONFIG.fleet[3];

        try {
          const fbRes = await registerWithFirebaseEmail({
            fullName,
            email: cleanEmail,
            password,
            role: 'partner',
            city,
            lang,
          });
          void apiRequest('/api/auth/partner/register', {
            method: 'POST',
            body: {
              fullName,
              phone: phone.trim(),
              whatsapp: whatsapp.trim() || phone.trim(),
              email: cleanEmail,
              city,
              operatingArea,
              password,
              vehicleCategoryId: selectedRegisterFleet.id,
              seatingCapacity: selectedRegisterFleet.seating_capacity,
            },
          }).catch(() => {});

          if (fbRes.emailVerified) {
            await finalizePartnerSession(fbRes.idToken, fbRes.user, fullName);
          } else {
            setEmailVerificationPending(true);
            setInfo(
              lang === 'ur'
                ? `تصدیقی لنک ${cleanEmail} پر بھیجا گیا ہے۔ ای میل میں لنک کھول کر نیچے بٹن دبائیں۔`
                : `Verification email sent to ${cleanEmail}. Open your inbox and verify before continuing.`
            );
          }
        } catch (fbErr: any) {
          const code = String(fbErr?.code || '');
          if (
            code === 'auth/operation-not-allowed' ||
            code === 'auth/unauthorized-domain' ||
            code === 'auth/network-request-failed'
          ) {
            const res = await apiRequest<{ token: string; user: User; partnerProfile: PartnerProfile }>(
              '/api/auth/partner/register',
              {
                method: 'POST',
                body: {
                  fullName,
                  phone: phone.trim(),
                  whatsapp: whatsapp.trim() || phone.trim(),
                  email: cleanEmail,
                  city,
                  operatingArea,
                  password,
                  vehicleCategoryId: selectedRegisterFleet.id,
                  seatingCapacity: selectedRegisterFleet.seating_capacity,
                },
              }
            );
            setRoleToken('partner', res.token);
            setStoredRoleUser('partner', res.user);
            try {
              localStorage.setItem('pr_profile_partner', JSON.stringify(res.partnerProfile));
            } catch {
              // ignore
            }
            onAuthenticated(res.token, res.user, res.partnerProfile);
            return;
          }
          throw fbErr;
        }
      }
    } catch (err: any) {
      setError(formatFirebaseAuthError(err, 'Pro Partner Auth'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir={lang === 'ur' ? 'rtl' : 'ltr'} className="min-h-screen w-full max-w-full overflow-x-clip bg-[#0D0D10] text-white flex flex-col">
      <header className="border-b border-zinc-800 bg-[#0D0D10] px-3 sm:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 w-full">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button type="button" onClick={onBackWelcome} className="p-2 rounded-lg hover:bg-zinc-900 text-zinc-400 shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <BrandLogo dark compact />
        </div>
        <div className="shrink-0 scale-90 sm:scale-100 origin-right">
          <LanguageToggle lang={lang} onChange={onChangeLang} dark />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 py-10">
        <div className="w-full max-w-md rounded-3xl bg-[#16171C] border border-zinc-800 p-6 sm:p-8 space-y-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#D4A017]">Pro Partner Portal</p>
            <h1 className="font-display text-2xl font-bold mt-1">
              {mode === 'login' ? 'Pro Partner Sign In' : mode === 'register' ? 'Become a Pro Partner' : 'Reset Password'}
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              {lang === 'ur'
                ? 'Google یا اپنے ای میل اور پاس ورڈ کے ذریعے ڈرائیور پورٹل میں داخل ہوں۔'
                : 'Sign in with Google or your Email & Password.'}
            </p>
          </div>

          {!emailVerificationPending && (
            <>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-zinc-900 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                    setInfo(null);
                  }}
                  className={`py-2 rounded-lg ${mode === 'login' ? 'bg-[#D4A017] text-[#0D0D10] font-bold' : 'text-zinc-400'}`}
                >
                  {lang === 'ur' ? 'لاگ اِن' : 'Login'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                    setInfo(null);
                  }}
                  className={`py-2 rounded-lg ${mode === 'register' ? 'bg-[#D4A017] text-[#0D0D10] font-bold' : 'text-zinc-400'}`}
                >
                  {lang === 'ur' ? 'رجسٹر' : 'Register'}
                </button>
              </div>

              {mode !== 'forgot' && (
                <>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleGoogleSignIn}
                    className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 disabled:opacity-60"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.9 1.5l2.7-2.6C16.9 3.3 14.7 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
                    </svg>
                    {lang === 'ur' ? 'Google کے ساتھ جاری رکھیں' : 'Continue with Google'}
                  </button>

                  <div className="relative flex items-center justify-center">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-zinc-800" />
                    </div>
                    <span className="relative bg-[#16171C] px-3 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                      {lang === 'ur' ? 'یا ای میل کے ساتھ' : 'Or continue with Email'}
                    </span>
                  </div>
                </>
              )}
            </>
          )}

          {error && <div className="rounded-xl bg-red-950/60 border border-red-800 px-3.5 py-2.5 text-xs text-red-200">{error}</div>}
          {info && <div className="rounded-xl bg-amber-950/60 border border-amber-800 px-3.5 py-2.5 text-xs text-amber-200">{info}</div>}

          {emailVerificationPending ? (
            <div className="space-y-4 text-xs text-center">
              <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-700 space-y-2">
                <p className="font-bold text-sm text-[#D4A017]">Verify Partner Email</p>
                <p className="text-zinc-300">Open the verification link sent to <strong className="font-mono">{email}</strong>.</p>
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    const reloaded = await reloadFirebaseUser('partner', city, lang);
                    if (!reloaded || !reloaded.emailVerified) {
                      setError('Email is not verified yet. Check your inbox and click the link first.');
                      return;
                    }
                    await finalizePartnerSession(reloaded.idToken, reloaded.user, fullName);
                  } catch (err: any) {
                    setError(formatFirebaseAuthError(err, 'Email Verification'));
                  } finally {
                    setLoading(false);
                  }
                }}
                className="w-full py-3 rounded-xl bg-[#D4A017] text-[#0D0D10] text-sm font-bold"
              >
                {loading ? 'Checking...' : "I've Verified — Continue"}
              </button>
              <button
                type="button"
                onClick={() => void resendFirebaseEmailVerification().then(() => setInfo('Verification email resent!'))}
                className="text-[#D4A017] hover:underline font-semibold"
              >
                Resend Verification Email
              </button>
            </div>
          ) : (
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
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Email Address</label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="driver@email.com"
                  className="w-full px-3 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white"
                />
              </div>

              {mode === 'register' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1">Mobile (Optional)</label>
                      <input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
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
                      <label className="block text-xs font-semibold text-zinc-300 mb-1">WhatsApp</label>
                      <input
                        value={whatsapp}
                        onChange={(e) => setWhatsapp(e.target.value)}
                        placeholder="03XXXXXXXXX"
                        className="w-full px-3 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1">Operating Area</label>
                      <input
                        value={operatingArea}
                        onChange={(e) => setOperatingArea(e.target.value)}
                        placeholder="e.g. F-10 / Blue Area"
                        className="w-full px-3 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      {lang === 'ur' ? 'گاڑی کی کیٹگری (سیون سیٹر سمیت)' : 'Vehicle Category (incl. 7-Seater Van)'}
                    </label>
                    <select
                      value={vehicleCategoryId}
                      onChange={(e) => setVehicleCategoryId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white"
                    >
                      {DEFAULT_PUBLIC_CONFIG.fleet.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.seating_capacity} Seats)
                        </option>
                      ))}
                    </select>
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
                {loading
                  ? 'Processing...'
                  : mode === 'login'
                  ? 'Sign In with Email'
                  : mode === 'register'
                  ? 'Register with Email'
                  : 'Send Password Reset Email'}
              </button>
            </form>
          )}

          {/* DIMMED, DISABLED CIRCULAR "COMING SOON" BUTTONS AT BOTTOM (Facebook & Phone OTP) */}
          {!emailVerificationPending && (
            <div className="pt-3 border-t border-zinc-800 flex flex-col items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                {lang === 'ur' ? 'فیس بک اور فون او ٹی پی · کمنگ سون' : 'Facebook & Phone SMS OTP · Coming Soon'}
              </span>
              <div className="flex items-center justify-center gap-4">
                <div className="flex flex-col items-center gap-1 opacity-45 select-none">
                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    title="Facebook Login — Coming Soon (Under Meta Review)"
                    className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center text-[#1877F2] cursor-not-allowed"
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                  </button>
                  <span className="text-[9px] font-semibold text-zinc-500">
                    {lang === 'ur' ? 'کمنگ سون' : 'Coming Soon'}
                  </span>
                </div>

                <div className="flex flex-col items-center gap-1 opacity-45 select-none">
                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    title="Phone SMS OTP — Coming Soon"
                    className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-400 cursor-not-allowed"
                  >
                    <Phone className="w-4 h-4" />
                  </button>
                  <span className="text-[9px] font-semibold text-zinc-500">
                    {lang === 'ur' ? 'کمنگ سون' : 'Coming Soon'}
                  </span>
                </div>
              </div>
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
  lang?: Language;
  profile: PartnerProfile;
  documents: PartnerDocument[];
  config: PublicConfig | null;
  onRefresh: () => Promise<void>;
  onLocalDocumentSaved?: (doc: PartnerDocument) => void;
  onToggleDocVisibility?: (docType: PartnerDocument['doc_type'], isPublic: boolean) => Promise<void> | void;
}> = ({
  mode,
  lang = 'en',
  profile,
  documents,
  config,
  onRefresh,
  onLocalDocumentSaved,
  onToggleDocVisibility,
}) => {
  const fleetCategories = (
    config?.fleet?.length ? config.fleet : DEFAULT_PUBLIC_CONFIG.fleet
  ).filter((f) => f.is_active === 1);

  const [cnicNumber, setCnicNumber] = useState(profile.cnic_number || '');
  const [cnicExpiry, setCnicExpiry] = useState(profile.cnic_expiry || '');
  const [licenceNumber, setLicenceNumber] = useState(profile.licence_number || '');
  const [licenceExpiry, setLicenceExpiry] = useState(profile.licence_expiry || '');
  const [vehicleCategoryId, setVehicleCategoryId] = useState(
    profile.vehicle_category_id || fleetCategories[0]?.id || 'fleet-sedan'
  );
  const [vehicleName, setVehicleName] = useState(profile.vehicle_name || '');
  const [vehicleNumber, setVehicleNumber] = useState(profile.vehicle_number || '');
  const [seatingCapacity, setSeatingCapacity] = useState(profile.seating_capacity || 4);
  const [fuelType, setFuelType] = useState(profile.fuel_type || 'Petrol');
  const [operatingCity, setOperatingCity] = useState(profile.operating_city || 'Islamabad');
  const [services, setServices] = useState<ServiceType[]>(
    profile.service_eligibility?.length ? profile.service_eligibility : ['pick_and_drop']
  );

  const selectedFleetCategory =
    fleetCategories.find((f) => f.id === vehicleCategoryId) || fleetCategories[0] || null;

  const handleSelectCategory = (catId: string) => {
    setVehicleCategoryId(catId);
    const matched = fleetCategories.find((f) => f.id === catId);
    if (matched?.seating_capacity) {
      setSeatingCapacity(matched.seating_capacity);
    }
  };

  const [expiryDrafts, setExpiryDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
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

  const handleUpload = async (docType: PartnerDocument['doc_type'], file: File) => {
    setUploadingSlot(docType);
    setMsg(null);
    const defaultPublic = docType === 'profile_photo' || docType === 'vehicle_photo';
    const existingDoc = documents.find((d) => d.doc_type === docType);
    const resolvedPublic =
      typeof existingDoc?.is_public === 'number' ? existingDoc.is_public === 1 : defaultPublic;

    try {
      const { dataUrl, fileName } = await compressAndReadUploadFile(file, 1280, 0.82);
      const localDoc: PartnerDocument = {
        id: existingDoc?.id || `DOC-${Date.now()}`,
        partner_id: profile.user_id,
        doc_type: docType,
        file_name: fileName,
        file_data_url: dataUrl,
        status: 'pending',
        expiry_date: expiryDrafts[docType] || existingDoc?.expiry_date || '',
        review_notes: '',
        is_public: resolvedPublic ? 1 : 0,
        uploaded_at: new Date().toISOString(),
      };

      try {
        const res = await apiRequest<{ uploaded?: boolean; document?: PartnerDocument }>('/api/partner/documents', {
          method: 'POST',
          role: 'partner',
          body: {
            docType,
            fileName,
            fileDataUrl: dataUrl,
            expiryDate: expiryDrafts[docType] || '',
            isPublic: resolvedPublic,
          },
        });
        onLocalDocumentSaved?.(res.document || localDoc);
        await onRefresh();
      } catch (apiErr: any) {
        if (isBackendOfflineError(apiErr)) {
          onLocalDocumentSaved?.(localDoc);
        } else {
          throw apiErr;
        }
      }

      setMsg(
        lang === 'ur'
          ? `${docType.replaceAll('_', ' ')} کامیابی سے اپ لوڈ ہو گیا ہے۔`
          : `${docType.replaceAll('_', ' ')} uploaded successfully for Admin review.`
      );
    } catch (err: any) {
      setMsg(err?.message || 'Upload failed. Please try another photo.');
    } finally {
      setUploadingSlot(null);
    }
  };

  return (
    <div className="space-y-6 w-full min-w-0 overflow-x-clip">
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

        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <label className="block text-xs font-semibold text-zinc-600">
              Select Vehicle Category (including Van · 7-seater · وین)
            </label>
            {selectedFleetCategory && (
              <span className="text-[11px] font-mono font-bold text-[#B8860B]">
                {selectedFleetCategory.seating_capacity} Seats
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-60 overflow-y-auto pr-1">
            {fleetCategories.map((f) => {
              const active = vehicleCategoryId === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => handleSelectCategory(f.id)}
                  className={`p-2 rounded-xl border text-left transition-all flex items-center gap-2.5 min-w-0 ${
                    active
                      ? 'border-[#D4A017] bg-[#FFFBEB] shadow-xs ring-1 ring-[#D4A017]'
                      : 'border-zinc-200 bg-white hover:border-zinc-300'
                  }`}
                >
                  <VehicleImage src={f.image_url} alt={f.name} className="w-14 h-10 rounded-lg border shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-bold text-[#0D0D10] truncate">{f.name}</div>
                    <div className="text-[10px] text-zinc-500 font-mono">{f.seating_capacity} Seats</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Vehicle Category</label>
            <select
              value={vehicleCategoryId}
              onChange={(e) => handleSelectCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white"
            >
              {fleetCategories.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.seating_capacity} seats)
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
              placeholder="e.g. Suzuki Every 7-Seater / Corolla GLi"
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
              max={30}
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

      {/* Screen 27: Document Upload Slots with Per-Photo Privacy Lock Toggle */}
      {mode === 'documents' && (
        <div className="space-y-3">
          <div className="rounded-xl bg-zinc-50 border border-zinc-200 px-3.5 py-2.5 text-xs text-zinc-600 flex flex-wrap items-center justify-between gap-2">
            <span>
              {lang === 'ur'
                ? 'ہر تصویر کے اوپر آنکھ / لاک بٹن سے آپ پبلک ویزیبلٹی آن یا بند کر سکتے ہیں۔ ایڈمن تمام دستاویزات دیکھ سکتا ہے۔'
                : 'Use the privacy button on each photo to show or hide it from Passengers. Admin always sees uploaded verification docs.'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {DOC_SLOTS.map((slot) => {
              const uploaded = documents.find((d) => d.doc_type === slot.type);
              const defaultPublic = slot.type === 'profile_photo' || slot.type === 'vehicle_photo';
              const isPublic = uploaded ? uploaded.is_public === 1 : defaultPublic;
              const isBusy = uploadingSlot === slot.type;

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
                      <div className="relative mt-2.5 rounded-xl overflow-hidden border border-zinc-200 bg-zinc-100">
                        <img
                          src={uploaded.file_data_url}
                          alt={slot.label}
                          className={`w-full h-32 object-cover transition-opacity ${
                            !isPublic ? 'opacity-80' : ''
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => onToggleDocVisibility?.(slot.type, !isPublic)}
                          className={`absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold shadow-sm backdrop-blur ${
                            isPublic
                              ? 'bg-emerald-700/95 text-white'
                              : 'bg-[#0D0D10]/90 text-[#F4C430]'
                          }`}
                        >
                          {isPublic ? (
                            <>
                              <Eye className="w-3 h-3" />
                              <span>{lang === 'ur' ? 'پبلک آن' : 'Public'}</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3 h-3" />
                              <span>{lang === 'ur' ? 'بند · ایڈمن' : 'Locked · Admin Only'}</span>
                            </>
                          )}
                        </button>
                      </div>
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
                    <label className="w-full min-h-[40px] inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-xs font-semibold text-[#0D0D10] cursor-pointer transition-colors">
                      {isBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D4A017]" />
                      ) : uploaded ? (
                        <FileCheck2 className="w-3.5 h-3.5 text-[#D4A017]" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      {isBusy
                        ? lang === 'ur'
                          ? 'اپ لوڈ ہو رہا ہے...'
                          : 'Compressing & Uploading...'
                        : uploaded
                        ? 'Re-upload Document'
                        : 'Upload Photo / File'}
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        disabled={isBusy}
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) void handleUpload(slot.type, file);
                        }}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
