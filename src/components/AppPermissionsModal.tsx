import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Camera,
  ExternalLink,
  MapPin,
  Mic,
  Phone,
  ShieldAlert,
  ShieldCheck,
  Volume2,
  X,
} from 'lucide-react';
import type { Language } from '../types';
import {
  type AppPermissionKey,
  type PermissionsSnapshot,
  hasPromptedPermissionsBefore,
  isEmbeddedIframe,
  markPermissionsPrompted,
  queryAllAppPermissions,
  requestAppPermission,
  toggleAppPermission,
} from '../utils/permissions';
import {
  getSavedRideBellSound,
  playRideBell,
  RIDE_BELL_OPTIONS,
  saveRideBellSound,
  type RideBellSoundId,
} from '../utils/rideBell';

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
    descEn: 'Live pickup pin, navigation & real-time trip tracking.',
    descUr: 'لائیو پِک اپ، روٹ نیویگیشن اور ٹرپ ٹریکنگ کے لیے۔',
  },
  {
    key: 'notifications',
    icon: Bell,
    titleEn: 'Notifications',
    titleUr: 'نوٹیفکیشنز',
    descEn: 'Ride confirmation, counter-offers & driver arrival alerts.',
    descUr: 'رائیڈ کی تصدیق، کرایہ آفر اور ڈرائیور آمد الرٹس۔',
  },
  {
    key: 'ride_bell',
    icon: Volume2,
    titleEn: 'Ride Bell & Tone',
    titleUr: 'رائیڈ بیل اور ٹون',
    descEn: 'Sound chime & ringtone when rides update or confirm.',
    descUr: 'بُکنگ کنفرم یا اپڈیٹ ہونے پر بیل اور گھنٹی کی آواز۔',
  },
  {
    key: 'camera',
    icon: Camera,
    titleEn: 'Camera',
    titleUr: 'کیمرہ',
    descEn: 'Capture CNIC, Driving Licence & Vehicle photos.',
    descUr: 'شناختی کارڈ، لائسنس اور گاڑی کی تصویر کے لیے۔',
  },
  {
    key: 'microphone',
    icon: Mic,
    titleEn: 'Microphone (Voice)',
    titleUr: 'مائیکروفون (وائس)',
    descEn: 'Voice location search & hands-free voice commands.',
    descUr: 'بول کر پتہ تلاش کرنے اور وائس کمانڈز کے لیے۔',
  },
  {
    key: 'phone_call',
    icon: Phone,
    titleEn: 'Phone & Direct Call',
    titleUr: 'فون اور ڈائریکٹ کال',
    descEn: 'One-tap direct call to driver, passenger & support.',
    descUr: 'ڈرائیور، مسافر اور سپورٹ کو فوری کال کرنے کے لیے۔',
  },
];

