import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  CarFront,
  HelpCircle,
  Home,
  LogOut,
  MapPin,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
  Volume2,
  VolumeX,
  Wallet as WalletIcon,
  X,
} from 'lucide-react';
import { BrandLogo, LanguageToggle, PWAInstallButton } from '../../components/BrandMark';
import { ProRiderAiCopilot } from '../../components/ProRiderAiCopilot';
import { ProfileThemeRowButton } from '../../components/ThemeSwitcher';
import { useFirebase } from '../../contexts/FirebaseContext';
import { useTheme } from '../../contexts/ThemeContext';
import { t, tr } from '../../i18n/translations';
import type {
  AppNotification,
  Booking,
  DemandMapData,
  Language,
  PublicConfig,
  SupportTicket,
  User,
  WalletTransaction,
} from '../../types';
import {
  ApiRequestError,
  apiRequest,
  getRoleToken,
  getStoredRoleUser,
  isBackendOfflineError,
  setRoleToken,
  setStoredRoleUser,
  useRoleWebSocket,
} from '../../utils/api';
import {
  getSavedRideBellSound,
  playRideBell,
  RIDE_BELL_OPTIONS,
  saveRideBellSound,
  sendRideBrowserNotification,
  type RideBellSoundId,
} from '../../utils/rideBell';
import { PassengerAuth } from './PassengerAuth';
import { PassengerBookingFlow } from './PassengerBookingFlow';
import {
  isActiveBookingStatus,
  isPendingBookingStatus,
  NotificationsView,
  PassengerBookingsView,
  PassengerProfileView,
  PassengerWalletView,
  SupportView,
} from './PassengerSecondaryViews';

type PassengerTab = 'home' | 'bookings' | 'wallet' | 'notifications' | 'support' | 'profile';

const getLocalPassengerBookingsKey = (userId?: string) => `pr_local_bookings_passenger_${userId || 'guest'}`;

function readLocalPassengerBookings(userId?: string, extraIds: Array<string | undefined | null> = []): Booking[] {
  const candidateKeys = Array.from(
    new Set(
      [userId, ...extraIds, 'local-passenger', 'guest']
        .filter((v): v is string => Boolean(v))
        .map((id) => getLocalPassengerBookingsKey(id))
    )
  );
  const allowedOwnerIds = new Set(
    [userId, ...extraIds, 'local-passenger', 'guest'].filter((v): v is string => Boolean(v))
  );
  const merged = new Map<string, Booking>();
  for (const key of candidateKeys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      for (const b of parsed as Booking[]) {
        if (!b || !b.id) continue;
        if (allowedOwnerIds.size > 0 && b.passenger_id && !allowedOwnerIds.has(b.passenger_id)) {
          continue;
        }
        if (!merged.has(b.id)) {
          merged.set(b.id, b);
        }
      }
    } catch {
      // ignore malformed storage entry
    }
  }
  return Array.from(merged.values()).sort((a, b) =>
    String(b.created_at || '').localeCompare(String(a.created_at || ''))
  );
}

function saveLocalPassengerBooking(booking: Booking, userId?: string, extraId?: string | null) {
  const targetIds = Array.from(
    new Set([userId, extraId, booking.passenger_id].filter((v): v is string => Boolean(v)))
  );
  for (const id of targetIds) {
    try {
      const key = getLocalPassengerBookingsKey(id);
      const raw = localStorage.getItem(key);
      const existing = raw ? (JSON.parse(raw) as Booking[]) : [];
      const filtered = (Array.isArray(existing) ? existing : []).filter((item) => item?.id !== booking.id);
      localStorage.setItem(key, JSON.stringify([booking, ...filtered].slice(0, 50)));
    } catch {
      // ignore storage quota errors
    }
  }
}

function purgePassengerNonMatchingState(activeUid?: string | null) {
  if (!activeUid) return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith('pr_local_bookings_passenger_') || key.startsWith('pr_user_passenger_')) {
        if (!key.endsWith(`_${activeUid}`)) {
          keysToRemove.push(key);
        }
      }
    }
    for (const k of keysToRemove) {
      localStorage.removeItem(k);
    }
  } catch {}
}

