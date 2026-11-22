import React, { useEffect, useState } from 'react';
import { Car, Download, Globe, WifiOff } from 'lucide-react';
import economyImg from '../assets/images/fleet_economy_1794584047757.jpg';
import comfortImg from '../assets/images/fleet_comfort_1794584048991.jpg';
import sedanImg from '../assets/images/fleet_sedan_1794584048087.jpg';
import premiumImg from '../assets/images/fleet_premium_1794584050155.jpg';
import heroMobilityImg from '../assets/images/hero_mobility_pakistan_1794584048013.jpg';
import type { Language } from '../types';

export const BrandLogo: React.FC<{ dark?: boolean; compact?: boolean }> = ({ dark = false, compact = false }) => {
  return (
    <div className="inline-flex items-center gap-2.5 select-none shrink-0">
      <img
        src="/assets/aistudio/pmg_3_88102afb.png"
        alt="PRO RIDER AI"
        className={`${compact ? 'w-8 h-8' : 'w-10 h-10'} rounded-full object-contain shrink-0 shadow-md border border-[#D4A017]/40 bg-black`}
      />
      <div className="flex flex-col leading-none">
        <span
          className={`font-display font-bold tracking-tight text-base whitespace-nowrap ${
            dark ? 'text-white' : 'text-[#0D0D10]'
          }`}
        >
          PRO RIDER <span className="text-[#D4A017]">AI</span>
        </span>
        {!compact && (
          <span className={`text-[11px] font-medium tracking-wide mt-0.5 whitespace-nowrap ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            Travel with Trust
          </span>
        )}
      </div>
    </div>
  );
};

export const LanguageToggle: React.FC<{
  lang: Language;
  onChange: (lang: Language) => void;
  dark?: boolean;
}> = ({ lang, onChange, dark = false }) => {
  return (
    <div
      className={`inline-flex items-center rounded-lg p-0.5 border text-xs font-medium shrink-0 ${
        dark ? 'bg-zinc-900 border-zinc-700 text-zinc-300' : 'bg-zinc-100 border-zinc-200 text-zinc-700'
      }`}
    >
      <Globe className="w-3.5 h-3.5 mx-1.5 text-[#D4A017]" />
      <button
        type="button"
        onClick={() => onChange('en')}
        className={`px-2 py-1 rounded-md transition-colors whitespace-nowrap ${
          lang === 'en' ? 'bg-[#0D0D10] text-white' : 'hover:text-[#D4A017]'
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => onChange('ur')}
        className={`px-2 py-1 rounded-md transition-colors whitespace-nowrap ${
          lang === 'ur' ? 'bg-[#D4A017] text-[#0D0D10] font-semibold' : 'hover:text-[#D4A017]'
        }`}
      >
        اردو
      </button>
    </div>
  );
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const PWAInstallButton: React.FC<{ dark?: boolean }> = ({ dark = false }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(standalone);
    setIsIOS(/iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase()));

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (isInstalled) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
    }
  };

  if (deferredPrompt) {
    return (
      <button
        type="button"
        onClick={handleInstall}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[36px] ${
          dark
            ? 'bg-[#D4A017] text-[#0D0D10] hover:bg-[#EAB308]'
            : 'bg-[#0D0D10] text-white hover:bg-zinc-800'
        }`}
      >
        <Download className="w-3.5 h-3.5" />
        Install App
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
            dark ? 'border-zinc-700 text-zinc-200 hover:bg-zinc-800' : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100'
          }`}
        >
          <Download className="w-3.5 h-3.5" />
          Install iOS
        </button>
        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 border border-zinc-200 text-[#0D0D10]">
              <h3 className="text-base font-bold font-display">Install PRO RIDER AI on iPhone / iPad</h3>
              <p className="mt-2 text-sm text-zinc-600 leading-relaxed">
                1. Tap the <strong>Share</strong> icon in Safari toolbar.<br />
                2. Scroll down and select <strong>Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-xl bg-[#0D0D10] py-2.5 text-sm font-semibold text-white"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white shadow-lg">
      <WifiOff className="w-3.5 h-3.5" />
      Offline Mode — Cached views active
    </div>
  );
};

const BUNDLED_IMAGE_MAP: Record<string, string> = {
  '/src/assets/images/fleet_economy_1794584047757.jpg': economyImg,
  '/src/assets/images/fleet_comfort_1794584048991.jpg': comfortImg,
  '/src/assets/images/fleet_sedan_1794584048087.jpg': sedanImg,
  '/src/assets/images/fleet_premium_1794584050155.jpg': premiumImg,
  '/src/assets/images/hero_mobility_pakistan_1794584048013.jpg': heroMobilityImg,
};

export const VehicleImage: React.FC<{ src?: string; alt: string; className?: string }> = ({
  src,
  alt,
  className = 'w-20 h-14',
}) => {
  const [failed, setFailed] = useState(false);
  const resolvedSrc = src ? BUNDLED_IMAGE_MAP[src] || src : undefined;
  if (!resolvedSrc || failed) {
    return (
      <div
        className={`${className} rounded-lg bg-gradient-to-br from-zinc-100 to-zinc-200 border border-zinc-200 flex items-center justify-center text-zinc-500 shrink-0`}
      >
        <Car className="w-6 h-6 text-[#D4A017]" />
      </div>
    );
  }
  return (
    <img
      src={resolvedSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${className} object-cover rounded-lg bg-white shrink-0`}
    />
  );
};
