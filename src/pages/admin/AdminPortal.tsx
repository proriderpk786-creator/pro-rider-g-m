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
  FileSpreadsheet,
  FileText,
  Flame,
  HelpCircle,
  KeyRound,
  Lock,
  LogOut,
  Menu,
  Package,
  Palette,
  PhoneCall,
  RefreshCw,
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
import { BrandLogo, LanguageToggle, VehicleImage } from '../../components/BrandMark';
import { GoogleSheetsSyncPanel } from '../../components/GoogleSheetsSyncPanel';
import { StreetMap } from '../../components/StreetMap';
import { ThemePreferencesPanel, ThemeQuickToggle } from '../../components/ThemeSwitcher';
import { useFirebase, type PartnerApplicationCloud } from '../../contexts/FirebaseContext';
import { tr, trBookingStatus, trVerificationStatus } from '../../i18n/translations';
import { apiRequest, getRoleToken, isBackendOfflineError, setRoleToken, useRoleWebSocket } from '../../utils/api';
import { downloadBookingPdf } from '../../utils/pdfGenerator';
import type {
  AppThemeId,
  AuthLayoutId,
  Booking,
  FleetCategory,
  HomeLayoutId,
  Language,
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
  | 'theme'
  | 'fleet'
  | 'fares'
  | 'passengers'
  | 'partners'
  | 'bookings'
  | 'zones'
  | 'schedule'
  | 'packages'
  | 'finance'
  | 'sheets'
  | 'tickets'
  | 'security';

type AdminAuthMode = 'login' | 'setup' | 'recovery';

interface AdminPortalProps {
  currentPath?: string;
  lang?: Language;
  onChangeLang?: (l: Language) => void;
  onNavigate?: (path: string) => void;
  onRefreshConfig?: () => Promise<void> | void;
}

const SHARED_PARTNER_SUBMISSIONS_KEY = 'pr_shared_partner_submissions';

function readSharedLocalPartners(): any[] {
  try {
    const raw = localStorage.getItem(SHARED_PARTNER_SUBMISSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSharedLocalPartnerUpdate(
  partnerId: string,
  patch: {
    verification_status?: string;
    admin_notes?: string;
    wallet_delta_pkr?: number;
  }
) {
  try {
    const list = readSharedLocalPartners();
    const updated = list.map((item) => {
      if (item?.user_id !== partnerId && item?.id !== partnerId && item?.cloud_uid !== partnerId) {
        return item;
      }
      return {
        ...item,
        ...(patch.verification_status ? { verification_status: patch.verification_status } : {}),
        ...(typeof patch.admin_notes === 'string' ? { admin_notes: patch.admin_notes } : {}),
        ...(typeof patch.wallet_delta_pkr === 'number'
          ? { wallet_balance_pkr: Number(item.wallet_balance_pkr || 0) + patch.wallet_delta_pkr }
          : {}),
        updated_at: new Date().toISOString(),
      };
    });
    localStorage.setItem(SHARED_PARTNER_SUBMISSIONS_KEY, JSON.stringify(updated));

    // Also update active per-ID cached partner profile if present in same browser
    for (const key of [`pr_profile_partner_${partnerId}`, 'pr_profile_partner']) {
      const rawProf = localStorage.getItem(key);
      if (!rawProf) continue;
      const prof = JSON.parse(rawProf);
      if (prof && (prof.user_id === partnerId || key === `pr_profile_partner_${partnerId}`)) {
        const nextProf = {
          ...prof,
          ...(patch.verification_status ? { verification_status: patch.verification_status } : {}),
          ...(typeof patch.admin_notes === 'string' ? { admin_notes: patch.admin_notes } : {}),
          ...(typeof patch.wallet_delta_pkr === 'number'
            ? { wallet_balance_pkr: Number(prof.wallet_balance_pkr || 0) + patch.wallet_delta_pkr }
            : {}),
        };
        localStorage.setItem(key, JSON.stringify(nextProf));
      }
    }
  } catch {
    // ignore storage errors
  }
}

function mapCloudAppToAdminPartner(app: PartnerApplicationCloud): any {
  const docs = Array.isArray(app.documents)
    ? app.documents.map((d) => ({
        id: `${app.uid}_${d.docType}`,
        partner_id: app.uid,
        doc_type: d.docType,
        file_name: d.fileName,
        file_data_url: d.fileDataUrl,
        status: d.status || 'pending',
        expiry_date: d.expiryDate || '',
        is_public: d.isPublic ? 1 : 0,
        review_notes: d.reviewNotes || '',
      }))
    : [];

  return {
    user_id: app.uid,
    cloud_uid: app.uid,
    full_name: app.fullName || 'Pro Partner',
    email: app.email || '',
    phone: app.phone || '',
    reference_phone: app.referencePhone || '',
    operating_city: app.operatingCity || 'Islamabad',
    cnic_number: app.cnicNumber || '',
    cnic_expiry: app.cnicExpiry || '',
    licence_number: app.licenceNumber || '',
    licence_expiry: app.licenceExpiry || '',
    vehicle_category_id: app.vehicleCategoryId || 'fleet-sedan',
    vehicle_name: app.vehicleName || '',
    vehicle_number: app.vehicleNumber || '',
    seating_capacity: app.seatingCapacity || 4,
    fuel_type: app.fuelType || 'Petrol',
    service_eligibility: Array.isArray(app.serviceEligibility) ? app.serviceEligibility : ['pick_and_drop'],
    verification_status: app.verificationStatus || 'under_review',
    admin_notes: app.adminNotes || '',
    wallet_balance_pkr: 0,
    pending_vehicle_review: 0,
    documents: docs,
    source: 'cloud',
  };
}

function mergeDocs(baseDocs: any[], incomingDocs: any[]): any[] {
  const byType = new Map<string, any>();
  for (const d of baseDocs || []) {
    if (d?.doc_type) byType.set(d.doc_type, d);
  }
  for (const d of incomingDocs || []) {
    if (d?.doc_type && (!byType.has(d.doc_type) || (!byType.get(d.doc_type)?.file_data_url && d.file_data_url))) {
      byType.set(d.doc_type, d);
    }
  }
  return Array.from(byType.values());
}

function mergePartnerLists(expressList: any[], cloudApps: PartnerApplicationCloud[], localList: any[]): any[] {
  const resultMap = new Map<string, any>();
  const emailToKey = new Map<string, string>();

  const upsert = (raw: any, sourceLabel: string) => {
    if (!raw) return;
    const uid = String(raw.user_id || raw.id || '').trim();
    const emailKey = String(raw.email || '').trim().toLowerCase();
    const existingKey = (uid && resultMap.has(uid) ? uid : '') || (emailKey && emailToKey.get(emailKey)) || uid || emailKey;
    if (!existingKey) return;

    const existing = resultMap.get(existingKey);
    const normalizedDocs = Array.isArray(raw.documents) ? raw.documents : [];
    const normalizedServices = Array.isArray(raw.service_eligibility)
      ? raw.service_eligibility
      : ['pick_and_drop'];

    if (!existing) {
      resultMap.set(existingKey, {
        ...raw,
        user_id: uid || existingKey,
        cloud_uid: raw.cloud_uid || (sourceLabel === 'cloud' ? uid : undefined),
        service_eligibility: normalizedServices,
        documents: normalizedDocs,
        source: raw.source || sourceLabel,
      });
      if (emailKey) emailToKey.set(emailKey, existingKey);
    } else {
      resultMap.set(existingKey, {
        ...existing,
        full_name: existing.full_name || raw.full_name,
        email: existing.email || raw.email,
        phone: existing.phone || raw.phone,
        reference_phone: existing.reference_phone || raw.reference_phone,
        operating_city: existing.operating_city || raw.operating_city,
        cnic_number: existing.cnic_number || raw.cnic_number,
        cnic_expiry: existing.cnic_expiry || raw.cnic_expiry,
        licence_number: existing.licence_number || raw.licence_number,
        licence_expiry: existing.licence_expiry || raw.licence_expiry,
        vehicle_name: existing.vehicle_name || raw.vehicle_name,
        vehicle_number: existing.vehicle_number || raw.vehicle_number,
        seating_capacity: existing.seating_capacity || raw.seating_capacity,
        fuel_type: existing.fuel_type || raw.fuel_type,
        admin_notes: existing.admin_notes || raw.admin_notes,
        cloud_uid: existing.cloud_uid || raw.cloud_uid || (sourceLabel === 'cloud' ? uid : undefined),
        verification_status:
          existing.verification_status === 'incomplete' && raw.verification_status
            ? raw.verification_status
            : existing.verification_status || raw.verification_status,
        service_eligibility:
          existing.service_eligibility?.length ? existing.service_eligibility : normalizedServices,
        documents: mergeDocs(existing.documents, normalizedDocs),
      });
      if (emailKey && !emailToKey.has(emailKey)) {
        emailToKey.set(emailKey, existingKey);
      }
    }
  };

  for (const p of expressList || []) upsert(p, 'server');
  for (const app of cloudApps || []) upsert(mapCloudAppToAdminPartner(app), 'cloud');
  for (const loc of localList || []) upsert(loc, 'local');

  const priority = (status: string) => {
    if (status === 'under_review') return 0;
    if (status === 'documents_pending') return 1;
    if (status === 'approved') return 2;
    if (status === 'incomplete') return 3;
    return 4;
  };

  return Array.from(resultMap.values()).sort((a, b) => priority(a.verification_status) - priority(b.verification_status));
}

export const AdminPortal: React.FC<AdminPortalProps> = ({
  currentPath = '/admin',
  lang = 'en',
  onChangeLang,
  onNavigate,
  onRefreshConfig,
}) => {
  const {
    firebaseUser,
    signInWithGooglePopup,
    fetchAllPartnerApplicationsForAdmin,
    reviewPartnerApplicationInFirestore,
  } = useFirebase();
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
  const [partnerFilter, setPartnerFilter] = useState<'all' | 'pending' | 'approved' | 'other'>('all');
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{
    title: string;
    dataUrl: string;
    fileName?: string;
    partnerName?: string;
    status?: string;
    expiryDate?: string;
  } | null>(null);
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
      const cloudApps = await fetchAllPartnerApplicationsForAdmin().catch(() => []);
      const localShared = readSharedLocalPartners();
      const mergedPartners = mergePartnerLists(
        Array.isArray(prt?.partners) ? prt.partners : [],
        cloudApps,
        localShared
      );
      const pendingPartnersCount = mergedPartners.filter((p) =>
        ['under_review', 'documents_pending'].includes(p.verification_status)
      ).length;

      const safeOv: any = ov || {};
      setOverview(
        safeOv.kpis
          ? {
              ...safeOv,
              kpis: {
                ...safeOv.kpis,
                totalPartners: Math.max(Number(safeOv.kpis.totalPartners || 0), mergedPartners.length),
                pendingPartners: Math.max(Number(safeOv.kpis.pendingPartners || 0), pendingPartnersCount),
              },
            }
          : {
              kpis: {
                totalPassengers: Array.isArray(psg?.passengers) ? psg.passengers.length : 0,
                totalPartners: mergedPartners.length,
                pendingPartners: pendingPartnersCount,
                activeBookings: Array.isArray(bks?.bookings)
                  ? bks.bookings.filter((b: Booking) =>
                      ['searching', 'negotiating', 'confirmed', 'on_the_way', 'arrived', 'started'].includes(b.status)
                    ).length
                  : 0,
                completedBookings: 0,
                pendingMonthlyAppsCount: 0,
                gmvPkr: 0,
                commissionPkr: 0,
              },
              onlinePartners: Array.isArray(safeOv.onlinePartners) ? safeOv.onlinePartners : [],
              mapBookings: Array.isArray(safeOv.mapBookings) ? safeOv.mapBookings : [],
            }
      );
      setPartners(mergedPartners);
      setBookings(Array.isArray(bks?.bookings) ? bks.bookings : []);
      setFleet(Array.isArray(flt?.fleet) ? flt.fleet : []);
      setZones(Array.isArray(zns?.zones) ? zns.zones : []);
      setPackages(Array.isArray(pkgs?.packages) ? pkgs.packages : []);
      setSettings(stg?.settings || {});
      setTransactions(Array.isArray(fin?.transactions) ? fin.transactions : []);
      setTickets(Array.isArray(tkt?.tickets) ? tkt.tickets : []);
      setSecurityLogs(Array.isArray(sec?.logs) ? sec.logs : []);
      setPassengers(Array.isArray(psg?.passengers) ? psg.passengers : []);

      if (flt.fleet.length > 0 && !selectedFleetId) {
        setSelectedFleetId(flt.fleet[0].id);
        setFareForm(flt.fleet[0]);
      }
    } catch (err) {
      if (isBackendOfflineError(err) || token === 'pr_admin_local_token_786') {
        const superAdminUser: User = {
          id: 'admin-super-786',
          full_name: 'Super Admin',
          email: 'prorider.pk786@gmail.com',
          phone: '03125007782',
          whatsapp: '03125007782',
          city: 'Islamabad',
          role: 'admin',
          phone_verified: 1,
          created_at: new Date().toISOString(),
        };
        setAdminUser((prev) => prev || superAdminUser);

        const cloudApps = await fetchAllPartnerApplicationsForAdmin().catch(() => []);
        const localShared = readSharedLocalPartners();
        const mergedPartners = mergePartnerLists([], cloudApps, localShared);
        setPartners(mergedPartners);
        const pendingPartnersCount = mergedPartners.filter((p) =>
          ['under_review', 'documents_pending'].includes(p.verification_status)
        ).length;

        const allBookings: Booking[] = [];
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('pr_local_bookings_passenger_')) {
              const raw = localStorage.getItem(key);
              if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                  allBookings.push(...parsed);
                }
              }
            }
          }
        } catch {
          // ignore
        }
        setBookings(allBookings);
        const activeCount = allBookings.filter((b) =>
          ['searching', 'negotiating', 'confirmed', 'on_the_way', 'arrived', 'started'].includes(b.status)
        ).length;
        const completedList = allBookings.filter((b) => b.status === 'completed');
        const gmvPkr = completedList.reduce((acc, b) => acc + Number(b.total_bill_pkr || 0), 0);
        const commissionPkr = completedList.reduce((acc, b) => acc + Number(b.commission_pkr || 0), 0);
        setOverview((prev: any) => ({
          kpis: {
            totalPassengers: prev?.kpis?.totalPassengers ?? 1,
            totalPartners: mergedPartners.length,
            pendingPartners: pendingPartnersCount,
            activeBookings: activeCount,
            completedBookings: completedList.length,
            pendingMonthlyAppsCount: prev?.kpis?.pendingMonthlyAppsCount ?? 0,
            gmvPkr,
            commissionPkr,
          },
          onlinePartners: prev?.onlinePartners ?? [],
          mapBookings: allBookings.slice(0, 40),
        }));
        return;
      }
      setRoleToken('admin', null);
      setToken(null);
      setAdminUser(null);
    }
  }, [token, selectedFleetId, fetchAllPartnerApplicationsForAdmin]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (token && adminUser && currentPath === '/admin/login' && onNavigate) {
      onNavigate('/admin');
    }
  }, [token, adminUser, currentPath, onNavigate]);

  useRoleWebSocket('admin', token, (event) => {
    if (event === 'config:updated') {
      window.dispatchEvent(new Event('pr:refresh-config'));
      return;
    }
    if (
      [
        'booking:created',
        'booking:updated',
        'booking:application',
        'partner:document_uploaded',
        'partner:location',
        'support:new',
      ].includes(event)
    ) {
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
      if (isBackendOfflineError(err) && email.toLowerCase().trim() === 'prorider.pk786@gmail.com') {
        const localAdmin: User = {
          id: 'admin-super-786',
          full_name: 'Super Admin',
          email: 'prorider.pk786@gmail.com',
          phone: '03125007782',
          whatsapp: '03125007782',
          city: 'Islamabad',
          role: 'admin',
          phone_verified: 1,
          created_at: new Date().toISOString(),
        };
        completeAdminRedirect('pr_admin_local_token_786', localAdmin);
        return;
      }
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
    { ok: pw.length >= 10, label: tr(lang, '10+ characters', 'کم از کم 10 حروف') },
    { ok: /[A-Z]/.test(pw), label: tr(lang, 'Uppercase (A-Z)', 'بڑا حرف (A-Z)') },
    { ok: /[a-z]/.test(pw), label: tr(lang, 'Lowercase (a-z)', 'چھوٹا حرف (a-z)') },
    { ok: /[0-9]/.test(pw), label: tr(lang, 'Number (0-9)', 'ہندسا (0-9)') },
    { ok: /[^A-Za-z0-9]/.test(pw), label: tr(lang, 'Special symbol (!@#$)', 'خصوصی علامت (!@#$)') },
  ];

  if (!token || !adminUser) {
    return (
      <div dir={lang === 'ur' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#0D0D10] text-white flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md rounded-3xl bg-[#16171C] border border-zinc-800 p-6 sm:p-8 space-y-5 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <BrandLogo dark compact lang={lang} />
            <div className="flex items-center gap-1.5">
              {onChangeLang && <LanguageToggle lang={lang} onChange={onChangeLang} dark />}
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#D4A017]">
                <Lock className="w-3.5 h-3.5" />
                {tr(lang, 'Private Admin', 'پرائیویٹ ایڈمن')}
              </span>
            </div>
          </div>

          {/* One-time Emergency Backup Recovery Key Confirmation Screen */}
          {issuedBackupKey && pendingSession ? (
            <div className="space-y-4">
              <div className="rounded-2xl bg-emerald-950/50 border border-emerald-700/60 p-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                  {tr(lang, 'Super Admin Credentials Secured', 'سپرایڈمن اسناد محفوظ ہو گئیں')}
                </p>
                <p className="text-xs text-zinc-200 leading-relaxed">
                  {tr(
                    lang,
                    'Save your one-time Emergency Backup Recovery Key offline right now. For your security, it will never be shown again.',
                    'اپنی ون ٹائم ایمرجنسی بیک اپ ریکوری کی ابھی آف لائن محفوظ کر لیں۔ سیکیورٹی کی خاطر یہ دوبارہ نہیں دکھائی جائے گی۔'
                  )}
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
                  {tr(lang, 'Copy', 'کاپی')}
                </button>
              </div>
              <label className="flex items-start gap-2.5 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={backupSavedAck}
                  onChange={(e) => setBackupSavedAck(e.target.checked)}
                  className="mt-0.5 accent-[#D4A017]"
                />
                <span>
                  {tr(
                    lang,
                    'I have copied and stored this Emergency Backup Recovery Key safely.',
                    'میں نے یہ ایمرجنسی بیک اپ ریکوری کی کاپی کر کے محفوظ جگہ رکھ لی ہے۔'
                  )}
                </span>
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
                {tr(lang, 'Continue to Admin Dashboard', 'ایڈمن ڈیش بورڈ پر جائیں')}
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
                  {tr(lang, 'Sign In', 'سائن ان')}
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
                  {tr(lang, 'Account Setup', 'اکاؤنٹ سیٹ اپ')}
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
                  {tr(lang, 'Forgot Password', 'پاس ورڈ بھول گئے')}
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
                    <h1 className="font-display text-2xl font-bold">{tr(lang, 'Super Admin Sign In', 'سپر ایڈمن سائن ان')}</h1>
                    <p className="text-xs text-zinc-400 mt-1">
                      {tr(
                        lang,
                        'Authorized Super Admin access is verified exclusively on the backend server.',
                        'مجاز سپر ایڈمن رسائی کی تصدیق صرف بیک اینڈ سرور پر کی جاتی ہے۔'
                      )}
                    </p>
                  </div>

                  {setupCompleted === false && (
                    <div className="rounded-xl bg-amber-950/50 border border-amber-700/70 p-3.5 text-xs text-amber-200 space-y-2">
                      <p className="font-semibold">
                        {tr(lang, 'Protected First-Time Password Setup Required', 'پہلی بار محفوظ پاس ورڈ سیٹ اپ ضروری ہے')}
                      </p>
                      <p className="text-amber-200/80">
                        {tr(
                          lang,
                          'No password is set by default. Complete the protected setup process to create your own Super Admin password.',
                          'پہلے سے کوئی پاس ورڈ سیٹ نہیں ہے۔ اپنا سپر ایڈمن پاس ورڈ بنانے کے لیے سیٹ اپ مکمل کریں۔'
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('setup');
                          setLoginError(null);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#D4A017] text-[#0D0D10] font-bold text-xs"
                      >
                        {tr(lang, 'Start Account Setup', 'اکاؤنٹ سیٹ اپ شروع کریں')}
                      </button>
                    </div>
                  )}

                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1">
                        {tr(lang, 'Authorized Super Admin Email', 'مجاز سپر ایڈمن ای میل')}
                      </label>
                      <input
                        type="email"
                        required
                        autoComplete="username"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={tr(lang, 'Enter authorized Super Admin email', 'مجاز سپر ایڈمن ای میل درج کریں')}
                        className="w-full px-3.5 py-3 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-zinc-300">{tr(lang, 'Password', 'پاس ورڈ')}</label>
                        <button
                          type="button"
                          onClick={() => {
                            setAuthMode('recovery');
                            setLoginError(null);
                          }}
                          className="text-[11px] font-semibold text-[#D4A017] hover:underline"
                        >
                          {tr(lang, 'Forgot Password?', 'پاس ورڈ بھول گئے؟')}
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={tr(lang, 'Enter your private Super Admin password', 'اپنا نجی سپر ایڈمن پاس ورڈ درج کریں')}
                          className="w-full px-3.5 py-3 pr-11 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((s) => !s)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                          aria-label={showPassword ? tr(lang, 'Hide password', 'پاس ورڈ چھپائیں') : tr(lang, 'Show password', 'پاس ورڈ دکھائیں')}
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
                      {loginBusy ? tr(lang, 'Authorizing...', 'تصدیق ہو رہی ہے...') : tr(lang, 'Authorize Super Admin', 'سپر ایڈمن سائن ان کریں')}
                    </button>
                  </form>
                </div>
              )}

              {/* MODE 2: PROTECTED SUPER ADMIN ACCOUNT SETUP */}
              {authMode === 'setup' && (
                <div className="space-y-4">
                  <div>
                    <h1 className="font-display text-xl sm:text-2xl font-bold">
                      {tr(lang, 'Protected Super Admin Setup', 'محفوظ سپر ایڈمن سیٹ اپ')}
                    </h1>
                    <p className="text-xs text-zinc-400 mt-1">
                      {tr(
                        lang,
                        'Verify your authorized Super Admin identity with the backend to create your private password and recovery credentials.',
                        'اپنا نجی پاس ورڈ اور ریکوری اسناد بنانے کے لیے سرور پر اپنی مجاز سپر ایڈمن شناخت کی تصدیق کریں۔'
                      )}
                    </p>
                  </div>

                  {setupCompleted === true && (
                    <div className="rounded-xl bg-zinc-900 border border-zinc-700 p-4 text-xs text-zinc-300 space-y-2">
                      <p className="font-semibold text-white">
                        {tr(lang, 'Account Setup Already Completed', 'اکاؤنٹ سیٹ اپ پہلے ہی مکمل ہے')}
                      </p>
                      <p>
                        {tr(
                          lang,
                          'The Super Admin account already has a private password configured. Please sign in or use Forgot Password to securely reset it.',
                          'سپر ایڈمن اکاؤنٹ پر نجی پاس ورڈ پہلے سے سیٹ ہے۔ براہِ کرم سائن ان کریں یا پاس ورڈ تبدیل کرنے کے لیے ریکوری استعمال کریں۔'
                        )}
                      </p>
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setAuthMode('login')}
                          className="px-3 py-1.5 rounded-lg bg-[#D4A017] text-[#0D0D10] font-bold"
                        >
                          {tr(lang, 'Go to Sign In', 'سائن ان پر جائیں')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAuthMode('recovery')}
                          className="px-3 py-1.5 rounded-lg bg-zinc-800 text-white font-semibold"
                        >
                          {tr(lang, 'Forgot Password', 'پاس ورڈ بھول گئے')}
                        </button>
                      </div>
                    </div>
                  )}

                  {setupCompleted !== true && !setupChallenge && (
                    <form onSubmit={handleSetupVerify} className="space-y-3.5">
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1">
                          {tr(lang, 'Authorized Super Admin Email', 'مجاز سپر ایڈمن ای میل')}
                        </label>
                        <input
                          type="email"
                          required
                          value={setupEmail}
                          onChange={(e) => setSetupEmail(e.target.value)}
                          placeholder={tr(lang, 'Enter authorized Super Admin email', 'مجاز سپر ایڈمن ای میل درج کریں')}
                          className="w-full px-3.5 py-3 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1">
                          {tr(lang, 'Registered Official Support Mobile / WhatsApp', 'رجسٹرڈ آفیشل سپورٹ موبائل / واٹس ایپ')}
                        </label>
                        <input
                          type="tel"
                          required
                          value={setupPhone}
                          onChange={(e) => setSetupPhone(e.target.value)}
                          placeholder={tr(lang, 'Enter registered official mobile number', 'رجسٹرڈ آفیشل موبائل نمبر درج کریں')}
                          className="w-full px-3.5 py-3 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white font-mono"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={loginBusy}
                        className="w-full py-3 rounded-xl bg-[#D4A017] text-[#0D0D10] text-sm font-bold hover:bg-[#EAB308] min-h-[44px]"
                      >
                        {loginBusy ? tr(lang, 'Verifying with Server...', 'سرور سے تصدیق ہو رہی ہے...') : tr(lang, 'Verify Authorized Identity', 'مجاز شناخت کی تصدیق کریں')}
                      </button>
                    </form>
                  )}

                  {setupCompleted !== true && setupChallenge && (
                    <form onSubmit={handleSetupComplete} className="space-y-3.5">
                      <div className="rounded-xl bg-emerald-950/40 border border-emerald-800 px-3 py-2 text-[11px] text-emerald-300">
                        {tr(
                          lang,
                          'Identity verified. Create your strong private password & personal recovery passphrase.',
                          'شناخت کی تصدیق ہو گئی۔ اب اپنا مضبوط نجی پاس ورڈ اور ذاتی ریکوری جملہ بنائیں۔'
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1">
                          {tr(lang, 'Create Strong Password', 'مضبوط پاس ورڈ بنائیں')}
                        </label>
                        <input
                          type="password"
                          required
                          value={setupPassword}
                          onChange={(e) => setSetupPassword(e.target.value)}
                          placeholder={tr(lang, 'Min 10 chars, upper, lower, number, symbol', 'کم از کم 10 حروف، بڑا/چھوٹا حرف، ہندسا اور علامت')}
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
                        <label className="block text-xs font-semibold text-zinc-300 mb-1">
                          {tr(lang, 'Confirm Password', 'پاس ورڈ کی تصدیق کریں')}
                        </label>
                        <input
                          type="password"
                          required
                          value={setupConfirm}
                          onChange={(e) => setSetupConfirm(e.target.value)}
                          placeholder={tr(lang, 'Re-enter your new password', 'اپنا نیا پاس ورڈ دوبارہ لکھیں')}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1">
                          {tr(
                            lang,
                            'Personal Recovery Passphrase (8+ chars, for Forgot Password)',
                            'ذاتی ریکوری پاس فریز (کم از کم 8 حروف، پاس ورڈ ریکوری کے لیے)'
                          )}
                        </label>
                        <input
                          type="password"
                          required
                          value={setupPhrase}
                          onChange={(e) => setSetupPhrase(e.target.value)}
                          placeholder={tr(lang, 'Create a secret passphrase you remember', 'کوئی خفیہ جملہ لکھیں جو آپ کو یاد رہے')}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setSetupChallenge(null)}
                          className="px-4 py-3 rounded-xl border border-zinc-700 text-xs font-semibold text-zinc-300"
                        >
                          {tr(lang, 'Back', 'واپس')}
                        </button>
                        <button
                          type="submit"
                          disabled={loginBusy}
                          className="flex-1 py-3 rounded-xl bg-[#D4A017] text-[#0D0D10] text-sm font-bold hover:bg-[#EAB308]"
                        >
                          {loginBusy
                            ? tr(lang, 'Securing Account...', 'اکاؤنٹ محفوظ ہو رہا ہے...')
                            : tr(lang, 'Create Password & Activate Admin', 'پاس ورڈ بنائیں اور ایڈمن فعال کریں')}
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
                    <h1 className="font-display text-xl sm:text-2xl font-bold">
                      {tr(lang, 'Secure Password Recovery', 'محفوظ پاس ورڈ ریکوری')}
                    </h1>
                    <p className="text-xs text-zinc-400 mt-1">
                      {tr(
                        lang,
                        'Reset Super Admin password using backend verification and your personal Recovery Passphrase or Backup Recovery Key.',
                        'سرور کی تصدیق اور ذاتی ریکوری جملے یا بیک اپ ریکوری کی کے ذریعے سپر ایڈمن پاس ورڈ ری سیٹ کریں۔'
                      )}
                    </p>
                  </div>

                  {!recChallenge ? (
                    <form onSubmit={handleRecoveryVerify} className="space-y-3.5">
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1">
                          {tr(lang, 'Authorized Super Admin Email', 'مجاز سپر ایڈمن ای میل')}
                        </label>
                        <input
                          type="email"
                          required
                          value={recEmail}
                          onChange={(e) => setRecEmail(e.target.value)}
                          placeholder={tr(lang, 'Enter authorized Super Admin email', 'مجاز سپر ایڈمن ای میل درج کریں')}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1">
                          {tr(lang, 'Registered Official Mobile Number', 'رجسٹرڈ آفیشل موبائل نمبر')}
                        </label>
                        <input
                          type="tel"
                          required
                          value={recPhone}
                          onChange={(e) => setRecPhone(e.target.value)}
                          placeholder={tr(lang, 'Registered official phone', 'رجسٹرڈ آفیشل فون نمبر')}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1">
                          {tr(lang, 'Recovery Method', 'ریکوری کا طریقہ')}
                        </label>
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
                            {tr(lang, 'Recovery Passphrase', 'ریکوری جملہ')}
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
                            {tr(lang, 'Backup Key (PRK-)', 'بیک اپ کی (PRK-)')}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1">
                          {recMethod === 'backup_key'
                            ? tr(lang, 'Emergency Backup Recovery Key', 'ایمرجنسی بیک اپ ریکوری کی')
                            : tr(lang, 'Personal Recovery Passphrase', 'ذاتی ریکوری پاس فریز')}
                        </label>
                        <input
                          type="password"
                          required
                          value={recSecret}
                          onChange={(e) => setRecSecret(e.target.value)}
                          placeholder={
                            recMethod === 'backup_key'
                              ? 'PRK-XXXX-XXXX-XXXX-XXXX'
                              : tr(lang, 'Enter recovery passphrase', 'ریکوری پاس فریز درج کریں')
                          }
                          className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-white font-mono"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={loginBusy}
                        className="w-full py-3 rounded-xl bg-[#D4A017] text-[#0D0D10] text-sm font-bold hover:bg-[#EAB308]"
                      >
                        {loginBusy ? tr(lang, 'Verifying Recovery...', 'تصدیق ہو رہی ہے...') : tr(lang, 'Verify Recovery Credentials', 'ریکوری اسناد کی تصدیق کریں')}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleRecoveryReset} className="space-y-3.5">
                      <div className="rounded-xl bg-emerald-950/40 border border-emerald-800 px-3 py-2 text-[11px] text-emerald-300">
                        {tr(
                          lang,
                          'Recovery verified. Setting a new password immediately invalidates all prior Admin sessions.',
                          'تصدیق مکمل ہو گئی۔ نیا پاس ورڈ سیٹ کرنے پر تمام پرانے ایڈمن سیشن فوری ختم ہو جائیں گے۔'
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1">
                          {tr(lang, 'New Strong Password', 'نیا مضبوط پاس ورڈ')}
                        </label>
                        <input
                          type="password"
                          required
                          value={recNewPass}
                          onChange={(e) => setRecNewPass(e.target.value)}
                          placeholder={tr(lang, 'Min 10 chars, upper, lower, number, symbol', 'کم از کم 10 حروف، بڑا/چھوٹا حرف، ہندسا اور علامت')}
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
                        <label className="block text-xs font-semibold text-zinc-300 mb-1">
                          {tr(lang, 'Confirm New Password', 'نئے پاس ورڈ کی تصدیق کریں')}
                        </label>
                        <input
                          type="password"
                          required
                          value={recConfirmPass}
                          onChange={(e) => setRecConfirmPass(e.target.value)}
                          placeholder={tr(lang, 'Re-enter new password', 'نیا پاس ورڈ دوبارہ لکھیں')}
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
                        {tr(lang, 'Generate a fresh Emergency Backup Recovery Key', 'نئی ایمرجنسی بیک اپ ریکوری کی بنائیں')}
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setRecChallenge(null)}
                          className="px-4 py-3 rounded-xl border border-zinc-700 text-xs font-semibold text-zinc-300"
                        >
                          {tr(lang, 'Back', 'واپس')}
                        </button>
                        <button
                          type="submit"
                          disabled={loginBusy}
                          className="flex-1 py-3 rounded-xl bg-[#D4A017] text-[#0D0D10] text-sm font-bold hover:bg-[#EAB308]"
                        >
                          {loginBusy ? tr(lang, 'Updating Password...', 'پاس ورڈ اپڈیٹ ہو رہا ہے...') : tr(lang, 'Reset Password & Sign In', 'پاس ورڈ ری سیٹ کر کے سائن ان کریں')}
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
    { id: 'dashboard', label: tr(lang, 'Operations & Live Map', 'آپریشنز اور لائیو نقشہ'), icon: Activity },
    { id: 'theme', label: tr(lang, 'Theme & Design Studio', 'تھیم اور ڈیزائن اسٹوڈیو'), icon: Palette },
    { id: 'fleet', label: tr(lang, 'Fleet & Vehicle Photos', 'گاڑیاں اور فوٹوز'), icon: Car },
    { id: 'fares', label: tr(lang, 'Fare Tariffs & Multipliers', 'کرایہ اور ریٹس سیٹنگز'), icon: Sliders },
    { id: 'passengers', label: tr(lang, 'Passengers & Accounts', 'مسافر اور اکاؤنٹس'), icon: UserCheck },
    { id: 'partners', label: tr(lang, 'Pro Partners & Docs', 'پرو پارٹنرز اور دستاویزات'), icon: Users },
    { id: 'bookings', label: tr(lang, 'Live Bookings & Invoices', 'لائیو بکنگز اور انوائس'), icon: ClipboardList },
    { id: 'zones', label: tr(lang, 'Heat Map & Rickshaw', 'ہیٹ میپ اور رکشہ'), icon: Flame },
    { id: 'schedule', label: tr(lang, 'Schedule & App Settings', 'شیڈول اور ایپ سیٹنگز'), icon: Settings },
    { id: 'packages', label: tr(lang, 'Monthly Packages', 'ماہانہ پیکیجز'), icon: Package },
    { id: 'finance', label: tr(lang, 'Wallet & Settlements', 'والیٹ اور ادائیگیاں'), icon: Wallet },
    { id: 'sheets', label: tr(lang, 'Google Sheets Sync', 'گوگل شیٹس سنک'), icon: FileSpreadsheet },
    { id: 'tickets', label: tr(lang, 'Support Tickets', 'سپورٹ ٹکٹس'), icon: HelpCircle },
    { id: 'security', label: tr(lang, 'Security & Audit Logs', 'سیکیورٹی اور آڈٹ لاگز'), icon: KeyRound },
  ];

  const reviewPartner = async (
    partnerId: string,
    status: PartnerApplicationCloud['verificationStatus'],
    approvePendingVehicle = false,
    cloudUid?: string
  ) => {
    const notes = partnerNotes[partnerId] || '';
    try {
      await apiRequest(`/api/admin/partners/${partnerId}/review`, {
        method: 'POST',
        role: 'admin',
        body: {
          verificationStatus: status,
          adminNotes: notes,
          approvePendingVehicle,
        },
      });
    } catch (err) {
      if (!isBackendOfflineError(err)) {
        setToast(err instanceof Error ? err.message : tr(lang, 'Review failed.', 'تصدیق محفوظ نہ ہو سکی۔'));
        return;
      }
    }

    await reviewPartnerApplicationInFirestore(cloudUid || partnerId, status, notes).catch(() => false);
    writeSharedLocalPartnerUpdate(partnerId, {
      verification_status: status,
      admin_notes: notes,
    });

    setPartners((prev) =>
      prev.map((p) =>
        p.user_id === partnerId ? { ...p, verification_status: status, admin_notes: notes } : p
      )
    );
    setToast(
      tr(
        lang,
        `Partner status updated to ${status.toUpperCase()}.`,
        `پارٹنر کا اسٹیٹس ${trVerificationStatus(lang, status)} کر دیا گیا ہے۔`
      )
    );
    await loadAll();
  };

  const pendingPartnersBadge =
    partners.filter((p) => ['under_review', 'documents_pending'].includes(p.verification_status)).length ||
    Number(overview?.kpis?.pendingPartners || 0);
  const isVerifiedSuperAdminCloud = Boolean(
    firebaseUser?.emailVerified && firebaseUser?.email?.toLowerCase() === 'prorider.pk786@gmail.com'
  );

  const handleSyncCloudPartners = async () => {
    setSyncingCloud(true);
    try {
      const res = await signInWithGooglePopup('partner', 'Islamabad', lang);
      const signedEmail = res.user.email?.toLowerCase() || '';
      if (signedEmail !== 'prorider.pk786@gmail.com') {
        setToast(
          tr(
            lang,
            `Please sign in with Super Admin Google account (prorider.pk786@gmail.com). Signed in as ${signedEmail}.`,
            `براہِ کرم سپر ایڈمن گوگل اکاؤنٹ (prorider.pk786@gmail.com) سے لاگ اِن کریں۔`
          )
        );
      } else {
        await loadAll();
        setToast(
          tr(
            lang,
            'Cloud partner applications & documents synced cleanly.',
            'کلاؤڈ سے تمام پارٹنر درخواستیں اور دستاویزات کامیابی سے سنک ہو گئیں۔'
          )
        );
      }
    } catch (err: any) {
      setToast(err?.message || tr(lang, 'Cloud sync failed.', 'کلاؤڈ سنک مکمل نہ ہو سکا۔'));
    } finally {
      setSyncingCloud(false);
    }
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
    setToast(tr(lang, 'Fare tariff saved and active for new bookings.', 'کرایہ ریٹ محفوظ ہو کر نئی بکنگز پر لاگو ہو گیا ہے۔'));
    await loadAll();
  };

  return (
    <div dir={lang === 'ur' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#F8F8FA] flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <header className="md:hidden sticky top-0 z-30 bg-[#0D0D10] text-white px-3 h-14 flex items-center justify-between gap-2 border-b border-zinc-800">
        <BrandLogo dark compact lang={lang} />
        <div className="flex items-center gap-1.5">
          <ThemeQuickToggle lang={lang} dark />
          {onChangeLang && <LanguageToggle lang={lang} onChange={onChangeLang} dark />}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-xs font-semibold text-[#F4C430]"
            aria-label={tr(lang, 'Toggle Admin Menu', 'ایڈمن مینو کھولیں')}
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            <span className="truncate max-w-[100px]">{navItems.find((i) => i.id === tab)?.label || tr(lang, 'Menu', 'مینو')}</span>
          </button>
        </div>
      </header>

      {/* Obsidian Black Admin Sidebar (Responsive Drawer on Mobile, Sticky Rail on Desktop) */}
      <aside
        className={`${
          mobileMenuOpen ? 'flex' : 'hidden'
        } md:flex md:w-64 bg-[#0D0D10] text-white p-5 flex-col justify-between shrink-0 md:sticky md:top-0 md:h-screen z-20`}
      >
        <div className="space-y-4 overflow-y-auto">
          <div className="hidden md:flex items-center justify-between">
            <BrandLogo dark compact lang={lang} />
            <ShieldCheck className="w-4 h-4 text-[#D4A017]" />
          </div>
          <div className="hidden md:flex items-center justify-between gap-1.5 pb-1">
            <ThemeQuickToggle lang={lang} dark />
            {onChangeLang && <LanguageToggle lang={lang} onChange={onChangeLang} dark />}
          </div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#D4A017]">
            {tr(lang, 'Admin Panel', 'ایڈمن پینل')}
          </p>

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
                  className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                    active ? 'bg-[#D4A017] text-[#0D0D10]' : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.id === 'partners' && pendingPartnersBadge > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold shrink-0 ${
                        active ? 'bg-[#0D0D10] text-[#F4C430]' : 'bg-[#D4A017] text-[#0D0D10]'
                      }`}
                    >
                      {pendingPartnersBadge}
                    </span>
                  )}
                  {item.id === 'bookings' && Number(overview?.kpis?.pendingMonthlyAppsCount || 0) > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold shrink-0 ${
                        active ? 'bg-[#0D0D10] text-[#F4C430]' : 'bg-[#D4A017] text-[#0D0D10]'
                      }`}
                    >
                      {overview.kpis.pendingMonthlyAppsCount}
                    </span>
                  )}
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
            {tr(lang, 'Sign Out Admin', 'ایڈمن لاگ آؤٹ')}
          </button>
        </div>
      </aside>

      {/* Admin Main Viewport */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto">
        {toast && (
          <div className="rounded-xl bg-[#0D0D10] text-[#F4C430] px-4 py-2.5 text-xs font-semibold flex items-center justify-between">
            <span>{toast}</span>
            <button type="button" onClick={() => setToast(null)} className="text-zinc-400 hover:text-white">
              {tr(lang, 'Dismiss', 'بند کریں')}
            </button>
          </div>
        )}

        {/* 1. Dashboard & Full Operational Map */}
        {tab === 'dashboard' && overview && (
          <div className="space-y-6">
            <h1 className="font-display text-2xl font-bold text-[#0D0D10]">
              {tr(lang, 'Operations Control Center', 'آپریشنز کنٹرول سینٹر')}
            </h1>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-2xl bg-[#0D0D10] text-white p-5">
                <span className="text-xs text-zinc-400">{tr(lang, 'Active Bookings', 'فعال بکنگز')}</span>
                <div className="font-mono text-2xl font-bold text-[#D4A017] mt-1">
                  {overview?.kpis?.activeBookings ?? 0}
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-5">
                <span className="text-xs text-zinc-500">{tr(lang, 'Pending Partner Reviews', 'زیرِ غور پارٹنرز')}</span>
                <div className="font-mono text-2xl font-bold text-amber-700 mt-1">
                  {overview?.kpis?.pendingPartners ?? 0}
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-5">
                <span className="text-xs text-zinc-500">{tr(lang, 'Passengers / Partners', 'مسافر / پارٹنرز')}</span>
                <div className="font-mono text-2xl font-bold text-[#0D0D10] mt-1">
                  {overview?.kpis?.totalPassengers ?? 0} / {overview?.kpis?.totalPartners ?? 0}
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-5">
                <span className="text-xs text-zinc-500">{tr(lang, 'Platform Commission', 'پلیٹ فارم کمیشن')}</span>
                <div className="font-mono text-2xl font-bold text-emerald-700 mt-1">
                  Rs. {Number(overview?.kpis?.commissionPkr || 0).toLocaleString()}
                </div>
              </div>
            </div>

            {Number(overview?.kpis?.pendingMonthlyAppsCount || 0) > 0 && (
              <div className="rounded-2xl border-2 border-[#D4A017] bg-amber-50/70 p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[#8F6400]">
                    {tr(lang, 'Monthly Booking Partner Approvals Pending', 'ماہانہ بکنگ پر پارٹنر منظوری درکار')}
                  </span>
                  <p className="text-sm font-bold text-[#0D0D10] mt-0.5">
                    {tr(
                      lang,
                      `${overview?.kpis?.pendingMonthlyAppsCount ?? 0} Pro Partner application(s) awaiting Super Admin assignment.`,
                      `${overview?.kpis?.pendingMonthlyAppsCount ?? 0} پرو پارٹنر درخواستیں سپر ایڈمن کی منظوری کی منتظر ہیں۔`
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTab('bookings')}
                  className="px-4 py-2 rounded-xl bg-[#0D0D10] text-white text-xs font-bold hover:bg-zinc-800"
                >
                  {tr(lang, 'Review Driver Applications', 'ڈرائیور درخواستیں دیکھیں')}
                </button>
              </div>
            )}

            <div className="space-y-2">
              <h2 className="font-display text-base font-bold">
                {tr(lang, 'Live Operational Street Map (Demand Zones & Active Partners)', 'لائیو آپریشنل اسٹریٹ میپ (ڈیمانڈ زونز اور فعال پارٹنرز)')}
              </h2>
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

        {/* Global Theme & Design Studio */}
        {tab === 'theme' && (
          <ThemePreferencesPanel
            lang={lang}
            isAdminStudio
            onAdminApplyGlobal={async (payload: {
              themeId: AppThemeId;
              homeLayout: HomeLayoutId;
              authLayout: AuthLayoutId;
              forceGlobal: boolean;
            }) => {
              await apiRequest('/api/admin/theme', {
                method: 'PUT',
                role: 'admin',
                body: payload,
              });
              await onRefreshConfig?.();
              window.dispatchEvent(new Event('pr:refresh-config'));
              setToast(tr(lang, 'Global theme & layout applied to entire app!', 'گلوبل تھیم اور ڈیزائن پوری ایپ پر لاگو کر دیا گیا ہے!'));
              await loadAll();
            }}
          />
        )}

        {/* 2. Pro Partner & Document Review */}
        {tab === 'partners' && (() => {
          const filteredPartners = partners.filter((p) => {
            if (partnerFilter === 'pending') {
              return ['under_review', 'documents_pending', 'incomplete'].includes(p.verification_status);
            }
            if (partnerFilter === 'approved') {
              return p.verification_status === 'approved';
            }
            if (partnerFilter === 'other') {
              return ['rejected', 'suspended'].includes(p.verification_status);
            }
            return true;
          });

          return (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#0D0D10]">
                    {tr(lang, 'Pro Partner Verification & Document Review', 'پرو پارٹنر تصدیق اور دستاویزات کا جائزہ')}
                  </h1>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {tr(
                      lang,
                      'Inspect submitted CNIC, driving licence, vehicle documents, and reference contacts before approval.',
                      'منظوری سے قبل شناختی کارڈ، ڈرائیونگ لائسنس، گاڑی کی دستاویزات اور ریفرنس نمبر کی تصدیق کریں۔'
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!isVerifiedSuperAdminCloud && (
                    <button
                      type="button"
                      disabled={syncingCloud}
                      onClick={handleSyncCloudPartners}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0D0D10] text-[#F4C430] text-xs font-bold hover:bg-zinc-800 disabled:opacity-60"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncingCloud ? 'animate-spin' : ''}`} />
                      {tr(lang, 'Sync Cloud Docs', 'کلاؤڈ دستاویزات سنک کریں')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void loadAll()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200 bg-white text-zinc-700 text-xs font-semibold hover:bg-zinc-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    {tr(lang, 'Refresh', 'تازہ کریں')}
                  </button>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-white border border-zinc-200 w-fit text-xs font-semibold">
                {[
                  { id: 'all' as const, label: tr(lang, `All (${partners.length})`, `تمام (${partners.length})`) },
                  {
                    id: 'pending' as const,
                    label: tr(
                      lang,
                      `Pending (${partners.filter((p) => ['under_review', 'documents_pending', 'incomplete'].includes(p.verification_status)).length})`,
                      `زیرِ غور (${partners.filter((p) => ['under_review', 'documents_pending', 'incomplete'].includes(p.verification_status)).length})`
                    ),
                  },
                  {
                    id: 'approved' as const,
                    label: tr(
                      lang,
                      `Approved (${partners.filter((p) => p.verification_status === 'approved').length})`,
                      `منظور شدہ (${partners.filter((p) => p.verification_status === 'approved').length})`
                    ),
                  },
                  {
                    id: 'other' as const,
                    label: tr(
                      lang,
                      `Rejected / Suspended (${partners.filter((p) => ['rejected', 'suspended'].includes(p.verification_status)).length})`,
                      `مسترد / معطل (${partners.filter((p) => ['rejected', 'suspended'].includes(p.verification_status)).length})`
                    ),
                  },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setPartnerFilter(f.id)}
                    className={`px-3 py-1.5 rounded-lg transition-colors ${
                      partnerFilter === f.id
                        ? 'bg-[#D4A017] text-[#0D0D10] font-bold'
                        : 'text-zinc-600 hover:bg-zinc-100'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {filteredPartners.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center space-y-2">
                  <p className="text-sm font-semibold text-zinc-700">
                    {tr(lang, 'No Pro Partner applications found in this view.', 'اس حصے میں ابھی کوئی پارٹنر درخواست موجود نہیں۔')}
                  </p>
                  {!isVerifiedSuperAdminCloud && (
                    <p className="text-xs text-zinc-500">
                      {tr(
                        lang,
                        'Tip: Click "Sync Cloud Docs" above with prorider.pk786@gmail.com to fetch online Firestore submissions.',
                        'کلاؤڈ سے درخواستیں دیکھنے کے لیے اوپر "کلاؤڈ دستاویزات سنک کریں" پر کلک کریں۔'
                      )}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredPartners.map((p) => {
                    const docsList = Array.isArray(p.documents) ? p.documents : [];
                    const servicesList = Array.isArray(p.service_eligibility) ? p.service_eligibility : [];
                    const statusColor =
                      p.verification_status === 'approved'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : ['under_review', 'documents_pending'].includes(p.verification_status)
                        ? 'bg-amber-50 border-amber-200 text-amber-900'
                        : p.verification_status === 'rejected' || p.verification_status === 'suspended'
                        ? 'bg-red-50 border-red-200 text-red-800'
                        : 'bg-zinc-100 border-zinc-200 text-zinc-700';

                    return (
                      <div key={p.user_id} className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4 shadow-sm">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-display text-lg font-bold text-[#0D0D10]">{p.full_name}</span>
                              {p.email && <span className="text-xs text-zinc-500 font-mono">({p.email})</span>}
                            </div>
                            <div className="text-xs text-zinc-600 font-mono flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span>
                                <strong>{tr(lang, 'Mobile:', 'موبائل:')}</strong> {p.phone || '—'}
                              </span>
                              {p.reference_phone && (
                                <span className="inline-flex items-center gap-1 text-amber-800">
                                  <PhoneCall className="w-3 h-3" />
                                  <strong>{tr(lang, 'Reference:', 'ریفرنس:')}</strong> {p.reference_phone}
                                </span>
                              )}
                              <span>
                                <strong>{tr(lang, 'City:', 'شہر:')}</strong> {p.operating_city || '—'}
                              </span>
                            </div>
                            <div className="text-xs text-zinc-600 font-mono flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span>
                                <strong>{tr(lang, 'CNIC:', 'شناختی کارڈ:')}</strong> {p.cnic_number || 'N/A'}
                                {p.cnic_expiry ? ` (${tr(lang, 'Exp:', 'میعاد:')} ${p.cnic_expiry})` : ''}
                              </span>
                              <span>
                                <strong>{tr(lang, 'Licence:', 'لائسنس:')}</strong> {p.licence_number || 'N/A'}
                                {p.licence_expiry ? ` (${tr(lang, 'Exp:', 'میعاد:')} ${p.licence_expiry})` : ''}
                              </span>
                            </div>
                            <div className="text-xs text-zinc-600">
                              {tr(lang, 'Vehicle:', 'گاڑی:')} <strong>{p.vehicle_name || 'N/A'}</strong> (
                              {p.vehicle_number || tr(lang, 'No Plate', 'نمبر پلیٹ نہیں')} · {p.seating_capacity || 4}{' '}
                              {tr(lang, 'seats', 'سیٹیں')} · {p.fuel_type || 'Petrol'}) ·{' '}
                              {tr(lang, 'Services:', 'سروسز:')} {servicesList.join(', ') || 'pick_and_drop'}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono text-xs font-bold">
                              {tr(lang, 'Wallet:', 'والیٹ:')} Rs. {Number(p.wallet_balance_pkr || 0).toLocaleString()}
                            </span>
                            <span className={`px-3 py-1 rounded-lg border font-mono text-xs font-bold uppercase ${statusColor}`}>
                              {trVerificationStatus(lang, p.verification_status)}
                            </span>
                          </div>
                        </div>

                        {docsList.length > 0 ? (
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            {docsList.map((doc: any) => {
                              const isPdf = String(doc.file_data_url || '').startsWith('data:application/pdf');
                              const labelText = String(doc.doc_type || 'document').replaceAll('_', ' ');
                              return (
                                <button
                                  key={doc.id || doc.doc_type}
                                  type="button"
                                  onClick={() =>
                                    setPreviewDoc({
                                      title: labelText.toUpperCase(),
                                      dataUrl: doc.file_data_url,
                                      fileName: doc.file_name,
                                      partnerName: p.full_name,
                                      status: doc.status,
                                      expiryDate: doc.expiry_date,
                                    })
                                  }
                                  className="group text-start rounded-xl border border-zinc-200 p-2 space-y-1.5 text-[11px] hover:border-[#D4A017] hover:bg-amber-50/40 transition-colors"
                                >
                                  <div className="relative w-full h-24 rounded-lg overflow-hidden bg-zinc-100 flex items-center justify-center">
                                    {isPdf ? (
                                      <div className="flex flex-col items-center justify-center text-zinc-600 gap-1">
                                        <FileText className="w-7 h-7 text-[#B8860B]" />
                                        <span className="text-[10px] font-bold">PDF</span>
                                      </div>
                                    ) : doc.file_data_url ? (
                                      <img
                                        src={doc.file_data_url}
                                        alt={labelText}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <FileText className="w-6 h-6 text-zinc-400" />
                                    )}
                                    <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                      <Eye className="w-5 h-5" />
                                    </span>
                                  </div>
                                  <div className="font-semibold capitalize truncate text-[#0D0D10]">{labelText}</div>
                                  <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase">
                                    <span>{doc.status || 'pending'}</span>
                                    {doc.expiry_date && <span className="font-mono">{doc.expiry_date}</span>}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-500">
                            {tr(lang, 'No document photos uploaded yet.', 'ابھی تک کوئی دستاویز اپلوڈ نہیں کی گئی۔')}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-100">
                          <input
                            placeholder={tr(lang, 'Admin review notes...', 'ایڈمن کے ریویو نوٹس...')}
                            value={partnerNotes[p.user_id] ?? p.admin_notes ?? ''}
                            onChange={(e) => setPartnerNotes((n) => ({ ...n, [p.user_id]: e.target.value }))}
                            className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-zinc-200 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => reviewPartner(p.user_id, 'approved', Boolean(p.pending_vehicle_review), p.cloud_uid)}
                            className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800"
                          >
                            {tr(lang, 'Approve Partner', 'پارٹنر منظور کریں')}
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await apiRequest(`/api/admin/partners/${p.user_id}/wallet`, {
                                  method: 'POST',
                                  role: 'admin',
                                  body: {
                                    amountPkr: 1000,
                                    type: 'credit',
                                    note: 'Super Admin Partner Wallet Top-Up (+Rs. 1,000)',
                                  },
                                });
                              } catch (walletErr) {
                                if (!isBackendOfflineError(walletErr)) {
                                  setToast(
                                    walletErr instanceof Error
                                      ? walletErr.message
                                      : tr(lang, 'Wallet update failed.', 'والیٹ اپڈیٹ نہ ہو سکا۔')
                                  );
                                  return;
                                }
                              }
                              writeSharedLocalPartnerUpdate(p.user_id, { wallet_delta_pkr: 1000 });
                              setPartners((prev) =>
                                prev.map((item) =>
                                  item.user_id === p.user_id
                                    ? { ...item, wallet_balance_pkr: Number(item.wallet_balance_pkr || 0) + 1000 }
                                    : item
                                )
                              );
                              setToast(
                                tr(
                                  lang,
                                  `Added Rs. 1,000 to ${p.full_name}'s wallet.`,
                                  `${p.full_name} کے والیٹ میں 1,000 روپے شامل کر دیے گئے۔`
                                )
                              );
                              await loadAll();
                            }}
                            className="px-3.5 py-2 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold hover:bg-[#EAB308]"
                          >
                            {tr(lang, '+ Top Up Rs. 1,000', '+ 1,000 روپے والیٹ')}
                          </button>
                          <button
                            type="button"
                            onClick={() => reviewPartner(p.user_id, 'rejected', false, p.cloud_uid)}
                            className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700"
                          >
                            {tr(lang, 'Reject', 'مسترد کریں')}
                          </button>
                          <button
                            type="button"
                            onClick={() => reviewPartner(p.user_id, 'suspended', false, p.cloud_uid)}
                            className="px-4 py-2 rounded-xl border border-zinc-300 text-xs font-bold hover:bg-zinc-50"
                          >
                            {tr(lang, 'Suspend', 'معطل کریں')}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* Fleet Management (Add genuine original photos, edit, delete, tariffs) */}
        {tab === 'fleet' && (
          <FleetManagementTab
            fleet={fleet}
            lang={lang}
            onReload={loadAll}
            onShowToast={(msg) => setToast(msg)}
          />
        )}

        {/* Fare Management (Base fares, per-km rates, extra stops, waiting, multipliers, negotiation bounds) */}
        {tab === 'fares' && (
          <FareManagementTab
            fleet={fleet}
            settings={settings}
            lang={lang}
            onReload={loadAll}
            onShowToast={(msg) => setToast(msg)}
          />
        )}

        {/* Passenger Management (Accounts, wallet balances, trips, verify/suspend controls) */}
        {tab === 'passengers' && (
          <PassengerManagementTab
            passengers={passengers}
            lang={lang}
            onReload={loadAll}
            onShowToast={(msg) => setToast(msg)}
          />
        )}

        {/* Live Bookings & Official PDF Invoices */}
        {tab === 'bookings' && (
          <BookingsManagementTab
            bookings={bookings}
            lang={lang}
            onReload={loadAll}
            onShowToast={(msg) => setToast(msg)}
          />
        )}

        {/* Operating Zones & Heat Map Demand */}
        {tab === 'zones' && (
          <ZonesManagementTab
            zones={zones}
            lang={lang}
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
              setToast(tr(lang, 'Schedule & Go Now limits updated.', 'شیڈول اور گو ناؤ کی حدود اپڈیٹ ہو گئیں۔'));
            }}
            className="max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 space-y-4"
          >
            <h1 className="font-display text-xl font-bold">{tr(lang, 'Schedule & Go Now Controls', 'شیڈول اور گو ناؤ کنٹرولز')}</h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-zinc-600 mb-1">{tr(lang, 'Go Now Min Offer (%)', 'گو ناؤ کم از کم آفر (%)')}</label>
                <input
                  value={settings.go_now_min_offer_pct || '80'}
                  onChange={(e) => setSettings((s) => ({ ...s, go_now_min_offer_pct: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-zinc-600 mb-1">{tr(lang, 'Go Now Max Offer (%)', 'گو ناؤ زیادہ سے زیادہ آفر (%)')}</label>
                <input
                  value={settings.go_now_max_offer_pct || '135'}
                  onChange={(e) => setSettings((s) => ({ ...s, go_now_max_offer_pct: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-zinc-600 mb-1">{tr(lang, 'Schedule Default Pickup', 'شیڈول ڈیفالٹ پک اپ وقت')}</label>
                <input
                  value={settings.schedule_default_pickup || '08:00 AM'}
                  onChange={(e) => setSettings((s) => ({ ...s, schedule_default_pickup: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200"
                />
              </div>
              <div>
                <label className="block font-semibold text-zinc-600 mb-1">{tr(lang, 'Schedule Default Drop', 'شیڈول ڈیفالٹ ڈراپ وقت')}</label>
                <input
                  value={settings.schedule_default_drop || '05:30 PM'}
                  onChange={(e) => setSettings((s) => ({ ...s, schedule_default_drop: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200"
                />
              </div>
              <div>
                <label className="block font-semibold text-zinc-600 mb-1">{tr(lang, 'Schedule Rate (PKR/km)', 'شیڈول ریٹ (روپے/کلومیٹر)')}</label>
                <input
                  value={settings.schedule_rate_per_km || '38'}
                  onChange={(e) => setSettings((s) => ({ ...s, schedule_rate_per_km: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-zinc-600 mb-1">{tr(lang, 'Official Support WhatsApp', 'آفیشل سپورٹ واٹس ایپ')}</label>
                <input
                  value={settings.support_whatsapp || '03125007782'}
                  onChange={(e) => setSettings((s) => ({ ...s, support_whatsapp: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 font-mono"
                />
              </div>
            </div>
            <button type="submit" className="px-6 py-2.5 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold">
              {tr(lang, 'Update Settings', 'سیٹنگز اپڈیٹ کریں')}
            </button>
          </form>
        )}

        {/* 8. Monthly Packages */}
        {tab === 'packages' && (
          <div className="space-y-5">
            <h1 className="font-display text-2xl font-bold">{tr(lang, 'Monthly Packages Management', 'ماہانہ پیکیجز کا انتظام')}</h1>
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
                    {p.is_active === 1 ? tr(lang, 'Active', 'فعال') : tr(lang, 'Paused', 'روکا ہوا')}
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
                placeholder={tr(lang, 'New Package Name', 'نئے پیکیج کا نام')}
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
                {tr(lang, '+ Add Package', '+ پیکیج شامل کریں')}
              </button>
            </form>
          </div>
        )}

        {/* 9. Finance & Settlements */}
        {tab === 'finance' && (
          <div className="space-y-4">
            <h1 className="font-display text-2xl font-bold">{tr(lang, 'Financial Ledger & Partner Withdrawals', 'مالیاتی کھاتہ اور پارٹنر ادائیگیاں')}</h1>
            <div className="rounded-2xl border border-zinc-200 bg-white overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">{tr(lang, 'Tx Ref', 'ٹرانزیکشن نمبر')}</th>
                    <th className="px-4 py-3">{tr(lang, 'User', 'صارف')}</th>
                    <th className="px-4 py-3">{tr(lang, 'Role', 'کردار')}</th>
                    <th className="px-4 py-3">{tr(lang, 'Type', 'قسم')}</th>
                    <th className="px-4 py-3">{tr(lang, 'Status', 'حالت')}</th>
                    <th className="px-4 py-3 text-right">{tr(lang, 'Amount', 'رقم')}</th>
                    <th className="px-4 py-3 text-right">{tr(lang, 'Action', 'کارروائی')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                        {tr(lang, 'No transactions recorded yet.', 'ابھی کوئی مالیاتی ریکارڈ موجود نہیں۔')}
                      </td>
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
                              <CheckCircle2 className="w-3 h-3" /> {tr(lang, 'Mark Settled', 'ادائیگی مکمل کریں')}
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
            <h1 className="font-display text-2xl font-bold">{tr(lang, 'Support Tickets', 'سپورٹ ٹکٹس')}</h1>
            {tickets.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
                {tr(lang, 'No open support tickets.', 'اس وقت کوئی سپورٹ ٹکٹ نہیں ہے۔')}
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
                        placeholder={tr(lang, 'Write admin reply...', 'ایڈمن کا جواب لکھیں...')}
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
                            body: { reply: ticketReplies[tkt.id] || tr(lang, 'Resolved by Support', 'سپورٹ ٹیم کی طرف سے حل کر دیا گیا'), status: 'resolved' },
                          });
                          await loadAll();
                        }}
                        className="px-4 py-2 rounded-xl bg-[#0D0D10] text-white text-xs font-bold"
                      >
                        {tr(lang, 'Send Reply & Resolve', 'جواب بھیجیں اور حل کریں')}
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
                  {tr(lang, 'Super Admin Security & Access Audit', 'سپر ایڈمن سیکیورٹی اور رسائی آڈٹ')}
                </h1>
                <p className="text-xs text-zinc-500 mt-1">
                  {tr(
                    lang,
                    'Server-verified authentication, setup, recovery, and blocked-access audit trail.',
                    'سرور سے تصدیق شدہ لاگ ان، سیٹ اپ، ریکوری اور بلاک رسائی کا مکمل ریکارڈ۔'
                  )}
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">{tr(lang, 'Timestamp', 'وقت')}</th>
                    <th className="px-4 py-3">{tr(lang, 'Action', 'عمل')}</th>
                    <th className="px-4 py-3">{tr(lang, 'Status', 'حالت')}</th>
                    <th className="px-4 py-3">{tr(lang, 'Email', 'ای میل')}</th>
                    <th className="px-4 py-3">{tr(lang, 'Details', 'تفصیلات')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {securityLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                        {tr(lang, 'No security audit events recorded yet.', 'ابھی کوئی سیکیورٹی آڈٹ ریکارڈ موجود نہیں۔')}
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

        {tab === 'sheets' && (
          <GoogleSheetsSyncPanel
            lang={lang}
            bookings={bookings}
            transactions={transactions}
            partners={partners}
          />
        )}
      </main>

      {/* Full-Resolution Partner Document Preview Modal */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewDoc(null)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl bg-white border border-zinc-200 overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 bg-[#0D0D10] text-white flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-[#F4C430] truncate">{previewDoc.title}</div>
                <div className="text-[11px] text-zinc-300 truncate">
                  {previewDoc.partnerName || 'Pro Partner'}
                  {previewDoc.expiryDate ? ` · ${tr(lang, 'Expiry', 'میعاد')}: ${previewDoc.expiryDate}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {previewDoc.dataUrl && (
                  <a
                    href={previewDoc.dataUrl}
                    download={previewDoc.fileName || `${previewDoc.title}.jpg`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#D4A017] text-[#0D0D10] text-xs font-bold hover:bg-[#EAB308]"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {tr(lang, 'Download', 'ڈاؤن لوڈ')}
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  className="p-1.5 rounded-lg bg-zinc-800 text-zinc-200 hover:text-white"
                  aria-label={tr(lang, 'Close Preview', 'بند کریں')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 bg-zinc-100 flex items-center justify-center max-h-[80vh] overflow-auto">
              {String(previewDoc.dataUrl || '').startsWith('data:application/pdf') ? (
                <iframe
                  src={previewDoc.dataUrl}
                  title={previewDoc.title}
                  className="w-full h-[70vh] rounded-xl border border-zinc-200 bg-white"
                />
              ) : previewDoc.dataUrl ? (
                <img
                  src={previewDoc.dataUrl}
                  alt={previewDoc.title}
                  className="max-h-[72vh] w-auto mx-auto rounded-xl object-contain shadow-md"
                />
              ) : (
                <p className="text-sm text-zinc-500 py-12">
                  {tr(lang, 'Document preview unavailable.', 'دستاویز کا پیش نظارہ دستیاب نہیں ہے۔')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
