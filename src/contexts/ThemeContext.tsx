import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AppThemeId, AuthLayoutId, HomeLayoutId, Language, PublicConfig } from '../types';

export interface ThemeMeta {
  id: AppThemeId;
  nameEn: string;
  nameUr: string;
  descEn: string;
  descUr: string;
  isDark: boolean;
  bgHex: string;
  surfaceHex: string;
  accentHex: string;
  textHex: string;
}

export interface LayoutMeta<T extends string> {
  id: T;
  nameEn: string;
  nameUr: string;
  descEn: string;
  descUr: string;
}

export const APP_THEMES: ThemeMeta[] = [
  {
    id: 'classic-ivory',
    nameEn: 'Classic Ivory & Obsidian',
    nameUr: 'کلاسک آئیوری اور اوبسیڈین',
    descEn: 'Clean ivory studio light with obsidian & gold accents',
    descUr: 'صاف آئیوری لائٹ اور سیاہ و سنہری بٹن',
    isDark: false,
    bgHex: '#F8F8FA',
    surfaceHex: '#FFFFFF',
    accentHex: '#D4A017',
    textHex: '#0D0D10',
  },
  {
    id: 'obsidian-gold',
    nameEn: 'Obsidian Gold Luxury',
    nameUr: 'اوبسیڈین بلیک گولڈ',
    descEn: 'Deep charcoal dark mode with metallic champagne gold CTAs',
    descUr: 'گہرا سیاہ لگژری ڈارک موڈ اور سنہری بٹن',
    isDark: true,
    bgHex: '#09090C',
    surfaceHex: '#131419',
    accentHex: '#E5B83B',
    textHex: '#F8FAFC',
  },
  {
    id: 'royal-navy',
    nameEn: 'Royal Midnight Navy',
    nameUr: 'رائل مڈنائٹ نیوی',
    descEn: 'Sapphire midnight blue surfaces with golden highlights',
    descUr: 'شاہی نیوی بلیو تھیم اور سنہری بارڈر',
    isDark: true,
    bgHex: '#050E22',
    surfaceHex: '#0A1836',
    accentHex: '#D4A017',
    textHex: '#F8FAFC',
  },
  {
    id: 'pearl-marble',
    nameEn: 'Pearl Marble Champagne',
    nameUr: 'پرل ماربل شیمپین',
    descEn: 'Warm pearl-cream marble palette with brushed gold ribbons',
    descUr: 'نرم موتی کریم ماربل اور برشڈ گولڈ اسٹائل',
    isDark: false,
    bgHex: '#F6F1E5',
    surfaceHex: '#FFFDF8',
    accentHex: '#C8941D',
    textHex: '#1A1610',
  },
  {
    id: 'sovereign-noir',
    nameEn: 'Sovereign Velvet Noir',
    nameUr: 'ساورین ویلوٹ نوائر',
    descEn: 'Warm velvet obsidian with radiant sovereign amber glow',
    descUr: 'ویلوٹ سیاہ تھیم چمکتے سنہری گلو کے ساتھ',
    isDark: true,
    bgHex: '#080705',
    surfaceHex: '#14110C',
    accentHex: '#F4C430',
    textHex: '#FFF9EB',
  },
];

export const HOME_LAYOUTS: LayoutMeta<HomeLayoutId>[] = [
  {
    id: 'classic',
    nameEn: 'Classic Split Hero',
    nameUr: 'کلاسک اسپلٹ ہیرو',
    descEn: 'Clean asymmetric split layout with direct role entry cards',
    descUr: 'آسان دو حصوں والا اصل ڈیزائن',
  },
  {
    id: 'sovereign',
    nameEn: 'Sovereign Pakistan Hero',
    nameUr: 'ساورین پاکستان ہیرو',
    descEn: 'Grand centered Faisal Mosque scenic hero with 3 service tiles',
    descUr: 'فیصل مسجد اور بڑی گاڑی کے ساتھ مرکزی ہیرو ڈیزائن',
  },
  {
    id: 'editorial',
    nameEn: 'Smart Mobility Showcase',
    nameUr: 'اسمارٹ موبلٹی شوکیس',
    descEn: 'Structured Passenger & Partner columns with city corridor strip',
    descUr: 'مسافر اور ڈرائیور سہولیات کا مکمل دو کالم والا صفحہ',
  },
  {
    id: 'executive',
    nameEn: 'Executive Gold Splash',
    nameUr: 'ایگزیکٹو گولڈ اسپلش',
    descEn: 'Executive split showcase with central website pill & dual portal deck',
    descUr: 'گولڈ رِبن اور ڈبل پورٹل کارڈز والا ایگزیکٹو ہوم پیج',
  },
];

