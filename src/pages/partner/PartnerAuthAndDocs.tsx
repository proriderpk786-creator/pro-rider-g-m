import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  CarFront,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  FileCheck2,
  Loader2,
  Lock,
  Mail,
  Phone,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
  User as UserIcon,
} from 'lucide-react';
import fallbackSedanHeroImg from '../../assets/images/fleet_premium_1794584050155.jpg';
import heroMobilityImg from '../../assets/images/hero_mobility_pakistan_1794584048013.jpg';
import { BrandLogo, LanguageToggle, VehicleImage } from '../../components/BrandMark';
import { DEFAULT_PUBLIC_CONFIG } from '../../config/defaultConfig';
import { formatFirebaseAuthError, useFirebase } from '../../contexts/FirebaseContext';
import { useTheme } from '../../contexts/ThemeContext';
import { formatVehicleLabel, tr, trService, trVerificationStatus } from '../../i18n/translations';
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
        } catch (apiRegErr: any) {
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
          } catch (fbErr) {
            throw apiRegErr?.message ? apiRegErr : fbErr;
          }
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
                onError={(e) => {
                  const img = e.currentTarget;
                  if (img.dataset.fallbackApplied !== '1') {
                    img.dataset.fallbackApplied = '1';
                    img.src = fallbackSedanHeroImg;
                  }
                }}
                className="w-full h-full object-cover object-center opacity-80"
                loading="eager"
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
                onError={(e) => {
                  const img = e.currentTarget;
                  if (img.dataset.fallbackApplied !== '1') {
                    img.dataset.fallbackApplied = '1';
                    img.src = fallbackSedanHeroImg;
                  }
                }}
                className="w-full h-full object-cover object-center"
                loading="eager"
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
}) => {
  const fleetCategories = (
    config?.fleet?.length ? config.fleet : DEFAULT_PUBLIC_CONFIG.fleet
  ).filter((f) => f.is_active === 1);

  const [step, setStep] = useState<number>(1);
  const totalSteps = 6;

  // Form fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [referencePhone, setReferencePhone] = useState('');
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

  const [saving, setSaving] = useState(false);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const getDoc = (type: PartnerDocument['doc_type']) => documents.find((d) => d.doc_type === type);

  const handleDocumentUpload = async (docType: PartnerDocument['doc_type'], file: File) => {
    setUploadingType(docType);
    setMsg(null);
    try {
      const { dataUrl, fileName } = await compressAndReadUploadFile(file, 1280, 0.82);

      // Run AI OCR scan for documents
      let ocr: any = null;
      if (['cnic_front', 'cnic_back', 'driving_licence', 'vehicle_registration'].includes(docType)) {
        try {
          const res = await apiRequest<any>('/api/gemini/ocr', {
            method: 'POST',
            role: 'partner',
            body: { imageDataUrl: dataUrl, docType },
          });
          ocr = res;
          if (ocr) {
            if (ocr.fullName && !fullName) setFullName(ocr.fullName);
            if (ocr.cnicNumber && (docType === 'cnic_front' || docType === 'cnic_back')) {
              setCnicNumber(ocr.cnicNumber);
            }
            if (ocr.licenceNumber && docType === 'driving_licence') {
              setLicenceNumber(ocr.licenceNumber);
            }
            if (ocr.licenceExpiry && docType === 'driving_licence') {
              setLicenceExpiry(ocr.licenceExpiry);
            }
          }
        } catch (err) {
          console.warn('OCR scan warning:', err);
        }
      }

      const existing = getDoc(docType);
      const localDoc: PartnerDocument = {
        id: existing?.id || `DOC-${Date.now()}`,
        partner_id: profile.user_id,
        doc_type: docType,
        file_name: fileName,
        file_data_url: dataUrl,
        status: 'pending',
        expiry_date: existing?.expiry_date || '',
        review_notes: '',
        is_public: docType === 'profile_photo' || docType === 'vehicle_photo' ? 1 : 0,
        uploaded_at: new Date().toISOString(),
      };

      try {
        const apiRes = await apiRequest<{ document?: PartnerDocument }>('/api/partner/documents', {
          method: 'POST',
          role: 'partner',
          body: {
            docType,
            fileName,
            fileDataUrl: dataUrl,
            expiryDate: existing?.expiry_date || '',
            isPublic: localDoc.is_public === 1,
          },
        });
        onLocalDocumentSaved?.(apiRes.document || localDoc);
        await onRefresh();
      } catch (err: any) {
        if (isBackendOfflineError(err)) {
          onLocalDocumentSaved?.(localDoc);
        } else {
          throw err;
        }
      }

      if (ocr?.imageQuality && ocr.imageQuality !== 'sharp') {
        setMsg(
          tr(
            lang,
            `⚠️ Image Quality Notice: ${ocr.qualityMessage || 'Please upload a sharper, clearer photo.'}`,
            `⚠️ تصویر دھندلی ہے۔ براہ کرم زیادہ واضح تصویر اپ لوڈ کریں۔`
          )
        );
      } else {
        setMsg(
          tr(
            lang,
            `✨ Document uploaded & scanned successfully! Review details below.`,
            `✨ دستاویز کامیابی سے اپ لوڈ اور اسکین ہو گئی ہے۔`
          )
        );
      }
    } catch (err: any) {
      setMsg(err?.message || tr(lang, 'Upload failed. Please try again.', 'اپ لوڈ ناکام ہو گیا۔'));
    } finally {
      setUploadingType(null);
    }
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await apiRequest('/api/partner/registration', {
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
        tr(
          lang,
          '🎉 Registration submitted successfully! Pending Admin approval.',
          '🎉 رجسٹریشن کامیابی سے جمع ہو گئی ہے! ایڈمن کی منظوری کا انتظار ہے۔'
        )
      );
      await onRefresh();
    } catch (err: any) {
      setMsg(err?.message || tr(lang, 'Submission failed.', 'جمع کرانا ناکام ہو گیا۔'));
    } finally {
      setSaving(false);
    }
  };

  const stepTitles = [
    { num: 1, titleEn: 'Selfie', titleUr: 'سیلفی' },
    { num: 2, titleEn: 'CNIC', titleUr: 'شناختی کارڈ' },
    { num: 3, titleEn: 'Licence', titleUr: 'ڈرائیونگ لائسنس' },
    { num: 4, titleEn: 'Vehicle Book', titleUr: 'گاڑی کی بک' },
    { num: 5, titleEn: 'Vehicle Photos', titleUr: 'گاڑی کی تصاویر' },
    { num: 6, titleEn: 'Basic Info & Submit', titleUr: 'بنیادی معلومات اور سبمٹ' },
  ];

  return (
    <div className="space-y-6 w-full max-w-3xl mx-auto pb-12">
      {/* Progress Bar Header */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#D4A017]">
              {tr(lang, `Step ${step} of ${totalSteps}`, `مرحلہ ${step} از ${totalSteps}`)}
            </span>
            <h2 className="font-display text-lg font-bold text-[#0D0D10]">
              {lang === 'ur' ? stepTitles[step - 1].titleUr : stepTitles[step - 1].titleEn}
            </h2>
          </div>
          <span className="px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-mono text-xs font-bold">
            {Math.round((step / totalSteps) * 100)}% {tr(lang, 'Completed', 'مکمل')}
          </span>
        </div>

        <div className="w-full bg-zinc-100 h-2 rounded-full overflow-hidden">
          <div
            className="bg-[#D4A017] h-full transition-all duration-300"
            style={{ width: `${(step / totalSteps) * 100}%` }}
          />
        </div>

        <div className="hidden sm:grid grid-cols-6 gap-1 pt-1">
          {stepTitles.map((st) => (
            <button
              key={st.num}
              type="button"
              onClick={() => setStep(st.num)}
              className={`text-[10px] font-bold py-1 px-1 rounded-lg border text-center truncate transition-all ${
                step === st.num
                  ? 'border-[#D4A017] bg-[#D4A017]/15 text-[#0D0D10]'
                  : st.num < step
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-zinc-200 text-zinc-400'
              }`}
            >
              {st.num}. {lang === 'ur' ? st.titleUr : st.titleEn}
            </button>
          ))}
        </div>
      </div>

      {msg && (
        <div className="rounded-xl bg-[#0D0D10] text-[#F4C430] px-4 py-3 text-xs font-semibold shadow-md flex items-center justify-between">
          <span>{msg}</span>
          <button type="button" onClick={() => setMsg(null)} className="text-zinc-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Step 1: Selfie Upload */}
      {step === 1 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-5 shadow-sm">
          <div className="space-y-1">
            <h3 className="font-display text-base font-bold flex items-center gap-2">
              <Camera className="w-5 h-5 text-[#D4A017]" />
              {tr(lang, '1. Pro Partner Live Selfie / Profile Photo', '1. پرو پارٹنر لائیو سیلفی یا پروفائل تصویر')}
            </h3>
            <p className="text-xs text-zinc-500">
              {tr(
                lang,
                'Upload a clear, front-facing live photo of yourself. If unclear, you can retake anytime.',
                'اپنی واضح سامنے کی تصویر اپ لوڈ کریں۔ اگر تصویر واضح نہ ہو تو دوبارہ لیں۔'
              )}
            </p>
          </div>

          <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-zinc-200 rounded-2xl bg-zinc-50/50 space-y-4">
            {getDoc('profile_photo')?.file_data_url ? (
              <div className="relative w-36 h-36 rounded-2xl overflow-hidden border-2 border-[#D4A017] shadow-md">
                <img src={getDoc('profile_photo')?.file_data_url} alt="Selfie" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-24 h-24 rounded-full bg-zinc-200 flex items-center justify-center text-zinc-400">
                <Camera className="w-8 h-8" />
              </div>
            )}

            <div className="flex flex-wrap gap-2 justify-center">
              <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0D0D10] text-white text-xs font-bold hover:bg-zinc-800 cursor-pointer shadow-md">
                {uploadingType === 'profile_photo' ? <Loader2 className="w-4 h-4 animate-spin text-[#D4A017]" /> : <Upload className="w-4 h-4" />}
                <span>{getDoc('profile_photo') ? tr(lang, 'Retake / Change Selfie', 'سیلفی دوبارہ لیں') : tr(lang, 'Take / Upload Selfie', 'سیلفی اپ لوڈ کریں')}</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void handleDocumentUpload('profile_photo', f);
                  }}
                />
              </label>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-zinc-100">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold hover:bg-amber-400 shadow-sm"
            >
              <span>{tr(lang, 'Continue to CNIC', 'شناختی کارڈ پر جائیں')}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: CNIC Front & Back with AI OCR */}
      {step === 2 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-6 shadow-sm">
          <div className="space-y-1">
            <h3 className="font-display text-base font-bold flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-[#D4A017]" />
              {tr(lang, '2. CNIC Front & Back (AI Auto-Scan)', '2. شناختی کارڈ فرنٹ اور بیک (AI خودکار اسکین)')}
            </h3>
            <p className="text-xs text-zinc-500">
              {tr(
                lang,
                'Upload CNIC Front first, then CNIC Back. AI OCR automatically extracts your Name, CNIC Number, and Date of Birth.',
                'پہلے فرنٹ اور پھر بیک تصویر اپلوڈ کریں۔ OCR خودکار طور پر آپ کا نام اور شناختی کارڈ نمبر پڑھ لے گا۔'
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Front */}
            <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50 space-y-3">
              <div className="text-xs font-bold text-zinc-700">{tr(lang, 'CNIC Front Copy', 'شناختی کارڈ فرنٹ')}</div>
              {getDoc('cnic_front')?.file_data_url ? (
                <div className="relative h-32 rounded-lg overflow-hidden border border-zinc-200 bg-white">
                  <img src={getDoc('cnic_front')?.file_data_url} alt="CNIC Front" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="h-32 rounded-lg border-2 border-dashed border-zinc-300 flex items-center justify-center text-zinc-400 text-xs">
                  {tr(lang, 'No Front Uploaded', 'فرنٹ اپلوڈ نہیں')}
                </div>
              )}
              <label className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#0D0D10] text-white text-xs font-bold cursor-pointer">
                {uploadingType === 'cnic_front' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                <span>{getDoc('cnic_front') ? tr(lang, 'Retake Front', 'فرنٹ دوبارہ لیں') : tr(lang, 'Upload Front', 'فرنٹ اپلوڈ کریں')}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void handleDocumentUpload('cnic_front', f);
                  }}
                />
              </label>
            </div>

            {/* Back */}
            <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50 space-y-3">
              <div className="text-xs font-bold text-zinc-700">{tr(lang, 'CNIC Back Copy', 'شناختی کارڈ بیک')}</div>
              {getDoc('cnic_back')?.file_data_url ? (
                <div className="relative h-32 rounded-lg overflow-hidden border border-zinc-200 bg-white">
                  <img src={getDoc('cnic_back')?.file_data_url} alt="CNIC Back" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="h-32 rounded-lg border-2 border-dashed border-zinc-300 flex items-center justify-center text-zinc-400 text-xs">
                  {tr(lang, 'No Back Uploaded', 'بیک اپلوڈ نہیں')}
                </div>
              )}
              <label className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#0D0D10] text-white text-xs font-bold cursor-pointer">
                {uploadingType === 'cnic_back' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                <span>{getDoc('cnic_back') ? tr(lang, 'Retake Back', 'بیک دوبارہ لیں') : tr(lang, 'Upload Back', 'بیک اپلوڈ کریں')}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void handleDocumentUpload('cnic_back', f);
                  }}
                />
              </label>
            </div>
          </div>

          {/* OCR Extracted Data Preview & Verification */}
          <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 space-y-3">
            <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#D4A017]" />
              {tr(lang, 'AI OCR Extracted Information (Verify & Correct if needed):', 'AI OCR سے پڑھی گئی معلومات (تصدیق کریں):')}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">{tr(lang, 'CNIC Number', 'شناختی کارڈ نمبر')}</label>
                <input
                  value={cnicNumber}
                  onChange={(e) => setCnicNumber(e.target.value)}
                  placeholder="37405-XXXXXXX-X"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 font-mono text-xs bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">{tr(lang, 'CNIC Expiry Date', 'میعاد تاریخ')}</label>
                <input
                  type="date"
                  value={cnicExpiry}
                  onChange={(e) => setCnicExpiry(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs bg-white"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t border-zinc-100">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-700"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>{tr(lang, 'Back', 'پچھلا')}</span>
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold hover:bg-amber-400 shadow-sm"
            >
              <span>{tr(lang, 'Continue to Licence', 'لائسنس پر جائیں')}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Driving License */}
      {step === 3 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-6 shadow-sm">
          <div className="space-y-1">
            <h3 className="font-display text-base font-bold flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-[#D4A017]" />
              {tr(lang, '3. Driving Licence (AI Auto-Scan)', '3. ڈرائیونگ لائسنس (AI خودکار اسکین)')}
            </h3>
            <p className="text-xs text-zinc-500">
              {tr(
                lang,
                'Upload your valid driving licence photo. OCR will automatically extract your licence number and expiry date.',
                'اپنے کارآمد ڈرائیونگ لائسنس کی تصویر اپ لوڈ کریں۔ OCR خودکار طور پر نمبر اور تاریخ پڑھ لے گا۔'
              )}
            </p>
          </div>

          <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-zinc-200 rounded-2xl bg-zinc-50/50 space-y-4">
            {getDoc('driving_licence')?.file_data_url ? (
              <div className="relative w-full max-w-sm h-40 rounded-xl overflow-hidden border border-zinc-200 bg-white shadow-sm">
                <img src={getDoc('driving_licence')?.file_data_url} alt="Driving Licence" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-xl bg-zinc-200 flex items-center justify-center text-zinc-400">
                <FileCheck2 className="w-8 h-8" />
              </div>
            )}

            <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0D0D10] text-white text-xs font-bold cursor-pointer shadow-md">
              {uploadingType === 'driving_licence' ? <Loader2 className="w-4 h-4 animate-spin text-[#D4A017]" /> : <Upload className="w-4 h-4" />}
              <span>{getDoc('driving_licence') ? tr(lang, 'Retake / Change Licence', 'لائسنس دوبارہ لیں') : tr(lang, 'Upload Driving Licence', 'لائسنس اپ لوڈ کریں')}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void handleDocumentUpload('driving_licence', f);
                }}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50/50 text-xs">
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">{tr(lang, 'Licence Number', 'لائسنس نمبر')}</label>
              <input
                value={licenceNumber}
                onChange={(e) => setLicenceNumber(e.target.value)}
                placeholder="ISB-123456"
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 font-mono text-xs bg-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">{tr(lang, 'Licence Expiry', 'لائسنس کی میعاد')}</label>
              <input
                type="date"
                value={licenceExpiry}
                onChange={(e) => setLicenceExpiry(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs bg-white"
              />
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t border-zinc-100">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-700"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>{tr(lang, 'Back', 'پچھلا')}</span>
            </button>
            <button
              type="button"
              onClick={() => setStep(4)}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold hover:bg-amber-400 shadow-sm"
            >
              <span>{tr(lang, 'Continue to Vehicle Book', 'گاڑی کی بک پر جائیں')}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Vehicle Registration Book / Smart Card */}
      {step === 4 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-6 shadow-sm">
          <div className="space-y-1">
            <h3 className="font-display text-base font-bold flex items-center gap-2">
              <CarFront className="w-5 h-5 text-[#D4A017]" />
              {tr(lang, '4. Vehicle Registration Book / Smart Card', '4. گاڑی کی رجسٹریشن بک / اسمارٹ کارڈ')}
            </h3>
            <p className="text-xs text-zinc-500">
              {tr(
                lang,
                'Upload the vehicle registration book or smart card. AI OCR extracts your vehicle registration number and make.',
                'گاڑی کی رجسٹریشن بک یا اسمارٹ کارڈ اپ لوڈ کریں۔ AI OCR نمبر اور گاڑی کی تفصیلات خودکار پڑھ لے گا۔'
              )}
            </p>
          </div>

          <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-zinc-200 rounded-2xl bg-zinc-50/50 space-y-4">
            {getDoc('vehicle_registration')?.file_data_url ? (
              <div className="relative w-full max-w-sm h-40 rounded-xl overflow-hidden border border-zinc-200 bg-white shadow-sm">
                <img src={getDoc('vehicle_registration')?.file_data_url} alt="Vehicle Book" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-xl bg-zinc-200 flex items-center justify-center text-zinc-400">
                <CarFront className="w-8 h-8" />
              </div>
            )}

            <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0D0D10] text-white text-xs font-bold cursor-pointer shadow-md">
              {uploadingType === 'vehicle_registration' ? <Loader2 className="w-4 h-4 animate-spin text-[#D4A017]" /> : <Upload className="w-4 h-4" />}
              <span>{getDoc('vehicle_registration') ? tr(lang, 'Retake / Change Book', 'بک دوبارہ لیں') : tr(lang, 'Upload Vehicle Book', 'رجسٹریشن بک اپ لوڈ کریں')}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void handleDocumentUpload('vehicle_registration', f);
                }}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl border border-zinc-200 bg-zinc-50 text-xs">
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">{tr(lang, 'Vehicle Plate Number', 'نمبر پلیٹ')}</label>
              <input
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                placeholder="LEA-4512"
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 font-mono uppercase text-xs bg-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">{tr(lang, 'Vehicle Make & Model', 'گاڑی کا ماڈل')}</label>
              <input
                value={vehicleName}
                onChange={(e) => setVehicleName(e.target.value)}
                placeholder="Suzuki Every / Corolla GLi"
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs bg-white"
              />
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t border-zinc-100">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-700"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>{tr(lang, 'Back', 'پچھلا')}</span>
            </button>
            <button
              type="button"
              onClick={() => setStep(5)}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold hover:bg-amber-400 shadow-sm"
            >
              <span>{tr(lang, 'Continue to Vehicle Photos', 'گاڑی کی تصاویر پر جائیں')}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Vehicle Exterior Photos */}
      {step === 5 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-6 shadow-sm">
          <div className="space-y-1">
            <h3 className="font-display text-base font-bold flex items-center gap-2">
              <CarFront className="w-5 h-5 text-[#D4A017]" />
              {tr(lang, '5. Vehicle Exterior Photo (with Number Plate)', '5. گاڑی کی بیرونی تصویر (نمبر پلیٹ سمیت)')}
            </h3>
            <p className="text-xs text-zinc-500">
              {tr(
                lang,
                'Upload a clear exterior photo of your vehicle showing the front/rear number plate clearly.',
                'گاڑی کی ایسی واضح تصویر اپ لوڈ کریں جس میں نمبر پلیٹ صاف دکھائی دے رہی ہو۔'
              )}
            </p>
          </div>

          <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-zinc-200 rounded-2xl bg-zinc-50/50 space-y-4">
            {getDoc('vehicle_photo')?.file_data_url ? (
              <div className="relative w-full max-w-sm h-40 rounded-xl overflow-hidden border border-zinc-200 bg-white shadow-sm">
                <img src={getDoc('vehicle_photo')?.file_data_url} alt="Vehicle Photo" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-xl bg-zinc-200 flex items-center justify-center text-zinc-400">
                <CarFront className="w-8 h-8" />
              </div>
            )}

            <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0D0D10] text-white text-xs font-bold cursor-pointer shadow-md">
              {uploadingType === 'vehicle_photo' ? <Loader2 className="w-4 h-4 animate-spin text-[#D4A017]" /> : <Upload className="w-4 h-4" />}
              <span>{getDoc('vehicle_photo') ? tr(lang, 'Retake / Change Photo', 'تصویر دوبارہ لیں') : tr(lang, 'Upload Vehicle Photo', 'گاڑی کی تصویر اپ لوڈ کریں')}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void handleDocumentUpload('vehicle_photo', f);
                }}
              />
            </label>
          </div>

          <div className="flex justify-between pt-4 border-t border-zinc-100">
            <button
              type="button"
              onClick={() => setStep(4)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-700"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>{tr(lang, 'Back', 'پچھلا')}</span>
            </button>
            <button
              type="button"
              onClick={() => setStep(6)}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold hover:bg-amber-400 shadow-sm"
            >
              <span>{tr(lang, 'Continue to Final Info', 'آخری معلومات پر جائیں')}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 6: Basic Information (Only Manual Input) & Final Submit */}
      {step === 6 && (
        <form onSubmit={handleFinalSubmit} className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-6 shadow-sm">
          <div className="space-y-1">
            <h3 className="font-display text-base font-bold flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#D4A017]" />
              {tr(lang, '6. Basic Information & Final Submission', '6. بنیادی معلومات اور حتمی سبمشن')}
            </h3>
            <p className="text-xs text-zinc-500">
              {tr(
                lang,
                'Please enter your manual contact details, select your vehicle category, and submit your registration for Admin approval.',
                'براہ کرم اپنی رابطہ کی معلومات درج کریں اور ایڈمن کی منظوری کے لیے رجسٹریشن جمع کروائیں۔'
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">{tr(lang, 'Full Name (Manual)', 'پورا نام')}</label>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Muhammad Ali"
                className="w-full px-3 py-2 rounded-xl border border-zinc-300 bg-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">{tr(lang, 'Mobile Number', 'موبائل نمبر')}</label>
              <input
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="03125007782"
                className="w-full px-3 py-2 rounded-xl border border-zinc-300 font-mono bg-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">{tr(lang, 'Reference Mobile Number', 'حوالہ / ایمرجنسی موبائل نمبر')}</label>
              <input
                required
                value={referencePhone}
                onChange={(e) => setReferencePhone(e.target.value)}
                placeholder="03001234567"
                className="w-full px-3 py-2 rounded-xl border border-zinc-300 font-mono bg-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">{tr(lang, 'Operating City', 'آپریٹنگ سٹی')}</label>
              <select value={operatingCity} onChange={(e) => setOperatingCity(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-zinc-300 bg-white">
                <option value="Islamabad">Islamabad</option>
                <option value="Rawalpindi">Rawalpindi</option>
                <option value="Lahore">Lahore</option>
                <option value="Karachi">Karachi</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-semibold text-zinc-700">
              {tr(lang, 'Select Vehicle Category (including Van · 7-seater)', 'گاڑی کی کیٹگری منتخب کریں')}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {fleetCategories.map((f) => {
                const active = vehicleCategoryId === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setVehicleCategoryId(f.id);
                      if (f.seating_capacity) setSeatingCapacity(f.seating_capacity);
                    }}
                    className={`p-2.5 rounded-xl border text-start transition-all flex items-center gap-2 ${
                      active ? 'border-[#D4A017] bg-[#D4A017]/15 ring-1 ring-[#D4A017]' : 'border-zinc-200 bg-white'
                    }`}
                  >
                    <VehicleImage src={f.image_url} alt={f.name} categorySlug={f.slug} className="w-12 h-9 rounded-lg border shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold truncate">{formatVehicleLabel(f.name, lang)}</div>
                      <div className="text-[10px] text-zinc-500 font-mono">{f.seating_capacity} seats</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-zinc-700">
              {tr(lang, 'Service Eligibility Preferences', 'سروس کی اقسام')}
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
                        setServices((prev) => (checked ? prev.filter((x) => x !== id) : [...prev, id]))
                      }
                      className="accent-[#D4A017]"
                    />
                    <span className="font-semibold">{trService(lang, id)}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t border-zinc-100">
            <button
              type="button"
              onClick={() => setStep(5)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-700"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>{tr(lang, 'Back', 'پچھلا')}</span>
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 shadow-md"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>{tr(lang, 'Submit Registration for Admin Approval', 'ایڈمن منظوری کے لیے رجسٹریشن جمع کروائیں')}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
