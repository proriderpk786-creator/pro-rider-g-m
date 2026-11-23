import React, { useEffect, useState } from 'react';
import { Bell, Camera, Check, ExternalLink, MapPin, ShieldCheck, Volume2, VolumeX } from 'lucide-react';
import { tr } from '../i18n/translations';
import type { Language } from '../types';
import { isEmbeddedIframe, queryAllAppPermissions, requestAppPermission, type PermissionGrantState } from '../utils/permissions';
import {
  getSavedRideBellSound,
  playRideBell,
  RIDE_BELL_OPTIONS,
  saveRideBellSound,
  type RideBellSoundId,
} from '../utils/rideBell';

interface PermissionsRequestBannerProps {
  lang: Language;
  role?: 'passenger' | 'partner';
  bellSound?: RideBellSoundId;
  onChangeBellSound?: (sound: RideBellSoundId) => void;
}

export const PermissionsRequestBanner: React.FC<PermissionsRequestBannerProps> = ({
  lang,
  role = 'passenger',
  bellSound,
  onChangeBellSound,
}) => {
  const [notifState, setNotifState] = useState<PermissionGrantState>('prompt');
  const [cameraState, setCameraState] = useState<PermissionGrantState>('prompt');
  const [locationState, setLocationState] = useState<PermissionGrantState>('prompt');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [localBell, setLocalBell] = useState<RideBellSoundId>(() => bellSound ?? getSavedRideBellSound(role));

  useEffect(() => {
    if (bellSound) setLocalBell(bellSound);
  }, [bellSound]);

  const activeBell = bellSound ?? localBell;

  const updateBell = (next: RideBellSoundId) => {
    setLocalBell(next);
    saveRideBellSound(next, role);
    onChangeBellSound?.(next);
    if (next !== 'muted') {
      playRideBell(next);
    }
  };

  useEffect(() => {
    let active = true;
    void queryAllAppPermissions().then((snap) => {
      if (!active) return;
      setNotifState(snap.notifications);
      setCameraState(snap.camera);
      setLocationState(snap.location);
    });
    return () => {
      active = false;
    };
  }, []);

  const inIframe = isEmbeddedIframe();

  const handleRequestNotifications = async () => {
    setBusyKey('notifications');
    setErrorMsg(null);
    const res = await requestAppPermission('notifications');
    setNotifState(res);
    if (res === 'denied') {
      setErrorMsg(
        tr(
          lang,
          'In-app ride bell is active here. For OS browser banners, allow Notifications in site settings.',
          'ایپ کے اندر بیل الرٹ آن ہے۔ براؤزر پاپ اپ نوٹیفکیشن کے لیے سائٹ سیٹنگ سے اجازت دیں۔'
        )
      );
    }
    setBusyKey(null);
  };

  const handleRequestCamera = async () => {
    setBusyKey('camera');
    setErrorMsg(null);
    const res = await requestAppPermission('camera');
    setCameraState(res);
    if (res === 'denied' || res === 'unsupported') {
      setErrorMsg(
        inIframe
          ? tr(
              lang,
              'Live camera is restricted inside the preview frame — you can upload photos directly from gallery or open in a full tab.',
              'پریویو فریم میں لائیو کیمرہ محدود ہوتا ہے — آپ گیلری سے تصویر اپ لوڈ کر سکتے ہیں یا نئے ٹیب میں ایپ کھول سکتے ہیں۔'
            )
          : tr(
              lang,
              'Camera permission denied or unavailable. You can still upload images directly from device gallery.',
              'کیمرہ کی اجازت بند ہے۔ آپ گیلری سے براہ راست تصویر اپ لوڈ کر سکتے ہیں۔'
            )
      );
    }
    setBusyKey(null);
  };

  const handleRequestLocation = async () => {
    setBusyKey('location');
    setErrorMsg(null);
    const res = await requestAppPermission('location');
    setLocationState(res);
    if (res === 'denied' || res === 'unsupported') {
      setErrorMsg(
        inIframe
          ? tr(
              lang,
              'Live GPS popup is restricted inside the preview frame — map pin drag & area search work right here, or open in a full tab for one-tap GPS.',
              'پریویو فریم میں آٹو جی پی ایس محدود ہوتا ہے — آپ نقشے پر پن لگا کر یا سرچ کر کے سفر بُک کر سکتے ہیں، یا نئے ٹیب میں کھولیں۔'
            )
          : tr(
              lang,
              'GPS Location permission is blocked. Map pin & area search still work, or allow Location in browser settings.',
              'لوکیشن کی اجازت بند ہے۔ آپ نقشے پر پن لگا کر پک اپ منتخب کر سکتے ہیں یا براؤزر سیٹنگ سے GPS آن کریں۔'
            )
      );
    }
    setBusyKey(null);
  };

  return (
    <div className="pr-preserve-light rounded-2xl border border-[#D4A017]/40 bg-gradient-to-r from-[#16161B] via-[#0D0D10] to-[#261E0A] text-white p-4 sm:p-5 shadow-lg space-y-3.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F4C430] to-[#B8860B] text-[#0D0D10] flex items-center justify-center shrink-0 font-bold shadow-sm">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-display text-sm sm:text-base font-bold text-[#F4C430]">
              {tr(lang, 'Device Permissions & Notification Bell', 'ڈیوائس اجازتیں اور نوٹیفکیشن بیل کنٹرول')}
            </h3>
            <p className="text-xs text-zinc-300 leading-snug">
              {tr(
                lang,
                'Control Location, Notifications, Camera and your in-app Ride Bell sound directly.',
                'لوکیشن، نوٹیفکیشن، کیمرہ اور ایپ کے اندر رائیڈ بیل کی آواز یہیں سے کنٹرول کریں۔'
              )}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => updateBell(activeBell === 'muted' ? (role === 'passenger' ? 'soft_gold' : 'classic_bell') : 'muted')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
            activeBell === 'muted'
              ? 'bg-red-500/20 border border-red-400/50 text-red-200'
              : 'bg-emerald-500/20 border border-emerald-400/50 text-emerald-200'
          }`}
        >
          {activeBell === 'muted' ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          {activeBell === 'muted'
            ? tr(lang, 'Bell Muted (Tap to Unmute)', 'بیل خاموش ہے (آن کریں)')
            : tr(lang, 'Bell Active', 'بیل آن ہے')}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {locationState === 'granted' ? (
          <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 text-xs font-semibold">
            <Check className="w-3.5 h-3.5" /> {tr(lang, 'Location Enabled', 'لوکیشن فعال')}
          </span>
        ) : (
          <button
            type="button"
            disabled={busyKey !== null}
            onClick={handleRequestLocation}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-xs font-semibold hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            <MapPin className="w-3.5 h-3.5 text-[#F4C430]" />
            {tr(lang, 'Allow Location', 'لوکیشن آن کریں')}
          </button>
        )}

        {notifState === 'granted' ? (
          <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 text-xs font-semibold">
            <Check className="w-3.5 h-3.5" /> {tr(lang, 'Notifications Enabled', 'نوٹیفکیشن فعال')}
          </span>
        ) : (
          <button
            type="button"
            disabled={busyKey !== null}
            onClick={handleRequestNotifications}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F4C430] text-[#0D0D10] text-xs font-bold hover:bg-[#E5B520] transition-colors disabled:opacity-50"
          >
            <Bell className="w-3.5 h-3.5" />
            {tr(lang, 'Allow Notifications', 'نوٹیفکیشن کی اجازت')}
          </button>
        )}

        {cameraState === 'granted' ? (
          <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 text-xs font-semibold">
            <Check className="w-3.5 h-3.5" /> {tr(lang, 'Camera Enabled', 'کیمرہ فعال')}
          </span>
        ) : (
          <button
            type="button"
            disabled={busyKey !== null}
            onClick={handleRequestCamera}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-xs font-semibold hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            <Camera className="w-3.5 h-3.5 text-[#D4A017]" />
            {tr(lang, 'Allow Camera', 'کیمرہ کی اجازت')}
          </button>
        )}
      </div>

      {/* In-App Notification Bell Tone Controls */}
      <div className="pt-2.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-zinc-400 mr-1">
            {tr(lang, 'Ride Bell Tone:', 'بیل کی آواز:')}
          </span>
          {RIDE_BELL_OPTIONS.map((opt) => {
            const selected = activeBell === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => updateBell(opt.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                  selected
                    ? 'bg-[#F4C430] text-[#0D0D10] border-[#F4C430]'
                    : 'bg-zinc-900/90 text-zinc-300 border-zinc-700 hover:bg-zinc-800'
                }`}
              >
                {lang === 'ur' ? opt.labelUr : opt.labelEn}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => playRideBell(activeBell === 'muted' ? 'soft_gold' : activeBell)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[#F4C430] text-[11px] font-bold transition-colors"
        >
          <Volume2 className="w-3.5 h-3.5" />
          {tr(lang, 'Test Bell', 'بیل ٹیسٹ')}
        </button>
      </div>

      {errorMsg && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-400/30 px-3 py-2 text-[11px] text-amber-200 flex flex-wrap items-center justify-between gap-2">
          <span>{errorMsg}</span>
          {inIframe && typeof window !== 'undefined' && (
            <a
              href={window.location.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F4C430] text-[#0D0D10] font-bold whitespace-nowrap hover:bg-[#E5B520]"
            >
              <ExternalLink className="w-3 h-3" />
              {tr(lang, 'Open Full Tab', 'نئے ٹیب میں کھولیں')}
            </a>
          )}
        </div>
      )}
    </div>
  );
};
