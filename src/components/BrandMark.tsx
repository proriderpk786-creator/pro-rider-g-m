import React, { useEffect, useState } from 'react';
import { Car, Download, Globe, Moon, Sun, WifiOff } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { tr } from '../i18n/translations';
import economyImg from '../assets/images/fleet_economy_1794584047757.jpg';
import comfortImg from '../assets/images/fleet_comfort_1794584048991.jpg';
import sedanImg from '../assets/images/fleet_sedan_1794584048087.jpg';
import premiumImg from '../assets/images/fleet_premium_1794584050155.jpg';
import heroMobilityImg from '../assets/images/hero_mobility_pakistan_1794584048013.jpg';
import type { Language } from '../types';

export const BrandLogo: React.FC<{ dark?: boolean; compact?: boolean; lang?: Language }> = ({
  dark,
  compact = false,
  lang = 'en',
}) => {
  const { isDark } = useTheme();
  const effectiveDark = dark ?? isDark;
  return (
    <div className={`inline-flex items-center ${compact ? 'gap-1.5 sm:gap-2.5' : 'gap-2.5'} select-none shrink-0`}>
      <img
        src="/assets/aistudio/pmg_3_88102afb.png"
        alt="PRO RIDER AI"
        className={`${compact ? 'w-7 h-7 sm:w-8 sm:h-8' : 'w-10 h-10'} rounded-full object-contain shrink-0 shadow-md border border-[#D4A017]/50 bg-black`}
      />
      <div className="flex flex-col leading-none">
        <span
          className={`font-display font-extrabold tracking-tight ${
            compact ? 'text-[13px] sm:text-base' : 'text-base'
          } whitespace-nowrap pr-on-accent ${
            effectiveDark ? '!text-white' : '!text-[#0D0D10]'
          }`}
        >
          PRO RIDER <span className="text-[#D4A017]">AI</span>
        </span>
        {!compact && (
          <span
            className={`text-[11px] font-semibold tracking-wide mt-0.5 whitespace-nowrap ${
              effectiveDark ? '!text-zinc-300' : '!text-zinc-600'
            }`}
          >
            {tr(lang, 'Travel with Trust', 'اعتماد کے ساتھ سفر کریں')}
          </span>
        )}
      </div>
    </div>
  );
};

export const ThemeModeToggle: React.FC<{
  dark?: boolean;
  lang?: Language;
}> = ({ dark, lang = 'en' }) => {
  const { isDark, setThemeId } = useTheme();
  const effectiveDark = dark ?? isDark;

  const toggleTheme = () => {
    if (isDark) {
      setThemeId('classic-ivory');
    } else {
      setThemeId('obsidian-gold');
    }
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? tr(lang, 'Switch to Light Ivory Gold mode', 'لائٹ گولڈ موڈ آن کریں') : tr(lang, 'Switch to Dark Gold mode', 'ڈارک گولڈ موڈ آن کریں')}
      aria-label={isDark ? tr(lang, 'Switch to Light Ivory Gold mode', 'لائٹ گولڈ موڈ آن کریں') : tr(lang, 'Switch to Dark Gold mode', 'ڈارک گولڈ موڈ آن کریں')}
      className={`pr-preserve-light inline-flex items-center justify-center gap-1.5 px-2 sm:px-2.5 py-1.5 sm:py-1 rounded-lg border text-xs font-bold shrink-0 transition-all min-h-[32px] ${
        effectiveDark
          ? 'bg-zinc-900 border-zinc-700 text-[#F4C430] hover:bg-zinc-800'
          : 'bg-zinc-100 border-zinc-300 text-[#0D0D10] hover:bg-zinc-200'
      }`}
    >
      {isDark ? <Sun className="w-3.5 h-3.5 text-[#F4C430]" /> : <Moon className="w-3.5 h-3.5 text-[#0D0D10]" />}
      <span className="hidden sm:inline text-[11px] font-bold whitespace-nowrap">
        {isDark ? tr(lang, 'Light', 'لائٹ') : tr(lang, 'Dark', 'ڈارک')}
      </span>
    </button>
  );
};