interface PassengerAppProps {
  config: PublicConfig | null;
  lang: Language;
  onChangeLang: (l: Language) => void;
  onNavigate: (path: string) => void;
}

export const PassengerApp: React.FC<PassengerAppProps> = ({
  config,
  lang,
  onChangeLang,
  onNavigate,
}) => {
  const { isDark } = useTheme();
  const { firebaseUser, signOutFirebase } = useFirebase();
  const [token, setToken] = useState<string | null>(() => getRoleToken('passenger'));
  const [user, setUser] = useState<User | null>(() => getStoredRoleUser<User>('passenger'));
  const [tab, setTab] = useState<PassengerTab>('home');
  const [bookingsSubTab, setBookingsSubTab] = useState<'pending' | 'active' | undefined>(undefined);
  const [bookings, setBookings] = useState<Booking[]>(() =>
    readLocalPassengerBookings(getStoredRoleUser<User>('passenger')?.id)
  );
  const [wallet, setWallet] = useState<{
    balancePkr: number;
    totalPaymentsPkr: number;
    outstandingPkr: number;
    transactions: WalletTransaction[];
  }>({ balancePkr: 0, totalPaymentsPkr: 0, outstandingPkr: 0, transactions: [] });
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [demandData, setDemandData] = useState<DemandMapData | null>(null);
  const [supportBookingId, setSupportBookingId] = useState('');
  const [livePartnerLocations, setLivePartnerLocations] = useState<Record<string, { lat: number; lng: number }>>({});
  const [bellSound, setBellSound] = useState<RideBellSoundId>(() => getSavedRideBellSound('passenger'));
  const [bellMenuOpen, setBellMenuOpen] = useState(false);
  const bellSoundRef = useRef(bellSound);
  bellSoundRef.current = bellSound;
  const bellMenuWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const activeUid = firebaseUser?.uid || user?.id;
    if (activeUid) {
      purgePassengerNonMatchingState(activeUid);
    }
  }, [firebaseUser?.uid, user?.id]);

  const handleChangeBellSound = useCallback((next: RideBellSoundId) => {
    setBellSound(next);
    saveRideBellSound(next, 'passenger');
    if (next !== 'muted') {
      playRideBell(next);
    }
  }, []);

  const loadDemand = useCallback(async () => {
    try {
      const data = await apiRequest<DemandMapData>('/api/map/demand');
      if (data && Array.isArray(data.hotspots)) {
        setDemandData(data);
      }
    } catch {
      // Preserve last valid demand state on transient fetch error or static hosting
    }
  }, []);

  const loadAll = useCallback(async () => {
    if (!token) return;
    const [meRes, bkRes, wlRes, ntRes, tkRes] = await Promise.allSettled([
      apiRequest<{ user: User }>('/api/auth/me', { role: 'passenger' }),
      apiRequest<{ bookings: Booking[] }>('/api/passenger/bookings', { role: 'passenger' }),
      apiRequest<typeof wallet>('/api/passenger/wallet', { role: 'passenger' }),
      apiRequest<{ notifications: AppNotification[] }>('/api/passenger/notifications', { role: 'passenger' }),
      apiRequest<{ tickets: SupportTicket[] }>('/api/passenger/support', { role: 'passenger' }),
    ]);

    const meErr = meRes.status === 'rejected' ? meRes.reason : null;
    const bkErr = bkRes.status === 'rejected' ? bkRes.reason : null;

    if (meRes.status === 'fulfilled' && meRes.value?.user) {
      setUser(meRes.value.user);
      setStoredRoleUser('passenger', meRes.value.user);
    }

    const activeUserId =
      (meRes.status === 'fulfilled' ? meRes.value?.user?.id : undefined) ||
      user?.id ||
      getStoredRoleUser<User>('passenger')?.id;

    if (bkRes.status === 'fulfilled' && Array.isArray(bkRes.value?.bookings)) {
      const serverList = bkRes.value.bookings;
      const localList = readLocalPassengerBookings(activeUserId, [firebaseUser?.uid]);
      const serverIds = new Set(serverList.map((b) => b.id));
      const unsyncedLocal = localList.filter((b) => !serverIds.has(b.id) && b.id.startsWith('BK-'));
      const combined = [...unsyncedLocal, ...serverList].sort((a, b) =>
        String(b.created_at || '').localeCompare(String(a.created_at || ''))
      );

      setBookings((prev) => {
        const prevConfirmedIds = new Set(
          (Array.isArray(prev) ? prev : [])
            .filter((b) => isActiveBookingStatus(b.status))
            .map((b) => b.id)
        );
        const newlyConfirmedBooking = combined.find(
          (b) =>
            isActiveBookingStatus(b.status) &&
            prev.length > 0 &&
            !prevConfirmedIds.has(b.id)
        );
        if (newlyConfirmedBooking) {
          playRideBell(bellSoundRef.current);
          sendRideBrowserNotification(
            tr(lang, 'Ride Confirmed & Active!', 'آپ کی رائیڈ کنفرم ہو کر ایکٹیو ہو گئی!'),
            `${newlyConfirmedBooking.pickup_address} → ${newlyConfirmedBooking.dropoff_address}`
          );
        }
        return combined;
      });
    } else if (
      bkErr &&
      (isBackendOfflineError(bkErr) || token.startsWith('pr_fb_'))
    ) {
      setBookings((prev) => {
        const local = readLocalPassengerBookings(activeUserId, [firebaseUser?.uid]);
        if (local.length > 0) return local;
        return Array.isArray(prev) ? prev : [];
      });
      setUser((prev) => prev || getStoredRoleUser<User>('passenger'));
    } else if (
      !token.startsWith('pr_fb_') &&
      bkErr instanceof ApiRequestError &&
      (bkErr.status === 401 || bkErr.status === 403)
    ) {
      setRoleToken('passenger', null);
      setToken(null);
      setUser(null);
      return;
    } else if (
      !token.startsWith('pr_fb_') &&
      meErr instanceof ApiRequestError &&
      (meErr.status === 401 || meErr.status === 403) &&
      bkRes.status !== 'fulfilled'
    ) {
      setRoleToken('passenger', null);
      setToken(null);
      setUser(null);
      return;
    }

    if (wlRes.status === 'fulfilled' && wlRes.value && typeof wlRes.value.balancePkr === 'number') {
      setWallet({
        balancePkr: wlRes.value.balancePkr || 0,
        totalPaymentsPkr: wlRes.value.totalPaymentsPkr || 0,
        outstandingPkr: wlRes.value.outstandingPkr || 0,
        transactions: Array.isArray(wlRes.value.transactions) ? wlRes.value.transactions : [],
      });
    }
    if (ntRes.status === 'fulfilled' && Array.isArray(ntRes.value?.notifications)) {
      setNotifications(ntRes.value.notifications);
    }
    if (tkRes.status === 'fulfilled' && Array.isArray(tkRes.value?.tickets)) {
      setTickets(tkRes.value.tickets);
    }
    void loadDemand();
  }, [token, loadDemand, lang, user?.id, firebaseUser?.uid]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => {
      void loadAll();
    }, 15000);
    const onFocus = () => void loadAll();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [token, loadAll]);

  useEffect(() => {
    const onBellUpdated = () => {
      setBellSound(getSavedRideBellSound('passenger'));
    };
    window.addEventListener('pr:bell-updated', onBellUpdated);
    return () => window.removeEventListener('pr:bell-updated', onBellUpdated);
  }, []);

  useEffect(() => {
    if (!bellMenuOpen) return;
    const onDocDown = (e: MouseEvent) => {
      if (bellMenuWrapRef.current && !bellMenuWrapRef.current.contains(e.target as Node)) {
        setBellMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [bellMenuOpen]);

  useRoleWebSocket('passenger', token, (event, data) => {
    if (event === 'config:updated') {
      window.dispatchEvent(new Event('pr:refresh-config'));
    } else if (event === 'partner:location' && data?.bookingId) {
      setLivePartnerLocations((prev) => ({
        ...prev,
        [data.bookingId]: { lat: data.lat, lng: data.lng },
      }));
    } else if (
      ['booking:offer', 'booking:updated', 'notification:new'].includes(event)
    ) {
      if (event === 'booking:offer' || event === 'booking:updated') {
        playRideBell(bellSoundRef.current);
        if (event === 'booking:updated' && data?.status === 'confirmed') {
          sendRideBrowserNotification(
            tr(lang, 'Booking Confirmed!', 'بُکنگ کنفرم ہو گئی!'),
            tr(lang, 'Your ride is now in Active bookings.', 'آپ کی رائیڈ اب ایکٹیو بکنگز میں شامل ہو گئی ہے۔')
          );
        }
      }
      void loadAll();
    }
  });

  const handleBookingCreated = useCallback(
    (created: Booking) => {
      saveLocalPassengerBooking(created, user?.id, firebaseUser?.uid);
      setBookings((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        return [created, ...list.filter((b) => b.id !== created.id)];
      });
    },
    [user?.id, firebaseUser?.uid]
  );

  const handleLogout = () => {
    setRoleToken('passenger', null);
    setStoredRoleUser('passenger', null);
    setToken(null);
    setUser(null);
    void signOutFirebase().catch(() => {});
  };

  if (!token || !user) {
    return (
      <PassengerAuth
        lang={lang}
        onChangeLang={onChangeLang}
        onAuthenticated={(tk, u) => {
          setRoleToken('passenger', tk);
          setStoredRoleUser('passenger', u);
          setToken(tk);
          setUser(u);
        }}
        onBackWelcome={() => onNavigate('/')}
      />
    );
  }

  const safeNotifications = Array.isArray(notifications) ? notifications : [];
  const safeBookings = Array.isArray(bookings) ? bookings : [];
  const unreadCount = safeNotifications.filter((n) => n.is_read === 0).length;
  const openBookingsCount = safeBookings.filter(
    (b) => isPendingBookingStatus(b.status) || isActiveBookingStatus(b.status)
  ).length;

  const navItems: Array<{ id: PassengerTab; label: string; icon: any; badge?: number }> = [
    { id: 'home', label: t(lang, 'home'), icon: Home },
    { id: 'bookings', label: t(lang, 'myBookings'), icon: CarFront, badge: openBookingsCount || undefined },
    { id: 'wallet', label: t(lang, 'wallet'), icon: WalletIcon },
    { id: 'notifications', label: t(lang, 'notifications'), icon: Bell, badge: unreadCount || undefined },
    { id: 'support', label: t(lang, 'support'), icon: HelpCircle },
    { id: 'profile', label: t(lang, 'profile'), icon: UserIcon },
  ];

  return (
    <div dir={lang === 'ur' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#F8F8FA] flex flex-col md:flex-row">
      {/* Desktop Obsidian Black Sidebar — Strictly Passenger Navigation Only */}
      <aside className="hidden md:flex md:w-64 bg-[#0D0D10] text-white flex-col justify-between p-5 shrink-0 sticky top-0 h-screen">
        <div className="space-y-6">
          <button type="button" onClick={() => setTab('home')} className="text-left">
            <BrandLogo dark />
          </button>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    active
                      ? 'bg-[#D4A017] text-[#0D0D10] font-bold'
                      : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </span>
                  {item.badge ? (
                    <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-red-600 text-white">
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-3 pt-4 border-t border-zinc-800">
          <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800">
            <p className="text-xs font-bold text-[#D4A017]">
              {tr(lang, 'Passenger Account', 'مسافر اکاؤنٹ')}
            </p>
            <p className="text-xs text-zinc-300 truncate mt-0.5">{user.full_name}</p>
            <p className="text-[11px] text-zinc-500 font-mono">{user.city}</p>
          </div>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('open-prorider-permissions'))}
            className="w-full flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-900"
          >
            <ShieldCheck className="w-4 h-4 text-[#D4A017]" />
            {lang === 'ur' ? 'ایپ پرمیشنز' : 'App Permissions'}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-900"
          >
            <LogOut className="w-4 h-4" />
            {t(lang, 'logout')}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col min-w-0 ${tab === 'home' ? 'pb-14 md:pb-0' : 'pb-20 md:pb-6'}`}>
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-zinc-200 px-3 sm:px-6 h-11 sm:h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 shrink">
            <div className="md:hidden flex items-center gap-1.5 min-w-0">
              <img
                src="/assets/aistudio/pmg_3_88102afb.png"
                alt="PRO RIDER"
                className="w-6 h-6 rounded-full object-contain bg-black border border-[#D4A017]/50 shrink-0"
              />
              <span className="font-display font-bold text-xs tracking-tight text-[#0D0D10] truncate">
                PRO RIDER <span className="text-[#D4A017]">AI</span>
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-zinc-600">
              <MapPin className="w-3.5 h-3.5 text-[#D4A017]" />
              <span>{user.city}, {tr(lang, 'Pakistan', 'پاکستان')}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('open-prorider-ai-copilot'))}
              aria-label={tr(lang, 'Open AI Voice & Concierge', 'اے آئی وائس اور مددگار کھولیں')}
              className="pr-preserve-light md:hidden inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-xl bg-gradient-to-r from-[#15151A] via-[#0D0D10] to-[#231B07] text-white text-[11px] font-bold border border-[#D4A017]/80 shadow-sm hover:border-[#F4C430] active:scale-95 transition-all whitespace-nowrap shrink-0"
            >
              <span className="w-5 h-5 rounded-lg bg-gradient-to-br from-[#F4C430] to-[#B8860B] text-[#0D0D10] flex items-center justify-center shrink-0">
                <Sparkles className="w-3 h-3" />
              </span>
              <span className="tracking-wide">{tr(lang, 'AI', 'اے آئی')}</span>
            </button>

            {/* In-App Notification Bell & Permissions Quick Controller */}
            <div ref={bellMenuWrapRef} className="relative">
              <button
                type="button"
                onClick={() => setBellMenuOpen((v) => !v)}
                aria-label={tr(lang, 'Notification Bell & Permissions', 'نوٹیفکیشن بیل اور پرمیشنز')}
                className="relative p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border border-zinc-200 bg-white text-[#0D0D10] hover:border-[#D4A017] transition-colors inline-flex items-center gap-1"
              >
                {bellSound === 'muted' ? (
                  <VolumeX className="w-4 h-4 text-zinc-500" />
                ) : (
                  <Bell className="w-4 h-4 text-[#B8860B]" />
                )}
                {unreadCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {bellMenuOpen && (
                <div className="fixed inset-x-3 top-14 sm:inset-x-auto sm:top-auto sm:mt-2 sm:absolute sm:right-0 sm:w-72 rounded-2xl border-2 border-[#0D0D10] bg-white shadow-2xl p-3.5 space-y-3 z-50 text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-[#0D0D10]">
                      {tr(lang, 'In-App Bell & Permissions', 'بیل اور ایپ پرمیشنز')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setBellMenuOpen(false)}
                      className="text-zinc-500 hover:text-[#0D0D10]"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    {RIDE_BELL_OPTIONS.map((opt) => {
                      const active = bellSound === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleChangeBellSound(opt.id)}
                          className={`w-full px-2.5 py-2 rounded-xl border text-left transition-colors ${
                            active
                              ? 'bg-[#0D0D10] border-[#0D0D10] text-[#F4C430]'
                              : 'bg-zinc-50 border-zinc-200 text-[#0D0D10] hover:bg-zinc-100'
                          }`}
                        >
                          <div className="text-[11px] font-bold">{lang === 'ur' ? opt.labelUr : opt.labelEn}</div>
                          <div className={`text-[10px] ${active ? 'text-zinc-300' : 'text-zinc-600'}`}>
                            {opt.descriptionEn}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => playRideBell(bellSound === 'muted' ? 'soft_gold' : bellSound)}
                      className="py-2 rounded-xl bg-[#D4A017] text-[#0D0D10] text-[11px] font-bold flex items-center justify-center gap-1 hover:bg-[#EAB308]"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      {tr(lang, 'Test Bell', 'بیل ٹیسٹ')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBellMenuOpen(false);
                        window.dispatchEvent(new CustomEvent('open-prorider-permissions'));
                      }}
                      className="py-2 rounded-xl border border-zinc-200 bg-zinc-50 text-[#0D0D10] text-[11px] font-bold flex items-center justify-center gap-1 hover:bg-zinc-100"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-[#D4A017]" />
                      {tr(lang, 'Permissions', 'پرمیشنز')}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setBellMenuOpen(false);
                      setTab('notifications');
                    }}
                    className="w-full py-2 rounded-xl bg-zinc-900 text-white text-[11px] font-semibold hover:bg-zinc-800"
                  >
                    {tr(lang, `Open Notifications (${unreadCount} unread)`, `نوٹیفکیشنز کھولیں (${unreadCount})`)}
                  </button>
                </div>
              )}
            </div>

            <div className="scale-90 sm:scale-100 origin-right shrink-0 flex items-center gap-1.5">
              <ProfileThemeRowButton lang={lang} dark={isDark} headerCompact />
              <LanguageToggle lang={lang} onChange={onChangeLang} dark={isDark} />
            </div>
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => setTab('profile')}
              aria-label={t(lang, 'profile')}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#0D0D10] text-white text-xs font-semibold border border-zinc-800 hover:border-[#D4A017] transition-colors shrink-0"
            >
              <UserIcon className="w-3.5 h-3.5 text-[#D4A017]" />
              <span className="hidden sm:inline max-w-[110px] truncate">{user.full_name}</span>
            </button>
          </div>
        </header>

        <main className={tab === 'home' ? 'flex-1 w-full flex flex-col' : 'flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6'}>
          {tab === 'home' && (
            <PassengerBookingFlow
              lang={lang}
              config={config}
              bookings={safeBookings}
              demandData={demandData}
              passengerId={user.id}
              passengerName={user.full_name}
              livePartnerLocations={livePartnerLocations}
              onRefreshBookings={loadAll}
              onBookingCreated={handleBookingCreated}
              onGoToBookings={(targetTab) => {
                setBookingsSubTab(targetTab);
                setTab('bookings');
              }}
            />
          )}
          {tab === 'bookings' && (
            <PassengerBookingsView
              lang={lang}
              bookings={safeBookings}
              passengerName={user.full_name}
              initialTab={bookingsSubTab}
              onRefresh={loadAll}
              onOpenSupport={(bkId) => {
                setSupportBookingId(bkId);
                setTab('support');
              }}
            />
          )}
          {tab === 'wallet' && (
            <PassengerWalletView
              lang={lang}
              passengerName={user.full_name}
              bookings={safeBookings}
              wallet={wallet}
              onRefresh={loadAll}
            />
          )}
          {tab === 'notifications' && (
            <NotificationsView
              lang={lang}
              role="passenger"
              bellSound={bellSound}
              onChangeBellSound={handleChangeBellSound}
              notifications={safeNotifications}
              onMarkAllRead={async () => {
                try {
                  await apiRequest('/api/passenger/notifications/read', { method: 'POST', role: 'passenger' });
                  await loadAll();
                } catch {
                  setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
                }
              }}
            />
          )}
          {tab === 'support' && (
            <SupportView
              lang={lang}
              role="passenger"
              tickets={Array.isArray(tickets) ? tickets : []}
              defaultBookingId={supportBookingId}
              onRefresh={loadAll}
            />
          )}
          {tab === 'profile' && (
            <PassengerProfileView
              lang={lang}
              user={user}
              unreadNotifications={unreadCount}
              bellSound={bellSound}
              onChangeBellSound={handleChangeBellSound}
              onOpenNotifications={() => setTab('notifications')}
              onUpdated={(updated) => {
                setUser(updated);
                setStoredRoleUser('passenger', updated);
              }}
              onLogout={handleLogout}
            />
          )}
        </main>
      </div>

      {/* Mobile Thumb-Zone Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-zinc-200 grid grid-cols-4 h-14 pb-safe">
        {[
          { id: 'home' as PassengerTab, label: t(lang, 'home'), icon: Home },
          { id: 'bookings' as PassengerTab, label: t(lang, 'rides'), icon: CarFront, badge: openBookingsCount || undefined },
          { id: 'wallet' as PassengerTab, label: t(lang, 'wallet'), icon: WalletIcon },
          { id: 'profile' as PassengerTab, label: t(lang, 'profile'), icon: UserIcon },
        ].map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${
                active ? 'text-[#B8860B]' : 'text-zinc-500'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {item.badge ? (
                  <span className="absolute -top-1 -right-2 min-w-[14px] h-[14px] px-1 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                    {item.badge}
                  </span>
                ) : null}
              </div>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <ProRiderAiCopilot persona="passenger" lang={lang} />
    </div>
  );
};
