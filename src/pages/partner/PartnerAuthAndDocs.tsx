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
  Mail,
  Phone,
  ShieldAlert,
  ShieldCheck,
  Upload,
  User as UserIcon,
} from 'lucide-react';
import heroMobilityImg from '../../assets/images/hero_mobility_pakistan_1794584048013.jpg';
import { BrandLogo, LanguageToggle, VehicleImage } from '../../components/BrandMark';
import { DEFAULT_PUBLIC_CONFIG } from '../../config/defaultConfig';
import { formatFirebaseAuthError, useFirebase } from '../../contexts/FirebaseContext';
import { useTheme } from '../../contexts/ThemeContext';
import { tr, trService, trVerificationStatus } from '../../i18n/translations';
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
  const { authLayout } = useTheme();
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
  const [showPassword, setShowPassword] = useState(false);
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
        tr(lang, 'Please enter the email address associated with your Pro Partner account.', 'درست ای میل ایڈریس درج کریں۔')
      );
      return;
    }

    if (mode === 'forgot') {
      setLoading(true);
      try {
        await sendFirebasePasswordReset(cleanEmail);
        setInfo(
          tr(
            lang,
            `Password reset link sent to ${cleanEmail}. Check your inbox and Spam folder.`,
            `پاس ورڈ ری سیٹ لنک ${cleanEmail} پر بھیجا گیا ہے۔`
          )
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
      setError(tr(lang, 'Password must be at least 6 characters.', 'پاس ورڈ کم از کم 6 حروف کا ہونا ضروری ہے۔'));
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
              tr(
                lang,
                `Verification email sent to ${cleanEmail}. Please click the link and tap "I've Verified — Continue".`,
                `براہ کرم ${cleanEmail} کی تصدیق لنک کے ذریعے مکمل کریں۔`
              )
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
              tr(
                lang,
                `Verification email sent to ${cleanEmail}. Open your inbox and verify before continuing.`,
                `تصدیقی لنک ${cleanEmail} پر بھیجا گیا ہے۔ ای میل میں لنک کھول کر نیچے بٹن دبائیں۔`
              )
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

  const AuthCardBody = (
    <div
      className={`w-full border border-[#D4A017]/40 bg-white p-6 sm:p-8 shadow-xl space-y-5 ${
        authLayout === 'hero-sheet' ? 'rounded-t-[32px] sm:rounded-3xl' : 'rounded-3xl'
      }`}
    >
      {authLayout === 'hero-sheet' && (
        <div className="w-12 h-1.5 rounded-full bg-[#D4A017]/50 mx-auto sm:hidden -mt-2" />
      )}

      <div className="text-center sm:text-start">
        <p className="text-xs font-bold uppercase tracking-widest text-[#B8860B]">
          {tr(lang, 'Pro Partner Portal', 'پرو پارٹنر پورٹل')}
        </p>
        <h1 className="font-display text-2xl font-bold mt-1 text-[#0D0D10]">
          {mode === 'login'
            ? tr(lang, 'Pro Partner Sign In', 'پرو پارٹنر سائن ان')
            : mode === 'register'
            ? tr(lang, 'Become a Pro Partner', 'پرو پارٹنر بنیں')
            : tr(lang, 'Reset Password', 'پاس ورڈ ری سیٹ کریں')}
        </h1>
        <p className="text-xs text-zinc-500 mt-1">
          {tr(
            lang,
            'Sign in with Google or your Email & Password.',
            'Google یا اپنے ای میل اور پاس ورڈ کے ذریعے ڈرائیور پورٹل میں داخل ہوں۔'
          )}
        </p>
      </div>

      {!emailVerificationPending && (
        <>
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-zinc-100 border border-[#D4A017]/30 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setInfo(null);
              }}
              className={`py-2.5 rounded-lg transition-colors ${
                mode === 'login' ? 'pr-gold-cta font-bold' : 'text-zinc-600 hover:text-[#0D0D10]'
              }`}
            >
              {tr(lang, 'Login', 'لاگ اِن')}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
                setInfo(null);
              }}
              className={`py-2.5 rounded-lg transition-colors ${
                mode === 'register' ? 'pr-gold-cta font-bold' : 'text-zinc-600 hover:text-[#0D0D10]'
              }`}
            >
              {tr(lang, 'Register', 'رجسٹر')}
            </button>
          </div>

          {mode !== 'forgot' && (
            <>
              <button
                type="button"
                disabled={loading}
                onClick={handleGoogleSignIn}
                className="pr-preserve-light w-full flex items-center justify-center gap-2.5 py-3 rounded-2xl border border-zinc-300 bg-white hover:bg-zinc-50 !text-[#0D0D10] text-xs font-bold disabled:opacity-60"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.9 1.5l2.7-2.6C16.9 3.3 14.7 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
                </svg>
                {tr(lang, 'Continue with Google', 'Google کے ساتھ جاری رکھیں')}
              </button>

              <div className="relative flex items-center justify-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-200" />
                </div>
                <span className="relative bg-white px-3 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                  {tr(lang, 'Or continue with Email', 'یا ای میل کے ساتھ')}
                </span>
              </div>
            </>
          )}
        </>
      )}

      {error && <div className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700">{error}</div>}
      {info && <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-900">{info}</div>}

      {emailVerificationPending ? (
        <div className="space-y-4 text-xs text-center">
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
            <p className="font-bold text-sm text-[#0D0D10]">
              {tr(lang, 'Verify Partner Email', 'ڈرائیور ای میل کی تصدیق کریں')}
            </p>
            <p className="text-zinc-600">
              {tr(lang, `Open the verification link sent to ${email}.`, `ای میل (${email}) میں بھیجے گئے لنک پر کلک کریں۔`)}
            </p>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              try {
                const reloaded = await reloadFirebaseUser('partner', city, lang);
                if (!reloaded || !reloaded.emailVerified) {
                  setError(tr(lang, 'Email is not verified yet. Check your inbox and click the link first.', 'ای میل ابھی تصدیق نہیں ہوئی۔'));
                  return;
                }
                await finalizePartnerSession(reloaded.idToken, reloaded.user, fullName);
              } catch (err: any) {
                setError(formatFirebaseAuthError(err, 'Email Verification'));
              } finally {
                setLoading(false);
              }
            }}
            className="w-full py-3 rounded-xl pr-gold-cta text-sm font-bold"
          >
            {loading ? tr(lang, 'Checking...', 'چیک ہو رہا ہے...') : tr(lang, "I've Verified — Continue", 'تصدیق مکمل — آگے بڑھیں')}
          </button>
          <button
            type="button"
            onClick={() =>
              void resendFirebaseEmailVerification().then(() =>
                setInfo(tr(lang, 'Verification email resent!', 'تصدیقی ای میل دوبارہ بھیج دی گئی۔'))
              )
            }
            className="text-[#B8860B] hover:underline font-semibold"
          >
            {tr(lang, 'Resend Verification Email', 'تصدیقی ای میل دوبارہ بھیجیں')}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {mode === 'register' && (
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">
                {tr(lang, 'Full Name (as per CNIC)', 'مکمل نام (شناختی کارڈ کے مطابق)')}
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-[#D4A017] absolute start-3 top-3" />
                <input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={tr(lang, 'e.g. Asif Ali', 'مثال: آصف علی')}
                  className="w-full ps-9 pe-3 py-2.5 rounded-xl border border-zinc-200 text-sm"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block font-semibold text-zinc-700 mb-1">
              {tr(lang, 'Email Address', 'ای میل ایڈریس')}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#D4A017] absolute start-3 top-3" />
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="driver@email.com"
                className="w-full ps-9 pe-3 py-2.5 rounded-xl border border-zinc-200 text-sm"
              />
            </div>
          </div>

          {mode === 'register' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">
                    {tr(lang, 'Mobile (Optional)', 'موبائل (اختیاری)')}
                  </label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="03XXXXXXXXX"
                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">
                    {tr(lang, 'City', 'شہر')}
                  </label>
                  <select
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm"
                  >
                    <option value="Islamabad">{tr(lang, 'Islamabad', 'اسلام آباد')}</option>
                    <option value="Rawalpindi">{tr(lang, 'Rawalpindi', 'راولپنڈی')}</option>
                    <option value="Lahore">{tr(lang, 'Lahore', 'لاہور')}</option>
                    <option value="Karachi">{tr(lang, 'Karachi', 'کراچی')}</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">
                    {tr(lang, 'WhatsApp', 'واٹس ایپ')}
                  </label>
                  <input
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="03XXXXXXXXX"
                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">
                    {tr(lang, 'Operating Area', 'علاقہ / سیکٹر')}
                  </label>
                  <input
                    value={operatingArea}
                    onChange={(e) => setOperatingArea(e.target.value)}
                    placeholder={tr(lang, 'e.g. F-10 / Blue Area', 'مثال: ایف-10 / بلیو ایریا')}
                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  {tr(lang, 'Vehicle Category (incl. 7-Seater Van)', 'گاڑی کی کیٹگری (سیون سیٹر سمیت)')}
                </label>
                <select
                  value={vehicleCategoryId}
                  onChange={(e) => setVehicleCategoryId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm"
                >
                  {DEFAULT_PUBLIC_CONFIG.fleet.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.seating_capacity} {tr(lang, 'Seats', 'سیٹیں')})
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {mode !== 'forgot' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-zinc-700">{tr(lang, 'Password', 'پاس ورڈ')}</label>
                <button
                  type="button"
                  onClick={() => setMode('forgot')}
                  className="text-[11px] font-semibold text-[#B8860B] hover:underline"
                >
                  {tr(lang, 'Forgot Password?', 'پاس ورڈ بھول گئے؟')}
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#D4A017] absolute start-3 top-3" />
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={tr(lang, 'Minimum 6 characters', 'کم از کم 6 حروف')}
                  className="w-full ps-9 pe-10 py-2.5 rounded-xl border border-zinc-200 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute end-3 top-2.5 text-zinc-400 hover:text-[#D4A017]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-2xl pr-gold-cta text-sm font-bold transition-transform hover:scale-[1.01]"
          >
            {loading
              ? tr(lang, 'Processing...', 'جاری ہے...')
              : mode === 'login'
              ? tr(lang, 'Sign In', 'سائن ان کریں')
              : mode === 'register'
              ? tr(lang, 'Register Pro Partner', 'پرو پارٹنر رجسٹر کریں')
              : tr(lang, 'Send Password Reset Email', 'پاس ورڈ ری سیٹ ای میل بھیجیں')}
          </button>

          {mode === 'forgot' && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-xs font-semibold text-zinc-500 hover:text-[#0D0D10]"
              >
                {tr(lang, '← Back to Login', '← واپس لاگ ان پر جائیں')}
              </button>
            </div>
          )}
        </form>
      )}

      {/* DIMMED, DISABLED CIRCULAR "COMING SOON" BUTTONS AT BOTTOM (Facebook & Phone OTP) */}
      {!emailVerificationPending && (
        <div className="pt-3 border-t border-zinc-100 flex flex-col items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
            {tr(lang, 'Facebook & Phone SMS OTP · Coming Soon', 'فیس بک اور فون او ٹی پی · کمنگ سون')}
          </span>
          <div className="flex items-center justify-center gap-4">
            <div className="flex flex-col items-center gap-1 opacity-45 select-none">
              <button
                type="button"
                disabled
                aria-disabled="true"
                title={tr(lang, 'Facebook Login — Coming Soon (Under Meta Review)', 'فیس بک لاگ ان — جلد آ رہا ہے')}
                className="w-10 h-10 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-[#1877F2] cursor-not-allowed"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
              </button>
              <span className="text-[9px] font-semibold text-zinc-400">
                {tr(lang, 'Coming Soon', 'کمنگ سون')}
              </span>
            </div>

            <div className="flex flex-col items-center gap-1 opacity-45 select-none">
              <button
                type="button"
                disabled
                aria-disabled="true"
                title={tr(lang, 'Phone SMS OTP — Coming Soon', 'فون ایس ایم ایس او ٹی پی — جلد آ رہا ہے')}
                className="w-10 h-10 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-600 cursor-not-allowed"
              >
                <Phone className="w-4 h-4" />
              </button>
              <span className="text-[9px] font-semibold text-zinc-400">
                {tr(lang, 'Coming Soon', 'کمنگ سون')}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div dir={lang === 'ur' ? 'rtl' : 'ltr'} className="min-h-screen w-full max-w-full overflow-x-clip bg-[#F8F8FA] flex flex-col">
      <header className="border-b border-zinc-200 bg-white px-3 sm:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 w-full sticky top-0 z-30">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button type="button" onClick={onBackWelcome} className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500 shrink-0">
            <ArrowLeft className={`w-4 h-4 ${lang === 'ur' ? 'rotate-180' : ''}`} />
          </button>
          <BrandLogo compact lang={lang} />
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <LanguageToggle lang={lang} onChange={onChangeLang} />
        </div>
      </header>

      {authLayout === 'classic-card' && (
        <main className="flex-1 flex items-center justify-center p-4 py-10">
          <div className="w-full max-w-md">{AuthCardBody}</div>
        </main>
      )}

      {authLayout === 'hero-sheet' && (
        <main className="flex-1 flex flex-col items-center">
          <div className="w-full max-w-2xl mx-auto">
            <div className="pr-preserve-light relative h-44 sm:h-56 w-full overflow-hidden sm:rounded-b-3xl bg-[#0D0D10]">
              <img
                src={heroMobilityImg}
                alt="PRO PARTNER"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-center opacity-80"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/25 flex flex-col justify-end p-5 sm:p-8">
                <p className="text-[11px] font-bold uppercase tracking-widest !text-[#F4C430]">
                  PRO RIDER AI
                </p>
                <h2 className="font-display text-2xl sm:text-3xl font-bold !text-white">
                  {tr(lang, 'PRO PARTNER', 'پرو پارٹنر')}
                </h2>
                <p className="text-xs !text-zinc-200 mt-0.5">
                  {tr(lang, 'Drive Smart. Earn More. Grow Together.', 'سمجھداری سے چلائیں، زیادہ کمائیں، اعتماد سے آگے بڑھیں۔')}
                </p>
              </div>
            </div>
            <div className="px-0 sm:px-4 -mt-6 relative z-10 pb-8">{AuthCardBody}</div>
          </div>
        </main>
      )}

      {authLayout === 'split-showcase' && (
        <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="hidden lg:flex lg:col-span-6 flex-col space-y-5">
            <div className="pr-preserve-light relative rounded-3xl overflow-hidden border border-[#D4A017]/50 h-[460px] bg-[#0D0D10] shadow-2xl">
              <img
                src={heroMobilityImg}
                alt="PRO RIDER AI Partner Showcase"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent flex flex-col justify-end p-8">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#F4C430] uppercase tracking-widest">
                  <ShieldCheck className="w-4 h-4" />
                  {tr(lang, 'Partner Excellence', 'پرو پارٹنر نیٹ ورک')}
                </span>
                <h2 className="font-display text-3xl font-bold !text-white mt-2">
                  {tr(lang, 'Drive Smart & Track Daily PKR Earnings', 'روزانہ کی PKR کمائی اور لائیو بُکنگز')}
                </h2>
                <p className="text-sm !text-zinc-200 mt-2">
                  {tr(
                    lang,
                    'Accept verified passenger rides, manage your showcase profile with per-photo locks, and settle directly via bank or wallet.',
                    'تصدیق شدہ سواریاں حاصل کریں، اپنی ڈرائیور پروفائل ترتیب دیں اور والٹ کے ذریعے ادائیگی وصول کریں۔'
                  )}
                </p>
              </div>
            </div>
          </div>
          <div className="lg:col-span-6 w-full max-w-md mx-auto">{AuthCardBody}</div>
        </main>
      )}
    </div>
  );
};

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

  const docSlots: Array<{ type: PartnerDocument['doc_type']; label: string; hasExpiry?: boolean }> = [
    { type: 'profile_photo', label: tr(lang, 'Partner Profile Photo', 'ڈرائیور کی پروفائل تصویر') },
    { type: 'cnic_front', label: tr(lang, 'CNIC Front Copy', 'شناختی کارڈ فرنٹ کاپی'), hasExpiry: true },
    { type: 'cnic_back', label: tr(lang, 'CNIC Back Copy', 'شناختی کارڈ بیک کاپی') },
    { type: 'driving_licence', label: tr(lang, 'Valid Driving Licence', 'کارآمد ڈرائیونگ لائسنس'), hasExpiry: true },
    { type: 'vehicle_registration', label: tr(lang, 'Vehicle Registration Book / Smart Card', 'گاڑی کی رجسٹریشن بک / اسمارٹ کارڈ') },
    { type: 'vehicle_photo', label: tr(lang, 'Vehicle Exterior Photo (with Number Plate)', 'گاڑی کی تصویر (نمبر پلیٹ سمیت)') },
  ];

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

  const statusColor =
    profile.verification_status === 'approved'
      ? 'text-emerald-700'
      : profile.verification_status === 'rejected' || profile.verification_status === 'suspended'
      ? 'text-red-700'
      : 'text-amber-700';

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
      setMsg(
        res.message ||
          tr(lang, 'Registration & vehicle details saved.', 'رجسٹریشن اور گاڑی کی تفصیلات محفوظ ہو گئیں۔')
      );
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
        tr(
          lang,
          `${docType.replaceAll('_', ' ')} uploaded successfully for Admin review.`,
          `${docType.replaceAll('_', ' ')} کامیابی سے اپ لوڈ ہو گیا ہے۔`
        )
      );
    } catch (err: any) {
      setMsg(err?.message || tr(lang, 'Upload failed. Please try another photo.', 'اپ لوڈ ناکام ہو گیا۔ دوبارہ کوشش کریں۔'));
    } finally {
      setUploadingSlot(null);
    }
  };

  return (
    <div className="space-y-6 w-full min-w-0 overflow-x-clip">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">
            {tr(lang, 'Verification Status', 'تصدیق کی صورتحال')}
          </p>
          <div className="flex items-center gap-2">
            {profile.verification_status === 'approved' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-700" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-amber-600" />
            )}
            <span className={`font-display text-xl font-bold ${statusColor}`}>
              {trVerificationStatus(lang, profile.verification_status)}
            </span>
          </div>
          {profile.admin_notes && (
            <p className="text-xs text-zinc-600">
              {tr(lang, 'Admin Note:', 'ایڈمن نوٹ:')} {profile.admin_notes}
            </p>
          )}
        </div>
        <div className="text-xs text-zinc-500 font-mono">
          {tr(lang, 'Uploaded Docs:', 'اپ لوڈ شدہ دستاویزات:')} {documents.length} / {docSlots.length}
        </div>
      </div>

      {msg && (
        <div className="rounded-xl bg-[#0D0D10] text-[#F4C430] px-4 py-2.5 text-xs font-semibold">{msg}</div>
      )}

      <form onSubmit={saveVehicleAndDetails} className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 space-y-5">
        <h3 className="font-display text-lg font-bold flex items-center gap-2">
          <CarFront className="w-5 h-5 text-[#D4A017]" />
          {mode === 'vehicle'
            ? tr(lang, 'Vehicle Management & Service Eligibility', 'گاڑی کا انتظام اور سروس اہلیت')
            : tr(lang, 'Personal Identity & Vehicle Registration', 'ذاتی شناخت اور گاڑی کی رجسٹریشن')}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              {tr(lang, 'CNIC Number', 'شناختی کارڈ نمبر')}
            </label>
            <input
              required
              value={cnicNumber}
              onChange={(e) => setCnicNumber(e.target.value)}
              placeholder="61101-XXXXXXX-X"
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              {tr(lang, 'CNIC Expiry', 'شناختی کارڈ کی میعاد')}
            </label>
            <input type="date" value={cnicExpiry} onChange={(e) => setCnicExpiry(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              {tr(lang, 'Driving Licence No.', 'ڈرائیونگ لائسنس نمبر')}
            </label>
            <input
              required
              value={licenceNumber}
              onChange={(e) => setLicenceNumber(e.target.value)}
              placeholder="ISB-XXXXXX"
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              {tr(lang, 'Licence Expiry', 'لائسنس کی میعاد')}
            </label>
            <input type="date" value={licenceExpiry} onChange={(e) => setLicenceExpiry(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm" />
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <label className="block text-xs font-semibold text-zinc-600">
              {tr(lang, 'Select Vehicle Category (including Van · 7-seater)', 'گاڑی کی کیٹگری منتخب کریں (7 سیٹر وین سمیت)')}
            </label>
            {selectedFleetCategory && (
              <span className="text-[11px] font-mono font-bold text-[#B8860B]">
                {selectedFleetCategory.seating_capacity} {tr(lang, 'Seats', 'سیٹیں')}
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
                  className={`p-2 rounded-xl border text-start transition-all flex items-center gap-2.5 min-w-0 ${
                    active
                      ? 'border-[#D4A017] bg-[#D4A017]/15 shadow-xs ring-1 ring-[#D4A017]'
                      : 'border-zinc-200 bg-white hover:border-zinc-300'
                  }`}
                >
                  <VehicleImage src={f.image_url} alt={f.name} className="w-14 h-10 rounded-lg border shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-bold text-[#0D0D10] truncate">{f.name}</div>
                    <div className="text-[10px] text-zinc-500 font-mono">
                      {f.seating_capacity} {tr(lang, 'Seats', 'سیٹیں')}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              {tr(lang, 'Vehicle Category', 'گاڑی کی قسم')}
            </label>
            <select
              value={vehicleCategoryId}
              onChange={(e) => handleSelectCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white"
            >
              {fleetCategories.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.seating_capacity} {tr(lang, 'seats', 'سیٹیں')})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              {tr(lang, 'Vehicle Make & Model', 'گاڑی کا نام اور ماڈل')}
            </label>
            <input
              required
              value={vehicleName}
              onChange={(e) => setVehicleName(e.target.value)}
              placeholder={tr(lang, 'e.g. Suzuki Every 7-Seater / Corolla GLi', 'مثال: سوزوکی ایوری / کرولا جی ایل آئی')}
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              {tr(lang, 'Registration Plate Number', 'رجسٹریشن نمبر پلیٹ')}
            </label>
            <input
              required
              value={vehicleNumber}
              onChange={(e) => setVehicleNumber(e.target.value)}
              placeholder="e.g. LEA-4512"
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm font-mono uppercase"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              {tr(lang, 'Seating Capacity', 'نشستوں کی تعداد')}
            </label>
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
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              {tr(lang, 'Fuel Type', 'ایندھن کی قسم')}
            </label>
            <select value={fuelType} onChange={(e) => setFuelType(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white">
              <option value="Petrol">{tr(lang, 'Petrol', 'پیٹرول')}</option>
              <option value="Hybrid">{tr(lang, 'Hybrid', 'ہائبرڈ')}</option>
              <option value="CNG">{tr(lang, 'CNG', 'سی این جی')}</option>
              <option value="Diesel">{tr(lang, 'Diesel', 'ڈیزل')}</option>
              <option value="Electric">{tr(lang, 'Electric', 'الیکٹرک')}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              {tr(lang, 'Operating City', 'کام کا شہر')}
            </label>
            <select value={operatingCity} onChange={(e) => setOperatingCity(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm bg-white">
              <option value="Islamabad">{tr(lang, 'Islamabad', 'اسلام آباد')}</option>
              <option value="Rawalpindi">{tr(lang, 'Rawalpindi', 'راولپنڈی')}</option>
              <option value="Lahore">{tr(lang, 'Lahore', 'لاہور')}</option>
              <option value="Karachi">{tr(lang, 'Karachi', 'کراچی')}</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold text-zinc-600">
            {tr(lang, 'Service Eligibility Preferences', 'خدمات کی اقسام')}
          </label>
          <div className="flex flex-wrap gap-3 text-xs">
            {(['pick_and_drop', 'ride_sharing', 'fuel_sharing'] as const).map((id) => {
              const checked = services.includes(id);
              return (
                <label key={id} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-zinc-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setServices((prev) =>
                        checked ? prev.filter((x) => x !== id) : [...prev, id]
                      )
                    }
                    className="accent-[#D4A017]"
                  />
                  <span className="font-semibold">{trService(lang, id)}</span>
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
          {saving
            ? tr(lang, 'Saving...', 'محفوظ ہو رہا ہے...')
            : tr(lang, 'Save Vehicle & Registration Details', 'گاڑی اور رجسٹریشن کی تفصیلات محفوظ کریں')}
        </button>
      </form>

      {mode === 'documents' && (
        <div className="space-y-3">
          <div className="rounded-xl bg-zinc-50 border border-zinc-200 px-3.5 py-2.5 text-xs text-zinc-600 flex flex-wrap items-center justify-between gap-2">
            <span>
              {tr(
                lang,
                'Use the privacy button on each photo to show or hide it from Passengers. Admin always sees uploaded verification docs.',
                'ہر تصویر کے اوپر آنکھ / لاک بٹن سے آپ پبلک ویزیبلٹی آن یا بند کر سکتے ہیں۔ ایڈمن تمام دستاویزات دیکھ سکتا ہے۔'
              )}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {docSlots.map((slot) => {
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
                          {uploaded.status === 'approved'
                            ? tr(lang, 'Approved', 'منظور شدہ')
                            : uploaded.status === 'rejected'
                            ? tr(lang, 'Rejected', 'مسترد')
                            : tr(lang, 'Pending', 'زیرِ جائزہ')}
                        </span>
                      ) : (
                        <span className="text-zinc-400">{tr(lang, 'Missing', 'باقی ہے')}</span>
                      )}
                    </div>

                    {uploaded?.file_data_url && (
                      <div className="relative mt-2.5 rounded-xl overflow-hidden border border-zinc-200 bg-zinc-100">
                        <img
                          src={uploaded.file_data_url}
                          alt={slot.label}
                          className={`w-full h-32 object-cover transition-opacity ${!isPublic ? 'opacity-80' : ''}`}
                        />
                        <button
                          type="button"
                          onClick={() => onToggleDocVisibility?.(slot.type, !isPublic)}
                          className={`pr-preserve-light absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold shadow-sm backdrop-blur ${
                            isPublic ? 'bg-emerald-700/95 !text-white' : 'bg-[#0D0D10]/90 !text-[#F4C430]'
                          }`}
                        >
                          {isPublic ? (
                            <>
                              <Eye className="w-3 h-3" />
                              <span>{tr(lang, 'Public', 'پبلک آن')}</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3 h-3" />
                              <span>{tr(lang, 'Locked · Admin Only', 'بند · ایڈمن')}</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                    {uploaded?.review_notes && (
                      <p className="mt-1.5 text-[11px] text-red-700">
                        {tr(lang, 'Note:', 'نوٹ:')} {uploaded.review_notes}
                      </p>
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
                        ? tr(lang, 'Compressing & Uploading...', 'اپ لوڈ ہو رہا ہے...')
                        : uploaded
                        ? tr(lang, 'Re-upload Document', 'دوبارہ اپ لوڈ کریں')
                        : tr(lang, 'Upload Photo / File', 'تصویر / فائل اپ لوڈ کریں')}
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
