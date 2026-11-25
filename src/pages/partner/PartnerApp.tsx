import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  Car,
  ClipboardList,
  FileCheck,
  HelpCircle,
  Home,
  LogOut,
  Navigation,
  Power,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  User as UserIcon,
  Wallet as WalletIcon,
} from 'lucide-react';
import { BrandLogo, LanguageToggle, PWAInstallButton } from '../../components/BrandMark';
import { ProRiderAiCopilot } from '../../components/ProRiderAiCopilot';
import { ProfileThemeRowButton } from '../../components/ThemeSwitcher';
import { useFirebase } from '../../contexts/FirebaseContext';
import { useTheme } from '../../contexts/ThemeContext';
import { t, tr, trVerificationStatus } from '../../i18n/translations';
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
  saveRideBellSound,
  sendRideBrowserNotification,
  type RideBellSoundId,
} from '../../utils/rideBell';
import { NotificationsView, SupportView } from '../passenger/PassengerSecondaryViews';
import { PartnerAuth, PartnerVerificationAndVehicleView } from './PartnerAuthAndDocs';
import { PartnerFinanceView, PartnerProfileView } from './PartnerFinanceAndProfile';
import { PartnerRequestsView, PartnerTripsView } from './PartnerRequestsAndTrips';

const PARTNER_PROFILE_STORAGE_KEY = 'pr_profile_partner';

function getPartnerDocsStorageKey(userId?: string | null) {
  return `pr_partner_docs_${userId || 'guest'}`;
}

function getPartnerProfileStorageKey(userId?: string | null) {
  return `pr_profile_partner_${userId || 'guest'}`;
}

function readStoredPartnerDocs(userId?: string | null): PartnerDocument[] {
  try {
    const raw = localStorage.getItem(getPartnerDocsStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PartnerDocument[]) : [];
  } catch {
    return [];
  }
}

function writeStoredPartnerDocs(userId: string | undefined | null, docs: PartnerDocument[]) {
  try {
    localStorage.setItem(getPartnerDocsStorageKey(userId), JSON.stringify(docs));
  } catch {
    // ignore quota errors
  }
}

