import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Car,
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  Eye,
  EyeOff,
  Flame,
  HelpCircle,
  KeyRound,
  Lock,
  LogOut,
  Menu,
  Package,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Trash2,
  UserCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { BrandLogo, VehicleImage } from '../../components/BrandMark';
import { StreetMap } from '../../components/StreetMap';
import { apiRequest, getRoleToken, setRoleToken, useRoleWebSocket } from '../../utils/api';
import { downloadBookingPdf } from '../../utils/pdfGenerator';
import type {
  Booking,
  FleetCategory,
  MonthlyPackage,
  PassengerAccount,
  ServiceZone,
  SupportTicket,
  User,
  WalletTransaction,
} from '../../types';
import { FleetManagementTab } from './FleetManagementTab';
import { FareManagementTab } from './FareManagementTab';
import { PassengerManagementTab } from './PassengerManagementTab';
import { ZonesManagementTab } from './ZonesManagementTab';
import { BookingsManagementTab } from './BookingsManagementTab';

type AdminTab =
  | 'dashboard'
  | 'fleet'
  | 'fares'
  | 'passengers'
  | 'partners'
  | 'bookings'
  | 'zones'
  | 'schedule'
  | 'packages'
  | 'finance'
  | 'tickets'
  | 'security';

type AdminAuthMode = 'login' | 'setup' | 'recovery';

