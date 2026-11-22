import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Phone,
  RefreshCw,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import heroMobilityImg from '../../assets/images/hero_mobility_pakistan_1794584048013.jpg';
import { BrandLogo, LanguageToggle } from '../../components/BrandMark';
import { formatFirebaseAuthError, useFirebase } from '../../contexts/FirebaseContext';
import { useTheme } from '../../contexts/ThemeContext';
import { tr } from '../../i18n/translations';
import type { Language, User } from '../../types';
import { apiRequest, isBackendOfflineError, setRoleToken, setStoredRoleUser } from '../../utils/api';

interface PassengerAuthProps {
  lang: Language;
  onChangeLang: (l: Language) => void;
  onAuthenticated: (token: string, user: User) => void;
  onBackWelcome: () => void;
}

type AuthMode = 'login' | 'register' | 'forgot';

export const PassengerAuth: React.FC<PassengerAuthProps> = ({
  lang,
  onChangeLang,
  onAuthenticated,
  onBackWelcome,
}) => {
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

  const [mode, setMode] = useState<AuthMode>('login');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [city, setCity] = useState('Islamabad');
  const [emailVerificationPending, setEmailVerificationPending] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const buildFirebaseUserRecord = (
    fbUser: {
      uid: string;
      displayName: string | null;
      email: string | null;
      phoneNumber: string | null;
    },
    fallbackName?: string
  ): User => ({
    id: fbUser.uid,
    role: 'passenger',
    full_name: fbUser.displayName || fallbackName || fbUser.email?.split('@')[0] || 'Verified Passenger',
    phone: fbUser.phoneNumber || phone || '',
    whatsapp: fbUser.phoneNumber || phone || '',
    email: fbUser.email || email || `${fbUser.uid}@prorider.pk`,
    city,
    phone_verified: 1,
    notify_push: 1,
    notify_sms: 1,
    status: 'active',
    created_at: new Date().toISOString(),
  });

  const finalizeSession = async (
    idToken: string,
    fbUser: { uid: string; displayName: string | null; email: string | null; phoneNumber: string | null },
    fallbackName?: string
  ) => {
    try {
      const res = await apiRequest<{ token: string; user: User }>('/api/auth/google/firebase', {
        method: 'POST',
        body: { idToken, role: 'passenger', city },
      });
      setRoleToken('passenger', res.token);
      setStoredRoleUser('passenger', res.user);
      onAuthenticated(res.token, res.user);
      return;
    } catch (err) {
      if (!isBackendOfflineError(err)) {
        throw err;
      }
      const firebaseSessionToken = `pr_fb_${idToken.slice(0, 32)}`;
      const localUser = buildFirebaseUserRecord(fbUser, fallbackName);
      setRoleToken('passenger', firebaseSessionToken);
      setStoredRoleUser('passenger', localUser);
      onAuthenticated(firebaseSessionToken, localUser);
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
      .then((tk) => (active ? finalizeSession(tk, redirectAuthUser) : undefined))
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
      const { idToken, user: fbUser } = await signInWithGooglePopup('passenger', city, lang);
      await finalizeSession(idToken, fbUser);
    } catch (err: any) {
      setError(formatFirebaseAuthError(err, 'Google'));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError(tr(lang, 'Please enter a valid email address.', 'درست ای میل ایڈریس درج کریں۔'));
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
            `پاس ورڈ ری سیٹ لنک ${cleanEmail} پر بھیج دیا گیا ہے۔ اپنا ان باکس یا Spam چیک کریں۔`
          )
        );
      } catch (err: any) {
        try {
          const fallback = await apiRequest<{ message: string }>('/api/auth/forgot-password', {
            method: 'POST',
            body: { phone: phone || cleanEmail, role: 'passenger' },
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

    if (mode === 'register' && !fullName.trim()) {
      setError(tr(lang, 'Please enter your full name.', 'اپنا پورا نام درج کریں۔'));
      return;
    }

    setLoading(true);
    try {
      if (mode === 'register') {
        try {
          const res = await registerWithFirebaseEmail({
            fullName,
            email: cleanEmail,
            password,
            role: 'passenger',
            city,
            lang,
          });
          void apiRequest('/api/auth/passenger/register', {
            method: 'POST',
            body: {
              fullName,
              phone: phone.trim(),
              whatsapp: phone.trim(),
              email: cleanEmail,
              city,
              password,
              acceptedPolicy: true,
            },
          }).catch(() => {});

          if (res.emailVerified) {
            await finalizeSession(res.idToken, res.user, fullName);
          } else {
            setEmailVerificationPending(true);
            setInfo(
              tr(
                lang,
                `A verification link has been sent to ${cleanEmail}. Click the link in your email, then tap "I've Verified — Continue".`,
                `تصدیقی لنک ${cleanEmail} پر بھیجا گیا ہے۔ لنک پر کلک کر کے نیچے بٹن دبائیں۔`
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
            const expressRes = await apiRequest<{ token: string; user: User }>('/api/auth/passenger/register', {
              method: 'POST',
              body: {
                fullName,
                phone: phone.trim(),
                whatsapp: phone.trim(),
                email: cleanEmail,
                city,
                password,
                acceptedPolicy: true,
              },
            });
            setRoleToken('passenger', expressRes.token);
            setStoredRoleUser('passenger', expressRes.user);
            onAuthenticated(expressRes.token, expressRes.user);
            return;
          }
          throw fbErr;
        }
      } else {
        try {
          const expressRes = await apiRequest<{ token: string; user: User }>('/api/auth/passenger/login', {
            method: 'POST',
            body: { identifier: cleanEmail, password },
          });
          setRoleToken('passenger', expressRes.token);
          setStoredRoleUser('passenger', expressRes.user);
          onAuthenticated(expressRes.token, expressRes.user);
          return;
        } catch (apiErr: any) {
          if (!isBackendOfflineError(apiErr) && apiErr?.status !== 401) {
            throw apiErr;
          }
          const fbRes = await signInWithFirebaseEmail({
            email: cleanEmail,
            password,
            role: 'passenger',
            city,
            lang,
          });
          if (!fbRes.emailVerified) {
            setEmailVerificationPending(true);
            setInfo(
              tr(
                lang,
                `Please verify your email (${cleanEmail}) using the link sent to your inbox, then tap "I've Verified — Continue".`,
                `براہ کرم ${cleanEmail} کی تصدیق لنک کے ذریعے مکمل کریں۔`
              )
            );
            return;
          }
          await finalizeSession(fbRes.idToken, fbRes.user);
        }
      }
    } catch (err: any) {
      setError(formatFirebaseAuthError(err, 'Email'));
    } finally {
      setLoading(false);
    }
  };

  const handleCheckEmailVerified = async () => {
    setError(null);
    setLoading(true);
    try {
      const reloaded = await reloadFirebaseUser('passenger', city, lang);
      if (!reloaded) {
        setError(tr(lang, 'Session expired. Please sign in again.', 'سیشن ختم ہو گیا ہے۔ دوبارہ سائن ان کریں۔'));
        setEmailVerificationPending(false);
        return;
      }
      if (!reloaded.emailVerified) {
        setError(
          tr(
            lang,
            'Your email is not verified yet. Open the verification email in your inbox (or Spam), click the link, then try again.',
            'آپ کی ای میل ابھی تک تصدیق نہیں ہوئی۔ ای میل ان باکس یا Spam چیک کریں اور لنک پر کلک کریں۔'
          )
        );
        return;
      }
      await finalizeSession(reloaded.idToken, reloaded.user, fullName);
    } catch (err: any) {
      setError(formatFirebaseAuthError(err, 'Email Verification'));
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

      <div className="space-y-1 text-center sm:text-start">
        <p className="text-xs font-bold uppercase tracking-widest text-[#B8860B]">
          {tr(lang, 'Passenger Portal', 'مسافر پورٹل')}
        </p>
        <h1 className="font-display text-2xl font-bold text-[#0D0D10]">
          {mode === 'login'
            ? tr(lang, 'Welcome Back', 'خوش آمدید')
            : mode === 'register'
            ? tr(lang, 'Create Passenger Account', 'نیا مسافر اکاؤنٹ بنائیں')
            : tr(lang, 'Reset Password', 'پاس ورڈ ری سیٹ کریں')}
        </h1>
        <p className="text-xs text-zinc-500">
          {tr(
            lang,
            'Sign in securely with Google or your Email & Password.',
            'گوگل یا ای میل اور پاس ورڈ سے محفوظ طریقے سے لاگ اِن کریں۔'
          )}
        </p>
      </div>

      {/* Mode Switcher */}
      {!emailVerificationPending && (
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
            {tr(lang, 'Login', 'سائن اِن')}
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
      )}

      {/* GOOGLE LOGIN */}
      {!emailVerificationPending && mode !== 'forgot' && (
        <>
          <button
            type="button"
            disabled={loading}
            onClick={handleGoogleSignIn}
            className="pr-preserve-light w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-2xl border border-zinc-300 bg-white hover:bg-zinc-50 text-xs font-bold !text-[#0D0D10] transition-colors shadow-xs disabled:opacity-60"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" />
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.19v3.15C3.17 21.32 7.22 24 12 24z" />
              <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.19C.43 8.12 0 9.87 0 12s.43 3.88 1.19 5.42l4.09-3.15z" />
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.22 0 3.17 2.68 1.19 6.58l4.09 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
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

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700 font-medium leading-relaxed">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-900 font-medium leading-relaxed">
          {info}
        </div>
      )}

      {emailVerificationPending ? (
        <div className="space-y-4 text-xs text-center">
          <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
            <Mail className="w-9 h-9 text-[#D4A017] mx-auto" />
            <p className="font-bold text-sm text-[#0D0D10]">
              {tr(lang, 'Verify Your Email Address', 'اپنے ای میل ایڈریس کی تصدیق کریں')}
            </p>
            <p className="text-zinc-600 leading-relaxed">
              {tr(
                lang,
                `Open the verification email sent to ${email} and click the verification link (check Spam if needed).`,
                `ای میل (${email}) پر بھیجے گئے تصدیقی لنک پر کلک کریں۔`
              )}
            </p>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={handleCheckEmailVerified}
            className="w-full py-3.5 rounded-2xl pr-gold-cta font-bold text-sm flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            {loading
              ? tr(lang, 'Checking Verification...', 'تصدیق چیک ہو رہی ہے...')
              : tr(lang, "I've Verified — Continue", 'تصدیق مکمل — آگے بڑھیں')}
          </button>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => {
                setEmailVerificationPending(false);
                setError(null);
              }}
              className="text-zinc-500 hover:text-[#0D0D10] font-semibold"
            >
              {tr(lang, '← Change Email', '← ای میل تبدیل کریں')}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={async () => {
                try {
                  await resendFirebaseEmailVerification();
                  setInfo(tr(lang, 'Verification email resent! Please check your inbox.', 'تصدیقی ای میل دوبارہ بھیج دی گئی ہے۔'));
                } catch (err: any) {
                  setError(formatFirebaseAuthError(err, 'Verification Email'));
                }
              }}
              className="text-[#B8860B] hover:underline font-semibold inline-flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              {tr(lang, 'Resend Link', 'لنک دوبارہ بھیجیں')}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleEmailSubmit} className="space-y-4 text-xs">
          {mode === 'register' && (
            <>
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  {tr(lang, 'Full Name', 'مکمل نام')}
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-[#D4A017] absolute start-3 top-3" />
                  <input
                    type="text"
                    required
                    placeholder={tr(lang, 'e.g. Ali Ahmed', 'مثال: علی احمد')}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full ps-9 pe-3 py-2.5 rounded-xl border border-zinc-200 font-medium focus:ring-2 focus:ring-[#D4A017]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">
                    {tr(lang, 'Mobile (Optional)', 'موبائل نمبر (اختیاری)')}
                  </label>
                  <input
                    type="tel"
                    placeholder="03XXXXXXXXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">
                    {tr(lang, 'City', 'شہر')}
                  </label>
                  <select
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 bg-white"
                  >
                    <option value="Islamabad">{tr(lang, 'Islamabad', 'اسلام آباد')}</option>
                    <option value="Rawalpindi">{tr(lang, 'Rawalpindi', 'راولپنڈی')}</option>
                    <option value="Lahore">{tr(lang, 'Lahore', 'لاہور')}</option>
                    <option value="Karachi">{tr(lang, 'Karachi', 'کراچی')}</option>
                  </select>
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block font-semibold text-zinc-700 mb-1">
              {tr(lang, 'Email Address', 'ای میل ایڈریس')}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#D4A017] absolute start-3 top-3" />
              <input
                type="email"
                required
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full ps-9 pe-3 py-2.5 rounded-xl border border-zinc-200 font-medium focus:ring-2 focus:ring-[#D4A017]"
              />
            </div>
          </div>

          {mode !== 'forgot' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-zinc-700">
                  {tr(lang, 'Password', 'پاس ورڈ')}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setError(null);
                    setInfo(null);
                  }}
                  className="text-[11px] font-semibold text-[#B8860B] hover:underline"
                >
                  {tr(lang, 'Forgot Password?', 'پاس ورڈ بھول گئے؟')}
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#D4A017] absolute start-3 top-3" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full ps-9 pe-10 py-2.5 rounded-xl border border-zinc-200 font-medium focus:ring-2 focus:ring-[#D4A017]"
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
            className="w-full py-3.5 rounded-2xl pr-gold-cta font-bold text-sm transition-transform hover:scale-[1.01] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading
              ? tr(lang, 'Please wait...', 'براہ کرم انتظار کریں...')
              : mode === 'login'
              ? tr(lang, 'Sign In', 'سائن ان کریں')
              : mode === 'register'
              ? tr(lang, 'Create Passenger Account', 'اکاؤنٹ رجسٹر کریں')
              : tr(lang, 'Send Password Reset Email', 'پاس ورڈ ری سیٹ ای میل بھیجیں')}
          </button>

          {mode === 'forgot' && (
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setInfo(null);
                }}
                className="text-xs font-semibold text-zinc-500 hover:text-[#0D0D10]"
              >
                {tr(lang, '← Back to Sign In', '← واپس سائن ان پر جائیں')}
              </button>
            </div>
          )}
        </form>
      )}

      {/* DIMMED, DISABLED CIRCULAR "COMING SOON" BUTTONS AT BOTTOM (Facebook & Phone OTP) */}
      {!emailVerificationPending && (
        <div className="pt-4 border-t border-zinc-100 flex flex-col items-center gap-2.5">
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
      <header className="bg-white border-b border-zinc-200 px-3 sm:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sticky top-0 z-30">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackWelcome}
            className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-600 shrink-0"
            aria-label={tr(lang, 'Back to welcome', 'واپس ہوم پر جائیں')}
          >
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
                alt="PRO RIDER AI"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-center opacity-80"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/25 flex flex-col justify-end p-5 sm:p-8">
                <p className="text-[11px] font-bold uppercase tracking-widest !text-[#F4C430]">
                  PRO RIDER AI
                </p>
                <h2 className="font-display text-2xl sm:text-3xl font-bold !text-white">
                  {tr(lang, 'PASSENGER PORTAL', 'مسافر پورٹل')}
                </h2>
                <p className="text-xs !text-zinc-200 mt-0.5">
                  {tr(lang, 'Travel with Trust. Ride Smart across Pakistan.', 'اعتماد کے ساتھ محفوظ اور شفاف سفر کریں۔')}
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
                alt="PRO RIDER AI Showcase"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent flex flex-col justify-end p-8">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#F4C430] uppercase tracking-widest">
                  <ShieldCheck className="w-4 h-4" />
                  {tr(lang, 'Verified Chauffeurs', 'تصدیق شدہ ڈرائیورز')}
                </span>
                <h2 className="font-display text-3xl font-bold !text-white mt-2">
                  {tr(lang, 'Your Daily & Instant Mobility Partner', 'آپ کا روزانہ اور فوری سفر کا ساتھی')}
                </h2>
                <p className="text-sm !text-zinc-200 mt-2">
                  {tr(
                    lang,
                    'Pick & Drop, Ride Sharing, and Fuel Sharing with official PKR invoices.',
                    'پِک اینڈ ڈراپ، رائیڈ شیئرنگ اور فیول شیئرنگ مکمل انوائس کے ساتھ۔'
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
