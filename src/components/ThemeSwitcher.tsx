import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, LayoutTemplate, Palette, RefreshCw, ShieldCheck, Smartphone, Sparkles, X } from 'lucide-react';
import {
  APP_THEMES,
  AUTH_LAYOUTS,
  HOME_LAYOUTS,
  useTheme,
} from '../contexts/ThemeContext';
import { tr } from '../i18n/translations';
import type { AppThemeId, AuthLayoutId, HomeLayoutId, Language } from '../types';

export const ThemeQuickToggle: React.FC<{
  lang: Language;
  dark?: boolean;
  showHomeLayoutPicker?: boolean;
}> = ({ lang, dark = false, showHomeLayoutPicker = false }) => {
  const { themeId, themeMeta, homeLayout, setThemeId, setHomeLayout } = useTheme();
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div ref={popRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={tr(lang, 'Change Theme & Design', 'تھیم اور ڈیزائن تبدیل کریں')}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all whitespace-nowrap min-h-[36px] ${
          dark
            ? 'bg-zinc-900/90 border-zinc-700 text-zinc-200 hover:border-[#D4A017]'
            : 'bg-white/95 border-zinc-200 text-[#0D0D10] hover:border-[#D4A017]'
        }`}
      >
        <span
          className="w-3 h-3 rounded-full border border-white/60 shrink-0 shadow-inner"
          style={{
            background: `linear-gradient(135deg, ${themeMeta.bgHex} 0%, ${themeMeta.accentHex} 100%)`,
          }}
        />
        <Palette className="w-3.5 h-3.5 text-[#D4A017]" />
        <span className="hidden sm:inline">{tr(lang, 'Theme', 'تھیم')}</span>
      </button>

      {open && (
        <div
          className={`${!themeMeta.isDark ? 'pr-preserve-light' : ''} absolute ${
            lang === 'ur' ? 'left-0' : 'right-0'
          } mt-2 w-72 sm:w-80 rounded-2xl border shadow-2xl p-3.5 z-50 space-y-3 ${
            themeMeta.isDark
              ? 'bg-[#131419] border-[#D4A017]/40 text-white'
              : 'bg-white border-zinc-200 text-[#0D0D10]'
          }`}
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-zinc-500/20">
            <span className="text-xs font-bold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#D4A017]" />
              {tr(lang, '5 Luxury Theme Models', '5 شاہانہ تھیم ماڈلز')}
            </span>
            <span className="text-[10px] font-mono text-[#D4A017]">PRO RIDER AI</span>
          </div>

          <div className="grid grid-cols-2 gap-1">
            {APP_THEMES.map((item) => {
              const active = themeId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setThemeId(item.id)}
                  className={`h-6 px-1.5 py-0.5 rounded-md border text-left transition-all flex items-center justify-between gap-1 ${
                    active
                      ? 'border-[#D4A017] bg-[#D4A017]/15'
                      : themeMeta.isDark
                      ? 'border-zinc-800 hover:border-zinc-700'
                      : 'border-zinc-200 hover:border-[#D4A017]/60'
                  }`}
                >
                  <div className="flex items-center gap-1 min-w-0">
                    <div className="flex -space-x-1 shrink-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-zinc-400/50"
                        style={{ backgroundColor: item.bgHex }}
                      />
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-white/60"
                        style={{ backgroundColor: item.accentHex }}
                      />
                    </div>
                    <span className="text-[10px] font-semibold truncate">
                      {lang === 'ur' ? item.nameUr : item.nameEn}
                    </span>
                  </div>
                  {active && <Check className="w-2.5 h-2.5 text-[#D4A017] shrink-0" />}
                </button>
              );
            })}
          </div>

          {showHomeLayoutPicker && (
            <div className="pt-2 border-t border-zinc-500/20 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#D4A017] flex items-center gap-1.5">
                <LayoutTemplate className="w-3.5 h-3.5" />
                {tr(lang, 'Home Page Layout', 'ہوم پیج ڈیزائن')}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {HOME_LAYOUTS.map((hl) => {
                  const active = homeLayout === hl.id;
                  return (
                    <button
                      key={hl.id}
                      type="button"
                      onClick={() => setHomeLayout(hl.id)}
                      className={`px-2.5 py-2 rounded-lg border text-[11px] font-semibold text-center transition-colors ${
                        active
                          ? 'bg-[#D4A017] text-[#0D0D10] border-[#D4A017] font-bold'
                          : themeMeta.isDark
                          ? 'border-zinc-800 text-zinc-300 hover:border-zinc-600'
                          : 'border-zinc-200 text-zinc-700 hover:border-zinc-400'
                      }`}
                    >
                      {lang === 'ur' ? hl.nameUr : hl.nameEn}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export interface ProfileCardTemplateOption {
  id: string;
  labelEn: string;
  labelUr: string;
}

export const ProfileThemeRowButton: React.FC<{
  lang: Language;
  className?: string;
  align?: 'left' | 'right';
  dark?: boolean;
  headerCompact?: boolean;
  pillStyle?: boolean;
  cardTemplates?: ProfileCardTemplateOption[];
  activeCardTemplateId?: string;
  onSelectCardTemplate?: (id: string) => void;
}> = ({
  lang,
  className = '',
  align = 'right',
  dark = false,
  headerCompact = false,
  pillStyle = false,
  cardTemplates,
  activeCardTemplateId,
  onSelectCardTemplate,
}) => {
  const { themeId, themeMeta, setThemeId, resetToAdminDefault, hasLocalOverride } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const popoverAlignClass =
    align === 'left'
      ? lang === 'ur'
        ? 'right-2 sm:right-0 sm:left-auto'
        : 'left-2 sm:left-0 sm:right-auto'
      : lang === 'ur'
      ? 'left-2 sm:left-0 sm:right-auto'
      : 'right-2 sm:right-0 sm:left-auto';

  const triggerClass = pillStyle
    ? `h-7 w-full px-1.5 rounded-full border border-[#D4A017]/80 bg-white hover:bg-amber-50/50 text-[#0D0D10] flex items-center justify-center gap-1 text-[10px] font-extrabold shadow-2xs transition-all min-w-0 ${
        menuOpen ? 'ring-1 ring-[#D4A017]' : ''
      }`
    : headerCompact
    ? `pr-preserve-light h-7 sm:h-8 px-2 py-0.5 rounded-lg border text-[10.5px] font-bold inline-flex items-center gap-1 transition-all whitespace-nowrap ${
        dark
          ? 'bg-zinc-900 border-zinc-700 text-[#F4C430] hover:border-[#D4A017]'
          : 'bg-zinc-100 border-zinc-200 text-[#0D0D10] hover:border-[#D4A017]'
      } ${menuOpen ? 'border-[#D4A017] ring-1 ring-[#D4A017]/50' : ''}`
    : `h-8 px-2.5 py-1 rounded-lg border border-zinc-200 bg-white hover:border-[#D4A017] text-[#0D0D10] inline-flex items-center gap-1.5 text-[11px] font-bold shadow-2xs transition-all whitespace-nowrap ${
        menuOpen ? 'border-[#D4A017] ring-1 ring-[#D4A017]/50' : ''
      }`;

  return (
    <div ref={containerRef} className={`relative ${pillStyle ? 'min-w-0' : 'inline-block shrink-0'} ${className}`}>
      <button
        type="button"
        onClick={() => setMenuOpen((prev) => !prev)}
        aria-expanded={menuOpen}
        aria-label={tr(lang, 'Themes & Appearance', 'تھیمز اور رنگ')}
        title={tr(lang, 'Themes & Appearance', 'تھیمز اور رنگ')}
        className={triggerClass}
      >
        <span
          className="w-2.5 h-2.5 rounded-full border border-zinc-400/60 shrink-0"
          style={{
            background: `linear-gradient(135deg, ${themeMeta.bgHex} 0%, ${themeMeta.accentHex} 100%)`,
          }}
        />
        <Palette className={`w-3 h-3 shrink-0 ${dark && headerCompact && !pillStyle ? 'text-[#F4C430]' : 'text-[#B8860B]'}`} />
        <span className={headerCompact && !pillStyle ? 'hidden sm:inline' : 'truncate'}>
          {tr(lang, 'Themes', 'تھیمز')}
        </span>
        {!pillStyle && (
          <ChevronRight
            className={`w-2.5 h-2.5 opacity-60 transition-transform shrink-0 ${
              menuOpen ? 'rotate-90' : lang === 'ur' ? 'rotate-180' : ''
            }`}
          />
        )}
      </button>

      {menuOpen && (
        <div
          className={`pr-preserve-light fixed left-1/2 -translate-x-1/2 ${
            pillStyle ? 'top-24' : 'top-12'
          } sm:translate-x-0 sm:top-full sm:mt-1.5 sm:absolute ${popoverAlignClass} w-52 sm:w-56 rounded-xl border border-zinc-200 bg-white shadow-xl p-2 z-50 space-y-1.5 animate-in fade-in zoom-in-95`}
        >
          <div className="flex items-center justify-between gap-1 px-0.5 pb-1 border-b border-zinc-100">
            <span className="text-[10px] font-bold text-[#0D0D10] flex items-center gap-1">
              <Palette className="w-2.5 h-2.5 text-[#D4A017]" />
              {tr(lang, 'Themes', 'تھیمز')}
            </span>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Close themes menu"
              className="p-0.5 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1">
            {APP_THEMES.map((item) => {
              const selected = themeId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setThemeId(item.id);
                    setMenuOpen(false);
                  }}
                  className={`h-6 px-1.5 py-0.5 rounded-md border text-left transition-all flex items-center justify-between gap-1 ${
                    selected
                      ? 'border-[#D4A017] bg-[#D4A017]/15 ring-1 ring-[#D4A017]/60'
                      : 'border-zinc-200 hover:border-zinc-400 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-1 min-w-0">
                    <div className="flex -space-x-1 shrink-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-zinc-400/50"
                        style={{ backgroundColor: item.bgHex }}
                      />
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-white/60 shadow-2xs"
                        style={{ backgroundColor: item.accentHex }}
                      />
                    </div>
                    <span className="text-[9.5px] font-bold text-[#0D0D10] truncate">
                      {lang === 'ur' ? item.nameUr : item.nameEn}
                    </span>
                  </div>
                  {selected && (
                    <Check className="w-2.5 h-2.5 text-[#9E730B] stroke-[3] shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {cardTemplates && cardTemplates.length > 0 && onSelectCardTemplate && (
            <div className="pt-1 border-t border-zinc-100 space-y-1">
              <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 px-0.5">
                {tr(lang, 'Card Style', 'کارڈ اسٹائل')}
              </div>
              <div className="grid grid-cols-3 gap-1">
                {cardTemplates.map((tpl) => {
                  const selected = tpl.id === activeCardTemplateId;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => onSelectCardTemplate(tpl.id)}
                      className={`h-6 px-1.5 rounded-md border text-[9.5px] font-bold flex items-center justify-center gap-0.5 truncate transition-colors ${
                        selected
                          ? 'border-[#D4A017] bg-[#0D0D10] text-[#F4C430]'
                          : 'border-zinc-200 bg-zinc-50 text-[#0D0D10] hover:bg-zinc-100'
                      }`}
                    >
                      {selected && <Check className="w-2.5 h-2.5 shrink-0" />}
                      <span className="truncate">{lang === 'ur' ? tpl.labelUr : tpl.labelEn}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {hasLocalOverride && (
            <div className="pt-1 border-t border-zinc-100 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  resetToAdminDefault();
                  setMenuOpen(false);
                }}
                className="h-5 inline-flex items-center gap-1 px-1.5 rounded border border-zinc-200 text-[9.5px] font-semibold text-zinc-600 hover:border-[#D4A017]"
              >
                <RefreshCw className="w-2.5 h-2.5 text-[#D4A017]" />
                {tr(lang, 'Admin Default', 'طے شدہ تھیم')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface ThemePreferencesPanelProps {
  lang: Language;
  isAdminStudio?: boolean;
  onAdminApplyGlobal?: (payload: {
    themeId: AppThemeId;
    homeLayout: HomeLayoutId;
    authLayout: AuthLayoutId;
    forceGlobal: boolean;
  }) => Promise<void>;
}

export const ThemePreferencesPanel: React.FC<ThemePreferencesPanelProps> = ({
  lang,
  isAdminStudio = false,
  onAdminApplyGlobal,
}) => {
  const {
    themeId,
    homeLayout,
    authLayout,
    hasLocalOverride,
    adminDefaultConfig,
    setThemeId,
    setHomeLayout,
    setAuthLayout,
    resetToAdminDefault,
  } = useTheme();

  const [draftTheme, setDraftTheme] = useState<AppThemeId>(adminDefaultConfig.themeId || themeId);
  const [draftHome, setDraftHome] = useState<HomeLayoutId>(adminDefaultConfig.homeLayout || homeLayout);
  const [draftAuth, setDraftAuth] = useState<AuthLayoutId>(adminDefaultConfig.authLayout || authLayout);
  const [forceGlobal, setForceGlobal] = useState<boolean>(adminDefaultConfig.forceGlobal);
  const [saving, setSaving] = useState(false);

  const activeTheme = isAdminStudio ? draftTheme : themeId;
  const activeHome = isAdminStudio ? draftHome : homeLayout;
  const activeAuth = isAdminStudio ? draftAuth : authLayout;

  const pickTheme = (id: AppThemeId) => {
    setThemeId(id);
    if (isAdminStudio) setDraftTheme(id);
  };

  const pickHome = (id: HomeLayoutId) => {
    setHomeLayout(id);
    if (isAdminStudio) setDraftHome(id);
  };

  const pickAuth = (id: AuthLayoutId) => {
    setAuthLayout(id);
    if (isAdminStudio) setDraftAuth(id);
  };

  const handleGlobalSave = async () => {
    if (!onAdminApplyGlobal) return;
    setSaving(true);
    try {
      await onAdminApplyGlobal({
        themeId: draftTheme,
        homeLayout: draftHome,
        authLayout: draftAuth,
        forceGlobal,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold flex items-center gap-2">
            <Palette className="w-5 h-5 text-[#D4A017]" />
            {isAdminStudio
              ? tr(lang, 'Global App Theme & Layout Studio', 'گلوبل ایپ تھیم اور ڈیزائن اسٹوڈیو')
              : tr(lang, 'Personal App Color Theme', 'ایپ کا ذاتی کلر تھیم')}
          </h3>
          <p className="text-xs text-zinc-500 mt-1">
            {isAdminStudio
              ? tr(
                  lang,
                  'Select a luxury theme, home page layout, and login card style to apply across the entire PRO RIDER AI platform.',
                  'یہاں سے منتخب کردہ تھیم، ہوم پیج ڈیزائن اور لاگ ان اسٹائل پوری ایپلیکیشن پر لاگو ہو جائے گا۔'
                )
              : tr(
                  lang,
                  'Choose a personal color theme for your dashboard. Front home page & login layouts are controlled by Admin.',
                  'اپنے ڈیش بورڈ کے لیے ذاتی کلر تھیم منتخب کریں۔ مین فرنٹ پیج اور لاگ ان ڈیزائن صرف ایڈمن پینل سے تبدیل ہوتے ہیں۔'
                )}
          </p>
        </div>
        {!isAdminStudio && hasLocalOverride && (
          <button
            type="button"
            onClick={resetToAdminDefault}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 text-xs font-semibold hover:border-[#D4A017]"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#D4A017]" />
            {tr(lang, 'Use Admin Default', 'ایڈمن کی طے شدہ تھیم لگائیں')}
          </button>
        )}
      </div>

      {/* 1. 5 Color Theme Models */}
      <div className="space-y-2">
        <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#D4A017]" />
          {tr(lang, '1. Select Theme Palette (5 Luxury Models)', '1. تھیم کلر ماڈل منتخب کریں (5 شاہانہ ماڈلز)')}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
          {APP_THEMES.map((item) => {
            const selected = activeTheme === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => pickTheme(item.id)}
                className={`h-7 px-2 py-1 rounded-lg border text-left transition-all flex items-center justify-between gap-1.5 ${
                  selected
                    ? 'border-[#D4A017] bg-[#D4A017]/10 ring-1 ring-[#D4A017]'
                    : 'border-zinc-200 hover:border-zinc-400 bg-white'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="flex -space-x-1 shrink-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-zinc-400/50"
                      style={{ backgroundColor: item.bgHex }}
                    />
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-white/60 shadow-2xs"
                      style={{ backgroundColor: item.accentHex }}
                    />
                  </div>
                  <div className="text-[11px] font-bold text-[#0D0D10] truncate">
                    {lang === 'ur' ? item.nameUr : item.nameEn}
                  </div>
                </div>
                {selected && (
                  <Check className="w-3 h-3 text-[#9E730B] stroke-[3] shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Home Page Design Selector (Super Admin Exclusive) */}
      {isAdminStudio && (
        <div className="space-y-3 pt-2 border-t border-zinc-200">
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
            <LayoutTemplate className="w-3.5 h-3.5 text-[#D4A017]" />
            {tr(lang, '2. Front Home Page Design (Admin Only)', '2. فرنٹ ہوم پیج ڈیزائن منتخب کریں (صرف ایڈمن)')}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {HOME_LAYOUTS.map((hl) => {
              const selected = activeHome === hl.id;
              return (
                <button
                  key={hl.id}
                  type="button"
                  onClick={() => pickHome(hl.id)}
                  className={`p-3.5 rounded-2xl border-2 text-left transition-all space-y-2 ${
                    selected ? 'border-[#D4A017] bg-[#D4A017]/10' : 'border-zinc-200 hover:border-[#D4A017]/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{lang === 'ur' ? hl.nameUr : hl.nameEn}</span>
                    {selected && <Check className="w-4 h-4 text-[#D4A017]" />}
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-snug">
                    {lang === 'ur' ? hl.descUr : hl.descEn}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Sign-In & Auth Card Style Selector (Super Admin Exclusive) */}
      {isAdminStudio && (
        <div className="space-y-3 pt-2 border-t border-zinc-200">
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5 text-[#D4A017]" />
            {tr(lang, '3. Sign-In & Registration Sheet Style (Admin Only)', '3. سائن ان اور لاگ ان کارڈ اسٹائل (صرف ایڈمن)')}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {AUTH_LAYOUTS.map((al) => {
              const selected = activeAuth === al.id;
              return (
                <button
                  key={al.id}
                  type="button"
                  onClick={() => pickAuth(al.id)}
                  className={`p-3.5 rounded-2xl border-2 text-left transition-all space-y-2 ${
                    selected ? 'border-[#D4A017] bg-[#D4A017]/10' : 'border-zinc-200 hover:border-[#D4A017]/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{lang === 'ur' ? al.nameUr : al.nameEn}</span>
                    {selected && <Check className="w-4 h-4 text-[#D4A017]" />}
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-snug">
                    {lang === 'ur' ? al.descUr : al.descEn}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Admin Global Sync Action Bar */}
      {isAdminStudio && onAdminApplyGlobal && (
        <div className="pt-4 border-t border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <label className="flex items-center gap-2.5 text-xs font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={forceGlobal}
              onChange={(e) => setForceGlobal(e.target.checked)}
              className="accent-[#D4A017] w-4 h-4"
            />
            <span>
              {tr(
                lang,
                'Apply & Sync across ALL Passengers, Pro Partners & Front Website immediately',
                'پوری ایپلیکیشن (مسافر، ڈرائیور اور فرنٹ ویب سائٹ) پر فوری طور پر لاگو کریں'
              )}
            </span>
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={handleGlobalSave}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold hover:bg-[#EAB308] min-h-[44px] shrink-0"
          >
            <ShieldCheck className="w-4 h-4" />
            {saving
              ? tr(lang, 'Applying Theme...', 'تھیم لاگو ہو رہی ہے...')
              : tr(lang, 'Save & Apply to Entire App', 'تھیم محفوظ کریں اور پوری ایپ پر لاگو کریں')}
          </button>
        </div>
      )}
    </div>
  );
};
