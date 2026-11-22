import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Lock,
  Mail,
  Phone,
  RefreshCw,
  User as UserIcon,
} from 'lucide-react';
import { BrandLogo, LanguageToggle } from '../../components/BrandMark';
import { formatFirebaseAuthError, useFirebase } from '../../contexts/FirebaseContext';
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

  // Form fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [city, setCity] = useState('Islamabad');

  // Email Verification Step
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

  // 1. GOOGLE LOGIN
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

  // 2. EMAIL & PASSWORD AUTH (Firebase + Resilient Express Fallback)
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError(lang === 'ur' ? 'درست ای میل ایڈریس درج کریں۔' : 'Please enter a valid email address.');
      return;
    }

    if (mode === 'forgot') {
      setLoading(true);
      try {
        await sendFirebasePasswordReset(cleanEmail);
        setInfo(
          lang === 'ur'
            ? `پاس ورڈ ری سیٹ لنک ${cleanEmail} پر بھیج دیا گیا ہے۔ اپنا ان باکس یا Spam چیک کریں۔`
            : `Password reset link sent to ${cleanEmail}. Check your inbox and Spam folder.`
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
      setError(lang === 'ur' ? 'پاس ورڈ کم از کم 6 حروف کا ہونا ضروری ہے۔' : 'Password must be at least 6 characters.');
      return;
    }

    if (mode === 'register' && !fullName.trim()) {
      setError(lang === 'ur' ? 'اپنا پورا نام درج کریں۔' : 'Please enter your full name.');
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
              lang === 'ur'
                ? `تصدیقی لنک ${cleanEmail} پر بھیجا گیا ہے۔ لنک پر کلک کر کے نیچے بٹن دبائیں۔`
                : `A verification link has been sent to ${cleanEmail}. Click the link in your email, then tap "I've Verified — Continue".`
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
        // Sign In: Try Express DB first so existing local accounts always work instantly,
        // and try Firebase Auth smoothly if Express doesn't have the user or is offline.
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
              lang === 'ur'
                ? `براہ کرم ${cleanEmail} کی تصدیق لنک کے ذریعے مکمل کریں۔`
                : `Please verify your email (${cleanEmail}) using the link sent to your inbox, then tap "I've Verified — Continue".`
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
        setError('Session expired. Please sign in again.');
        setEmailVerificationPending(false);
        return;
      }
      if (!reloaded.emailVerified) {
        setError(
          'Your email is not verified yet. Open the verification email in your inbox (or Spam), click the link, then try again.'
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

  return (
    <div dir={lang === 'ur' ? 'rtl' : 'ltr'} className="min-h-screen w-full max-w-full overflow-x-clip bg-[#F8F8FA] flex flex-col">
      <header className="bg-white border-b border-zinc-200 px-4 sm:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackWelcome}
            className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-600"
            aria-label="Back to welcome"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <BrandLogo compact />
        </div>
        <LanguageToggle lang={lang} onChange={onChangeLang} />
      </header>

      <main className="flex-1 flex items-center justify-center p-4 py-10">
        <div className="w-full max-w-md rounded-3xl bg-white border border-zinc-200 p-6 sm:p-8 shadow-sm space-y-5">
          <div className="space-y-1 text-center sm:text-left">
            <p className="text-xs font-bold uppercase tracking-widest text-[#B8860B]">Passenger Portal</p>
            <h1 className="font-display text-2xl font-bold text-[#0D0D10]">
              {mode === 'login' ? 'Welcome Back' : mode === 'register' ? 'Create Account' : 'Reset Password'}
            </h1>
            <p className="text-xs text-zinc-500">
              {lang === 'ur'
                ? 'گوگل یا ای میل اور پاس ورڈ سے محفوظ طریقے سے لاگ اِن کریں۔'
                : 'Sign in securely with Google or your Email & Password.'}
            </p>
          </div>

          {/* Mode Switcher */}
          {!emailVerificationPending && (
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-zinc-100 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setInfo(null);
                }}
                className={`py-2 rounded-lg transition-colors ${
                  mode === 'login' ? 'bg-[#0D0D10] text-white shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                {lang === 'ur' ? 'سائن اِن' : 'Sign In'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                  setInfo(null);
                }}
                className={`py-2 rounded-lg transition-colors ${
                  mode === 'register' ? 'bg-[#0D0D10] text-white shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                {lang === 'ur' ? 'رجسٹر' : 'Register'}
              </button>
            </div>
          )}

          {/* PRIMARY SOCIAL LOGIN: GOOGLE */}
          {!emailVerificationPending && mode !== 'forgot' && (
            <>
              <button
                type="button"
                disabled={loading}
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-2xl border border-zinc-200 bg-white hover:bg-zinc-50 text-xs font-bold text-zinc-800 transition-colors shadow-xs disabled:opacity-60"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.19v3.15C3.17 21.32 7.22 24 12 24z" />
                  <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.19C.43 8.12 0 9.87 0 12s.43 3.88 1.19 5.42l4.09-3.15z" />
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.22 0 3.17 2.68 1.19 6.58l4.09 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                </svg>
                {lang === 'ur' ? 'Google کے ساتھ جاری رکھیں' : 'Continue with Google'}
              </button>

              <div className="relative flex items-center justify-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-200" />
                </div>
                <span className="relative bg-white px-3 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                  {lang === 'ur' ? 'یا ای میل کے ساتھ' : 'Or sign in with Email'}
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

          {/* EMAIL VERIFICATION CHECK SCREEN */}
          {emailVerificationPending ? (
            <div className="space-y-4 text-xs text-center">
              <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
                <Mail className="w-9 h-9 text-[#D4A017] mx-auto" />
                <p className="font-bold text-sm text-[#0D0D10]">Verify Your Email Address</p>
                <p className="text-zinc-600 leading-relaxed">
                  Open the verification email sent to <strong className="font-mono">{email}</strong> and click the verification link (please check Spam/Promotions if not in Inbox).
                </p>
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={handleCheckEmailVerified}
                className="w-full py-3.5 rounded-2xl bg-[#D4A017] text-[#0D0D10] font-bold text-sm hover:bg-[#EAB308] flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                {loading ? 'Checking Verification...' : "I've Verified — Continue"}
              </button>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setEmailVerificationPending(false);
                    setError(null);
                  }}
                  className="text-zinc-500 hover:text-zinc-900 font-semibold"
                >
                  ← Change Email
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={async () => {
                    try {
                      await resendFirebaseEmailVerification();
                      setInfo('Verification email resent! Please check your inbox.');
                    } catch (err: any) {
                      setError(formatFirebaseAuthError(err, 'Verification Email'));
                    }
                  }}
                  className="text-[#B8860B] hover:underline font-semibold inline-flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  Resend Link
                </button>
              </div>
            </div>
          ) : (
            /* EMAIL LOGIN / REGISTER / FORGOT PASSWORD FORM */
            <form onSubmit={handleEmailSubmit} className="space-y-4 text-xs">
              {mode === 'register' && (
                <>
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Full Name</label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                      <input
                        type="text"
                        required
                        placeholder="e.g. Ali Ahmed"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 font-medium focus:ring-2 focus:ring-[#D4A017]"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">Mobile (Optional)</label>
                      <input
                        type="tel"
                        placeholder="03XXXXXXXXX"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">City</label>
                      <select
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 bg-white"
                      >
                        <option value="Islamabad">Islamabad</option>
                        <option value="Rawalpindi">Rawalpindi</option>
                        <option value="Lahore">Lahore</option>
                        <option value="Karachi">Karachi</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 font-medium focus:ring-2 focus:ring-[#D4A017]"
                  />
                </div>
              </div>

              {mode !== 'forgot' && (
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 font-medium focus:ring-2 focus:ring-[#D4A017]"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-2xl bg-[#0D0D10] text-white font-bold text-sm hover:bg-zinc-800 transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading
                  ? 'Please wait...'
                  : mode === 'login'
                  ? 'Sign In with Email'
                  : mode === 'register'
                  ? 'Register with Email'
                  : 'Send Password Reset Email'}
              </button>

              <div className="flex justify-between pt-1 text-[11px] text-zinc-500">
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === 'forgot' ? 'login' : 'forgot');
                    setError(null);
                    setInfo(null);
                  }}
                  className="hover:text-[#0D0D10] font-semibold"
                >
                  {mode === 'forgot' ? '← Back to Sign In' : 'Forgot Password?'}
                </button>
                <span>{lang === 'ur' ? 'ای میل لاگ اِن فعال ہے' : 'Email Auth Active'}</span>
              </div>
            </form>
          )}

          {/* DIMMED, DISABLED CIRCULAR "COMING SOON" BUTTONS AT BOTTOM (Facebook & Phone OTP) */}
          {!emailVerificationPending && (
            <div className="pt-4 border-t border-zinc-100 flex flex-col items-center gap-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                {lang === 'ur' ? 'فیس بک اور فون او ٹی پی · کمنگ سون' : 'Facebook & Phone SMS OTP · Coming Soon'}
              </span>
              <div className="flex items-center justify-center gap-4">
                <div className="flex flex-col items-center gap-1 opacity-45 select-none">
                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    title="Facebook Login — Coming Soon (Under Meta Review)"
                    className="w-10 h-10 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-[#1877F2] cursor-not-allowed"
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                  </button>
                  <span className="text-[9px] font-semibold text-zinc-400">
                    {lang === 'ur' ? 'کمنگ سون' : 'Coming Soon'}
                  </span>
                </div>

                <div className="flex flex-col items-center gap-1 opacity-45 select-none">
                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    title="Phone SMS OTP — Coming Soon"
                    className="w-10 h-10 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-600 cursor-not-allowed"
                  >
                    <Phone className="w-4 h-4" />
                  </button>
                  <span className="text-[9px] font-semibold text-zinc-400">
                    {lang === 'ur' ? 'کمنگ سون' : 'Coming Soon'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

