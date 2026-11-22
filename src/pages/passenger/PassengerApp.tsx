import React, { useCallback, useEffect, useState } from 'react';
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
  Wallet as WalletIcon,
} from 'lucide-react';
import { BrandLogo, LanguageToggle, PWAInstallButton, ThemeModeToggle } from '../../components/BrandMark';
import { ProRiderAiCopilot } from '../../components/ProRiderAiCopilot';
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
import { PassengerAuth } from './PassengerAuth';
import { PassengerBookingFlow } from './PassengerBookingFlow';
import {
  NotificationsView,
  PassengerBookingsView,
  PassengerProfileView,
  PassengerWalletView,
  SupportView,
} from './PassengerSecondaryViews';

type PassengerTab = 'home' | 'bookings' | 'wallet' | 'notifications' | 'support' | 'profile';

const getLocalPassengerBookingsKey = (userId?: string) => `pr_local_bookings_passenger_${userId || 'guest'}`;

function readLocalPassengerBookings(userId?: string): Booking[] {
  try {
    const raw = localStorage.getItem(getLocalPassengerBookingsKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((b: Booking) => !userId || b.passenger_id === userId || b.passenger_id === 'local-passenger') : [];
  } catch {
    return [];
  }
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
  const [token, setToken] = useState<string | null>(() => getRoleToken('passenger'));
  const [user, setUser] = useState<User | null>(() => getStoredRoleUser<User>('passenger'));
  const [tab, setTab] = useState<PassengerTab>('home');
  const [bookings, setBookings] = useState<Booking[]>(() => readLocalPassengerBookings(getStoredRoleUser<User>('passenger')?.id));
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
    try {
      const [meRes, bkRes, wlRes, ntRes, tkRes] = await Promise.all([
        apiRequest<{ user: User }>('/api/auth/me', { role: 'passenger' }),
        apiRequest<{ bookings: Booking[] }>('/api/passenger/bookings', { role: 'passenger' }),
        apiRequest<typeof wallet>('/api/passenger/wallet', { role: 'passenger' }),
        apiRequest<{ notifications: AppNotification[] }>('/api/passenger/notifications', { role: 'passenger' }),
        apiRequest<{ tickets: SupportTicket[] }>('/api/passenger/support', { role: 'passenger' }),
      ]);
      if (meRes?.user) {
        setUser(meRes.user);
        setStoredRoleUser('passenger', meRes.user);
      }
      if (Array.isArray(bkRes?.bookings)) {
        setBookings(bkRes.bookings);
      }
      if (wlRes && typeof wlRes.balancePkr === 'number') {
        setWallet({
          balancePkr: wlRes.balancePkr || 0,
          totalPaymentsPkr: wlRes.totalPaymentsPkr || 0,
          outstandingPkr: wlRes.outstandingPkr || 0,
          transactions: Array.isArray(wlRes.transactions) ? wlRes.transactions : [],
        });
      }
      if (Array.isArray(ntRes?.notifications)) {
        setNotifications(ntRes.notifications);
      }
      if (Array.isArray(tkRes?.tickets)) {
        setTickets(tkRes.tickets);
      }
      void loadDemand();
    } catch (err) {
      if (isBackendOfflineError(err) || token.startsWith('pr_fb_')) {
        // Static hosting (Vercel without Node backend) or transient backend outage:
        // keep authenticated Firebase/local session intact and hydrate cached bookings.
        setBookings((prev) => {
          const localUser = user || getStoredRoleUser<User>('passenger');
          const local = readLocalPassengerBookings(localUser?.id);
          return local.length > 0 ? local : Array.isArray(prev) ? prev : [];
        });
        setUser((prev) => prev || getStoredRoleUser<User>('passenger'));
        return;
      }
      if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403)) {
        setRoleToken('passenger', null);
        setToken(null);
        setUser(null);
      }
    }
  }, [token, loadDemand]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => {
      void loadDemand();
    }, 30000);
    return () => clearInterval(timer);
  }, [token, loadDemand]);

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
      loadAll();
    }
  });

  const { signOutFirebase } = useFirebase();

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

  const navItems: Array<{ id: PassengerTab; label: string; icon: any; badge?: number }> = [
    { id: 'home', label: t(lang, 'home'), icon: Home },
    { id: 'bookings', label: t(lang, 'myBookings'), icon: CarFront },
    { id: 'wallet', label: t(lang, 'wallet'), icon: WalletIcon },
    { id: 'notifications', label: t(lang, 'notifications'), icon: Bell, badge: unreadCount },
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
            <div className="scale-90 sm:scale-100 origin-right shrink-0 flex items-center gap-1.5">
              <ThemeModeToggle lang={lang} dark={isDark} />
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
              passengerName={user.full_name}
              livePartnerLocations={livePartnerLocations}
              onRefreshBookings={loadAll}
              onGoToBookings={() => setTab('bookings')}
            />
          )}
          {tab === 'bookings' && (
            <PassengerBookingsView
              lang={lang}
              bookings={safeBookings}
              passengerName={user.full_name}
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
          { id: 'bookings' as PassengerTab, label: t(lang, 'rides'), icon: CarFront },
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
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${
                active ? 'text-[#B8860B]' : 'text-zinc-500'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <ProRiderAiCopilot persona="passenger" lang={lang} />
    </div>
  );
};
