import React, { useState } from 'react';
import { ArrowLeft, Lock, Phone, ShieldCheck, User as UserIcon } from 'lucide-react';
import { BrandLogo, LanguageToggle } from '../../components/BrandMark';
import { useFirebase } from '../../contexts/FirebaseContext';
import { apiRequest, setRoleToken } from '../../utils/api';
import type { Language, User } from '../../types';

interface PassengerAuthProps {
  lang: Language;
  onChangeLang: (l: Language) => void;
  onAuthenticated: (token: string, user: User) => void;
  onBackWelcome: () => void;
}

export const PassengerAuth: React.FC<PassengerAuthProps> = ({
  lang,
  onChangeLang,
  onAuthenticated,
  onBackWelcome,
}) => {
  const { signInWithGooglePopup } = useFirebase();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('Islamabad');
  const [password, setPassword] = useState('');
  const [acceptedPolicy, setAcceptedPolicy] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const { idToken } = await signInWithGooglePopup('passenger', city, lang);
      const res = await apiRequest<{ token: string; user: User }>('/api/auth/google/firebase', {
        method: 'POST',
        body: { idToken, role: 'passenger', city },
      });
      setRoleToken('passenger', res.token);
      onAuthenticated(res.token, res.user);
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
        const res = await apiRequest<{ token: string; user: User }>('/api/auth/passenger/login', {
          method: 'POST',
          body: { identifier: phone, password },
        });
        setRoleToken('passenger', res.token);
        onAuthenticated(res.token, res.user);
      } else if (mode === 'register') {
        const res = await apiRequest<{ token: string; user: User }>('/api/auth/passenger/register', {
          method: 'POST',
          body: { fullName, phone, whatsapp, email, city, password, acceptedPolicy },
        });
        setRoleToken('passenger', res.token);
        onAuthenticated(res.token, res.user);
      } else {
        const res = await apiRequest<{ message: string }>('/api/auth/forgot-password', {
          method: 'POST',
          body: { phone, role: 'passenger' },
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
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-widest text-[#B8860B]">Passenger Portal</p>
            <h1 className="font-display text-2xl font-bold text-[#0D0D10]">
              {mode === 'login' ? 'Passenger Sign In' : mode === 'register' ? 'Create Passenger Account' : 'Reset Password'}
            </h1>
            <p className="text-xs text-zinc-500">
              Dedicated Passenger access for Pick &amp; Drop, Ride Sharing, Fuel Sharing, and Wallet.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-zinc-100 text-xs font-semibold">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(null); setInfo(null); }}
              className={`py-2 rounded-lg transition-colors ${mode === 'login' ? 'bg-[#0D0D10] text-white' : 'text-zinc-600'}`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(null); setInfo(null); }}
              className={`py-2 rounded-lg transition-colors ${mode === 'register' ? 'bg-[#0D0D10] text-white' : 'text-zinc-600'}`}
            >
              Register
            </button>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700 font-medium">
              {error}
            </div>
          )}
          {info && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-800 font-medium">
              {info}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Full Name</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                  <input
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Ali Khan"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 text-sm"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                {mode === 'login' ? 'Mobile Number or Email' : 'Mobile Number'}
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                <input
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="03XXXXXXXXX"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 text-sm"
                />
              </div>
            </div>

            {mode === 'register' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">WhatsApp Number</label>
                    <input
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      placeholder="03XXXXXXXXX"
                      className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">City</label>
                    <select
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm bg-white"
                    >
                      <option value="Islamabad">Islamabad</option>
                      <option value="Rawalpindi">Rawalpindi</option>
                      <option value="Lahore">Lahore</option>
                      <option value="Karachi">Karachi</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Email Address (Optional)</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm"
                  />
                </div>
              </>
            )}

            {mode !== 'forgot' && (
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
                  <input
                    required
                    type="password"
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 text-sm"
                  />
                </div>
              </div>
            )}

            {mode === 'register' && (
              <label className="flex items-start gap-2.5 text-xs text-zinc-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptedPolicy}
                  onChange={(e) => setAcceptedPolicy(e.target.checked)}
                  className="mt-0.5 accent-[#D4A017]"
                />
                <span>
                  I accept the PRO RIDER AI Privacy Policy and Terms of Service for Passenger bookings.
                </span>
              </label>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-[#D4A017] text-[#0D0D10] text-sm font-bold hover:bg-[#EAB308] transition-colors disabled:opacity-60"
            >
              {loading
                ? 'Please wait...'
                : mode === 'login'
                ? 'Login as Passenger'
                : mode === 'register'
                ? 'Register Passenger Account'
                : 'Request Reset Instructions'}
            </button>
          </form>

          {mode !== 'forgot' && (
            <div className="space-y-2.5">
              <div className="relative flex items-center justify-center text-[11px] text-zinc-400">
                <span className="h-px bg-zinc-200 flex-1" />
                <span className="px-2">or sync with Google Cloud</span>
                <span className="h-px bg-zinc-200 flex-1" />
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={handleGoogleSignIn}
                className="w-full py-2.5 rounded-xl border border-zinc-300 bg-white text-[#0D0D10] text-xs font-bold hover:bg-zinc-50 flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.9 1.5l2.7-2.6C16.9 3.3 14.7 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
                </svg>
                Continue with Google
              </button>
            </div>
          )}

          <div className="flex items-center justify-between text-xs pt-2 border-t border-zinc-100">
            <button
              type="button"
              onClick={() => setMode(mode === 'forgot' ? 'login' : 'forgot')}
              className="text-zinc-600 hover:text-[#0D0D10] font-medium"
            >
              {mode === 'forgot' ? 'Back to Login' : 'Forgot Password?'}
            </button>
            <span className="inline-flex items-center gap-1 text-zinc-500">
              <ShieldCheck className="w-3.5 h-3.5 text-[#D4A017]" />
              Passenger Only Session
            </span>
          </div>
        </div>
      </main>
    </div>
  );
};
