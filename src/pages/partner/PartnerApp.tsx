import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  Car,
  ClipboardList,
  FileCheck,
  HelpCircle,
  LogOut,
  Navigation,
  Power,
  TrendingUp,
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
  PartnerDocument,
  PartnerProfile,
  PublicConfig,
  SupportTicket,
  User,
  WalletTransaction,
} from '../../types';
import { apiRequest, getRoleToken, setRoleToken, useRoleWebSocket } from '../../utils/api';
import { NotificationsView, SupportView } from '../passenger/PassengerSecondaryViews';
import { PartnerAuth, PartnerVerificationAndVehicleView } from './PartnerAuthAndDocs';
import { PartnerFinanceView, PartnerProfileView } from './PartnerFinanceAndProfile';
import { PartnerRequestsView, PartnerTripsView } from './PartnerRequestsAndTrips';

type PartnerTab =
  | 'requests'
  | 'trips'
  | 'earnings'
  | 'wallet'
  | 'vehicle'
  | 'documents'
  | 'notifications'
  | 'support'
  | 'profile';

interface PartnerAppProps {
  config: PublicConfig | null;
  lang: Language;
  onChangeLang: (l: Language) => void;
  onNavigate: (path: string) => void;
}

export const PartnerApp: React.FC<PartnerAppProps> = ({
  config,
  lang,
  onChangeLang,
  onNavigate,
}) => {
  const [token, setToken] = useState<string | null>(() => getRoleToken('partner'));
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<PartnerProfile | null>(null);
  const [documents, setDocuments] = useState<PartnerDocument[]>([]);
  const [tab, setTab] = useState<PartnerTab>('requests');

  const [requests, setRequests] = useState<Booking[]>([]);
  const [approved, setApproved] = useState(false);
  const [trips, setTrips] = useState<Booking[]>([]);
  const [earnings, setEarnings] = useState<{
    grossEarnings: number;
    totalCommission: number;
    netEarnings: number;
    availableBalancePkr: number;
    pendingSettlementsPkr: number;
    paidWithdrawalsPkr: number;
    completedTrips: any[];
    transactions: WalletTransaction[];
  }>({
    grossEarnings: 0,
    totalCommission: 0,
    netEarnings: 0,
    availableBalancePkr: 0,
    pendingSettlementsPkr: 0,
    paidWithdrawalsPkr: 0,
    completedTrips: [],
    transactions: [],
  });
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [demandData, setDemandData] = useState<DemandMapData | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [gpsSharing, setGpsSharing] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  const loadDemand = useCallback(async () => {
    try {
      const data = await apiRequest<DemandMapData>('/api/map/demand');
      setDemandData(data);
    } catch {
      // Keep previous demand snapshot if transient error occurs
    }
  }, []);

  const loadAll = useCallback(async () => {
    if (!token) return;
    try {
      const [profRes, reqRes, tripRes, earnRes, ntRes, tkRes] = await Promise.all([
        apiRequest<{ user: User; partnerProfile: PartnerProfile; documents: PartnerDocument[] }>('/api/partner/profile', {
          role: 'partner',
        }),
        apiRequest<{ approved: boolean; requests: Booking[] }>('/api/partner/requests', { role: 'partner' }),
        apiRequest<{ trips: Booking[] }>('/api/partner/trips', { role: 'partner' }),
        apiRequest<typeof earnings>('/api/partner/earnings', { role: 'partner' }),
        apiRequest<{ notifications: AppNotification[] }>('/api/partner/notifications', { role: 'partner' }),
        apiRequest<{ tickets: SupportTicket[] }>('/api/partner/support', { role: 'partner' }),
      ]);
      setUser(profRes.user);
      setProfile(profRes.partnerProfile);
      setDocuments(profRes.documents);
      setApproved(reqRes.approved);
      setRequests(reqRes.requests);
      setTrips(tripRes.trips);
      setEarnings(earnRes);
      setNotifications(ntRes.notifications);
      setTickets(tkRes.tickets);
      void loadDemand();
    } catch {
      setRoleToken('partner', null);
      setToken(null);
      setUser(null);
    }
  }, [token]);

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

  const wsRef = useRoleWebSocket('partner', token, (event) => {
    if (
      ['booking:created', 'booking:offer', 'booking:updated', 'partner:verification_updated', 'notification:new'].includes(
        event
      )
    ) {
      loadAll();
    }
  });

  // Clean up GPS watcher
  useEffect(() => {
    if (!gpsSharing) {
      if (watchIdRef.current !== null) {
        navigator.geolocation?.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }
    if (!navigator.geolocation) {
      setGpsSharing(false);
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const payload = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ event: 'partner:location', data: payload }));
        } else {
          apiRequest('/api/partner/location', { method: 'POST', role: 'partner', body: payload }).catch(() => {});
        }
      },
      () => setGpsSharing(false),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [gpsSharing, wsRef]);

  const handleToggleOnline = async () => {
    if (!profile) return;
    setAvailabilityError(null);
    try {
      await apiRequest('/api/partner/availability', {
        method: 'POST',
        role: 'partner',
        body: { isOnline: !profile.is_online },
      });
      await loadAll();
    } catch (err: any) {
      setAvailabilityError(err.message);
      setTab('documents');
    }
  };

  const { signOutFirebase } = useFirebase();

  const handleLogout = () => {
    setGpsSharing(false);
    setRoleToken('partner', null);
    setToken(null);
    setUser(null);
    setProfile(null);
    void signOutFirebase().catch(() => {});
  };

  if (!token || !user || !profile) {
    return (
      <PartnerAuth
        lang={lang}
        onChangeLang={onChangeLang}
        onAuthenticated={(tk, u, p) => {
          setToken(tk);
          setUser(u);
          setProfile(p);
        }}
        onBackWelcome={() => onNavigate('/')}
      />
    );
  }

  const unreadCount = notifications.filter((n) => n.is_read === 0).length;

  const navItems: Array<{ id: PartnerTab; label: string; icon: any; badge?: number }> = [
    { id: 'requests', label: t(lang, 'requests'), icon: ClipboardList, badge: requests.length || undefined },
    { id: 'trips', label: t(lang, 'myTrips'), icon: Navigation },
    { id: 'earnings', label: t(lang, 'earnings'), icon: TrendingUp },
    { id: 'wallet', label: t(lang, 'wallet'), icon: WalletIcon },
    { id: 'vehicle', label: t(lang, 'vehicle'), icon: Car },
    { id: 'documents', label: t(lang, 'documents'), icon: FileCheck },
    { id: 'notifications', label: t(lang, 'notifications'), icon: Bell, badge: unreadCount || undefined },
    { id: 'support', label: t(lang, 'support'), icon: HelpCircle },
    { id: 'profile', label: t(lang, 'profile'), icon: UserIcon },
  ];

  return (
    <div dir={lang === 'ur' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#F8F8FA] flex flex-col md:flex-row">
      {/* Strictly Pro Partner Obsidian Black Sidebar — Zero Passenger Booking Forms */}
      <aside className="hidden md:flex md:w-64 bg-[#0D0D10] text-white flex-col justify-between p-5 shrink-0 sticky top-0 h-screen">
        <div className="space-y-5 overflow-y-auto">
          <button type="button" onClick={() => setTab('requests')} className="text-left">
            <BrandLogo dark />
          </button>

          <button
            type="button"
            onClick={handleToggleOnline}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-colors ${
              profile.is_online
                ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
                : 'bg-zinc-900 border-zinc-700 text-zinc-300'
            }`}
          >
            <span className="flex items-center gap-2">
              <Power className="w-4 h-4" />
              {profile.is_online ? 'Online · Receiving' : 'Offline Mode'}
            </span>
            <span className="font-mono text-[10px] uppercase">{profile.verification_status.replaceAll('_', ' ')}</span>
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
                  className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-sm font-medium transition-colors ${
                    active
                      ? 'bg-[#D4A017] text-[#0D0D10] font-bold'
                      : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="w-4 h-4" />
                    <span className="truncate">{item.label}</span>
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

        <div className="space-y-2 pt-3 border-t border-zinc-800">
          <div className="p-2.5 rounded-xl bg-zinc-900 text-xs">
            <p className="font-bold text-[#D4A017] truncate">{user.full_name}</p>
            <p className="text-[11px] text-zinc-400">Pro Partner · {user.city}</p>
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-6">
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-zinc-200 px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="md:hidden">
              <BrandLogo compact />
            </div>
            <button
              type="button"
              onClick={handleToggleOnline}
              className={`md:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${
                profile.is_online ? 'bg-emerald-700 text-white' : 'bg-zinc-200 text-zinc-800'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              {profile.is_online ? 'Online' : 'Offline'}
            </button>
            <span className="hidden sm:inline text-xs font-semibold text-zinc-600">
              Pro Partner Workspace · {profile.vehicle_name || 'Complete Vehicle Setup'}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <LanguageToggle lang={lang} onChange={onChangeLang} />
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => setTab('notifications')}
              className="relative p-2 rounded-xl border border-zinc-200 hover:bg-zinc-50"
            >
              <Bell className="w-4 h-4 text-[#0D0D10]" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-4">
          {availabilityError && (
            <div className="rounded-xl bg-amber-50 border border-amber-300 px-4 py-3 text-xs font-semibold text-amber-900">
              {availabilityError}
            </div>
          )}

          {tab === 'requests' && (
            <PartnerRequestsView
              approved={approved}
              profile={profile}
              requests={requests}
              demandData={demandData}
              zones={config?.zones || []}
              onRefresh={loadAll}
              onGoToDocs={() => setTab('documents')}
            />
          )}
          {tab === 'trips' && (
            <PartnerTripsView
              trips={trips}
              gpsSharing={gpsSharing}
              onToggleGpsSharing={() => setGpsSharing((v) => !v)}
              onRefresh={loadAll}
            />
          )}
          {(tab === 'earnings' || tab === 'wallet') && (
            <PartnerFinanceView
              mode={tab}
              partnerName={user.full_name}
              earnings={earnings}
              onRefresh={loadAll}
            />
          )}
          {(tab === 'vehicle' || tab === 'documents') && (
            <PartnerVerificationAndVehicleView
              mode={tab}
              profile={profile}
              documents={documents}
              config={config}
              onRefresh={loadAll}
            />
          )}
          {tab === 'notifications' && (
            <NotificationsView
              notifications={notifications}
              onMarkAllRead={async () => {
                await apiRequest('/api/partner/notifications/read', { method: 'POST', role: 'partner' });
                await loadAll();
              }}
            />
          )}
          {tab === 'support' && (
            <SupportView role="partner" tickets={tickets} onRefresh={loadAll} />
          )}
          {tab === 'profile' && (
            <PartnerProfileView user={user} onUpdated={setUser} onLogout={handleLogout} />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0D0D10] text-white border-t border-zinc-800 grid grid-cols-4 h-16 pb-safe">
        {[
          { id: 'requests' as PartnerTab, label: 'Requests', icon: ClipboardList },
          { id: 'trips' as PartnerTab, label: 'Trips', icon: Navigation },
          { id: 'earnings' as PartnerTab, label: 'Earnings', icon: TrendingUp },
          { id: 'documents' as PartnerTab, label: 'Docs', icon: FileCheck },
        ].map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${
                active ? 'text-[#D4A017]' : 'text-zinc-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <ProRiderAiCopilot persona="partner" lang={lang} />
    </div>
  );
};