function readStoredPartnerProfile(userId?: string | null): PartnerProfile | null {
  try {
    const raw =
      (userId ? localStorage.getItem(getPartnerProfileStorageKey(userId)) : null) ||
      localStorage.getItem(PARTNER_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PartnerProfile;
  } catch {
    return null;
  }
}

function writeStoredPartnerProfile(userId: string | undefined | null, p: PartnerProfile) {
  try {
    const serialized = JSON.stringify(p);
    localStorage.setItem(PARTNER_PROFILE_STORAGE_KEY, serialized);
    const id = userId || p.user_id;
    if (id) {
      localStorage.setItem(getPartnerProfileStorageKey(id), serialized);
    }
  } catch {
    // ignore quota errors
  }
}

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
  const { isDark } = useTheme();
  const { firebaseUser, signOutFirebase, fetchMyPartnerApplication } = useFirebase();
  const [token, setToken] = useState<string | null>(() => getRoleToken('partner'));
  const [user, setUser] = useState<User | null>(() => getStoredRoleUser<User>('partner'));
  const [profile, setProfile] = useState<PartnerProfile | null>(() =>
    readStoredPartnerProfile(getStoredRoleUser<User>('partner')?.id)
  );
  const [documents, setDocuments] = useState<PartnerDocument[]>(() =>
    readStoredPartnerDocs(getStoredRoleUser<User>('partner')?.id)
  );
  const [tab, setTab] = useState<PartnerTab>('requests');

  const [requests, setRequests] = useState<Booking[]>([]);
  const [approved, setApproved] = useState(false);
  const [trips, setTrips] = useState<Booking[]>([]);
  const [earnings, setEarnings] = useState<{
    grossEarnings: number;
    totalCommission: number;
    netEarnings: number;
    availableBalancePkr: number;
    minRequiredWalletPkr: number;
    instantCommissionPct: number;
    commissionDeductionMode: string;
    pendingSettlementsPkr: number;
    paidWithdrawalsPkr: number;
    completedTrips: any[];
    transactions: WalletTransaction[];
  }>({
    grossEarnings: 0,
    totalCommission: 0,
    netEarnings: 0,
    availableBalancePkr: 0,
    minRequiredWalletPkr: 500,
    instantCommissionPct: 15,
    commissionDeductionMode: 'on_accept',
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
  const [bellSound, setBellSound] = useState<RideBellSoundId>(() => getSavedRideBellSound('partner'));
  const [incomingRideNotice, setIncomingRideNotice] = useState<Booking | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const seenRequestIdsRef = useRef<Set<string> | null>(null);
  const bellSoundRef = useRef(bellSound);
  bellSoundRef.current = bellSound;
  const userRef = useRef(user);
  userRef.current = user;
  const profileRef = useRef(profile);
  profileRef.current = profile;

  useEffect(() => {
    const onBellUpdated = () => {
      setBellSound(getSavedRideBellSound('partner'));
    };
    window.addEventListener('pr:bell-updated', onBellUpdated);
    return () => window.removeEventListener('pr:bell-updated', onBellUpdated);
  }, []);

  const loadDemand = useCallback(async () => {
    try {
      const data = await apiRequest<DemandMapData>('/api/map/demand');
      if (data && Array.isArray(data.hotspots)) {
        setDemandData(data);
      }
    } catch {
      // Keep previous demand snapshot if transient error or static hosting
    }
  }, []);

  const loadAll = useCallback(async () => {
    if (!token) return;
    // Upgrade offline Firebase token silently if Express backend is reachable
    if (token.startsWith('pr_fb_') && firebaseUser) {
      try {
        const fbIdToken = await firebaseUser.getIdToken();
        const exch = await apiRequest<{ token: string; user: User; partnerProfile: PartnerProfile }>(
          '/api/auth/google/firebase',
          {
            method: 'POST',
            body: { idToken: fbIdToken, role: 'partner', city: userRef.current?.city || 'Islamabad' },
          }
        );
        if (exch?.token) {
          setRoleToken('partner', exch.token);
          setToken(exch.token);
          if (exch.user) {
            setUser(exch.user);
            setStoredRoleUser('partner', exch.user);
          }
          if (exch.partnerProfile) {
            setProfile(exch.partnerProfile);
            writeStoredPartnerProfile(exch.user?.id || exch.partnerProfile.user_id, exch.partnerProfile);
          }
          return;
        }
      } catch {
        // Backend still offline or not configured — proceed with cloud/local fallback
      }
    }

    try {
      const [profRes, reqRes, tripRes, earnRes, ntRes, tkRes] = await Promise.all([
        apiRequest<{ user: User; partnerProfile: PartnerProfile; documents: PartnerDocument[] }>('/api/partner/profile', {
          role: 'partner',
        }),
        apiRequest<{
          approved: boolean;
          walletBalancePkr?: number;
          minRequiredWalletPkr?: number;
          instantCommissionPct?: number;
          commissionDeductionMode?: string;
          requests: Booking[];
        }>('/api/partner/requests', { role: 'partner' }),
        apiRequest<{ trips: Booking[] }>('/api/partner/trips', { role: 'partner' }),
        apiRequest<typeof earnings>('/api/partner/earnings', { role: 'partner' }),
        apiRequest<{ notifications: AppNotification[] }>('/api/partner/notifications', { role: 'partner' }),
        apiRequest<{ tickets: SupportTicket[] }>('/api/partner/support', { role: 'partner' }),
      ]);
      if (profRes?.user) {
        setUser(profRes.user);
        setStoredRoleUser('partner', profRes.user);
      }
      if (profRes?.partnerProfile) {
        setProfile(profRes.partnerProfile);
        writeStoredPartnerProfile(profRes.user?.id || profRes.partnerProfile.user_id, profRes.partnerProfile);
      }
      const serverDocs = Array.isArray(profRes?.documents) ? profRes.documents : [];
      setDocuments(serverDocs);
      writeStoredPartnerDocs(profRes?.user?.id || userRef.current?.id, serverDocs);
      setApproved(Boolean(reqRes?.approved));
      setRequests(Array.isArray(reqRes?.requests) ? reqRes.requests : []);
      setTrips(Array.isArray(tripRes?.trips) ? tripRes.trips : []);
      if (earnRes && typeof earnRes.netEarnings === 'number') {
        setEarnings({
          grossEarnings: earnRes.grossEarnings || 0,
          totalCommission: earnRes.totalCommission || 0,
          netEarnings: earnRes.netEarnings || 0,
          availableBalancePkr: earnRes.availableBalancePkr ?? reqRes?.walletBalancePkr ?? 0,
          minRequiredWalletPkr: earnRes.minRequiredWalletPkr ?? reqRes?.minRequiredWalletPkr ?? config?.minPartnerWalletPkr ?? 500,
          instantCommissionPct: earnRes.instantCommissionPct ?? reqRes?.instantCommissionPct ?? config?.instantCommissionPct ?? 15,
          commissionDeductionMode: earnRes.commissionDeductionMode ?? reqRes?.commissionDeductionMode ?? 'on_accept',
          pendingSettlementsPkr: earnRes.pendingSettlementsPkr || 0,
          paidWithdrawalsPkr: earnRes.paidWithdrawalsPkr || 0,
          completedTrips: Array.isArray(earnRes.completedTrips) ? earnRes.completedTrips : [],
          transactions: Array.isArray(earnRes.transactions) ? earnRes.transactions : [],
        });
      }
      setNotifications(Array.isArray(ntRes?.notifications) ? ntRes.notifications : []);
      setTickets(Array.isArray(tkRes?.tickets) ? tkRes.tickets : []);
      void loadDemand();
    } catch (err) {
      if (isBackendOfflineError(err) || token.startsWith('pr_fb_')) {
        const localUser = userRef.current || getStoredRoleUser<User>('partner');
        if (localUser && !userRef.current) setUser(localUser);
        let localProfile = profileRef.current || readStoredPartnerProfile(localUser?.id);
        let storedDocs = readStoredPartnerDocs(localUser?.id || localProfile?.user_id);

        // Also check shared local bridge for Admin updates on the same browser
        try {
          const sharedRaw = localStorage.getItem('pr_shared_partner_submissions');
          if (sharedRaw && localUser?.id) {
            const sharedList = JSON.parse(sharedRaw);
            const sharedMatch = Array.isArray(sharedList)
              ? sharedList.find((x: any) => x?.user_id === localUser.id || x?.id === localUser.id)
              : null;
            if (sharedMatch && localProfile) {
              localProfile = {
                ...localProfile,
                verification_status: sharedMatch.verification_status || localProfile.verification_status,
                admin_notes: sharedMatch.admin_notes ?? localProfile.admin_notes,
              };
            }
          }
        } catch {
          // ignore
        }

        // Hydrate latest verification status, notes, fields & docs from Firestore if authenticated
        try {
          const cloud = await fetchMyPartnerApplication();
          if (cloud?.application) {
            const app = cloud.application;
            localProfile = {
              ...(localProfile || {
                user_id: localUser?.id || app.uid,
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
                operating_city: app.operatingCity || 'Islamabad',
                service_eligibility: ['pick_and_drop'],
                is_online: 0,
                current_lat: null,
                current_lng: null,
                last_location_at: null,
                admin_notes: '',
              }),
              reference_phone: app.referencePhone || localProfile?.reference_phone || '',
              cnic_number: app.cnicNumber || localProfile?.cnic_number || '',
              cnic_expiry: app.cnicExpiry || localProfile?.cnic_expiry || '',
              licence_number: app.licenceNumber || localProfile?.licence_number || '',
              licence_expiry: app.licenceExpiry || localProfile?.licence_expiry || '',
              vehicle_category_id: app.vehicleCategoryId || localProfile?.vehicle_category_id || 'fleet-sedan',
              vehicle_name: app.vehicleName || localProfile?.vehicle_name || '',
              vehicle_number: app.vehicleNumber || localProfile?.vehicle_number || '',
              seating_capacity: app.seatingCapacity || localProfile?.seating_capacity || 4,
              fuel_type: app.fuelType || localProfile?.fuel_type || 'Petrol',
              operating_city: app.operatingCity || localProfile?.operating_city || 'Islamabad',
              service_eligibility: (app.serviceEligibility?.length
                ? app.serviceEligibility
                : localProfile?.service_eligibility || ['pick_and_drop']) as any,
              verification_status: app.verificationStatus || localProfile?.verification_status || 'incomplete',
              admin_notes: app.adminNotes ?? localProfile?.admin_notes ?? '',
            };
            writeStoredPartnerProfile(localUser?.id || localProfile.user_id, localProfile);
            if (localUser && (app.fullName || app.phone)) {
              const mergedUser = {
                ...localUser,
                full_name: app.fullName || localUser.full_name,
                phone: app.phone || localUser.phone,
                city: app.operatingCity || localUser.city,
              };
              setUser(mergedUser);
              setStoredRoleUser('partner', mergedUser);
            }
          }
          if (cloud?.documents?.length) {
            const cloudDocs: PartnerDocument[] = cloud.documents.map((d) => ({
              id: `FB-${d.docType}`,
              partner_id: d.uid,
              doc_type: d.docType,
              file_name: d.fileName,
              file_data_url: d.fileDataUrl,
              status: d.status,
              expiry_date: d.expiryDate || '',
              review_notes: d.reviewNotes || '',
              is_public: d.isPublic ? 1 : 0,
              uploaded_at: new Date().toISOString(),
            }));
            const merged = [...cloudDocs];
            for (const ld of storedDocs) {
              if (!merged.some((cd) => cd.doc_type === ld.doc_type)) {
                merged.push(ld);
              }
            }
            storedDocs = merged;
            writeStoredPartnerDocs(localUser?.id || localProfile?.user_id, merged);
          }
        } catch {
          // Firestore offline or unverified email — rely on per-ID localStorage
        }

        if (localProfile) setProfile(localProfile);
        if (storedDocs.length > 0) setDocuments(storedDocs);
        setApproved(Boolean(localProfile && localProfile.verification_status === 'approved'));
        try {
          const collected: Booking[] = [];
          const acceptedTrips: Booking[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k || !k.startsWith('pr_local_bookings_passenger')) continue;
            const raw = localStorage.getItem(k);
            if (!raw) continue;
            const parsed = JSON.parse(raw) as Booking[];
            if (Array.isArray(parsed)) {
              for (const b of parsed) {
                if (['searching', 'negotiating'].includes(b.status) && !b.partner_id) {
                  collected.push(b);
                } else if (
                  localUser?.id &&
                  b.partner_id === localUser.id &&
                  ['confirmed', 'on_the_way', 'arrived', 'started', 'completed'].includes(b.status)
                ) {
                  acceptedTrips.push(b);
                }
              }
            }
          }
          setRequests(collected);
          if (acceptedTrips.length > 0) setTrips(acceptedTrips);
        } catch {
          // ignore
        }
        return;
      }
      if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403)) {
        setRoleToken('partner', null);
        setToken(null);
        setUser(null);
        setProfile(null);
      }
    }
  }, [token, firebaseUser, loadDemand, fetchMyPartnerApplication, config?.minPartnerWalletPkr, config?.instantCommissionPct]);

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

  // Trigger audible Ride Bell + browser notification when new passenger requests arrive
  useEffect(() => {
    if (!token) {
      seenRequestIdsRef.current = null;
      return;
    }
    if (seenRequestIdsRef.current === null) {
      seenRequestIdsRef.current = new Set(requests.map((r) => r.id));
      return;
    }
    const newlyArrived = requests.filter((r) => !seenRequestIdsRef.current!.has(r.id));
    if (newlyArrived.length > 0) {
      newlyArrived.forEach((r) => seenRequestIdsRef.current!.add(r.id));
      const latest = newlyArrived[0];
      setIncomingRideNotice(latest);
      playRideBell(bellSoundRef.current);
      sendRideBrowserNotification(
        `New Ride Request · Rs. ${Number(latest.proposed_fare_pkr || 0).toLocaleString()}`,
        `${latest.pickup_address} → ${latest.dropoff_address}`
      );
    }
  }, [requests, token]);

  const wsRef = useRoleWebSocket('partner', token, (event) => {
    if (event === 'config:updated') {
      window.dispatchEvent(new Event('pr:refresh-config'));
    } else if (event === 'booking:priority') {
      playRideBell(bellSoundRef.current === 'muted' ? 'muted' : 'urgent_dispatch');
      sendRideBrowserNotification(
        tr(lang, 'PRIORITY INSTANT RIDE NEARBY', 'قریبی فوری رائیڈ ترجیحی الرٹ'),
        tr(lang, 'You are the nearest eligible Pro Partner! Tap to accept directly.', 'آپ سب سے قریبی ڈرائیور ہیں! فوری قبول کرنے کے لیے کھولیں۔')
      );
    } else if (event === 'booking:created') {
      playRideBell(bellSoundRef.current);
      sendRideBrowserNotification(
        tr(lang, 'New Passenger Request', 'نئی مسافر رائیڈ درخواست'),
        tr(lang, 'Open PRO RIDER Driver Home to view ride details.', 'تفصیل دیکھنے کے لیے پرو رائیڈر ڈرائیور ہوم کھولیں۔')
      );
    }
    if (
      ['booking:priority', 'booking:created', 'booking:offer', 'booking:updated', 'partner:verification_updated', 'notification:new'].includes(
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
    const nextOnline = !profile.is_online;
    setAvailabilityError(null);

    const updatedProfile = { ...profile, is_online: nextOnline ? 1 : 0 };
    setProfile(updatedProfile);
    writeStoredPartnerProfile(user?.id || profile.user_id, updatedProfile);

    try {
      await apiRequest('/api/partner/availability', {
        method: 'POST',
        role: 'partner',
        body: { isOnline: nextOnline },
      });
      await loadAll();
    } catch {
      // Optimistic local state already applied successfully
    }
  };

  const handleLocalDocumentSaved = useCallback(
    (doc: PartnerDocument) => {
      setDocuments((prev) => {
        const next = [doc, ...prev.filter((d) => d.doc_type !== doc.doc_type)];
        writeStoredPartnerDocs(user?.id || profile?.user_id, next);
        return next;
      });
      void loadAll();
    },
    [user?.id, profile?.user_id, loadAll]
  );

  const handleToggleDocVisibility = useCallback(
    async (docType: PartnerDocument['doc_type'], isPublic: boolean) => {
      setDocuments((prev) => {
        const next = prev.map((d) =>
          d.doc_type === docType ? { ...d, is_public: isPublic ? 1 : 0 } : d
        );
        writeStoredPartnerDocs(user?.id || profile?.user_id, next);
        return next;
      });
      try {
        await apiRequest(`/api/partner/documents/${docType}/visibility`, {
          method: 'PATCH',
          role: 'partner',
          body: { isPublic },
        });
      } catch (err) {
        if (!isBackendOfflineError(err)) {
          await loadAll();
        }
      }
    },
    [user?.id, profile?.user_id, loadAll]
  );

  const handleLogout = () => {
    setGpsSharing(false);
    setRoleToken('partner', null);
    setStoredRoleUser('partner', null);
    try {
      // Remove only the active session pointer; keep per-user ID backups intact for seamless re-login
      localStorage.removeItem(PARTNER_PROFILE_STORAGE_KEY);
    } catch {
      // ignore
    }
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
          const prevForId = readStoredPartnerProfile(u.id);
          const mergedProfile: PartnerProfile = prevForId && prevForId.user_id === u.id
            ? {
                ...prevForId,
                ...p,
                reference_phone: p.reference_phone || prevForId.reference_phone || '',
                cnic_number: p.cnic_number || prevForId.cnic_number || '',
                cnic_expiry: p.cnic_expiry || prevForId.cnic_expiry || '',
                licence_number: p.licence_number || prevForId.licence_number || '',
                licence_expiry: p.licence_expiry || prevForId.licence_expiry || '',
                vehicle_name: p.vehicle_name || prevForId.vehicle_name || '',
                vehicle_number: p.vehicle_number || prevForId.vehicle_number || '',
                verification_status:
                  p.verification_status && p.verification_status !== 'incomplete'
                    ? p.verification_status
                    : prevForId.verification_status || 'incomplete',
              }
            : p;
          setRoleToken('partner', tk);
          setStoredRoleUser('partner', u);
          writeStoredPartnerProfile(u.id, mergedProfile);
          setToken(tk);
          setUser(u);
          setProfile(mergedProfile);
          setDocuments(readStoredPartnerDocs(u.id));
        }}
        onBackWelcome={() => onNavigate('/')}
      />
    );
  }

  const safeNotifications = Array.isArray(notifications) ? notifications : [];
  const unreadCount = safeNotifications.filter((n) => n.is_read === 0).length;

  const navItems: Array<{ id: PartnerTab; label: string; icon: any; badge?: number }> = [
    { id: 'requests', label: lang === 'ur' ? 'ہوم' : 'Home', icon: Home, badge: requests.length || undefined },
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
    <div dir={lang === 'ur' ? 'rtl' : 'ltr'} className="min-h-screen w-full max-w-full overflow-x-clip bg-[#F8F8FA] flex flex-col md:flex-row">
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
              {profile.is_online
                ? tr(lang, 'Online · Receiving', 'آن لائن · رائیڈز فعال')
                : tr(lang, 'Offline Mode', 'آف لائن موڈ')}
            </span>
            <span className="font-mono text-[10px] uppercase">
              {trVerificationStatus(lang, profile.verification_status)}
            </span>
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
            <p className="text-[11px] text-zinc-400">
              {tr(lang, 'Pro Partner', 'پرو پارٹنر')} · {user.city}
            </p>
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 w-full pb-20 md:pb-6">
        <header
          className={`sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-zinc-200 px-2.5 sm:px-6 h-12 sm:h-16 ${
            tab === 'requests' ? 'hidden md:flex' : 'flex'
          } items-center justify-between gap-2 w-full`}
        >
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 shrink">
            <div className="md:hidden flex items-center gap-1.5 min-w-0">
              <img
                src="/assets/aistudio/pmg_3_88102afb.png"
                alt="PRO RIDER"
                className="w-6 h-6 rounded-full object-contain bg-black border border-[#D4A017]/50 shrink-0"
              />
            </div>
            <button
              type="button"
              onClick={handleToggleOnline}
              className={`md:hidden inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 ${
                profile.is_online ? 'bg-emerald-700 text-white' : 'bg-zinc-200 text-zinc-800'
              }`}
            >
              <Power className="w-3 h-3" />
              {profile.is_online ? tr(lang, 'Online', 'آن لائن') : tr(lang, 'Offline', 'آف لائن')}
            </button>
            <span className="hidden sm:inline text-xs font-semibold text-zinc-600 truncate">
              {tr(lang, 'Pro Partner', 'پرو پارٹنر')} · {profile.vehicle_name || tr(lang, 'Complete Vehicle Setup', 'گاڑی کی تفصیلات مکمل کریں')}
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('open-prorider-ai-copilot'))}
              aria-label={tr(lang, 'Open AI Voice & Concierge', 'اے آئی وائس کھولیں')}
              className="pr-preserve-light md:hidden inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-xl bg-gradient-to-r from-[#15151A] via-[#0D0D10] to-[#231B07] text-white text-[11px] font-bold border border-[#D4A017]/80 shadow-sm hover:border-[#F4C430] active:scale-95 transition-all whitespace-nowrap shrink-0"
            >
              <span className="w-5 h-5 rounded-lg bg-gradient-to-br from-[#F4C430] to-[#B8860B] text-[#0D0D10] flex items-center justify-center shrink-0">
                <Sparkles className="w-3 h-3" />
              </span>
              <span className="tracking-wide">{tr(lang, 'AI', 'اے آئی')}</span>
            </button>
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

        <main className="flex-1 max-w-7xl w-full min-w-0 overflow-x-clip mx-auto p-3 sm:p-6 space-y-4">
          {availabilityError && (
            <div className="rounded-xl bg-amber-50 border border-amber-300 px-4 py-3 text-xs font-semibold text-amber-900">
              {availabilityError}
            </div>
          )}

          {tab === 'requests' && (
            <PartnerRequestsView
              lang={lang}
              approved={approved}
              profile={profile}
              requests={Array.isArray(requests) ? requests : []}
              walletBalancePkr={earnings.availableBalancePkr}
              minRequiredWalletPkr={earnings.minRequiredWalletPkr}
              instantCommissionPct={earnings.instantCommissionPct}
              demandData={demandData}
              zones={config?.zones || []}
              bellSound={bellSound}
              onChangeBellSound={(next) => {
                setBellSound(next);
                saveRideBellSound(next, 'partner');
                if (next !== 'muted') playRideBell(next);
              }}
              onTestBell={() => playRideBell(bellSound)}
              incomingRideNotice={incomingRideNotice}
              onDismissIncomingNotice={() => setIncomingRideNotice(null)}
              onRefresh={loadAll}
              onGoToDocs={() => setTab('documents')}
              onGoToWallet={() => setTab('wallet')}
              onToggleOnline={handleToggleOnline}
              onChangeLang={onChangeLang}
              onLogout={handleLogout}
            />
          )}
          {tab === 'trips' && (
            <PartnerTripsView
              lang={lang}
              trips={Array.isArray(trips) ? trips : []}
              gpsSharing={gpsSharing}
              onToggleGpsSharing={() => setGpsSharing((v) => !v)}
              onRefresh={loadAll}
            />
          )}
          {(tab === 'earnings' || tab === 'wallet') && (
            <PartnerFinanceView
              lang={lang}
              mode={tab}
              partnerName={user.full_name}
              earnings={earnings}
              onRefresh={loadAll}
            />
          )}
          {(tab === 'vehicle' || tab === 'documents') && (
            <PartnerVerificationAndVehicleView
              mode={tab}
              lang={lang}
              user={user}
              profile={profile}
              documents={Array.isArray(documents) ? documents : []}
              config={config}
              onRefresh={loadAll}
              onUserUpdated={(updatedUser) => {
                setUser(updatedUser);
                setStoredRoleUser('partner', updatedUser);
              }}
              onProfileUpdated={(updatedProfile) => {
                setProfile(updatedProfile);
                writeStoredPartnerProfile(user.id, updatedProfile);
              }}
              onLocalDocumentSaved={handleLocalDocumentSaved}
              onToggleDocVisibility={handleToggleDocVisibility}
            />
          )}
          {tab === 'notifications' && (
            <NotificationsView
              lang={lang}
              role="partner"
              bellSound={bellSound}
              onChangeBellSound={(next) => {
                setBellSound(next);
                saveRideBellSound(next, 'partner');
              }}
              notifications={safeNotifications}
              onMarkAllRead={async () => {
                try {
                  await apiRequest('/api/partner/notifications/read', { method: 'POST', role: 'partner' });
                  await loadAll();
                } catch {
                  setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
                }
              }}
            />
          )}
          {tab === 'support' && (
            <SupportView lang={lang} role="partner" tickets={Array.isArray(tickets) ? tickets : []} onRefresh={loadAll} />
          )}
          {tab === 'profile' && (
            <PartnerProfileView
              user={user}
              profile={profile}
              documents={Array.isArray(documents) ? documents : []}
              tripsCount={Array.isArray(trips) ? trips.filter((tItem) => tItem.status === 'completed').length : 0}
              lang={lang}
              unreadNotifications={unreadCount}
              onOpenNotifications={() => setTab('notifications')}
              onUpdated={(updated) => {
                setUser(updated);
                setStoredRoleUser('partner', updated);
              }}
              onProfileUpdated={(updatedProfile) => {
                setProfile(updatedProfile);
                writeStoredPartnerProfile(user.id, updatedProfile);
              }}
              onLocalDocumentSaved={handleLocalDocumentSaved}
              onToggleDocVisibility={handleToggleDocVisibility}
              onRefresh={loadAll}
              onLogout={handleLogout}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0D0D10] text-white border-t border-zinc-800 grid grid-cols-5 h-16 pb-safe">
        {[
          { id: 'requests' as PartnerTab, label: t(lang, 'home'), icon: Home },
          { id: 'trips' as PartnerTab, label: tr(lang, 'Trips', 'ٹرپس'), icon: Navigation },
          { id: 'earnings' as PartnerTab, label: t(lang, 'earnings'), icon: TrendingUp },
          { id: 'documents' as PartnerTab, label: tr(lang, 'Docs', 'دستاویزات'), icon: FileCheck },
          { id: 'profile' as PartnerTab, label: t(lang, 'profile'), icon: UserIcon },
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
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <ProRiderAiCopilot persona="partner" lang={lang} />
    </div>
  );
};
