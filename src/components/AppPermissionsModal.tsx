import React, { useCallback, useEffect, useState } from 'react';
import { Bell, Camera, CheckCircle2, MapPin, Mic, Phone, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import type { Language } from '../types';
import {
  type AppPermissionKey,
  type PermissionsSnapshot,
  hasPromptedPermissionsBefore,
  markPermissionsPrompted,
  queryAllAppPermissions,
  requestAppPermission,
} from '../utils/permissions';

interface PermissionItemMeta {
  key: AppPermissionKey;
  icon: React.FC<{ className?: string }>;
  titleEn: string;
  titleUr: string;
  descEn: string;
  descUr: string;
}

const PERMISSION_ITEMS: PermissionItemMeta[] = [
  {
    key: 'location',
    icon: MapPin,
    titleEn: 'Location (GPS)',
    titleUr: 'لوکیشن (GPS)',
    descEn: 'Live pickup pin, navigation, and real-time trip tracking.',
    descUr: 'لائیو پک اپ، روٹ نیویگیشن اور ٹرپ ٹریکنگ کے لیے۔',
  },
  {
    key: 'notifications',
    icon: Bell,
    titleEn: 'Notifications & Ride Bell',
    titleUr: 'نوٹیفکیشن اور رائیڈ بیل',
    descEn: 'Instant ride alerts, counter-offers, and driver dispatch bell.',
    descUr: 'نئی رائیڈ آنے پر فوری بیل اور نوٹیفکیشن الرٹ کے لیے۔',
  },
  {
    key: 'phone_call',
    icon: Phone,
    titleEn: 'Phone & Call Access',
    titleUr: 'کال اور فون پرمیشن',
    descEn: 'One-tap direct passenger, driver & safety support calling.',
    descUr: 'پیسنجر، ڈرائیور اور سپورٹ کو فوری کال کرنے کے لیے۔',
  },
  {
    key: 'microphone',
    icon: Mic,
    titleEn: 'Microphone (Voice)',
    titleUr: 'مائیکروفون (وائس)',
    descEn: 'Voice address search & hands-free AI assistant commands.',
    descUr: 'بول کر لوکیشن سرچ کرنے اور وائس کمانڈز کے لیے۔',
  },
  {
    key: 'camera',
    icon: Camera,
    titleEn: 'Camera',
    titleUr: 'کیمرہ',
    descEn: 'Capture CNIC, Driving Licence, and Vehicle verification photos.',
    descUr: 'شناختی کارڈ، لائسنس اور گاڑی کے ڈاکومنٹس کی تصویر کے لیے۔',
  },
];

export const AppPermissionsModal: React.FC<{ lang: Language; activeRoute: string }> = ({
  lang,
  activeRoute,
}) => {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<PermissionsSnapshot>({
    location: 'prompt',
    notifications: 'prompt',
    microphone: 'prompt',
    camera: 'prompt',
    phone_call: 'prompt',
  });
  const [busyKey, setBusyKey] = useState<AppPermissionKey | 'all' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await queryAllAppPermissions();
    setSnapshot(next);
    return next;
  }, []);

  useEffect(() => {
    const onOpenModal = () => {
      void refresh();
      setOpen(true);
    };
    const onAppInstalled = () => {
      void refresh();
      setOpen(true);
    };
    window.addEventListener('open-prorider-permissions', onOpenModal);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('open-prorider-permissions', onOpenModal);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, [refresh]);

  // Prompt essential permissions once on install/first launch inside Passenger or Partner apps
  useEffect(() => {
    if (activeRoute !== '/passenger' && activeRoute !== '/partner') return;
    if (hasPromptedPermissionsBefore()) {
      void refresh();
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const current = await refresh();
      if (cancelled) return;
      const allGranted = Object.values(current).every((st) => st === 'granted');
      if (!allGranted) {
        setOpen(true);
      } else {
        markPermissionsPrompted();
      }
    }, 900);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeRoute, refresh]);

  const handleRequestOne = async (key: AppPermissionKey) => {
    setBusyKey(key);
    setNotice(null);
    const result = await requestAppPermission(key);
    setSnapshot((prev) => ({ ...prev, [key]: result }));
    if (result === 'denied') {
      setNotice(
        lang === 'ur'
          ? 'براؤزر نے یہ پرمیشن بلاک کر رکھی ہے۔ براؤزر ایڈریس بار کے Lock آئیکن سے Allow کریں۔'
          : 'This permission is blocked in browser settings. Allow it from the browser site settings icon.'
      );
    }
    setBusyKey(null);
  };

  const handleAllowAll = async () => {
    setBusyKey('all');
    setNotice(null);
    const order: AppPermissionKey[] = ['location', 'notifications', 'phone_call', 'microphone', 'camera'];
    const updated: PermissionsSnapshot = { ...snapshot };
    for (const key of order) {
      if (updated[key] !== 'granted') {
        updated[key] = await requestAppPermission(key);
        setSnapshot({ ...updated });
      }
    }
    const deniedAny = Object.values(updated).some((v) => v === 'denied');
    if (deniedAny) {
      setNotice(
        lang === 'ur'
          ? 'کچھ پرمیشنز براؤزر میں بند ہیں — آپ انہیں نیچے الگ سے یا براؤزر سیٹنگ سے آن کر سکتے ہیں۔'
          : 'Some permissions were blocked by the browser — you can allow them in browser site settings.'
      );
    }
    markPermissionsPrompted();
    setBusyKey(null);
  };

  const handleClose = () => {
    markPermissionsPrompted();
    setOpen(false);
  };

  if (!open) return null;

  const grantedCount = Object.values(snapshot).filter((v) => v === 'granted').length;

  return (
    <div
      dir={lang === 'ur' ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-[9995] bg-black/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-white border border-zinc-200 shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
        <div className="bg-[#0D0D10] text-white px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#D4A017]/20 border border-[#D4A017]/50 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-[#D4A017]" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold leading-tight">
                {lang === 'ur' ? 'ایپ کی ضروری پرمیشنز' : 'Essential App Permissions'}
              </h2>
              <p className="text-[11px] text-zinc-400">
                {lang === 'ur'
                  ? `${grantedCount}/5 فعال — بہتر سروس کے لیے تمام پرمیشنز آن کریں`
                  : `${grantedCount}/5 active — enable all permissions for full app features`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close permissions dialog"
            className="p-2 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-2.5 overflow-y-auto">
          {notice && (
            <div className="rounded-xl bg-amber-50 border border-amber-300 px-3 py-2 text-xs font-medium text-amber-900 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>{notice}</span>
            </div>
          )}

          {PERMISSION_ITEMS.map((item) => {
            const Icon = item.icon;
            const state = snapshot[item.key];
            const isGranted = state === 'granted';
            const isDenied = state === 'denied';
            return (
              <div
                key={item.key}
                className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isGranted
                        ? 'bg-emerald-100 text-emerald-700'
                        : isDenied
                        ? 'bg-red-100 text-red-700'
                        : 'bg-white border border-zinc-200 text-[#0D0D10]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#0D0D10]">
                      {lang === 'ur' ? item.titleUr : item.titleEn}
                    </div>
                    <p className="text-[11px] text-zinc-600 leading-snug mt-0.5">
                      {lang === 'ur' ? item.descUr : item.descEn}
                    </p>
                  </div>
                </div>

                {isGranted ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 text-[11px] font-bold shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {lang === 'ur' ? 'آن ہے' : 'Allowed'}
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busyKey !== null}
                    onClick={() => handleRequestOne(item.key)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold shrink-0 transition-colors ${
                      isDenied
                        ? 'bg-red-50 border border-red-200 text-red-700 hover:bg-red-100'
                        : 'bg-[#0D0D10] text-white hover:bg-zinc-800'
                    }`}
                  >
                    {busyKey === item.key
                      ? '...'
                      : isDenied
                      ? lang === 'ur'
                        ? 'دوبارہ کوشش'
                        : 'Retry'
                      : lang === 'ur'
                      ? 'اجازت دیں'
                      : 'Allow'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-zinc-200 bg-zinc-50 flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            disabled={busyKey !== null}
            onClick={handleAllowAll}
            className="flex-1 py-3 px-4 rounded-2xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold hover:bg-[#EAB308] disabled:opacity-60"
          >
            {busyKey === 'all'
              ? lang === 'ur'
                ? 'پرمیشنز حاصل کی جا رہی ہیں...'
                : 'Requesting Permissions...'
              : lang === 'ur'
              ? 'تمام ضروری پرمیشنز آن کریں'
              : 'Allow All Essential Permissions'}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="py-3 px-4 rounded-2xl border border-zinc-300 bg-white text-[#0D0D10] text-xs font-semibold hover:bg-zinc-100"
          >
            {lang === 'ur' ? 'جاری رکھیں' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
};
