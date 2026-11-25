import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
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
  Save,
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
import { useToast } from '../../contexts/ToastContext';
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
                <span className="relative bg-[var(--pr-surface)] px-3 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
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

const SHARED_PARTNER_SUBMISSIONS_KEY = 'pr_shared_partner_submissions';

function cleanPhoneDisplay(raw?: string | null): string {
  const val = String(raw || '').trim();
  if (!val) return '';
  if (/^(G-|E-|R-)/i.test(val)) return '';
  return val;
}

function getDraftStorageKey(partnerId: string) {
  return `pr_partner_reg_draft_${partnerId || 'guest'}`;
}

interface PartnerRegDraft {
  step?: number;
  fullName?: string;
  phone?: string;
  referencePhone?: string;
  cnicNumber?: string;
  cnicExpiry?: string;
  licenceNumber?: string;
  licenceExpiry?: string;
  vehicleCategoryId?: string;
  vehicleName?: string;
  vehicleNumber?: string;
  seatingCapacity?: number;
  fuelType?: string;
  operatingCity?: string;
  services?: ServiceType[];
  updatedAt?: string;
}

function readPartnerDraft(partnerId: string): PartnerRegDraft | null {
  try {
    const raw = localStorage.getItem(getDraftStorageKey(partnerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as PartnerRegDraft) : null;
  } catch {
    return null;
  }
}

function writePartnerDraft(partnerId: string, draft: PartnerRegDraft) {
  try {
    localStorage.setItem(getDraftStorageKey(partnerId), JSON.stringify(draft));
  } catch {
    // ignore quota errors
  }
}

function upsertSharedPartnerSubmission(entry: {
  user_id: string;
  full_name: string;
  email: string;
  phone: string;
  reference_phone: string;
  cnic_number: string;
  cnic_expiry: string;
  licence_number: string;
  licence_expiry: string;
  vehicle_category_id: string;
  vehicle_name: string;
  vehicle_number: string;
  seating_capacity: number;
  fuel_type: string;
  operating_city: string;
  service_eligibility: ServiceType[];
  verification_status: string;
  admin_notes?: string;
  documents: PartnerDocument[];
}) {
  try {
    const raw = localStorage.getItem(SHARED_PARTNER_SUBMISSIONS_KEY);
    const list: any[] = raw ? JSON.parse(raw) : [];
    const safeList = Array.isArray(list) ? list : [];
    const idx = safeList.findIndex((p) => p?.user_id === entry.user_id || p?.id === entry.user_id);
    const record = {
      id: entry.user_id,
      ...entry,
      wallet_balance_pkr: safeList[idx]?.wallet_balance_pkr ?? 0,
      updated_at: new Date().toISOString(),
    };
    if (idx >= 0) {
      safeList[idx] = { ...safeList[idx], ...record };
    } else {
      safeList.unshift(record);
    }
    localStorage.setItem(SHARED_PARTNER_SUBMISSIONS_KEY, JSON.stringify(safeList.slice(0, 30)));
  } catch {
    // ignore quota errors
  }
}

// Screens 18, 19, 26, 27: Partner Registration, Vehicle Management & Document Verification
export const PartnerVerificationAndVehicleView: React.FC<{
  mode: 'documents' | 'vehicle';
  lang?: Language;
  user?: User | null;
  profile: PartnerProfile;
  documents: PartnerDocument[];
  config: PublicConfig | null;
  onRefresh: () => Promise<void>;
  onUserUpdated?: (user: User) => void;
  onProfileUpdated?: (profile: PartnerProfile) => void;
  onLocalDocumentSaved?: (doc: PartnerDocument) => void;
  onToggleDocVisibility?: (docType: PartnerDocument['doc_type'], isPublic: boolean) => Promise<void> | void;
}> = ({
  mode,
  lang = 'en',
  user,
  profile,
  documents,
  config,
  onRefresh,
  onUserUpdated,
  onProfileUpdated,
  onLocalDocumentSaved,
}) => {
  const { isDark } = useTheme();
  const { firebaseUser, syncPartnerApplication, syncPartnerDocument } = useFirebase();
  const partnerId = user?.id || profile.user_id || 'guest';

  const fleetCategories = (
    config?.fleet?.length ? config.fleet : DEFAULT_PUBLIC_CONFIG.fleet
  ).filter((f) => f.is_active === 1);

  const initialDraft = readPartnerDraft(partnerId);
  const totalSteps = 6;

  const [step, setStep] = useState<number>(() => {
    if (mode === 'vehicle') return 4;
    if (initialDraft?.step && initialDraft.step >= 1 && initialDraft.step <= 6) {
      return initialDraft.step;
    }
    return 1;
  });

  // Persistent per-ID form fields (never cleared on tab switch or refresh)
  const [fullName, setFullName] = useState(
    () => initialDraft?.fullName || user?.full_name || ''
  );
  const [phone, setPhone] = useState(
    () => initialDraft?.phone || cleanPhoneDisplay(user?.phone)
  );
  const [referencePhone, setReferencePhone] = useState(
    () => initialDraft?.referencePhone || profile.reference_phone || ''
  );
  const [cnicNumber, setCnicNumber] = useState(
    () => initialDraft?.cnicNumber || profile.cnic_number || ''
  );
  const [cnicExpiry, setCnicExpiry] = useState(
    () => initialDraft?.cnicExpiry || profile.cnic_expiry || ''
  );
  const [licenceNumber, setLicenceNumber] = useState(
    () => initialDraft?.licenceNumber || profile.licence_number || ''
  );
  const [licenceExpiry, setLicenceExpiry] = useState(
    () => initialDraft?.licenceExpiry || profile.licence_expiry || ''
  );
  const [vehicleCategoryId, setVehicleCategoryId] = useState(
    () =>
      initialDraft?.vehicleCategoryId ||
      profile.vehicle_category_id ||
      fleetCategories[0]?.id ||
      'fleet-sedan'
  );
  const [vehicleName, setVehicleName] = useState(
    () => initialDraft?.vehicleName || profile.vehicle_name || ''
  );
  const [vehicleNumber, setVehicleNumber] = useState(
    () => initialDraft?.vehicleNumber || profile.vehicle_number || ''
  );
  const [seatingCapacity, setSeatingCapacity] = useState(
    () => initialDraft?.seatingCapacity || profile.seating_capacity || 4
  );
  const [fuelType, setFuelType] = useState(
    () => initialDraft?.fuelType || profile.fuel_type || 'Petrol'
  );
  const [operatingCity, setOperatingCity] = useState(
    () => initialDraft?.operatingCity || profile.operating_city || user?.city || 'Islamabad'
  );
  const [services, setServices] = useState<ServiceType[]>(() =>
    initialDraft?.services?.length
      ? initialDraft.services
      : profile.service_eligibility?.length
      ? profile.service_eligibility
      : ['pick_and_drop']
  );

  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [uploadingType, setUploadingType] = useState<string | null>(null);

  // If partner switches to Vehicle mode from sidebar, jump straight to vehicle step if earlier
  useEffect(() => {
    if (mode === 'vehicle' && step < 4) {
      setStep(4);
    }
  }, [mode]);

  // Reload draft cleanly if the logged-in Partner ID changes
  const [hydratedId, setHydratedId] = useState(partnerId);
  useEffect(() => {
    if (partnerId === hydratedId) return;
    const d = readPartnerDraft(partnerId);
    setFullName(d?.fullName || user?.full_name || '');
    setPhone(d?.phone || cleanPhoneDisplay(user?.phone));
    setReferencePhone(d?.referencePhone || profile.reference_phone || '');
    setCnicNumber(d?.cnicNumber || profile.cnic_number || '');
    setCnicExpiry(d?.cnicExpiry || profile.cnic_expiry || '');
    setLicenceNumber(d?.licenceNumber || profile.licence_number || '');
    setLicenceExpiry(d?.licenceExpiry || profile.licence_expiry || '');
    setVehicleCategoryId(d?.vehicleCategoryId || profile.vehicle_category_id || fleetCategories[0]?.id || 'fleet-sedan');
    setVehicleName(d?.vehicleName || profile.vehicle_name || '');
    setVehicleNumber(d?.vehicleNumber || profile.vehicle_number || '');
    setSeatingCapacity(d?.seatingCapacity || profile.seating_capacity || 4);
    setFuelType(d?.fuelType || profile.fuel_type || 'Petrol');
    setOperatingCity(d?.operatingCity || profile.operating_city || user?.city || 'Islamabad');
    setServices(
      d?.services?.length
        ? d.services
        : profile.service_eligibility?.length
        ? profile.service_eligibility
        : ['pick_and_drop']
    );
    setHydratedId(partnerId);
  }, [partnerId, hydratedId, user, profile, fleetCategories]);

  // Fill empty fields from server/cloud profile whenever profile/user updates (without overwriting user edits)
  useEffect(() => {
    setFullName((prev) => prev || user?.full_name || '');
    setPhone((prev) => prev || cleanPhoneDisplay(user?.phone));
    setReferencePhone((prev) => prev || profile.reference_phone || '');
    setCnicNumber((prev) => prev || profile.cnic_number || '');
    setCnicExpiry((prev) => prev || profile.cnic_expiry || '');
    setLicenceNumber((prev) => prev || profile.licence_number || '');
    setLicenceExpiry((prev) => prev || profile.licence_expiry || '');
    setVehicleName((prev) => prev || profile.vehicle_name || '');
    setVehicleNumber((prev) => prev || profile.vehicle_number || '');
    if (profile.vehicle_category_id) {
      setVehicleCategoryId((prev) => prev || profile.vehicle_category_id);
    }
    if (profile.operating_city) {
      setOperatingCity((prev) => prev || profile.operating_city);
    }
  }, [user?.full_name, user?.phone, profile]);

  // Continuously persist draft per Partner ID so entered data is NEVER lost
  useEffect(() => {
    writePartnerDraft(partnerId, {
      step,
      fullName,
      phone,
      referencePhone,
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
      services,
      updatedAt: new Date().toISOString(),
    });
  }, [
    partnerId,
    step,
    fullName,
    phone,
    referencePhone,
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
    services,
  ]);

  const getDoc = (type: PartnerDocument['doc_type']) => documents.find((d) => d.doc_type === type);

  const phoneDigits = phone.replace(/\D/g, '');
  const refDigits = referencePhone.replace(/\D/g, '');

  const readinessItems = [
    {
      step: 1,
      done: Boolean(getDoc('profile_photo')?.file_data_url),
      label: tr(lang, 'Live Selfie Photo', 'لائیو سیلفی تصویر'),
    },
    {
      step: 2,
      done: Boolean(getDoc('cnic_front')?.file_data_url && cnicNumber.trim().length >= 5),
      label: tr(lang, 'CNIC Copy & Number', 'شناختی کارڈ کاپی اور نمبر'),
    },
    {
      step: 3,
      done: Boolean(getDoc('driving_licence')?.file_data_url || licenceNumber.trim().length >= 3),
      label: tr(lang, 'Driving Licence', 'ڈرائیونگ لائسنس'),
    },
    {
      step: 4,
      done: Boolean(getDoc('vehicle_registration')?.file_data_url || (vehicleNumber.trim() && vehicleName.trim())),
      label: tr(lang, 'Vehicle Book & Plate', 'گاڑی کی بک اور نمبر پلیٹ'),
    },
    {
      step: 5,
      done: Boolean(getDoc('vehicle_photo')?.file_data_url),
      label: tr(lang, 'Vehicle Exterior Photo', 'گاڑی کی بیرونی تصویر'),
    },
    {
      step: 6,
      done: Boolean(fullName.trim().length >= 2 && phoneDigits.length >= 10 && refDigits.length >= 10 && operatingCity),
      label: tr(lang, 'Contact & Reference Info', 'رابطہ اور حوالہ نمبر'),
    },
  ];

  const completedChecksCount = readinessItems.filter((item) => item.done).length;
  const realCompletionPct = Math.round((completedChecksCount / readinessItems.length) * 100);

  const persistSnapshotLocally = (nextStatus: PartnerProfile['verification_status'], nextDocs = documents) => {
    const cleanName = fullName.trim() || user?.full_name || 'Pro Partner';
    const cleanPhone = phone.trim() || cleanPhoneDisplay(user?.phone);
    const updatedUser: User = {
      ...(user || {
        id: partnerId,
        role: 'partner',
        full_name: cleanName,
        phone: cleanPhone,
        whatsapp: cleanPhone,
        email: firebaseUser?.email || '',
        city: operatingCity,
        phone_verified: 1,
        created_at: new Date().toISOString(),
      }),
      full_name: cleanName,
      phone: cleanPhone || user?.phone || '',
      city: operatingCity,
    };
    const updatedProfile: PartnerProfile = {
      ...profile,
      user_id: partnerId,
      reference_phone: referencePhone.trim(),
      cnic_number: cnicNumber.trim(),
      cnic_expiry: cnicExpiry,
      licence_number: licenceNumber.trim(),
      licence_expiry: licenceExpiry,
      vehicle_category_id: vehicleCategoryId,
      vehicle_name: vehicleName.trim(),
      vehicle_number: vehicleNumber.trim().toUpperCase(),
      seating_capacity: Number(seatingCapacity) || 4,
      fuel_type: fuelType,
      operating_city: operatingCity,
      service_eligibility: services.length ? services : ['pick_and_drop'],
      verification_status: nextStatus,
    };
    onUserUpdated?.(updatedUser);
    onProfileUpdated?.(updatedProfile);
    upsertSharedPartnerSubmission({
      user_id: partnerId,
      full_name: cleanName,
      email: updatedUser.email || firebaseUser?.email || '',
      phone: cleanPhone,
      reference_phone: referencePhone.trim(),
      cnic_number: cnicNumber.trim(),
      cnic_expiry: cnicExpiry,
      licence_number: licenceNumber.trim(),
      licence_expiry: licenceExpiry,
      vehicle_category_id: vehicleCategoryId,
      vehicle_name: vehicleName.trim(),
      vehicle_number: vehicleNumber.trim().toUpperCase(),
      seating_capacity: Number(seatingCapacity) || 4,
      fuel_type: fuelType,
      operating_city: operatingCity,
      service_eligibility: services.length ? services : ['pick_and_drop'],
      verification_status: nextStatus,
      admin_notes: profile.admin_notes || '',
      documents: nextDocs,
    });
    return { updatedUser, updatedProfile };
  };

  const handleDocumentUpload = async (docType: PartnerDocument['doc_type'], file: File) => {
    setUploadingType(docType);
    try {
      const { dataUrl, fileName } = await compressAndReadUploadFile(file, 1280, 0.82);

      // Run AI OCR scan for supported documents (best-effort, non-blocking)
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
            if (ocr.vehicleNumber && docType === 'vehicle_registration') {
              setVehicleNumber(ocr.vehicleNumber);
            }
            if (ocr.vehicleName && docType === 'vehicle_registration' && !vehicleName) {
              setVehicleName(ocr.vehicleName);
            }
          }
        } catch {
          // OCR is optional when backend is unavailable
        }
      }

      const existing = getDoc(docType);
      const localDoc: PartnerDocument = {
        id: existing?.id || `DOC-${Date.now()}`,
        partner_id: partnerId,
        doc_type: docType,
        file_name: fileName,
        file_data_url: dataUrl,
        status: 'pending',
        expiry_date: existing?.expiry_date || '',
        review_notes: '',
        is_public: docType === 'profile_photo' || docType === 'vehicle_photo' ? 1 : 0,
        uploaded_at: new Date().toISOString(),
      };

      const nextDocs = [localDoc, ...documents.filter((d) => d.doc_type !== docType)];
      onLocalDocumentSaved?.(localDoc);
      const nextStatus: PartnerProfile['verification_status'] =
        profile.verification_status === 'approved' ? 'approved' : 'under_review';
      persistSnapshotLocally(nextStatus, nextDocs);

      let syncedToServer = false;
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
        if (apiRes.document) {
          onLocalDocumentSaved?.(apiRes.document);
        }
        syncedToServer = true;
      } catch (err: any) {
        if (!isBackendOfflineError(err)) {
          throw err;
        }
      }

      // Always mirror document to Firestore when signed in with verified Firebase account
      if (firebaseUser?.emailVerified) {
        try {
          await syncPartnerDocument({
            docType,
            fileName,
            fileDataUrl: dataUrl,
            expiryDate: existing?.expiry_date || '',
            isPublic: localDoc.is_public === 1,
            fallbackName: fullName.trim() || user?.full_name || 'Pro Partner',
            fallbackCity: operatingCity,
            fallbackPhone: phone.trim() || cleanPhoneDisplay(user?.phone),
          });
          syncedToServer = true;
        } catch {
          // Firestore non-fatal if local bridge succeeded
        }
      }

      if (syncedToServer) {
        void onRefresh();
      }

      if (ocr?.imageQuality && ocr.imageQuality !== 'sharp') {
        toast.warning(
          tr(
            lang,
            `Document saved, but photo appears blurry: ${ocr.qualityMessage || 'Please upload a sharper copy if needed.'}`,
            `دستاویز محفوظ ہو گئی ہے، مگر تصویر ہلکی دھندلی ہے۔ بہتر منظوری کے لیے صاف تصویر اپ لوڈ کریں۔`
          )
        );
      } else {
        toast.success(
          tr(
            lang,
            'Document uploaded and synced directly for Super Admin review.',
            'دستاویز کامیابی سے محفوظ ہو کر سپر ایڈمن پینل میں بھیج دی گئی ہے۔'
          )
        );
      }
    } catch (err: any) {
      toast.error(err?.message || tr(lang, 'Upload failed. Please try again.', 'اپ لوڈ ناکام ہو گیا۔ براہِ کرم دوبارہ کوشش کریں۔'));
    } finally {
      setUploadingType(null);
    }
  };

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    try {
      const nextStatus: PartnerProfile['verification_status'] =
        profile.verification_status === 'approved'
          ? 'approved'
          : documents.length >= 1
          ? 'documents_pending'
          : 'incomplete';
      persistSnapshotLocally(nextStatus, documents);

      try {
        await apiRequest('/api/partner/registration', {
          method: 'PUT',
          role: 'partner',
          body: {
            fullName: fullName.trim(),
            phone: phone.trim(),
            referencePhone: referencePhone.trim(),
            cnicNumber: cnicNumber.trim(),
            cnicExpiry,
            licenceNumber: licenceNumber.trim(),
            licenceExpiry,
            vehicleCategoryId,
            vehicleName: vehicleName.trim(),
            vehicleNumber: vehicleNumber.trim().toUpperCase(),
            seatingCapacity,
            fuelType,
            operatingCity,
            serviceEligibility: services,
            isDraft: true,
          },
        });
      } catch (err: any) {
        if (!isBackendOfflineError(err)) throw err;
      }

      if (firebaseUser?.emailVerified) {
        try {
          await syncPartnerApplication({
            fullName: fullName.trim() || user?.full_name || 'Pro Partner',
            email: user?.email || firebaseUser.email || '',
            phone: phone.trim(),
            referencePhone: referencePhone.trim(),
            cnicNumber: cnicNumber.trim(),
            cnicExpiry,
            licenceNumber: licenceNumber.trim(),
            licenceExpiry,
            vehicleCategoryId,
            vehicleName: vehicleName.trim(),
            vehicleNumber: vehicleNumber.trim().toUpperCase(),
            seatingCapacity,
            fuelType,
            operatingCity,
            serviceEligibility: services,
            docsCount: documents.length,
            isSubmit: false,
          });
        } catch {
          // non-fatal
        }
      }

      toast.success(
        tr(
          lang,
          'Draft saved securely to your Partner ID. Your numbers and details will stay here.',
          'آپ کی معلومات آپ کی آئی ڈی کے ساتھ محفوظ کر لی گئی ہیں، اب یہ دوبارہ نہیں مٹیں گی۔'
        )
      );
    } catch (err: any) {
      toast.error(err?.message || tr(lang, 'Could not save draft.', 'ڈرافٹ محفوظ نہ ہو سکا۔'));
    } finally {
      setSavingDraft(false);
    }
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (fullName.trim().length < 2) {
      toast.error(tr(lang, 'Please enter your complete full name.', 'براہِ کرم اپنا مکمل نام درج کریں۔'));
      return;
    }
    if (phoneDigits.length < 10) {
      toast.error(
        tr(
          lang,
          'Please enter a complete 11-digit mobile number (e.g. 03001234567).',
          'براہِ کرم مکمل 11 ہندسوں کا موبائل نمبر درج کریں (مثال: 03001234567)۔'
        )
      );
      return;
    }
    if (refDigits.length < 10) {
      toast.error(
        tr(
          lang,
          'Please enter a complete 11-digit reference mobile number.',
          'براہِ کرم مکمل 11 ہندسوں کا حوالہ موبائل نمبر درج کریں۔'
        )
      );
      return;
    }

    setSaving(true);
    try {
      const targetStatus: PartnerProfile['verification_status'] =
        profile.verification_status === 'approved'
          ? 'approved'
          : documents.length >= 1
          ? 'under_review'
          : 'documents_pending';

      let expressOk = false;
      let expressRes: { user?: User; partnerProfile?: PartnerProfile; queuedForReview?: boolean; message?: string } | null = null;
      try {
        expressRes = await apiRequest('/api/partner/registration', {
          method: 'PUT',
          role: 'partner',
          body: {
            fullName: fullName.trim(),
            phone: phone.trim(),
            referencePhone: referencePhone.trim(),
            cnicNumber: cnicNumber.trim(),
            cnicExpiry,
            licenceNumber: licenceNumber.trim(),
            licenceExpiry,
            vehicleCategoryId,
            vehicleName: vehicleName.trim(),
            vehicleNumber: vehicleNumber.trim().toUpperCase(),
            seatingCapacity,
            fuelType,
            operatingCity,
            serviceEligibility: services,
            isDraft: false,
          },
        });
        expressOk = true;
      } catch (err: any) {
        if (!isBackendOfflineError(err)) {
          throw err;
        }
      }

      if (expressRes?.user) {
        onUserUpdated?.(expressRes.user);
      }
      if (expressRes?.partnerProfile) {
        onProfileUpdated?.(expressRes.partnerProfile);
      } else {
        persistSnapshotLocally(targetStatus, documents);
      }

      // Sync to Firestore so Admin Panel always receives submitted registration & documents
      if (firebaseUser?.emailVerified) {
        try {
          await syncPartnerApplication({
            fullName: fullName.trim(),
            email: user?.email || firebaseUser.email || '',
            phone: phone.trim(),
            referencePhone: referencePhone.trim(),
            cnicNumber: cnicNumber.trim(),
            cnicExpiry,
            licenceNumber: licenceNumber.trim(),
            licenceExpiry,
            vehicleCategoryId,
            vehicleName: vehicleName.trim(),
            vehicleNumber: vehicleNumber.trim().toUpperCase(),
            seatingCapacity,
            fuelType,
            operatingCity,
            serviceEligibility: services,
            docsCount: documents.length,
            isSubmit: true,
          });
          // Ensure any previously local-only documents are also pushed to Firestore
          for (const docItem of documents) {
            if (docItem.file_data_url) {
              await syncPartnerDocument({
                docType: docItem.doc_type,
                fileName: docItem.file_name,
                fileDataUrl: docItem.file_data_url,
                expiryDate: docItem.expiry_date || '',
                isPublic: docItem.is_public === 1,
                fallbackName: fullName.trim(),
                fallbackCity: operatingCity,
                fallbackPhone: phone.trim(),
              });
            }
          }
        } catch {
          // Local bridge already preserved submission
        }
      }

      if (expressOk) {
        void onRefresh();
      }

      toast.success(
        expressRes?.queuedForReview
          ? tr(
              lang,
              'Updated vehicle details queued for Super Admin review. Your saved records remain intact.',
              'گاڑی کی نئی تفصیلات سپر ایڈمن کی نظرثانی کے لیے بھیج دی گئی ہیں۔'
            )
          : tr(
              lang,
              'Application submitted! Your details and documents are now visible in the Super Admin Panel for approval.',
              'درخواست کامیابی سے جمع ہو گئی ہے! آپ کی تمام تفصیلات اور دستاویزات براہِ راست ایڈمن پینل میں پہنچ چکی ہیں۔'
            )
      );
    } catch (err: any) {
      toast.error(
        err?.message ||
          tr(
            lang,
            'Submission failed. Please verify your entries and try again.',
            'درخواست جمع کرانے میں رکاوٹ پیش آئی۔ براہِ کرم معلومات چیک کر کے دوبارہ کوشش کریں۔'
          )
      );
    } finally {
      setSaving(false);
    }
  };

  const stepTitles = [
    { num: 1, titleEn: 'Live Selfie', titleUr: 'لائیو سیلفی' },
    { num: 2, titleEn: 'CNIC Scan', titleUr: 'شناختی کارڈ' },
    { num: 3, titleEn: 'Driving Licence', titleUr: 'ڈرائیونگ لائسنس' },
    { num: 4, titleEn: 'Vehicle Book', titleUr: 'گاڑی کی بک' },
    { num: 5, titleEn: 'Vehicle Photo', titleUr: 'گاڑی کی تصویر' },
    { num: 6, titleEn: 'Review & Submit', titleUr: 'جائزہ اور سبمٹ' },
  ];

  const cardSurface = isDark
    ? 'border-zinc-800 bg-[#141519] text-zinc-100'
    : 'border-zinc-200 bg-white text-[#0D0D10]';
  const subSurface = isDark
    ? 'border-zinc-800 bg-zinc-900/70'
    : 'border-zinc-200 bg-zinc-50';
  const inputSurface = isDark
    ? 'border-zinc-700 bg-zinc-900 text-white placeholder:text-zinc-500'
    : 'border-zinc-300 bg-white text-[#0D0D10] placeholder:text-zinc-400';
  const labelTone = isDark ? 'text-zinc-300' : 'text-zinc-700';
  const mutedTone = isDark ? 'text-zinc-400' : 'text-zinc-500';
  const urBodyClass = lang === 'ur' ? 'leading-[2.0]' : '';

  const statusTone =
    profile.verification_status === 'approved'
      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
      : profile.verification_status === 'under_review'
      ? 'bg-amber-50 border-amber-300 text-amber-950'
      : profile.verification_status === 'rejected' || profile.verification_status === 'suspended'
      ? 'bg-red-50 border-red-300 text-red-900'
      : 'bg-zinc-100 border-zinc-300 text-zinc-800';

  return (
    <div className="space-y-5 w-full max-w-3xl mx-auto pb-12">
      {/* Verification Status & Persistent ID Strip */}
      <div className={`rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-3 ${statusTone}`}>
        <div className="flex items-start gap-3 min-w-0">
          <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5 text-[#B8860B]" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider">
                {tr(lang, 'Account Status:', 'اکاؤنٹ اسٹیٹس:')} {trVerificationStatus(lang, profile.verification_status)}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-white/80 border border-black/10 font-mono text-[10px] font-bold text-zinc-700">
                ID: {user?.email || partnerId.slice(0, 14)}
              </span>
            </div>
            <p className={`text-[11px] mt-1 opacity-90 ${urBodyClass}`}>
              {profile.verification_status === 'approved'
                ? tr(lang, 'Your Pro Partner verification is approved. You can go Online and accept rides.', 'آپ کی پرو پارٹنر تصدیق مکمل ہو چکی ہے۔ اب آپ آن لائن جا کر سواریاں قبول کر سکتے ہیں۔')
                : profile.verification_status === 'under_review'
                ? tr(lang, 'Submitted to Super Admin Panel. Your uploaded documents and details remain safely saved.', 'آپ کی درخواست سپر ایڈمن پینل میں موجود ہے۔ تمام دستاویزات اور نمبر آپ کی آئی ڈی میں محفوظ ہیں۔')
                : tr(lang, 'All details & photos you add stay permanently saved to your Partner ID across sessions.', 'آپ جو بھی نمبر یا تصویر ایک بار محفوظ کریں گے وہ آپ کی آئی ڈی میں مستقل محفوظ رہے گی۔')}
            </p>
            {profile.admin_notes && (
              <p className="text-[11px] font-bold mt-1.5 px-2.5 py-1 rounded-lg bg-white/70 border border-black/10">
                {tr(lang, 'Admin Note:', 'ایڈمن نوٹ:')} {profile.admin_notes}
              </p>
            )}
          </div>
        </div>
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white/80 border border-black/10 text-emerald-800 shrink-0">
          {tr(lang, 'Auto-Saved', 'خودکار محفوظ')} ✓
        </span>
      </div>

      {/* Progress Bar Header */}
      <div className={`rounded-2xl border p-5 space-y-4 shadow-sm ${cardSurface}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#D4A017]">
              {tr(lang, `Step ${step} of ${totalSteps}`, `مرحلہ ${step} از ${totalSteps}`)}
            </span>
            <h2 className="font-display text-lg font-bold">
              {lang === 'ur' ? stepTitles[step - 1].titleUr : stepTitles[step - 1].titleEn}
            </h2>
          </div>
          <span className="px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-mono text-xs font-bold">
            {realCompletionPct}% {tr(lang, 'Ready', 'مکمل')}
          </span>
        </div>

        <div className="w-full bg-zinc-200/70 h-2 rounded-full overflow-hidden">
          <div
            className="bg-[#D4A017] h-full transition-all duration-300"
            style={{ width: `${Math.max(8, realCompletionPct)}%` }}
          />
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 pt-1">
          {stepTitles.map((st, idx) => {
            const done = readinessItems[idx]?.done;
            return (
              <button
                key={st.num}
                type="button"
                onClick={() => setStep(st.num)}
                className={`text-[10px] font-bold py-1.5 px-1.5 rounded-lg border text-center truncate transition-all ${
                  step === st.num
                    ? 'border-[#D4A017] bg-[#D4A017]/20 ring-1 ring-[#D4A017]'
                    : done
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : isDark
                    ? 'border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    : 'border-zinc-200 text-zinc-500 hover:border-zinc-300'
                }`}
              >
                {done ? '✓ ' : `${st.num}. `}
                {lang === 'ur' ? st.titleUr : st.titleEn}
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 1: Selfie Upload */}
      {step === 1 && (
        <div className={`rounded-2xl border p-6 space-y-5 shadow-sm ${cardSurface}`}>
          <div className="space-y-1">
            <h3 className="font-display text-base font-bold flex items-center gap-2">
              <Camera className="w-5 h-5 text-[#D4A017]" />
              {tr(lang, '1. Pro Partner Live Selfie / Profile Photo', '1. پرو پارٹنر لائیو سیلفی یا پروفائل تصویر')}
            </h3>
            <p className={`text-xs ${mutedTone} ${urBodyClass}`}>
              {tr(
                lang,
                'Upload a clear, front-facing live photo of yourself so passengers recognize you confidently.',
                'اپنی واضح اور سامنے کی تصویر اپ لوڈ کریں تاکہ مسافر آپ کو آسانی اور اعتماد سے پہچان سکیں۔'
              )}
            </p>
          </div>

          <div className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl space-y-4 ${subSurface}`}>
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
              <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0D0D10] text-white text-xs font-bold hover:bg-zinc-800 cursor-pointer shadow-md border border-zinc-700">
                {uploadingType === 'profile_photo' ? <Loader2 className="w-4 h-4 animate-spin text-[#D4A017]" /> : <Upload className="w-4 h-4" />}
                <span>{getDoc('profile_photo') ? tr(lang, 'Change Saved Selfie', 'محفوظ سیلفی تبدیل کریں') : tr(lang, 'Take / Upload Selfie', 'سیلفی اپ لوڈ کریں')}</span>
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

          <div className="flex justify-end pt-4 border-t border-zinc-200/60">
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
        <div className={`rounded-2xl border p-6 space-y-6 shadow-sm ${cardSurface}`}>
          <div className="space-y-1">
            <h3 className="font-display text-base font-bold flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-[#D4A017]" />
              {tr(lang, '2. CNIC Front & Back (AI Auto-Scan)', '2. شناختی کارڈ فرنٹ اور بیک (خودکار اسکین)')}
            </h3>
            <p className={`text-xs ${mutedTone} ${urBodyClass}`}>
              {tr(
                lang,
                'Upload CNIC Front & Back copies. Your CNIC number and expiry stay saved permanently to your account.',
                'شناختی کارڈ کے فرنٹ اور بیک کی واضح تصویر اپ لوڈ کریں۔ آپ کا درج کردہ نمبر آپ کی آئی ڈی میں مستقل محفوظ رہے گا۔'
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className={`p-4 rounded-xl border space-y-3 ${subSurface}`}>
              <div className={`text-xs font-bold ${labelTone}`}>{tr(lang, 'CNIC Front Copy', 'شناختی کارڈ فرنٹ')}</div>
              {getDoc('cnic_front')?.file_data_url ? (
                <div className="relative h-32 rounded-lg overflow-hidden border border-zinc-200 bg-white">
                  <img src={getDoc('cnic_front')?.file_data_url} alt="CNIC Front" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="h-32 rounded-lg border-2 border-dashed border-zinc-300 flex items-center justify-center text-zinc-400 text-xs">
                  {tr(lang, 'No Front Uploaded', 'فرنٹ اپ لوڈ نہیں')}
                </div>
              )}
              <label className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#0D0D10] text-white text-xs font-bold cursor-pointer border border-zinc-700">
                {uploadingType === 'cnic_front' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                <span>{getDoc('cnic_front') ? tr(lang, 'Change Front Copy', 'فرنٹ تبدیل کریں') : tr(lang, 'Upload Front', 'فرنٹ اپ لوڈ کریں')}</span>
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

            <div className={`p-4 rounded-xl border space-y-3 ${subSurface}`}>
              <div className={`text-xs font-bold ${labelTone}`}>{tr(lang, 'CNIC Back Copy', 'شناختی کارڈ بیک')}</div>
              {getDoc('cnic_back')?.file_data_url ? (
                <div className="relative h-32 rounded-lg overflow-hidden border border-zinc-200 bg-white">
                  <img src={getDoc('cnic_back')?.file_data_url} alt="CNIC Back" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="h-32 rounded-lg border-2 border-dashed border-zinc-300 flex items-center justify-center text-zinc-400 text-xs">
                  {tr(lang, 'No Back Uploaded', 'بیک اپ لوڈ نہیں')}
                </div>
              )}
              <label className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#0D0D10] text-white text-xs font-bold cursor-pointer border border-zinc-700">
                {uploadingType === 'cnic_back' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                <span>{getDoc('cnic_back') ? tr(lang, 'Change Back Copy', 'بیک تبدیل کریں') : tr(lang, 'Upload Back', 'بیک اپ لوڈ کریں')}</span>
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

          <div className="p-4 rounded-xl border border-amber-300/70 bg-amber-50/70 space-y-3">
            <div className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#D4A017]" />
              {tr(lang, 'CNIC Details (Saved Automatically to Your ID):', 'شناختی کارڈ کی تفصیلات (آپ کی آئی ڈی میں محفوظ):')}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-zinc-800 mb-1">{tr(lang, 'CNIC Number', 'شناختی کارڈ نمبر')}</label>
                <input
                  value={cnicNumber}
                  onChange={(e) => setCnicNumber(e.target.value)}
                  placeholder="37405-XXXXXXX-X"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 font-mono text-xs bg-white text-[#0D0D10]"
                />
              </div>
              <div>
                <label className="block font-semibold text-zinc-800 mb-1">{tr(lang, 'CNIC Expiry Date', 'میعاد تاریخ')}</label>
                <input
                  type="date"
                  value={cnicExpiry}
                  onChange={(e) => setCnicExpiry(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs bg-white text-[#0D0D10]"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-between gap-2 pt-4 border-t border-zinc-200/60">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-300 text-xs font-semibold"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>{tr(lang, 'Back', 'پچھلا')}</span>
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={savingDraft}
                onClick={handleSaveDraft}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-300 text-xs font-bold hover:border-[#D4A017]"
              >
                {savingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 text-[#D4A017]" />}
                <span>{tr(lang, 'Save Draft', 'محفوظ کریں')}</span>
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
        </div>
      )}

      {/* Step 3: Driving License */}
      {step === 3 && (
        <div className={`rounded-2xl border p-6 space-y-6 shadow-sm ${cardSurface}`}>
          <div className="space-y-1">
            <h3 className="font-display text-base font-bold flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-[#D4A017]" />
              {tr(lang, '3. Driving Licence (AI Auto-Scan)', '3. ڈرائیونگ لائسنس (خودکار اسکین)')}
            </h3>
            <p className={`text-xs ${mutedTone} ${urBodyClass}`}>
              {tr(
                lang,
                'Upload your valid driving licence photo and confirm your licence number and expiry date.',
                'اپنے کارآمد ڈرائیونگ لائسنس کی تصویر اپ لوڈ کریں اور لائسنس نمبر و میعاد کی تصدیق کریں۔'
              )}
            </p>
          </div>

          <div className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl space-y-4 ${subSurface}`}>
            {getDoc('driving_licence')?.file_data_url ? (
              <div className="relative w-full max-w-sm h-40 rounded-xl overflow-hidden border border-zinc-200 bg-white shadow-sm">
                <img src={getDoc('driving_licence')?.file_data_url} alt="Driving Licence" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-xl bg-zinc-200 flex items-center justify-center text-zinc-400">
                <FileCheck2 className="w-8 h-8" />
              </div>
            )}

            <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0D0D10] text-white text-xs font-bold cursor-pointer shadow-md border border-zinc-700">
              {uploadingType === 'driving_licence' ? <Loader2 className="w-4 h-4 animate-spin text-[#D4A017]" /> : <Upload className="w-4 h-4" />}
              <span>{getDoc('driving_licence') ? tr(lang, 'Change Saved Licence', 'لائسنس تبدیل کریں') : tr(lang, 'Upload Driving Licence', 'لائسنس اپ لوڈ کریں')}</span>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl border border-amber-300/70 bg-amber-50/70 text-xs">
            <div>
              <label className="block font-semibold text-zinc-800 mb-1">{tr(lang, 'Licence Number', 'لائسنس نمبر')}</label>
              <input
                value={licenceNumber}
                onChange={(e) => setLicenceNumber(e.target.value)}
                placeholder="ISB-123456"
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 font-mono text-xs bg-white text-[#0D0D10]"
              />
            </div>
            <div>
              <label className="block font-semibold text-zinc-800 mb-1">{tr(lang, 'Licence Expiry', 'لائسنس کی میعاد')}</label>
              <input
                type="date"
                value={licenceExpiry}
                onChange={(e) => setLicenceExpiry(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs bg-white text-[#0D0D10]"
              />
            </div>
          </div>

          <div className="flex flex-wrap justify-between gap-2 pt-4 border-t border-zinc-200/60">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-300 text-xs font-semibold"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>{tr(lang, 'Back', 'پچھلا')}</span>
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={savingDraft}
                onClick={handleSaveDraft}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-300 text-xs font-bold hover:border-[#D4A017]"
              >
                {savingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 text-[#D4A017]" />}
                <span>{tr(lang, 'Save Draft', 'محفوظ کریں')}</span>
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
        </div>
      )}

      {/* Step 4: Vehicle Registration Book / Smart Card */}
      {step === 4 && (
        <div className={`rounded-2xl border p-6 space-y-6 shadow-sm ${cardSurface}`}>
          <div className="space-y-1">
            <h3 className="font-display text-base font-bold flex items-center gap-2">
              <CarFront className="w-5 h-5 text-[#D4A017]" />
              {tr(lang, '4. Vehicle Registration Book / Smart Card', '4. گاڑی کی رجسٹریشن بک / اسمارٹ کارڈ')}
            </h3>
            <p className={`text-xs ${mutedTone} ${urBodyClass}`}>
              {tr(
                lang,
                'Upload your vehicle registration book or smart card and confirm your vehicle number plate & model.',
                'گاڑی کی رجسٹریشن بک یا اسمارٹ کارڈ اپ لوڈ کریں اور گاڑی کی نمبر پلیٹ اور ماڈل کی تصدیق کریں۔'
              )}
            </p>
          </div>

          <div className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl space-y-4 ${subSurface}`}>
            {getDoc('vehicle_registration')?.file_data_url ? (
              <div className="relative w-full max-w-sm h-40 rounded-xl overflow-hidden border border-zinc-200 bg-white shadow-sm">
                <img src={getDoc('vehicle_registration')?.file_data_url} alt="Vehicle Book" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-xl bg-zinc-200 flex items-center justify-center text-zinc-400">
                <CarFront className="w-8 h-8" />
              </div>
            )}

            <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0D0D10] text-white text-xs font-bold cursor-pointer shadow-md border border-zinc-700">
              {uploadingType === 'vehicle_registration' ? <Loader2 className="w-4 h-4 animate-spin text-[#D4A017]" /> : <Upload className="w-4 h-4" />}
              <span>{getDoc('vehicle_registration') ? tr(lang, 'Change Saved Book', 'بک تبدیل کریں') : tr(lang, 'Upload Vehicle Book', 'رجسٹریشن بک اپ لوڈ کریں')}</span>
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

          <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl border text-xs ${subSurface}`}>
            <div>
              <label className={`block font-semibold mb-1 ${labelTone}`}>{tr(lang, 'Vehicle Plate Number', 'نمبر پلیٹ')}</label>
              <input
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                placeholder="LEA-4512"
                className={`w-full px-3 py-2 rounded-lg border font-mono uppercase text-xs ${inputSurface}`}
              />
            </div>
            <div>
              <label className={`block font-semibold mb-1 ${labelTone}`}>{tr(lang, 'Vehicle Make & Model', 'گاڑی کا ماڈل')}</label>
              <input
                value={vehicleName}
                onChange={(e) => setVehicleName(e.target.value)}
                placeholder="Suzuki Every / Corolla GLi"
                className={`w-full px-3 py-2 rounded-lg border text-xs ${inputSurface}`}
              />
            </div>
            <div>
              <label className={`block font-semibold mb-1 ${labelTone}`}>{tr(lang, 'Fuel Type', 'ایندھن کی قسم')}</label>
              <select
                value={fuelType}
                onChange={(e) => setFuelType(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-xs ${inputSurface}`}
              >
                <option value="Petrol">Petrol</option>
                <option value="Hybrid">Hybrid</option>
                <option value="CNG">CNG</option>
                <option value="Diesel">Diesel</option>
                <option value="Electric">Electric</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap justify-between gap-2 pt-4 border-t border-zinc-200/60">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-300 text-xs font-semibold"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>{tr(lang, 'Back', 'پچھلا')}</span>
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={savingDraft}
                onClick={handleSaveDraft}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-300 text-xs font-bold hover:border-[#D4A017]"
              >
                {savingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 text-[#D4A017]" />}
                <span>{tr(lang, 'Save Draft', 'محفوظ کریں')}</span>
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
        </div>
      )}

      {/* Step 5: Vehicle Exterior Photos */}
      {step === 5 && (
        <div className={`rounded-2xl border p-6 space-y-6 shadow-sm ${cardSurface}`}>
          <div className="space-y-1">
            <h3 className="font-display text-base font-bold flex items-center gap-2">
              <CarFront className="w-5 h-5 text-[#D4A017]" />
              {tr(lang, '5. Vehicle Exterior Photo (with Number Plate)', '5. گاڑی کی بیرونی تصویر (نمبر پلیٹ سمیت)')}
            </h3>
            <p className={`text-xs ${mutedTone} ${urBodyClass}`}>
              {tr(
                lang,
                'Upload a clear exterior photo of your vehicle showing the front or rear number plate clearly.',
                'گاڑی کی ایسی واضح تصویر اپ لوڈ کریں جس میں نمبر پلیٹ صاف دکھائی دے رہی ہو۔'
              )}
            </p>
          </div>

          <div className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl space-y-4 ${subSurface}`}>
            {getDoc('vehicle_photo')?.file_data_url ? (
              <div className="relative w-full max-w-sm h-40 rounded-xl overflow-hidden border border-zinc-200 bg-white shadow-sm">
                <img src={getDoc('vehicle_photo')?.file_data_url} alt="Vehicle Photo" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-xl bg-zinc-200 flex items-center justify-center text-zinc-400">
                <CarFront className="w-8 h-8" />
              </div>
            )}

            <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0D0D10] text-white text-xs font-bold cursor-pointer shadow-md border border-zinc-700">
              {uploadingType === 'vehicle_photo' ? <Loader2 className="w-4 h-4 animate-spin text-[#D4A017]" /> : <Upload className="w-4 h-4" />}
              <span>{getDoc('vehicle_photo') ? tr(lang, 'Change Vehicle Photo', 'تصویر تبدیل کریں') : tr(lang, 'Upload Vehicle Photo', 'گاڑی کی تصویر اپ لوڈ کریں')}</span>
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

          <div className="flex justify-between pt-4 border-t border-zinc-200/60">
            <button
              type="button"
              onClick={() => setStep(4)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-300 text-xs font-semibold"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>{tr(lang, 'Back', 'پچھلا')}</span>
            </button>
            <button
              type="button"
              onClick={() => setStep(6)}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold hover:bg-amber-400 shadow-sm"
            >
              <span>{tr(lang, 'Continue to Review & Submit', 'جائزہ اور حتمی سبمٹ پر جائیں')}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 6: Basic Information, Readiness Checklist & Final Submit */}
      {step === 6 && (
        <form onSubmit={handleFinalSubmit} className={`rounded-2xl border p-6 space-y-6 shadow-sm ${cardSurface}`}>
          <div className="space-y-1">
            <h3 className="font-display text-base font-bold flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#D4A017]" />
              {tr(lang, '6. Basic Information & Final Submission', '6. بنیادی معلومات اور حتمی سبمشن')}
            </h3>
            <p className={`text-xs ${mutedTone} ${urBodyClass}`}>
              {tr(
                lang,
                'Confirm your saved contact numbers, vehicle category, and send your complete application directly to Super Admin.',
                'اپنا محفوظ شدہ رابطہ نمبر، گاڑی کی کیٹگری اور دستاویزات چیک کر کے براہِ راست سپر ایڈمن کو منظوری کے لیے بھیجیں۔'
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className={`block font-semibold mb-1 ${labelTone}`}>{tr(lang, 'Full Name (Manual)', 'پورا نام')}</label>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Muhammad Ali"
                className={`w-full px-3 py-2.5 rounded-xl border ${inputSurface}`}
              />
            </div>
            <div>
              <label className={`block font-semibold mb-1 ${labelTone}`}>{tr(lang, 'Mobile Number (11 digits)', 'موبائل نمبر (11 ہندسے)')}</label>
              <input
                required
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="03001234567"
                className={`w-full px-3 py-2.5 rounded-xl border font-mono ${inputSurface}`}
              />
              {phone && phoneDigits.length < 10 && (
                <p className="text-[11px] text-amber-600 font-semibold mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  {tr(lang, 'Enter full 11-digit mobile number (e.g. 03001234567)', 'مکمل 11 ہندسوں کا نمبر درج کریں (مثال: 03001234567)')}
                </p>
              )}
            </div>
            <div>
              <label className={`block font-semibold mb-1 ${labelTone}`}>{tr(lang, 'Reference Mobile Number', 'حوالہ / ایمرجنسی موبائل نمبر')}</label>
              <input
                required
                type="tel"
                value={referencePhone}
                onChange={(e) => setReferencePhone(e.target.value)}
                placeholder="03141512921"
                className={`w-full px-3 py-2.5 rounded-xl border font-mono ${inputSurface}`}
              />
              {referencePhone && refDigits.length < 10 && (
                <p className="text-[11px] text-amber-600 font-semibold mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  {tr(lang, 'Enter complete 11-digit reference number', 'مکمل 11 ہندسوں کا حوالہ نمبر درج کریں')}
                </p>
              )}
            </div>
            <div>
              <label className={`block font-semibold mb-1 ${labelTone}`}>{tr(lang, 'Operating City', 'آپریٹنگ سٹی')}</label>
              <select
                value={operatingCity}
                onChange={(e) => setOperatingCity(e.target.value)}
                className={`w-full px-3 py-2.5 rounded-xl border ${inputSurface}`}
              >
                <option value="Islamabad">Islamabad</option>
                <option value="Rawalpindi">Rawalpindi</option>
                <option value="Lahore">Lahore</option>
                <option value="Karachi">Karachi</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <label className={`block text-xs font-semibold ${labelTone}`}>
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
                      active
                        ? 'border-[#D4A017] bg-[#D4A017]/15 ring-1 ring-[#D4A017]'
                        : isDark
                        ? 'border-zinc-800 bg-zinc-900'
                        : 'border-zinc-200 bg-white'
                    }`}
                  >
                    <VehicleImage src={f.image_url} alt={f.name} categorySlug={f.slug} className="w-12 h-9 rounded-lg border shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold truncate">{formatVehicleLabel(f.name, lang)}</div>
                      <div className={`text-[10px] font-mono ${mutedTone}`}>{f.seating_capacity} seats</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label className={`block text-xs font-semibold ${labelTone}`}>
              {tr(lang, 'Service Eligibility Preferences', 'سروس کی اقسام')}
            </label>
            <div className="flex flex-wrap gap-3 text-xs">
              {(['pick_and_drop', 'ride_sharing', 'fuel_sharing'] as const).map((id) => {
                const checked = services.includes(id);
                return (
                  <label
                    key={id}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer ${
                      checked ? 'border-[#D4A017] bg-[#D4A017]/10' : 'border-zinc-300/80'
                    }`}
                  >
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

          {/* Interactive Readiness Summary (tap any item to jump to that step) */}
          <div className={`p-4 rounded-xl border space-y-2.5 ${subSurface}`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold ${labelTone}`}>
                {tr(lang, 'Application Readiness Summary', 'درخواست کی تیاری کا جائزہ')}
              </span>
              <span className="text-[11px] font-mono font-bold text-[#B8860B]">
                {completedChecksCount}/{readinessItems.length} {tr(lang, 'Ready', 'مکمل')}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {readinessItems.map((item) => (
                <button
                  key={item.step}
                  type="button"
                  onClick={() => setStep(item.step)}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left text-[11px] font-semibold transition-colors ${
                    item.done
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                  }`}
                >
                  <span className="shrink-0">{item.done ? '✓' : '•'}</span>
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap justify-between gap-2 pt-4 border-t border-zinc-200/60">
            <button
              type="button"
              onClick={() => setStep(5)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-300 text-xs font-semibold"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>{tr(lang, 'Back', 'پچھلا')}</span>
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={savingDraft}
                onClick={handleSaveDraft}
                className="inline-flex items-center gap-1.5 px-4 py-3 rounded-xl border border-zinc-300 text-xs font-bold hover:border-[#D4A017]"
              >
                {savingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 text-[#D4A017]" />}
                <span>{tr(lang, 'Save Changes', 'محفوظ کریں')}</span>
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-7 py-3 rounded-xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 shadow-md disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>{tr(lang, 'Submit Registration for Admin Approval', 'ایڈمن منظوری کے لیے رجسٹریشن جمع کروائیں')}</span>
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