export const LanguageToggle: React.FC<{
  lang: Language;
  onChange: (lang: Language) => void;
  dark?: boolean;
}> = ({ lang, onChange, dark }) => {
  const { isDark } = useTheme();
  const effectiveDark = dark ?? isDark;
  return (
    <div
      className={`pr-preserve-light inline-flex items-center rounded-lg p-0.5 border text-[11px] sm:text-xs font-semibold shrink-0 ${
        effectiveDark ? 'bg-zinc-900 border-zinc-700 text-zinc-200' : 'bg-zinc-100 border-zinc-300 text-[#0D0D10]'
      }`}
    >
      <Globe className="hidden sm:block w-3.5 h-3.5 mx-1.5 text-[#D4A017]" />
      <button
        type="button"
        onClick={() => onChange('en')}
        className={`px-1.5 sm:px-2 py-1 rounded-md transition-colors whitespace-nowrap ${
          lang === 'en' ? 'bg-[#0D0D10] text-white font-bold' : 'hover:text-[#D4A017]'
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => onChange('ur')}
        className={`px-1.5 sm:px-2 py-1 rounded-md transition-colors whitespace-nowrap ${
          lang === 'ur' ? 'bg-[#D4A017] text-[#0D0D10] font-bold' : 'hover:text-[#D4A017]'
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

export const PWAInstallButton: React.FC<{ dark?: boolean; lang?: Language }> = ({ dark, lang = 'en' }) => {
  const { isDark } = useTheme();
  const effectiveDark = dark ?? isDark;
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
          effectiveDark
            ? 'bg-[#D4A017] text-[#0D0D10] hover:bg-[#EAB308]'
            : 'bg-[#0D0D10] text-white hover:bg-zinc-800'
        }`}
      >
        <Download className="w-3.5 h-3.5" />
        {tr(lang, 'Install App', 'ایپ انسٹال کریں')}
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
            effectiveDark
              ? 'border-zinc-700 text-zinc-200 hover:bg-zinc-800'
              : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100'
          }`}
        >
          <Download className="w-3.5 h-3.5" />
          {tr(lang, 'Install iOS', 'آئی فون پر انسٹال')}
        </button>
        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 border border-zinc-200 text-[#0D0D10]">
              <h3 className="text-base font-bold font-display">
                {tr(lang, 'Install PRO RIDER AI on iPhone / iPad', 'آئی فون / آئی پیڈ پر پرو رائیڈر اے آئی انسٹال کریں')}
              </h3>
              <p className="mt-2 text-sm text-zinc-600 leading-relaxed">
                {tr(lang, '1. Tap the Share icon in Safari toolbar.', '1. سفاری بار میں Share آئیکن پر کلک کریں۔')}
                <br />
                {tr(lang, '2. Scroll down and select Add to Home Screen.', '2. نیچے Add to Home Screen منتخب کریں۔')}
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-xl bg-[#0D0D10] py-2.5 text-sm font-semibold text-white"
              >
                {tr(lang, 'Close', 'بند کریں')}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC<{ lang?: Language }> = ({ lang = 'en' }) => {
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
      {tr(lang, 'Offline Mode — Cached views active', 'آف لائن موڈ — محفوظ شدہ صفحات فعال ہیں')}
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

function resolveFallbackFleetImage(alt?: string, slug?: string): string | undefined {
  const key = `${slug || ''} ${alt || ''}`.toLowerCase();
  if (key.includes('luxury') || key.includes('premium') || key.includes('suv') || key.includes('fortuner')) {
    return premiumImg;
  }
  if (key.includes('sedan') || key.includes('corolla') || key.includes('civic')) {
    return sedanImg;
  }
  if (key.includes('comfort') || key.includes('van') || key.includes('coaster')) {
    return comfortImg;
  }
  if (key.includes('economy') || key.includes('alto') || key.includes('cultus') || key.includes('wagon') || key.includes('bike') || key.includes('rickshaw')) {
    return economyImg;
  }
  return comfortImg;
}

export const VehicleImage: React.FC<{ src?: string; alt: string; className?: string; categorySlug?: string }> = ({
  src,
  alt,
  className = 'w-20 h-14',
  categorySlug,
}) => {
  const { isDark } = useTheme();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const directSrc = src ? BUNDLED_IMAGE_MAP[src] || src : undefined;
  const fallbackSrc = resolveFallbackFleetImage(alt, categorySlug);
  const effectiveSrc = !failed && directSrc ? directSrc : fallbackSrc;

  if (!effectiveSrc) {
    return (
      <div
        className={`${className} rounded-lg border flex items-center justify-center shrink-0 ${
          isDark
            ? 'bg-gradient-to-br from-[#1B1D24] to-[#111218] border-zinc-800 text-zinc-400'
            : 'bg-gradient-to-br from-zinc-100 to-zinc-200 border-zinc-200 text-zinc-500'
        }`}
      >
        <Car className="w-6 h-6 text-[#D4A017]" />
      </div>
    );
  }
  return (
    <img
      src={effectiveSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => {
        if (!failed) setFailed(true);
      }}
      className={`${className} object-cover rounded-lg shrink-0 ${isDark ? 'bg-[#16171F]' : 'bg-zinc-100'}`}
    />
  );
};