export const AUTH_LAYOUTS: LayoutMeta<AuthLayoutId>[] = [
  {
    id: 'hero-sheet',
    nameEn: 'Luxury Hero Sheet',
    nameUr: 'لگژری ہیرو شیٹ',
    descEn: 'Scenic top banner with curved gold-trimmed sign-in sheet',
    descUr: 'اوپر تصویر اور نیچے گول کناروں والا جدید سائن ان کارڈ',
  },
  {
    id: 'classic-card',
    nameEn: 'Classic Focused Card',
    nameUr: 'کلاسک فوکسڈ کارڈ',
    descEn: 'Fast clean centered card for rapid sign-in & registration',
    descUr: 'تیز اور سادہ مرکزی سائن ان کارڈ',
  },
  {
    id: 'split-showcase',
    nameEn: 'Split Visual Showcase',
    nameUr: 'اسپلٹ ویژول شوکیس',
    descEn: 'Side-by-side scenic car gallery & gold-trimmed auth panel',
    descUr: 'سائیڈ بائی سائیڈ گاڑی تصویر اور لاگ ان پینل',
  },
];

interface ThemeContextValue {
  themeId: AppThemeId;
  themeMeta: ThemeMeta;
  isDark: boolean;
  homeLayout: HomeLayoutId;
  authLayout: AuthLayoutId;
  hasLocalOverride: boolean;
  adminDefaultConfig: {
    themeId: AppThemeId;
    homeLayout: HomeLayoutId;
    authLayout: AuthLayoutId;
    forceGlobal: boolean;
    updatedAt: number;
  };
  setThemeId: (id: AppThemeId) => void;
  setHomeLayout: (id: HomeLayoutId) => void;
  setAuthLayout: (id: AuthLayoutId) => void;
  cycleTheme: () => void;
  resetToAdminDefault: () => void;
  getThemeLabel: (id: AppThemeId, lang: Language) => string;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const LS_THEME = 'pr_user_theme';
const LS_HOME = 'pr_user_home_layout';
const LS_AUTH = 'pr_user_auth_layout';
const LS_SYNC_TS = 'pr_user_theme_sync_ts';

const isValidTheme = (v: unknown): v is AppThemeId =>
  typeof v === 'string' && APP_THEMES.some((t) => t.id === v);

const isValidHome = (v: unknown): v is HomeLayoutId =>
  typeof v === 'string' && HOME_LAYOUTS.some((h) => h.id === v);

const isValidAuth = (v: unknown): v is AuthLayoutId =>
  typeof v === 'string' && AUTH_LAYOUTS.some((a) => a.id === v);

export const ThemeProvider: React.FC<{
  config: PublicConfig;
  children: React.ReactNode;
}> = ({ config, children }) => {
  const adminDefault = useMemo(
    () => ({
      themeId: isValidTheme(config.themeConfig?.themeId) ? config.themeConfig!.themeId : 'obsidian-gold',
      homeLayout: isValidHome(config.themeConfig?.homeLayout) ? config.themeConfig!.homeLayout : 'sovereign',
      authLayout: isValidAuth(config.themeConfig?.authLayout) ? config.themeConfig!.authLayout : 'hero-sheet',
      forceGlobal: Boolean(config.themeConfig?.forceGlobal),
      updatedAt: Number(config.themeConfig?.updatedAt || 0),
    }),
    [config.themeConfig]
  );

  const [themeId, setThemeState] = useState<AppThemeId>(() => {
    try {
      const saved = localStorage.getItem(LS_THEME);
      return isValidTheme(saved) ? saved : 'obsidian-gold';
    } catch {
      return 'obsidian-gold';
    }
  });

  const [homeLayout, setHomeState] = useState<HomeLayoutId>(() => adminDefault.homeLayout);

  const [authLayout, setAuthState] = useState<AuthLayoutId>(() => adminDefault.authLayout);

  const [hasLocalOverride, setHasLocalOverride] = useState<boolean>(() => {
    try {
      return Boolean(localStorage.getItem(LS_THEME));
    } catch {
      return false;
    }
  });

  // Automatically propagate Admin Global Theme & Layout updates across sessions
  useEffect(() => {
    setHomeState(adminDefault.homeLayout);
    setAuthState(adminDefault.authLayout);
    try {
      localStorage.removeItem(LS_HOME);
      localStorage.removeItem(LS_AUTH);
      const localSyncTs = Number(localStorage.getItem(LS_SYNC_TS) || '0');
      const hasOverride = Boolean(localStorage.getItem(LS_THEME));
      if (adminDefault.forceGlobal || adminDefault.updatedAt > localSyncTs || !hasOverride) {
        setThemeState(adminDefault.themeId);
        if (adminDefault.updatedAt > localSyncTs || adminDefault.forceGlobal) {
          localStorage.setItem(LS_SYNC_TS, String(adminDefault.updatedAt || Date.now()));
          if (adminDefault.forceGlobal) {
            localStorage.removeItem(LS_THEME);
            setHasLocalOverride(false);
          } else {
            localStorage.setItem(LS_THEME, adminDefault.themeId);
          }
        }
      }
    } catch {
      // ignore storage errors
    }
  }, [adminDefault]);

  // Apply data-theme attribute & live CSS custom properties onto <html> and <body>
  useEffect(() => {
    const meta = APP_THEMES.find((t) => t.id === themeId) || APP_THEMES[0];
    const root = document.documentElement;
    root.setAttribute('data-theme', meta.id);
    root.style.colorScheme = meta.isDark ? 'dark' : 'light';
    root.style.setProperty('--pr-bg', meta.bgHex);
    root.style.setProperty('--pr-surface', meta.surfaceHex);
    root.style.setProperty('--pr-text', meta.textHex);
    root.style.setProperty('--pr-accent', meta.accentHex);
    if (document.body) {
      document.body.style.backgroundColor = meta.bgHex;
      document.body.style.color = meta.textHex;
    }
  }, [themeId]);

  const setThemeId = useCallback((id: AppThemeId) => {
    setThemeState(id);
    setHasLocalOverride(true);
    try {
      localStorage.setItem(LS_THEME, id);
      localStorage.setItem(LS_SYNC_TS, String(Date.now()));
    } catch {
      // ignore
    }
  }, []);

  const setHomeLayout = useCallback((id: HomeLayoutId) => {
    setHomeState(id);
  }, []);

  const setAuthLayout = useCallback((id: AuthLayoutId) => {
    setAuthState(id);
  }, []);

  const cycleTheme = useCallback(() => {
    const idx = APP_THEMES.findIndex((t) => t.id === themeId);
    const next = APP_THEMES[(idx + 1) % APP_THEMES.length];
    setThemeId(next.id);
  }, [themeId, setThemeId]);

  const resetToAdminDefault = useCallback(() => {
    setThemeState(adminDefault.themeId);
    setHomeState(adminDefault.homeLayout);
    setAuthState(adminDefault.authLayout);
    setHasLocalOverride(false);
    try {
      localStorage.removeItem(LS_THEME);
      localStorage.removeItem(LS_HOME);
      localStorage.removeItem(LS_AUTH);
      localStorage.setItem(LS_SYNC_TS, String(adminDefault.updatedAt || Date.now()));
    } catch {
      // ignore
    }
  }, [adminDefault]);

  const themeMeta = useMemo(() => APP_THEMES.find((t) => t.id === themeId) || APP_THEMES[0], [themeId]);

  const getThemeLabel = useCallback((id: AppThemeId, lang: Language) => {
    const found = APP_THEMES.find((t) => t.id === id);
    if (!found) return id;
    return lang === 'ur' ? found.nameUr : found.nameEn;
  }, []);

  const value: ThemeContextValue = {
    themeId,
    themeMeta,
    isDark: themeMeta.isDark,
    homeLayout,
    authLayout,
    hasLocalOverride,
    adminDefaultConfig: adminDefault,
    setThemeId,
    setHomeLayout,
    setAuthLayout,
    cycleTheme,
    resetToAdminDefault,
    getThemeLabel,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return ctx;
}
