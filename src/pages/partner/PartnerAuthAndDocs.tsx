import React, { useEffect, useState } from 'react';
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
import { formatFirebaseAuthError, useFirebase } from '../../contexts/FirebaseContext';
import { apiRequest, isBackendOfflineError, setRoleToken, setStoredRoleUser } from '../../utils/api';
import type {
  Language,
  PartnerDocument,
  PartnerProfile,
  PublicConfig,
  ServiceType,
  User,
} from '../../types';

// Screen 17: Pro Partner Login / Registration (Google, Facebook, Email, Phone SMS OTP)
export const PartnerAuth: React.FC<{
  lang: Language;
  onChangeLang: (l: Language) => void;
  onAuthenticated: (token: string, user: User, profile: PartnerProfile) => void;
  onBackWelcome: () => void;
}> = ({ lang, onChangeLang, onAuthenticated, onBackWelcome }) => {
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

  const [authMethod, setAuthMethod] = useState<'email' | 'phone'>('email');
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('Islamabad');
  const [operatingArea, setOperatingArea] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [phoneStep, setPhoneStep] = useState<'input' | 'verify'>('input');
  const [confirmationResult, setConfirmationResult] = useState<any>(null);
  const [serverOtpDevCode, setServerOtpDevCode] = useState<string | null>(null);
  const [phoneAuthSource, setPhoneAuthSource] = useState<'firebase' | 'server'>('firebase');
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
      phone: fbUser.phoneNumber || phone || '03001234567',
      whatsapp: whatsapp || fbUser.phoneNumber || phone || '03001234567',
      email: fbUser.email || email || `${fbUser.uid}@prorider.pk`,
      city,
      operating_area: operatingArea || 'City Center',
      phone_verified: 1,
      status: 'active',
      created_at: new Date().toISOString(),
    };
    const profile: PartnerProfile = {
      user_id: fbUser.uid,
      verification_status: 'incomplete',
      cnic_number: '',
      cnic_expiry: '',
      licence_number: '',
      licence_expiry: '',
      vehicle_category_id: 'fleet-sedan',
      vehicle_name: '',
      vehicle_number: '',
      seating_capacity: 4,
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
    try {
      const res = await apiRequest<{ token: string; user: User; partnerProfile: PartnerProfile }>(
        '/api/auth/google/firebase',
        { method: 'POST', body: { idToken, role: 'partner', city } }
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

  const handleFacebookSignIn = async () => {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const { idToken, user: fbUser } = await signInWithFacebookPopup('partner', city, lang);
      await finalizePartnerSession(idToken, fbUser);
    } catch (err: any) {
      setError(formatFirebaseAuthError(err, 'Facebook'));
    } finally {
      setLoading(false);
    }
  };

  const handleSendPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!phone || phone.replace(/\D+/g, '').length < 10) {
      setError('Please enter a valid mobile number (e.g. 03001234567).');
      return;
    }
    setLoading(true);
    try {
      const confirmation = await sendFirebasePhoneOtp(phone, 'recaptcha-partner-phone');
      setConfirmationResult(confirmation);
      setPhoneAuthSource('firebase');
      setServerOtpDevCode(null);
      setPhoneStep('verify');
      setInfo(`6-digit SMS OTP code sent to ${phone}.`);
    } catch (fbErr: any) {
      try {
        const res = await apiRequest<{ message: string; devOtpCode?: string }>('/api/auth/otp/send', {
          method: 'POST',
          body: { phone, role: 'partner', purpose: 'login' },
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
          'partner',
          city,
          lang
        );
        await finalizePartnerSession(idToken, fbUser, fullName || `Partner ${phone.slice(-4)}`);
      } else {
        await apiRequest('/api/auth/otp/verify', {
          method: 'POST',
          body: { phone, role: 'partner', code: otpCode.trim() },
        });
        const res = await apiRequest<{ token: string; user: User; partnerProfile: PartnerProfile }>(
          '/api/auth/partner/login',
          { method: 'POST', body: { identifier: phone, password: password || 'PhoneVerifiedLogin123!' } }
        );
        setRoleToken('partner', res.token);
        setStoredRoleUser('partner', res.user);
        onAuthenticated(res.token, res.user, res.partnerProfile);
      }
    } catch (err: any) {
      setError(formatFirebaseAuthError(err, 'Phone OTP'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (mode === 'forgot') {
      if (!email || !email.includes('@')) {
        setError('Please enter the email address associated with your Pro Partner account.');
        return;
      }
      setLoading(true);
      try {
        await sendFirebasePasswordReset(email);
        setInfo(`Password reset link sent to ${email}.`);
      } catch (err: any) {
        setError(formatFirebaseAuthError(err, 'Password Reset'));
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        try {
          const fbRes = await signInWithFirebaseEmail({
            email,
            password,
            role: 'partner',
            city,
            lang,
          });
          if (!fbRes.emailVerified) {
            setEmailVerificationPending(true);
            setInfo(`Verification email sent to ${email}. Please click the link and tap "I've Verified — Continue".`);
            setLoading(false);
            return;
          }
          await finalizePartnerSession(fbRes.idToken, fbRes.user);
        } catch (fbErr: any) {
          try {
            const res = await apiRequest<{ token: string; user: User; partnerProfile: PartnerProfile }>(
              '/api/auth/partner/login',
              { method: 'POST', body: { identifier: email || phone, password } }
            );
            setRoleToken('partner', res.token);
            setStoredRoleUser('partner', res.user);
            onAuthenticated(res.token, res.user, res.partnerProfile);
            return;
          } catch (apiErr) {
            if (!isBackendOfflineError(apiErr)) throw apiErr;
            throw fbErr;
          }
        }
      } else {
        const fbRes = await registerWithFirebaseEmail({
          fullName,
          email,
          password,
          role: 'partner',
          city,
          lang,
        });
        void apiRequest('/api/auth/partner/register', {
          method: 'POST',
          body: { fullName, phone, whatsapp, email, city, operatingArea, password },
        }).catch(() => {});

        if (fbRes.emailVerified) {
          await finalizePartnerSession(fbRes.idToken, fbRes.user, fullName);
        } else {
          setEmailVerificationPending(true);
          setInfo(`Verification email sent to ${email}. Open your inbox and verify before continuing.`);
        }
      }
    } catch (err: any) {
      setError(formatFirebaseAuthError(err, 'Pro Partner Auth'));
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
              Sign in with Google, Facebook, Email Verification, or Phone SMS OTP.
            </p>
          </div>

          <div id="recaptcha-partner-phone" />

          {!emailVerificationPending && (
            <>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-zinc-900 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => { setMode('login'); setPhoneStep('input'); setError(null); setInfo(null); }}
                  className={`py-2 rounded-lg ${mode === 'login' ? 'bg-[#D4A017] text-[#0D0D10] font-bold' : 'text-zinc-400'}`}
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('register'); setPhoneStep('input'); setError(null); setInfo(null); }}
                  className={`py-2 rounded-lg ${mode === 'register' ? 'bg-[#D4A017] text-[#0D0D10] font-bold' : 'text-zinc-400'}`}
                >
                  Register
                </button>
              </div>

              {mode !== 'forgot' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleGoogleSignIn}
                      className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 disabled:opacity-60"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.9 1.5l2.7-2.6C16.9 3.3 14.7 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
                      </svg>
                      Google
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleFacebookSignIn}
                      className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#1877F2] hover:bg-[#1565C0] text-white text-xs font-bold disabled:opacity-60"
                    >
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                      Facebook
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-zinc-900 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => { setAuthMethod('email'); setPhoneStep('input'); setError(null); }}
                      className={`py-2 rounded-lg ${authMethod === 'email' ? 'bg-zinc-800 text-white' : 'text-zinc-400'}`}
                    >
                      Email Verification
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAuthMethod('phone'); setPhoneStep('input'); setError(null); }}
                      className={`py-2 rounded-lg ${authMethod === 'phone' ? 'bg-zinc-800 text-white' : 'text-zinc-400'}`}
                    >
                      Phone SMS OTP
                    </button>
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
          ) : authMethod === 'phone' && mode !== 'forgot' ? (
            phoneStep === 'input' ? (
              <form onSubmit={handleSendPhoneOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Mobile Number</label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                    <input
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="03001234567"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white font-mono"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-[#D4A017] text-[#0D0D10] text-sm font-bold hover:bg-[#EAB308]"
                >
                  {loading ? 'Sending SMS OTP...' : 'Send 6-Digit SMS OTP'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyPhoneOtp} className="space-y-4">
                {serverOtpDevCode && (
                  <p className="text-xs text-amber-300 font-mono text-center">Local Dev OTP: {serverOtpDevCode}</p>
                )}
                <input
                  required
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="Enter 6-digit OTP"
                  className="w-full text-center tracking-[0.6em] py-3 rounded-xl border border-[#D4A017] bg-zinc-900 text-lg text-white font-mono"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-[#D4A017] text-[#0D0D10] text-sm font-bold"
                >
                  {loading ? 'Verifying...' : 'Verify SMS OTP & Sign In'}
                </button>
              </form>
            )
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
                      <label className="block text-xs font-semibold text-zinc-300 mb-1">Mobile Number</label>
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
                  ? 'Sign In as Pro Partner'
                  : mode === 'register'
                  ? 'Register & Verify Email'
                  : 'Send Password Reset Email'}
              </button>
            </form>
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
