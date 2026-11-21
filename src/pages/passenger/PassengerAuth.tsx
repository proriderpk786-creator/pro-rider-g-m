import React, { useEffect, useState } from 'react';
import type { ConfirmationResult } from 'firebase/auth';
import {
  ArrowLeft,
  CheckCircle2,
  Lock,
  Mail,
  Phone,
  RefreshCw,
  ShieldCheck,
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

type AuthMethod = 'phone' | 'email';
type AuthMode = 'login' | 'register' | 'forgot';

export const PassengerAuth: React.FC<PassengerAuthProps> = ({
  lang,
  onChangeLang,
  onAuthenticated,
  onBackWelcome,
}) => {
  const {
    signInWithGooglePopup,
    signInWithFacebookPopup,
    registerWithFirebaseEmail,
    signInWithFirebaseEmail,
    resendFirebaseEmailVerification,
    reloadFirebaseUser,
    sendFirebasePasswordReset,
    sendFirebasePhoneOtp,
    confirmFirebasePhoneOtp,
    redirectAuthUser,
    redirectError,
    clearRedirectState,
  } = useFirebase();

  const [authMethod, setAuthMethod] = useState<AuthMethod>('email');
  const [mode, setMode] = useState<AuthMode>('login');

  // Form fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [city, setCity] = useState('Islamabad');

  // Phone SMS OTP Verification state
  const [phoneStep, setPhoneStep] = useState<'input' | 'verify'>('input');
  const [otpCode, setOtpCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [serverOtpDevCode, setServerOtpDevCode] = useState<string | null>(null);
  const [phoneAuthSource, setPhoneAuthSource] = useState<'firebase' | 'server'>('firebase');

  // Email Verification Step
  const [emailVerificationPending, setEmailVerificationPending] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const buildFirebaseUserRecord = (fbUser: {
    uid: string;
    displayName: string | null;
    email: string | null;
    phoneNumber: string | null;
  }, fallbackName?: string): User => ({
    id: fbUser.uid,
    role: 'passenger',
    full_name: fbUser.displayName || fallbackName || fbUser.email?.split('@')[0] || 'Verified Passenger',
    phone: fbUser.phoneNumber || phone || '03125007782',
    whatsapp: fbUser.phoneNumber || phone || '03125007782',
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
      // Static hosting (Vercel) without Express backend: persist Firebase-verified session cleanly
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
        if (active) setError(formatFirebaseAuthError(err, 'Social Login'));
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

  // 2. FACEBOOK LOGIN
  const handleFacebookSignIn = async () => {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const { idToken, user: fbUser } = await signInWithFacebookPopup('passenger', city, lang);
      await finalizeSession(idToken, fbUser);
    } catch (err: any) {
      setError(formatFirebaseAuthError(err, 'Facebook'));
    } finally {
      setLoading(false);
    }
  };

  // 3. PHONE NUMBER SMS OTP — STEP 1: SEND CODE
  const handleSendPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!phone || phone.replace(/\D+/g, '').length < 10) {
      setError('Please enter a valid Pakistan mobile number (e.g. 03125007782).');
      return;
    }
    setLoading(true);
    try {
      const confirmation = await sendFirebasePhoneOtp(phone, 'recaptcha-passenger-phone');
      setConfirmationResult(confirmation);
      setPhoneAuthSource('firebase');
      setServerOtpDevCode(null);
      setPhoneStep('verify');
      setInfo(`6-digit SMS OTP code sent to ${phone}.`);
    } catch (fbErr: any) {
      // If Express OTP endpoint is active locally, allow server OTP as fallback; otherwise show real Firebase setup message
      try {
        const res = await apiRequest<{ message: string; devOtpCode?: string }>('/api/auth/otp/send', {
          method: 'POST',
          body: { phone, role: 'passenger', purpose: 'login' },
        });
        setPhoneAuthSource('server');
        setServerOtpDevCode(res.devOtpCode || null);
        setPhoneStep('verify');
        setInfo(res.message || `Verification OTP sent to ${phone}.`);
      } catch {
        setError(formatFirebaseAuthError(fbErr, 'Phone SMS'));
      }
    } finally {
      setLoading(false);
    }
  };

  // 3B. PHONE NUMBER SMS OTP — STEP 2: VERIFY CODE
  const handleVerifyPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!otpCode || otpCode.trim().length !== 6) {
      setError('Please enter the 6-digit SMS verification code.');
      return;
    }
    setLoading(true);
    try {
      if (phoneAuthSource === 'firebase' && confirmationResult) {
        const { idToken, user: fbUser } = await confirmFirebasePhoneOtp(
          confirmationResult,
          otpCode,
          'passenger',
          city,
          lang
        );
        await finalizeSession(idToken, fbUser, fullName || `Passenger ${phone.slice(-4)}`);
      } else {
        await apiRequest('/api/auth/otp/verify', {
          method: 'POST',
          body: { phone, role: 'passenger', code: otpCode.trim() },
        });
        try {
          const res = await apiRequest<{ token: string; user: User }>('/api/auth/passenger/login', {
            method: 'POST',
            body: { identifier: phone, password: 'PhoneVerifiedLogin123!' },
          });
          setRoleToken('passenger', res.token);
          setStoredRoleUser('passenger', res.user);
          onAuthenticated(res.token, res.user);
        } catch {
          const res = await apiRequest<{ token: string; user: User }>('/api/auth/passenger/register', {
            method: 'POST',
            body: {
              fullName: fullName || `Passenger ${phone.slice(-4)}`,
              phone,
              whatsapp: phone,
              email: email || `${phone}@prorider.pk`,
              city,
              password: password || 'PhoneVerifiedLogin123!',
              acceptedPolicy: true,
            },
          });
          setRoleToken('passenger', res.token);
          setStoredRoleUser('passenger', res.user);
          onAuthenticated(res.token, res.user);
        }
      }
    } catch (err: any) {
      setError(formatFirebaseAuthError(err, 'Phone OTP'));
    } finally {
      setLoading(false);
    }
  };

  // 4. EMAIL & PASSWORD AUTH + VERIFICATION
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    if (mode === 'forgot') {
      setLoading(true);
      try {
        await sendFirebasePasswordReset(email);
        setInfo(`Password reset link sent to ${email}. Check your inbox and Spam folder.`);
      } catch (err: any) {
        setError(formatFirebaseAuthError(err, 'Password Reset'));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (mode === 'register' && !fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'register') {
        const res = await registerWithFirebaseEmail({
          fullName,
          email,
          password,
          role: 'passenger',
          city,
          lang,
        });
        // Best-effort sync to Express backend if running
        void apiRequest('/api/auth/passenger/register', {
          method: 'POST',
          body: {
            fullName,
            phone: phone || '03120000000',
            whatsapp: phone || '03120000000',
            email,
            city,
            password,
            acceptedPolicy: true,
          },
        }).catch(() => {});

        if (res.emailVerified) {
          await finalizeSession(res.idToken, res.user, fullName);
        } else {
          setEmailVerificationPending(true);
          setInfo(`A verification link has been sent to ${email}. Click the link in your email, then tap "I've Verified — Continue".`);
        }
      } else {
        // Sign In: Try Firebase Auth first; if Express DB only has legacy user, fall back cleanly to Express login
        try {
          const res = await signInWithFirebaseEmail({
            email,
            password,
            role: 'passenger',
            city,
            lang,
          });
          if (!res.emailVerified) {
            setEmailVerificationPending(true);
            setInfo(`Please verify your email (${email}) using the link sent to your inbox, then tap "I've Verified — Continue".`);
            setLoading(false);
            return;
          }
          await finalizeSession(res.idToken, res.user);
        } catch (fbErr: any) {
          try {
            const expressRes = await apiRequest<{ token: string; user: User }>('/api/auth/passenger/login', {
              method: 'POST',
              body: { identifier: email, password },
            });
            setRoleToken('passenger', expressRes.token);
            setStoredRoleUser('passenger', expressRes.user);
            onAuthenticated(expressRes.token, expressRes.user);
            return;
          } catch (apiErr) {
            if (!isBackendOfflineError(apiErr)) {
              throw apiErr;
            }
            throw fbErr;
          }
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
        setError('Your email is not verified yet. Open the verification email in your inbox (or Spam), click the link, then try again.');
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
    <div dir={lang === 'ur' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#F8F8FA] flex flex-col">
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
        <div className="w-full max-w-md rounded-3xl bg-white border border-zinc-200 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="space-y-1 text-center sm:text-left">
            <p className="text-xs font-bold uppercase tracking-widest text-[#B8860B]">Passenger Portal</p>
            <h1 className="font-display text-2xl font-bold text-[#0D0D10]">
              {mode === 'login' ? 'Welcome Back' : mode === 'register' ? 'Create Account' : 'Reset Password'}
            </h1>
            <p className="text-xs text-zinc-500">
              Sign in securely with Google, Facebook, Email, or Phone SMS OTP.
            </p>
          </div>

          {/* Invisible reCAPTCHA mount point for Firebase Phone Auth */}
          <div id="recaptcha-passenger-phone" />

          {/* Mode Switcher */}
          {!emailVerificationPending && (
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-zinc-100 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setPhoneStep('input');
                  setError(null);
                  setInfo(null);
                }}
                className={`py-2 rounded-lg transition-colors ${
                  mode === 'login' ? 'bg-[#0D0D10] text-white shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setPhoneStep('input');
                  setError(null);
                  setInfo(null);
                }}
                className={`py-2 rounded-lg transition-colors ${
                  mode === 'register' ? 'bg-[#0D0D10] text-white shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Register
              </button>
            </div>
          )}

          {/* SOCIAL LOGIN BUTTONS (Google & Facebook) */}
          {!emailVerificationPending && mode !== 'forgot' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleGoogleSignIn}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-zinc-200 bg-white hover:bg-zinc-50 text-xs font-semibold text-zinc-800 transition-colors shadow-xs disabled:opacity-60"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" />
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.19v3.15C3.17 21.32 7.22 24 12 24z" />
                    <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.19C.43 8.12 0 9.87 0 12s.43 3.88 1.19 5.42l4.09-3.15z" />
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.22 0 3.17 2.68 1.19 6.58l4.09 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                  </svg>
                  Google
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={handleFacebookSignIn}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-[#1877F2] hover:bg-[#1565C0] text-xs font-semibold text-white transition-colors shadow-xs disabled:opacity-60"
                >
                  <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                  Facebook
                </button>
              </div>

              <div className="relative flex items-center justify-center">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-200" /></div>
                <span className="relative bg-white px-3 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                  Or continue with Email / Phone
                </span>
              </div>

              {/* METHOD SELECTOR TABS */}
              <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-zinc-100 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMethod('email');
                    setPhoneStep('input');
                    setError(null);
                    setInfo(null);
                  }}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all ${
                    authMethod === 'email' ? 'bg-white text-[#0D0D10] font-bold shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5 text-[#D4A017]" />
                  Email Verification
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMethod('phone');
                    setPhoneStep('input');
                    setError(null);
                    setInfo(null);
                  }}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all ${
                    authMethod === 'phone' ? 'bg-white text-[#0D0D10] font-bold shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  <Phone className="w-3.5 h-3.5 text-[#D4A017]" />
                  Phone SMS OTP
                </button>
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
          ) : authMethod === 'email' ? (
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
                      <label className="block font-semibold text-zinc-700 mb-1">Mobile Number</label>
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
                  ? 'Register & Send Verification Email'
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
                <span>Verified Email Required</span>
              </div>
            </form>
          ) : phoneStep === 'input' ? (
            /* PHONE SMS OTP STEP 1 */
            <form onSubmit={handleSendPhoneOtp} className="space-y-4 text-xs">
              {mode === 'register' && (
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Full Name</label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="e.g. Ali Ahmed"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 font-medium focus:ring-2 focus:ring-[#D4A017]"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Mobile Number (Pakistan)</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                  <input
                    type="tel"
                    required
                    placeholder="03125007782"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 font-mono font-bold focus:ring-2 focus:ring-[#D4A017]"
                  />
                </div>
                <span className="text-[11px] text-zinc-400 mt-1 block">
                  A 6-digit SMS verification code will be sent via Firebase Phone Auth.
                </span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-2xl bg-[#0D0D10] text-white font-bold text-sm hover:bg-zinc-800 transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? 'Sending SMS OTP...' : 'Send 6-Digit SMS OTP'}
              </button>
            </form>
          ) : (
            /* PHONE SMS OTP STEP 2 */
            <form onSubmit={handleVerifyPhoneOtp} className="space-y-5 text-xs animate-in fade-in">
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-center space-y-1">
                <ShieldCheck className="w-8 h-8 text-[#D4A017] mx-auto mb-1" />
                <p className="font-bold text-sm text-[#0D0D10]">Enter 6-Digit SMS Code</p>
                <p className="text-zinc-600">
                  Sent to <strong className="font-mono">{phone}</strong>
                </p>
                {serverOtpDevCode && (
                  <p className="text-[11px] text-amber-800 font-mono pt-1">
                    Local Dev OTP Code: <strong>{serverOtpDevCode}</strong>
                  </p>
                )}
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1.5 text-center">Verification Code (OTP)</label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  autoFocus
                  placeholder="123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="w-full text-center tracking-[0.8em] font-mono text-2xl font-bold py-3 rounded-2xl border-2 border-[#D4A017] bg-white focus:outline-none focus:ring-2 focus:ring-[#D4A017]/50"
                />
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setPhoneStep('input');
                    setError(null);
                  }}
                  className="text-zinc-500 hover:text-zinc-900 font-semibold"
                >
                  ← Change Number
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleSendPhoneOtp as any}
                  className="text-[#D4A017] hover:underline font-semibold"
                >
                  Resend SMS Code
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 rounded-2xl bg-[#D4A017] text-[#0D0D10] font-bold text-sm hover:bg-[#EAB308] transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? (
                  <span>Verifying Code...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Verify SMS OTP &amp; Sign In
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
};