export const AppPermissionsModal: React.FC<{ lang: Language; activeRoute: string }> = ({
  lang,
  activeRoute,
}) => {
  const role: 'passenger' | 'partner' = activeRoute.startsWith('/partner') ? 'partner' : 'passenger';
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<PermissionsSnapshot>({
    location: 'prompt',
    notifications: 'prompt',
    ride_bell: 'granted',
    camera: 'prompt',
    microphone: 'prompt',
    phone_call: 'prompt',
  });
  const [bellTone, setBellTone] = useState<RideBellSoundId>(() => getSavedRideBellSound(role));
  const [busyKey, setBusyKey] = useState<AppPermissionKey | 'all' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await queryAllAppPermissions(role);
    setSnapshot(next);
    setBellTone(getSavedRideBellSound(role));
    return next;
  }, [role]);

  useEffect(() => {
    const onOpenModal = () => {
      void refresh();
      setNotice(null);
      setOpen(true);
    };
    const onAppInstalled = () => {
      void refresh();
      setOpen(true);
    };
    const onBellUpdated = () => {
      setBellTone(getSavedRideBellSound(role));
      void refresh();
    };
    window.addEventListener('open-prorider-permissions', onOpenModal);
    window.addEventListener('appinstalled', onAppInstalled);
    window.addEventListener('pr:bell-updated', onBellUpdated);
    return () => {
      window.removeEventListener('open-prorider-permissions', onOpenModal);
      window.removeEventListener('appinstalled', onAppInstalled);
      window.removeEventListener('pr:bell-updated', onBellUpdated);
    };
  }, [refresh, role]);

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

  const inIframe = isEmbeddedIframe();

  const handleToggleOne = async (key: AppPermissionKey) => {
    const currentlyOn = snapshot[key] === 'granted';
    setBusyKey(key);
    setNotice(null);
    const nextState = await toggleAppPermission(key, !currentlyOn, role);
    setSnapshot((prev) => ({ ...prev, [key]: nextState }));
    setBellTone(getSavedRideBellSound(role));
    if (!currentlyOn && (nextState === 'denied' || nextState === 'unsupported')) {
      setNotice(
        inIframe
          ? lang === 'ur'
            ? 'پریویو فریم میں براؤزر یہ پرمیشن روکتا ہے — آپ ایپ کو نئے ٹیب میں کھول کر تمام پرمیشنز آن کر سکتے ہیں، یا نقشے پر پن اور گیلری اپ لوڈ یہیں استعمال کریں۔'
            : 'Preview frame restricts this popup. Open the app in a full browser tab to grant live device access, or use map pin & file upload directly here.'
          : lang === 'ur'
          ? 'براؤزر نے یہ پرمیشن بلاک کر رکھی ہے۔ براؤزر ایڈریس بار کے Lock آئیکن سے Allow کریں۔'
          : 'This permission is blocked in browser settings. Allow it from the browser site settings icon.'
      );
    }
    setBusyKey(null);
  };

  const handleSelectTone = (toneId: RideBellSoundId) => {
    setBellTone(toneId);
    saveRideBellSound(toneId, role);
    window.dispatchEvent(new CustomEvent('pr:bell-updated', { detail: { role, sound: toneId } }));
    if (toneId !== 'muted') {
      void toggleAppPermission('ride_bell', true, role).then((st) => {
        setSnapshot((prev) => ({ ...prev, ride_bell: st }));
      });
      playRideBell(toneId);
    } else {
      setSnapshot((prev) => ({ ...prev, ride_bell: 'prompt' }));
    }
  };

  const handleAllowAll = async () => {
    setBusyKey('all');
    setNotice(null);
    const order: AppPermissionKey[] = ['location', 'notifications', 'ride_bell', 'phone_call', 'microphone', 'camera'];
    const updated: PermissionsSnapshot = { ...snapshot };
    for (const key of order) {
      if (updated[key] !== 'granted') {
        updated[key] = await requestAppPermission(key, role);
        setSnapshot({ ...updated });
      }
    }
    setBellTone(getSavedRideBellSound(role));
    const deniedAny = Object.values(updated).some((v) => v === 'denied');
    if (deniedAny) {
      setNotice(
        inIframe
          ? lang === 'ur'
            ? 'پریویو فریم میں کیمرہ اور GPS محدود ہوتے ہیں۔ مکمل فیچرز کے لیے نیچے "نئے ٹیب میں کھولیں" دبائیں، یا نقشے پر پن اور گیلری سے کام جاری رکھیں۔'
            : 'Preview frame restricts live GPS/Camera popups. Open in a full browser tab for native prompts, or continue using manual map pin & file uploads here.'
          : lang === 'ur'
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

  const totalCount = PERMISSION_ITEMS.length;
  const grantedCount = PERMISSION_ITEMS.filter((it) => snapshot[it.key] === 'granted').length;

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
                {lang === 'ur' ? 'ایپ کی تمام پرمیشنز' : 'App Permissions'}
              </h2>
              <p className="text-[11px] text-zinc-400">
                {lang === 'ur'
                  ? `${grantedCount}/${totalCount} فعال — سامنے بٹن سے آن یا آف کریں`
                  : `${grantedCount}/${totalCount} active — toggle ON or OFF anytime`}
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
            <div className="rounded-xl bg-amber-50 border border-amber-300 px-3 py-2.5 text-xs font-medium text-amber-900 space-y-2">
              <div className="flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span>{notice}</span>
              </div>
              {inIframe && typeof window !== 'undefined' && (
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0D0D10] text-[#F4C430] text-[11px] font-bold hover:bg-zinc-800"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {lang === 'ur' ? 'نئے ٹیب میں ایپ کھولیں' : 'Open App in New Tab'}
                </a>
              )}
            </div>
          )}

          {PERMISSION_ITEMS.map((item) => {
            const Icon = item.icon;
            const state = snapshot[item.key];
            const isOn = state === 'granted';
            const isDenied = state === 'denied';
            const isBusy = busyKey === item.key;

            return (
              <div
                key={item.key}
                className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isOn
                          ? 'bg-emerald-100 text-emerald-700'
                          : isDenied
                          ? 'bg-red-100 text-red-700'
                          : 'bg-white border border-zinc-200 text-[#0D0D10]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#0D0D10] flex items-center gap-1.5">
                        <span>{lang === 'ur' ? item.titleUr : item.titleEn}</span>
                        {isDenied && (
                          <span className="text-[10px] font-semibold text-red-600">
                            ({lang === 'ur' ? 'بلاک' : 'Blocked'})
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-600 leading-snug mt-0.5">
                        {lang === 'ur' ? item.descUr : item.descEn}
                      </p>
                    </div>
                  </div>

                  {/* Clean ON / OFF Toggle Switch */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isOn}
                    disabled={busyKey !== null}
                    onClick={() => void handleToggleOne(item.key)}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-1.5 py-1 rounded-full border transition-all disabled:opacity-60 ${
                      isOn
                        ? 'bg-emerald-600 border-emerald-600 text-white flex-row-reverse'
                        : 'bg-zinc-200 border-zinc-300 text-zinc-700 flex-row'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-white shadow-xs shrink-0" />
                    <span className="text-[10px] font-extrabold uppercase tracking-wide tabular-nums min-w-[24px] text-center">
                      {isBusy ? '...' : isOn ? (lang === 'ur' ? 'آن' : 'ON') : (lang === 'ur' ? 'آف' : 'OFF')}
                    </span>
                  </button>
                </div>

                {/* Inline Tone Picker when Ride Bell permission is toggled ON */}
                {item.key === 'ride_bell' && isOn && (
                  <div className="pt-2 border-t border-zinc-200/80 flex flex-wrap items-center gap-1.5">
                    {RIDE_BELL_OPTIONS.filter((o) => o.id !== 'muted').map((opt) => {
                      const active = bellTone === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleSelectTone(opt.id)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                            active
                              ? 'bg-[#F4C430] border-[#B8860B] text-[#0D0D10]'
                              : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                          }`}
                        >
                          {lang === 'ur' ? opt.labelUr : opt.labelEn}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => playRideBell(bellTone === 'muted' ? 'soft_gold' : bellTone)}
                      className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0D0D10] text-[#F4C430] text-[10px] font-bold"
                    >
                      <Volume2 className="w-3 h-3" />
                      {lang === 'ur' ? 'ٹیسٹ' : 'Test'}
                    </button>
                  </div>
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
                ? 'آن کیا جا رہا ہے...'
                : 'Activating...'
              : lang === 'ur'
              ? 'تمام پرمیشنز آن کریں'
              : 'Turn All Permissions ON'}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="py-3 px-4 rounded-2xl border border-zinc-300 bg-white text-[#0D0D10] text-xs font-semibold hover:bg-zinc-100"
          >
            {lang === 'ur' ? 'مکمل' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
};