interface AdminPortalProps {
  currentPath?: string;
  onNavigate?: (path: string) => void;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({ currentPath = '/admin', onNavigate }) => {
  const [token, setToken] = useState<string | null>(() => getRoleToken('admin'));
  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [setupCompleted, setSetupCompleted] = useState<boolean | null>(null);
  const [authMode, setAuthMode] = useState<AdminAuthMode>('login');

  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

  // Setup state
  const [setupEmail, setSetupEmail] = useState('');
  const [setupPhone, setSetupPhone] = useState('');
  const [setupChallenge, setSetupChallenge] = useState<{ challengeId: string; challengeToken: string } | null>(null);
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');
  const [setupPhrase, setSetupPhrase] = useState('');
  const [issuedBackupKey, setIssuedBackupKey] = useState<string | null>(null);
  const [pendingSession, setPendingSession] = useState<{ token: string; user: User } | null>(null);
  const [backupSavedAck, setBackupSavedAck] = useState(false);

  // Recovery state
  const [recEmail, setRecEmail] = useState('');
  const [recPhone, setRecPhone] = useState('');
  const [recMethod, setRecMethod] = useState<'phrase' | 'backup_key'>('phrase');
  const [recSecret, setRecSecret] = useState('');
  const [recChallenge, setRecChallenge] = useState<{
    challengeId: string;
    challengeToken: string;
    recoveredViaBackupKey?: boolean;
  } | null>(null);
  const [recNewPass, setRecNewPass] = useState('');
  const [recConfirmPass, setRecConfirmPass] = useState('');
  const [recRotateKey, setRecRotateKey] = useState(true);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [overview, setOverview] = useState<any>(null);
  const [partners, setPartners] = useState<any[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [fleet, setFleet] = useState<FleetCategory[]>([]);
  const [zones, setZones] = useState<ServiceZone[]>([]);
  const [packages, setPackages] = useState<MonthlyPackage[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [securityLogs, setSecurityLogs] = useState<any[]>([]);
  const [passengers, setPassengers] = useState<PassengerAccount[]>([]);

  const [selectedFleetId, setSelectedFleetId] = useState<string>('');
  const [fareForm, setFareForm] = useState<Partial<FleetCategory>>({});
  const [newFleetName, setNewFleetName] = useState('');
  const [newFleetRate, setNewFleetRate] = useState('45');
  const [newPkgName, setNewPkgName] = useState('');
  const [newPkgPrice, setNewPkgPrice] = useState('24000');
  const [ticketReplies, setTicketReplies] = useState<Record<string, string>>({});
  const [partnerNotes, setPartnerNotes] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  const loadAdminStatus = useCallback(async () => {
    try {
      const res = await apiRequest<{ setupCompleted: boolean }>('/api/auth/admin/status');
      setSetupCompleted(res.setupCompleted);
      if (!res.setupCompleted) {
        setAuthMode('setup');
      }
    } catch {
      setSetupCompleted(true);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      loadAdminStatus();
    }
  }, [token, loadAdminStatus]);

  const loadAll = useCallback(async () => {
    if (!token) return;
    try {
      const [me, ov, prt, bks, flt, zns, pkgs, stg, fin, tkt, sec, psg] = await Promise.all([
        apiRequest<{ user: User }>('/api/auth/me', { role: 'admin' }),
        apiRequest('/api/admin/overview', { role: 'admin' }),
        apiRequest<{ partners: any[] }>('/api/admin/partners', { role: 'admin' }),
        apiRequest<{ bookings: Booking[] }>('/api/admin/bookings', { role: 'admin' }),
        apiRequest<{ fleet: FleetCategory[] }>('/api/admin/fleet', { role: 'admin' }),
        apiRequest<{ zones: ServiceZone[] }>('/api/admin/zones', { role: 'admin' }),
        apiRequest<{ packages: MonthlyPackage[] }>('/api/admin/packages', { role: 'admin' }),
        apiRequest<{ settings: Record<string, string> }>('/api/admin/settings', { role: 'admin' }),
        apiRequest<{ transactions: WalletTransaction[] }>('/api/admin/finance', { role: 'admin' }),
        apiRequest<{ tickets: SupportTicket[] }>('/api/admin/tickets', { role: 'admin' }),
        apiRequest<{ logs: any[] }>('/api/admin/security-logs', { role: 'admin' }),
        apiRequest<{ passengers: PassengerAccount[] }>('/api/admin/passengers', { role: 'admin' }),
      ]);
      setAdminUser(me.user);
      setOverview(ov);
      setPartners(prt.partners);
      setBookings(bks.bookings);
      setFleet(flt.fleet);
      setZones(zns.zones);
      setPackages(pkgs.packages);
      setSettings(stg.settings);
      setTransactions(fin.transactions);
      setTickets(tkt.tickets);
      setSecurityLogs(sec.logs);
      setPassengers(psg.passengers || []);

      if (flt.fleet.length > 0 && !selectedFleetId) {
        setSelectedFleetId(flt.fleet[0].id);
        setFareForm(flt.fleet[0]);
      }
    } catch {
      setRoleToken('admin', null);
      setToken(null);
      setAdminUser(null);
    }
  }, [token, selectedFleetId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (token && adminUser && currentPath === '/admin/login' && onNavigate) {
      onNavigate('/admin');
    }
  }, [token, adminUser, currentPath, onNavigate]);

  useRoleWebSocket('admin', token, (event) => {
    if (['booking:created', 'booking:updated', 'partner:document_uploaded', 'partner:location', 'support:new'].includes(event)) {
      loadAll();
    }
  });

  const completeAdminRedirect = (nextToken: string, nextUser: User) => {
    setRoleToken('admin', nextToken);
    setToken(nextToken);
    setAdminUser(nextUser);
    if (onNavigate) {
      onNavigate('/admin');
    } else if (window.location.pathname !== '/admin') {
      window.history.replaceState({}, '', '/admin');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginBusy(true);
    setLoginError(null);
    try {
      const res = await apiRequest<{ token: string; user: User }>('/api/auth/admin/login', {
        method: 'POST',
        body: { email, password },
      });
      completeAdminRedirect(res.token, res.user);
    } catch (err: any) {
      setLoginError(err.message || 'Admin authorization denied');
    } finally {
      setLoginBusy(false);
    }
  };

  const handleSetupVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginBusy(true);
    setLoginError(null);
    try {
      const res = await apiRequest<{ challengeId: string; challengeToken: string }>(
        '/api/auth/admin/setup/verify-identity',
        {
          method: 'POST',
          body: { email: setupEmail, officialPhone: setupPhone },
        }
      );
      setSetupChallenge(res);
    } catch (err: any) {
      setLoginError(err.message || 'Identity verification failed');
    } finally {
      setLoginBusy(false);
    }
  };

  const handleSetupComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupChallenge) return;
    setLoginBusy(true);
    setLoginError(null);
    try {
      const res = await apiRequest<{ token: string; user: User; backupRecoveryKey: string }>(
        '/api/auth/admin/setup/complete',
        {
          method: 'POST',
          body: {
            email: setupEmail,
            challengeId: setupChallenge.challengeId,
            challengeToken: setupChallenge.challengeToken,
            password: setupPassword,
            confirmPassword: setupConfirm,
            recoveryPhrase: setupPhrase,
          },
        }
      );
      setIssuedBackupKey(res.backupRecoveryKey);
      setPendingSession({ token: res.token, user: res.user });
      setBackupSavedAck(false);
    } catch (err: any) {
      setLoginError(err.message || 'Unable to complete Super Admin setup');
    } finally {
      setLoginBusy(false);
    }
  };

  const handleRecoveryVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginBusy(true);
    setLoginError(null);
    try {
      const res = await apiRequest<{
        challengeId: string;
        challengeToken: string;
        recoveredViaBackupKey?: boolean;
      }>('/api/auth/admin/recovery/verify', {
        method: 'POST',
        body: {
          email: recEmail,
          officialPhone: recPhone,
          method: recMethod,
          secret: recSecret,
        },
      });
      setRecChallenge(res);
      if (res.recoveredViaBackupKey) {
        setRecRotateKey(true);
      }
    } catch (err: any) {
      setLoginError(err.message || 'Recovery verification failed');
    } finally {
      setLoginBusy(false);
    }
  };

