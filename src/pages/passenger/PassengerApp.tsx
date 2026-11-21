import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  CarFront,
  HelpCircle,
  Home,
  LogOut,
  MapPin,
  User as UserIcon,
  Wallet as WalletIcon,
} from 'lucide-react';
import { BrandLogo, LanguageToggle, PWAInstallButton } from '../../components/BrandMark';
import { ProRiderAiCopilot } from '../../components/ProRiderAiCopilot';
import { useFirebase } from '../../contexts/FirebaseContext';
import { t } from '../../i18n/translations';
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
import { apiRequest, getRoleToken, setRoleToken, useRoleWebSocket } from '../../utils/api';
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
  const [token, setToken] = useState<string | null>(() => getRoleToken('passenger'));
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<PassengerTab>('home');
  const [bookings, setBookings] = useState<Booking[]>([]);
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
      setDemandData(data);
    } catch {
      // Preserve last valid demand state on transient fetch error
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
      setUser(meRes.user);
      setBookings(bkRes.bookings);
      setWallet(wlRes);
      setNotifications(ntRes.notifications);
      setTickets(tkRes.tickets);
      void loadDemand();
    } catch {
      setRoleToken('passenger', null);
      setToken(null);
      setUser(null);
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
    if (event === 'partner:location' && data?.bookingId) {
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
          setToken(tk);
          setUser(u);
        }}
        onBackWelcome={() => onNavigate('/')}
      />
    );
  }

  const unreadCount = notifications.filter((n) => n.is_read === 0).length;

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
            <p className="text-xs font-bold text-[#D4A017]">Passenger Account</p>
            <p className="text-xs text-zinc-300 truncate mt-0.5">{user.full_name}</p>
            <p className="text-[11px] text-zinc-500 font-mono">{user.city}</p>
          </div>
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
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-6">
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-zinc-200 px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="md:hidden">
              <BrandLogo compact />
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-zinc-600">
              <MapPin className="w-3.5 h-3.5 text-[#D4A017]" />
              <span>{user.city}, Pakistan</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <LanguageToggle lang={lang} onChange={onChangeLang} />
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => setTab('notifications')}
              aria-label="Notifications"
              className="relative p-2 rounded-xl border border-zinc-200 hover:bg-zinc-50"
            >
              <Bell className="w-4 h-4 text-[#0D0D10]" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setTab('profile')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0D0D10] text-white text-xs font-semibold"
            >
              <UserIcon className="w-3.5 h-3.5 text-[#D4A017]" />
              <span className="hidden sm:inline max-w-[110px] truncate">{user.full_name}</span>
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
          {tab === 'home' && (
            <PassengerBookingFlow
              lang={lang}
              config={config}
              bookings={bookings}
              demandData={demandData}
              passengerName={user.full_name}
              livePartnerLocations={livePartnerLocations}
              onRefreshBookings={loadAll}
              onGoToBookings={() => setTab('bookings')}
            />
          )}
          {tab === 'bookings' && (
            <PassengerBookingsView
              bookings={bookings}
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
              passengerName={user.full_name}
              bookings={bookings}
              wallet={wallet}
              onRefresh={loadAll}
            />
          )}
          {tab === 'notifications' && (
            <NotificationsView
              notifications={notifications}
              onMarkAllRead={async () => {
                await apiRequest('/api/passenger/notifications/read', { method: 'POST', role: 'passenger' });
                await loadAll();
              }}
            />
          )}
          {tab === 'support' && (
            <SupportView
              role="passenger"
              tickets={tickets}
              defaultBookingId={supportBookingId}
              onRefresh={loadAll}
            />
          )}
          {tab === 'profile' && (
            <PassengerProfileView
              user={user}
              onUpdated={setUser}
              onLogout={handleLogout}
            />
          )}
        </main>
      </div>

      {/* Mobile Thumb-Zone Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-zinc-200 grid grid-cols-4 h-16 pb-safe">
        {[
          { id: 'home' as PassengerTab, label: t(lang, 'home'), icon: Home },
          { id: 'bookings' as PassengerTab, label: 'Rides', icon: CarFront },
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