  const handleRecoveryReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recChallenge) return;
    setLoginBusy(true);
    setLoginError(null);
    try {
      const res = await apiRequest<{ token: string; user: User; newBackupRecoveryKey?: string | null }>(
        '/api/auth/admin/recovery/reset',
        {
          method: 'POST',
          body: {
            email: recEmail,
            challengeId: recChallenge.challengeId,
            challengeToken: recChallenge.challengeToken,
            newPassword: recNewPass,
            confirmPassword: recConfirmPass,
            rotateBackupKey: recRotateKey,
          },
        }
      );
      if (res.newBackupRecoveryKey) {
        setIssuedBackupKey(res.newBackupRecoveryKey);
        setPendingSession({ token: res.token, user: res.user });
        setBackupSavedAck(false);
      } else {
        completeAdminRedirect(res.token, res.user);
      }
    } catch (err: any) {
      setLoginError(err.message || 'Password recovery failed');
    } finally {
      setLoginBusy(false);
    }
  };

  const handleLogout = () => {
    setRoleToken('admin', null);
    setToken(null);
    setAdminUser(null);
    setIssuedBackupKey(null);
    setPendingSession(null);
  };

  const passwordRules = (pw: string) => [
    { ok: pw.length >= 10, label: '10+ characters' },
    { ok: /[A-Z]/.test(pw), label: 'Uppercase (A-Z)' },
    { ok: /[a-z]/.test(pw), label: 'Lowercase (a-z)' },
    { ok: /[0-9]/.test(pw), label: 'Number (0-9)' },
    { ok: /[^A-Za-z0-9]/.test(pw), label: 'Special symbol (!@#$)' },
  ];

  if (!token || !adminUser) {
    return (
      <div className="min-h-screen bg-[#0D0D10] text-white flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md rounded-3xl bg-[#16171C] border border-zinc-800 p-6 sm:p-8 space-y-5 shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <BrandLogo dark compact />
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#D4A017]">
              <Lock className="w-3.5 h-3.5" />
              Private Admin
            </span>
          </div>

          {/* One-time Emergency Backup Recovery Key Confirmation Screen */}
          {issuedBackupKey && pendingSession ? (
            <div className="space-y-4">
              <div className="rounded-2xl bg-emerald-950/50 border border-emerald-700/60 p-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                  Super Admin Credentials Secured
                </p>
                <p className="text-xs text-zinc-200 leading-relaxed">
                  Save your one-time Emergency Backup Recovery Key offline right now. For your security, it will never be shown again.
                </p>
              </div>
              <div className="rounded-xl bg-zinc-900 border border-[#D4A017]/50 p-4 flex items-center justify-between gap-3">
                <code className="font-mono text-sm sm:text-base font-bold text-[#F4C430] tracking-wider break-all">
                  {issuedBackupKey}
                </code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(issuedBackupKey)}
                  className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </button>
              </div>
              <label className="flex items-start gap-2.5 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={backupSavedAck}
                  onChange={(e) => setBackupSavedAck(e.target.checked)}
                  className="mt-0.5 accent-[#D4A017]"
                />
                <span>I have copied and stored this Emergency Backup Recovery Key safely.</span>
              </label>
              <button
                type="button"
                disabled={!backupSavedAck}
                onClick={() => {
                  const sess = pendingSession;
                  setIssuedBackupKey(null);
                  setPendingSession(null);
                  completeAdminRedirect(sess.token, sess.user);
                }}
                className="w-full py-3 rounded-xl bg-[#D4A017] disabled:opacity-40 text-[#0D0D10] text-sm font-bold hover:bg-[#EAB308]"
              >
                Continue to Admin Dashboard
              </button>
            </div>
          ) : (
            <>
              {/* Mode Switcher */}
              <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-zinc-900 p-1 border border-zinc-800 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setLoginError(null);
                  }}
                  className={`py-2 rounded-lg transition-colors ${
                    authMode === 'login' ? 'bg-[#D4A017] text-[#0D0D10] font-bold' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('setup');
                    setLoginError(null);
                  }}
                  className={`py-2 rounded-lg transition-colors ${
                    authMode === 'setup' ? 'bg-[#D4A017] text-[#0D0D10] font-bold' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Account Setup
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('recovery');
                    setLoginError(null);
                  }}
                  className={`py-2 rounded-lg transition-colors ${
                    authMode === 'recovery' ? 'bg-[#D4A017] text-[#0D0D10] font-bold' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Forgot Password
                </button>
              </div>

              {loginError && (
                <div className="rounded-xl bg-red-950/60 border border-red-800 px-3.5 py-2.5 text-xs text-red-200">
                  {loginError}
                </div>
              )}

              {/* MODE 1: SUPER ADMIN SIGN IN */}
              {authMode === 'login' && (
                <div className="space-y-4">
                  <div>
                    <h1 className="font-display text-2xl font-bold">Super Admin Sign In</h1>
                    <p className="text-xs text-zinc-400 mt-1">
                      Authorized Super Admin access is verified exclusively on the backend server.
                    </p>
                  </div>

                  {setupCompleted === false && (
                    <div className="rounded-xl bg-amber-950/50 border border-amber-700/70 p-3.5 text-xs text-amber-200 space-y-2">
                      <p className="font-semibold">Protected First-Time Password Setup Required</p>
                      <p className="text-amber-200/80">
                        No password is set by default. Complete the protected setup process to create your own Super Admin password.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('setup');
                          setLoginError(null);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#D4A017] text-[#0D0D10] font-bold text-xs"
                      >
                        Start Account Setup
                      </button>
                    </div>
                  )}

                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1">Authorized Super Admin Email</label>
                      <input
                        type="email"
                        required
                        autoComplete="username"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter authorized Super Admin email"
                        className="w-full px-3.5 py-3 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-zinc-300">Password</label>
                        <button
                          type="button"
                          onClick={() => {
                            setAuthMode('recovery');
                            setLoginError(null);
                          }}
                          className="text-[11px] font-semibold text-[#D4A017] hover:underline"
                        >
                          Forgot Password?
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter your private Super Admin password"
                          className="w-full px-3.5 py-3 pr-11 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((s) => !s)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={loginBusy}
                      className="w-full py-3 rounded-xl bg-[#D4A017] text-[#0D0D10] text-sm font-bold hover:bg-[#EAB308] min-h-[44px]"
                    >
                      {loginBusy ? 'Authorizing...' : 'Authorize Super Admin'}
                    </button>
                  </form>
                </div>
              )}

              {/* MODE 2: PROTECTED SUPER ADMIN ACCOUNT SETUP */}
              {authMode === 'setup' && (
                <div className="space-y-4">
                  <div>
                    <h1 className="font-display text-xl sm:text-2xl font-bold">Protected Super Admin Setup</h1>
                    <p className="text-xs text-zinc-400 mt-1">
                      Verify your authorized Super Admin identity with the backend to create your private password and recovery credentials.
                    </p>
                  </div>

                  {setupCompleted === true && (
                    <div className="rounded-xl bg-zinc-900 border border-zinc-700 p-4 text-xs text-zinc-300 space-y-2">
                      <p className="font-semibold text-white">Account Setup Already Completed</p>
                      <p>
                        The Super Admin account already has a private password configured. Please sign in or use Forgot Password to securely reset it.
                      </p>
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setAuthMode('login')}
                          className="px-3 py-1.5 rounded-lg bg-[#D4A017] text-[#0D0D10] font-bold"
                        >
                          Go to Sign In
                        </button>
                        <button
                          type="button"
                          onClick={() => setAuthMode('recovery')}
                          className="px-3 py-1.5 rounded-lg bg-zinc-800 text-white font-semibold"
                        >
                          Forgot Password
                        </button>
                      </div>
                    </div>
                  )}

                  {setupCompleted !== true && !setupChallenge && (
                    <form onSubmit={handleSetupVerify} className="space-y-3.5">
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1">Authorized Super Admin Email</label>
                        <input
                          type="email"
                          required
                          value={setupEmail}
                          onChange={(e) => setSetupEmail(e.target.value)}
                          placeholder="Enter authorized Super Admin email"
                          className="w-full px-3.5 py-3 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1">
                          Registered Official Support Mobile / WhatsApp
                        </label>
                        <input
                          type="tel"
                          required
                          value={setupPhone}
                          onChange={(e) => setSetupPhone(e.target.value)}
                          placeholder="Enter registered official mobile number"
                          className="w-full px-3.5 py-3 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white font-mono"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={loginBusy}
                        className="w-full py-3 rounded-xl bg-[#D4A017] text-[#0D0D10] text-sm font-bold hover:bg-[#EAB308] min-h-[44px]"
                      >
                        {loginBusy ? 'Verifying with Server...' : 'Verify Authorized Identity'}
                      </button>
                    </form>
                  )}

                  {setupCompleted !== true && setupChallenge && (
                    <form onSubmit={handleSetupComplete} className="space-y-3.5">
                      <div className="rounded-xl bg-emerald-950/40 border border-emerald-800 px-3 py-2 text-[11px] text-emerald-300">
                        Identity verified. Create your strong private password &amp; personal recovery passphrase.
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1">Create Strong Password</label>
                        <input
                          type="password"
                          required
                          value={setupPassword}
                          onChange={(e) => setSetupPassword(e.target.value)}
                          placeholder="Min 10 chars, upper, lower, number, symbol"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white"
                        />
                        <div className="grid grid-cols-2 gap-1 mt-2 text-[10px]">
                          {passwordRules(setupPassword).map((r) => (
                            <span key={r.label} className={r.ok ? 'text-emerald-400' : 'text-zinc-500'}>
                              {r.ok ? '✓ ' : '○ '}
                              {r.label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1">Confirm Password</label>
                        <input
                          type="password"
                          required
                          value={setupConfirm}
                          onChange={(e) => setSetupConfirm(e.target.value)}
                          placeholder="Re-enter your new password"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1">
                          Personal Recovery Passphrase (8+ chars, for Forgot Password)
                        </label>
                        <input
                          type="password"
                          required
                          value={setupPhrase}
                          onChange={(e) => setSetupPhrase(e.target.value)}
                          placeholder="Create a secret passphrase you remember"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setSetupChallenge(null)}
                          className="px-4 py-3 rounded-xl border border-zinc-700 text-xs font-semibold text-zinc-300"
                        >
                          Back
                        </button>
                        <button
                          type="submit"
                          disabled={loginBusy}
                          className="flex-1 py-3 rounded-xl bg-[#D4A017] text-[#0D0D10] text-sm font-bold hover:bg-[#EAB308]"
                        >
                          {loginBusy ? 'Securing Account...' : 'Create Password & Activate Admin'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* MODE 3: FORGOT PASSWORD & SECURE RECOVERY */}
              {authMode === 'recovery' && (
                <div className="space-y-4">
                  <div>
                    <h1 className="font-display text-xl sm:text-2xl font-bold">Secure Password Recovery</h1>
                    <p className="text-xs text-zinc-400 mt-1">
                      Reset Super Admin password using backend verification and your personal Recovery Passphrase or Backup Recovery Key.
                    </p>
                  </div>

                  {!recChallenge ? (
                    <form onSubmit={handleRecoveryVerify} className="space-y-3.5">
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1">Authorized Super Admin Email</label>
                        <input
                          type="email"
                          required
                          value={recEmail}
                          onChange={(e) => setRecEmail(e.target.value)}
                          placeholder="Enter authorized Super Admin email"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1">Registered Official Mobile Number</label>
                        <input
                          type="tel"
                          required
                          value={recPhone}
                          onChange={(e) => setRecPhone(e.target.value)}
                          placeholder="Registered official phone"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1">Recovery Method</label>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => setRecMethod('phrase')}
                            className={`py-2 px-3 rounded-xl border font-semibold ${
                              recMethod === 'phrase'
                                ? 'border-[#D4A017] bg-[#D4A017]/15 text-[#F4C430]'
                                : 'border-zinc-700 text-zinc-400'
                            }`}
                          >
                            Recovery Passphrase
                          </button>
                          <button
                            type="button"
                            onClick={() => setRecMethod('backup_key')}
                            className={`py-2 px-3 rounded-xl border font-semibold ${
                              recMethod === 'backup_key'
                                ? 'border-[#D4A017] bg-[#D4A017]/15 text-[#F4C430]'
                                : 'border-zinc-700 text-zinc-400'
                            }`}
                          >
                            Backup Key (PRK-)
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1">
                          {recMethod === 'backup_key' ? 'Emergency Backup Recovery Key' : 'Personal Recovery Passphrase'}
                        </label>
                        <input
                          type="password"
                          required
                          value={recSecret}
                          onChange={(e) => setRecSecret(e.target.value)}
                          placeholder={recMethod === 'backup_key' ? 'PRK-XXXX-XXXX-XXXX-XXXX' : 'Enter recovery passphrase'}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white font-mono"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={loginBusy}
                        className="w-full py-3 rounded-xl bg-[#D4A017] text-[#0D0D10] text-sm font-bold hover:bg-[#EAB308]"
                      >
                        {loginBusy ? 'Verifying Recovery...' : 'Verify Recovery Credentials'}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleRecoveryReset} className="space-y-3.5">
                      <div className="rounded-xl bg-emerald-950/40 border border-emerald-800 px-3 py-2 text-[11px] text-emerald-300">
                        Recovery verified. Setting a new password immediately invalidates all prior Admin sessions.
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1">New Strong Password</label>
                        <input
                          type="password"
                          required
                          value={recNewPass}
                          onChange={(e) => setRecNewPass(e.target.value)}
                          placeholder="Min 10 chars, upper, lower, number, symbol"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white"
                        />
                        <div className="grid grid-cols-2 gap-1 mt-2 text-[10px]">
                          {passwordRules(recNewPass).map((r) => (
                            <span key={r.label} className={r.ok ? 'text-emerald-400' : 'text-zinc-500'}>
                              {r.ok ? '✓ ' : '○ '}
                              {r.label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1">Confirm New Password</label>
                        <input
                          type="password"
                          required
                          value={recConfirmPass}
                          onChange={(e) => setRecConfirmPass(e.target.value)}
                          placeholder="Re-enter new password"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-xs text-zinc-300">
                        <input
                          type="checkbox"
                          checked={recRotateKey}
                          onChange={(e) => setRecRotateKey(e.target.checked)}
                          className="accent-[#D4A017]"
                        />
                        Generate a fresh Emergency Backup Recovery Key
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setRecChallenge(null)}
                          className="px-4 py-3 rounded-xl border border-zinc-700 text-xs font-semibold text-zinc-300"
                        >
                          Back
                        </button>
                        <button
                          type="submit"
                          disabled={loginBusy}
                          className="flex-1 py-3 rounded-xl bg-[#D4A017] text-[#0D0D10] text-sm font-bold hover:bg-[#EAB308]"
                        >
                          {loginBusy ? 'Updating Password...' : 'Reset Password & Sign In'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  const navItems: Array<{ id: AdminTab; label: string; icon: any }> = [
    { id: 'dashboard', label: 'Operations & Live Map', icon: Activity },
    { id: 'fleet', label: 'Fleet & Vehicle Photos', icon: Car },
    { id: 'fares', label: 'Fare Tariffs & Multipliers', icon: Sliders },
    { id: 'passengers', label: 'Passengers & Accounts', icon: UserCheck },
    { id: 'partners', label: 'Pro Partners & Docs', icon: Users },
    { id: 'bookings', label: 'Live Bookings & Invoices', icon: ClipboardList },
    { id: 'zones', label: 'Heat Map & Rickshaw', icon: Flame },
    { id: 'schedule', label: 'Schedule & App Settings', icon: Settings },
    { id: 'packages', label: 'Monthly Packages', icon: Package },
    { id: 'finance', label: 'Wallet & Settlements', icon: Wallet },
    { id: 'tickets', label: 'Support Tickets', icon: HelpCircle },
    { id: 'security', label: 'Security & Audit Logs', icon: KeyRound },
  ];

  const reviewPartner = async (partnerId: string, status: string, approvePendingVehicle = false) => {
    await apiRequest(`/api/admin/partners/${partnerId}/review`, {
      method: 'POST',
      role: 'admin',
      body: {
        verificationStatus: status,
        adminNotes: partnerNotes[partnerId] || '',
        approvePendingVehicle,
      },
    });
    setToast(`Partner ${partnerId} updated to ${status.toUpperCase()}.`);
    await loadAll();
  };

  const saveFareChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFleetId) return;
    await apiRequest(`/api/admin/fleet/${selectedFleetId}`, {
      method: 'PATCH',
      role: 'admin',
      body: {
        base_fare_pkr: fareForm.base_fare_pkr,
        per_km_min_pkr: fareForm.per_km_min_pkr,
        per_km_max_pkr: fareForm.per_km_max_pkr,
        waiting_charge_per_min: fareForm.waiting_charge_per_min,
        extra_stop_pkr: fareForm.extra_stop_pkr,
        commission_pct: fareForm.commission_pct,
      },
    });
    setToast('Fare tariff saved and active for new bookings.');
    await loadAll();
  };

  return (
    <div className="min-h-screen bg-[#F8F8FA] flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <header className="md:hidden sticky top-0 z-30 bg-[#0D0D10] text-white px-4 h-14 flex items-center justify-between border-b border-zinc-800">
        <BrandLogo dark compact />
        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-xs font-semibold text-[#F4C430]"
          aria-label="Toggle Admin Menu"
        >
          {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          <span>{navItems.find((i) => i.id === tab)?.label || 'Menu'}</span>
        </button>
      </header>

      {/* Obsidian Black Admin Sidebar (Responsive Drawer on Mobile, Sticky Rail on Desktop) */}
      <aside
        className={`${
          mobileMenuOpen ? 'flex' : 'hidden'
        } md:flex md:w-64 bg-[#0D0D10] text-white p-5 flex-col justify-between shrink-0 md:sticky md:top-0 md:h-screen z-20`}
      >
        <div className="space-y-5 overflow-y-auto">
          <div className="hidden md:flex items-center justify-between">
            <BrandLogo dark compact />
            <ShieldCheck className="w-4 h-4 text-[#D4A017]" />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#D4A017]">Admin Panel</p>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                    active ? 'bg-[#D4A017] text-[#0D0D10]' : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pt-4 border-t border-zinc-800 space-y-2 mt-4">
          <div className="text-[11px] text-zinc-400 truncate font-mono">{adminUser.email}</div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-900"
          >
            <LogOut className="w-4 h-4" />
            Sign Out Admin
          </button>
        </div>
      </aside>

      {/* Admin Main Viewport */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto">
        {toast && (
          <div className="rounded-xl bg-[#0D0D10] text-[#F4C430] px-4 py-2.5 text-xs font-semibold flex items-center justify-between">
            <span>{toast}</span>
            <button type="button" onClick={() => setToast(null)} className="text-zinc-400 hover:text-white">
              Dismiss
            </button>
          </div>
        )}

        {/* 1. Dashboard & Full Operational Map */}
        {tab === 'dashboard' && overview && (
          <div className="space-y-6">
            <h1 className="font-display text-2xl font-bold text-[#0D0D10]">Operations Control Center</h1>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-2xl bg-[#0D0D10] text-white p-5">
                <span className="text-xs text-zinc-400">Active Bookings</span>
                <div className="font-mono text-2xl font-bold text-[#D4A017] mt-1">{overview.kpis.activeBookings}</div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-5">
                <span className="text-xs text-zinc-500">Pending Partner Reviews</span>
                <div className="font-mono text-2xl font-bold text-amber-700 mt-1">{overview.kpis.pendingPartners}</div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-5">
                <span className="text-xs text-zinc-500">Passengers / Partners</span>
                <div className="font-mono text-2xl font-bold text-[#0D0D10] mt-1">
                  {overview.kpis.totalPassengers} / {overview.kpis.totalPartners}
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-5">
                <span className="text-xs text-zinc-500">Platform Commission</span>
                <div className="font-mono text-2xl font-bold text-emerald-700 mt-1">
                  Rs. {Number(overview.kpis.commissionPkr || 0).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="font-display text-base font-bold">Live Operational Street Map (Demand Zones &amp; Active Partners)</h2>
              <StreetMap
                zones={zones}
                partnerMarkers={(overview.onlinePartners || [])
                  .filter((p: any) => p.current_lat && p.current_lng)
                  .map((p: any) => ({
                    id: p.id,
                    name: p.full_name,
                    lat: p.current_lat,
                    lng: p.current_lng,
                    vehicle: `${p.vehicle_name} (${p.vehicle_number})`,
                  }))}
                heightClass="h-[460px]"
              />
            </div>
          </div>
        )}

        {/* 2. Pro Partner & Document Review */}
        {tab === 'partners' && (
          <div className="space-y-5">
            <h1 className="font-display text-2xl font-bold">Pro Partner Verification &amp; Document Review</h1>
            {partners.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
                No Pro Partners registered yet.
              </div>
            ) : (
              <div className="space-y-4">
                {partners.map((p) => (
                  <div key={p.user_id} className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-display text-lg font-bold">{p.full_name}</div>
                        <div className="text-xs text-zinc-500 font-mono">
                          {p.phone} · {p.operating_city} · CNIC: {p.cnic_number || 'N/A'} · Licence: {p.licence_number || 'N/A'}
                        </div>
                        <div className="text-xs text-zinc-600 mt-1">
                          Vehicle: <strong>{p.vehicle_name || 'N/A'}</strong> ({p.vehicle_number || 'No Plate'}) · Services:{' '}
                          {p.service_eligibility.join(', ')}
                        </div>
                      </div>
                      <span className="px-3 py-1 rounded-lg bg-zinc-100 font-mono text-xs font-bold uppercase">
                        {p.verification_status.replaceAll('_', ' ')}
                      </span>
                    </div>

                    {p.documents.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        {p.documents.map((doc: any) => (
                          <div key={doc.id} className="rounded-xl border border-zinc-200 p-2 space-y-1 text-[11px]">
                            <img src={doc.file_data_url} alt={doc.doc_type} className="w-full h-20 object-cover rounded-lg" />
                            <div className="font-semibold truncate">{doc.doc_type.replaceAll('_', ' ')}</div>
                            <div className="text-zinc-500 uppercase">{doc.status}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-100">
                      <input
                        placeholder="Admin review notes..."
                        value={partnerNotes[p.user_id] ?? p.admin_notes ?? ''}
                        onChange={(e) => setPartnerNotes((n) => ({ ...n, [p.user_id]: e.target.value }))}
                        className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-zinc-200 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => reviewPartner(p.user_id, 'approved', Boolean(p.pending_vehicle_review))}
                        className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold"
                      >
                        Approve Partner
                      </button>
                      <button
                        type="button"
                        onClick={() => reviewPartner(p.user_id, 'rejected')}
                        className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-bold"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => reviewPartner(p.user_id, 'suspended')}
                        className="px-4 py-2 rounded-xl border border-zinc-300 text-xs font-bold"
                      >
                        Suspend
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Fleet Management (Add genuine original photos, edit, delete, tariffs) */}
        {tab === 'fleet' && (
          <FleetManagementTab
            fleet={fleet}
            onReload={loadAll}
            onShowToast={(msg) => setToast(msg)}
          />
        )}

        {/* Fare Management (Base fares, per-km rates, extra stops, waiting, multipliers, negotiation bounds) */}
        {tab === 'fares' && (
          <FareManagementTab
            fleet={fleet}
            settings={settings}
            onReload={loadAll}
            onShowToast={(msg) => setToast(msg)}
          />
        )}

        {/* Passenger Management (Accounts, wallet balances, trips, verify/suspend controls) */}
        {tab === 'passengers' && (
          <PassengerManagementTab
            passengers={passengers}
            onReload={loadAll}
            onShowToast={(msg) => setToast(msg)}
          />
        )}

        {/* Live Bookings & Official PDF Invoices */}
        {tab === 'bookings' && (
          <BookingsManagementTab
            bookings={bookings}
            onReload={loadAll}
            onShowToast={(msg) => setToast(msg)}
          />
        )}

        {/* Operating Zones & Heat Map Demand */}
        {tab === 'zones' && (
          <ZonesManagementTab
            zones={zones}
            onReload={loadAll}
            onShowToast={(msg) => setToast(msg)}
          />
        )}

        {/* 7. Schedule & Go Now Negotiation Limits */}
        {tab === 'schedule' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await apiRequest('/api/admin/settings', {
                method: 'PUT',
                role: 'admin',
                body: settings,
              });
              setToast('Schedule & Go Now limits updated.');
            }}
            className="max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 space-y-4"
          >
            <h1 className="font-display text-xl font-bold">Schedule &amp; Go Now Controls</h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-zinc-600 mb-1">Go Now Min Offer (%)</label>
                <input
                  value={settings.go_now_min_offer_pct || '80'}
                  onChange={(e) => setSettings((s) => ({ ...s, go_now_min_offer_pct: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-zinc-600 mb-1">Go Now Max Offer (%)</label>
                <input
                  value={settings.go_now_max_offer_pct || '135'}
                  onChange={(e) => setSettings((s) => ({ ...s, go_now_max_offer_pct: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-zinc-600 mb-1">Schedule Default Pickup</label>
                <input
                  value={settings.schedule_default_pickup || '08:00 AM'}
                  onChange={(e) => setSettings((s) => ({ ...s, schedule_default_pickup: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200"
                />
              </div>
              <div>
                <label className="block font-semibold text-zinc-600 mb-1">Schedule Default Drop</label>
                <input
                  value={settings.schedule_default_drop || '05:30 PM'}
                  onChange={(e) => setSettings((s) => ({ ...s, schedule_default_drop: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200"
                />
              </div>
              <div>
                <label className="block font-semibold text-zinc-600 mb-1">Schedule Rate (PKR/km)</label>
                <input
                  value={settings.schedule_rate_per_km || '38'}
                  onChange={(e) => setSettings((s) => ({ ...s, schedule_rate_per_km: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-zinc-600 mb-1">Official Support WhatsApp</label>
                <input
                  value={settings.support_whatsapp || '03125007782'}
                  onChange={(e) => setSettings((s) => ({ ...s, support_whatsapp: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-mono"
                />
              </div>
            </div>
            <button type="submit" className="px-6 py-2.5 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold">
              Update Settings
            </button>
          </form>
        )}

        {/* 8. Monthly Packages */}
        {tab === 'packages' && (
          <div className="space-y-5">
            <h1 className="font-display text-2xl font-bold">Monthly Packages Management</h1>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {packages.map((p) => (
                <div key={p.id} className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3">
                  <div className="font-display font-bold text-base">{p.name}</div>
                  <div className="font-mono text-lg font-bold text-[#B8860B]">Rs. {p.base_monthly_pkr.toLocaleString()}</div>
                  <p className="text-xs text-zinc-500">{p.description}</p>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiRequest(`/api/admin/packages/${p.id}`, {
                        method: 'PATCH',
                        role: 'admin',
                        body: { is_active: p.is_active !== 1 },
                      });
                      await loadAll();
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                      p.is_active === 1 ? 'bg-emerald-700 text-white' : 'bg-zinc-200 text-zinc-700'
                    }`}
                  >
                    {p.is_active === 1 ? 'Active' : 'Paused'}
                  </button>
                </div>
              ))}
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await apiRequest('/api/admin/packages', {
                  method: 'POST',
                  role: 'admin',
                  body: {
                    name: newPkgName,
                    vehicle_category_id: fleet[0]?.id || 'fleet-sedan',
                    base_monthly_pkr: Number(newPkgPrice),
                    description: 'Admin-created monthly commuter package.',
                  },
                });
                setNewPkgName('');
                await loadAll();
              }}
              className="rounded-2xl border border-zinc-200 bg-white p-5 flex flex-wrap gap-3"
            >
              <input
                required
                placeholder="New Package Name"
                value={newPkgName}
                onChange={(e) => setNewPkgName(e.target.value)}
                className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-zinc-200 text-xs"
              />
              <input
                type="number"
                value={newPkgPrice}
                onChange={(e) => setNewPkgPrice(e.target.value)}
                className="w-32 px-3 py-2 rounded-xl border border-zinc-200 text-xs font-mono"
              />
              <button type="submit" className="px-4 py-2 rounded-xl bg-[#0D0D10] text-white text-xs font-bold">
                + Add Package
              </button>
            </form>
          </div>
        )}

        {/* 9. Finance & Settlements */}
        {tab === 'finance' && (
          <div className="space-y-4">
            <h1 className="font-display text-2xl font-bold">Financial Ledger &amp; Partner Withdrawals</h1>
            <div className="rounded-2xl border border-zinc-200 bg-white overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Tx Ref</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">No transactions recorded yet.</td>
                    </tr>
                  ) : (
                    transactions.map((tx: any) => (
                      <tr key={tx.id}>
                        <td className="px-4 py-3 font-mono font-bold">{tx.tx_ref}</td>
                        <td className="px-4 py-3">{tx.full_name}</td>
                        <td className="px-4 py-3 uppercase">{tx.role}</td>
                        <td className="px-4 py-3 uppercase">{tx.type}</td>
                        <td className="px-4 py-3 uppercase font-semibold">{tx.status}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold">Rs. {Number(tx.amount_pkr).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">
                          {tx.type === 'withdrawal' && tx.status === 'pending' && (
                            <button
                              type="button"
                              onClick={async () => {
                                await apiRequest(`/api/admin/settlements/${tx.id}/pay`, { method: 'POST', role: 'admin' });
                                await loadAll();
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-700 text-white font-bold"
                            >
                              <CheckCircle2 className="w-3 h-3" /> Mark Settled
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 10. Support Tickets */}
        {tab === 'tickets' && (
          <div className="space-y-4">
            <h1 className="font-display text-2xl font-bold">Support Tickets</h1>
            {tickets.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
                No open support tickets.
              </div>
            ) : (
              <div className="space-y-3">
                {tickets.map((tkt) => (
                  <div key={tkt.id} className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3">
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <span className="font-mono font-bold text-[#0D0D10]">
                        {tkt.id} · {tkt.role.toUpperCase()} · {tkt.full_name} ({tkt.phone})
                      </span>
                      <span className="uppercase font-bold">{tkt.status}</span>
                    </div>
                    <p className="font-semibold text-sm">{tkt.subject}</p>
                    <p className="text-xs text-zinc-600">{tkt.message}</p>
                    <div className="flex flex-wrap gap-2 pt-2">
                      <input
                        placeholder="Write admin reply..."
                        value={ticketReplies[tkt.id] ?? tkt.admin_reply ?? ''}
                        onChange={(e) => setTicketReplies((r) => ({ ...r, [tkt.id]: e.target.value }))}
                        className="flex-1 min-w-[220px] px-3 py-2 rounded-xl border border-zinc-200 text-xs"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          await apiRequest(`/api/admin/tickets/${tkt.id}/reply`, {
                            method: 'POST',
                            role: 'admin',
                            body: { reply: ticketReplies[tkt.id] || 'Resolved by Support', status: 'resolved' },
                          });
                          await loadAll();
                        }}
                        className="px-4 py-2 rounded-xl bg-[#0D0D10] text-white text-xs font-bold"
                      >
                        Send Reply &amp; Resolve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 11. Security & Audit Logs */}
        {tab === 'security' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="font-display text-2xl font-bold flex items-center gap-2">
                  <ShieldAlert className="w-6 h-6 text-[#D4A017]" />
                  Super Admin Security &amp; Access Audit
                </h1>
                <p className="text-xs text-zinc-500 mt-1">
                  Server-verified authentication, setup, recovery, and blocked-access audit trail.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {securityLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                        No security audit events recorded yet.
                      </td>
                    </tr>
                  ) : (
                    securityLogs.map((log: any) => (
                      <tr key={log.id}>
                        <td className="px-4 py-3 font-mono text-zinc-500 whitespace-nowrap">{log.created_at}</td>
                        <td className="px-4 py-3 font-mono font-bold text-[#0D0D10]">{log.action}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              log.status === 'success' || log.status === 'challenge_issued'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono">{log.email || '—'}</td>
                        <td className="px-4 py-3 text-zinc-600">{log.details || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
