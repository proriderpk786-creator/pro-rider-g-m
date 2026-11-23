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
          className={`pr-preserve-light absolute ${
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

          <div className="space-y-1.5">
            {APP_THEMES.map((item) => {
              const active = themeId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setThemeId(item.id)}
                  className={`w-full flex items-center justify-between gap-2.5 p-2 rounded-xl border text-left transition-all ${
                    active
                      ? 'border-[#D4A017] bg-[#D4A017]/15'
                      : themeMeta.isDark
                      ? 'border-zinc-800 hover:border-zinc-700'
                      : 'border-zinc-200 hover:border-[#D4A017]/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex -space-x-1.5 shrink-0">
                      <span
                        className="w-5 h-5 rounded-full border border-zinc-400/50"
                        style={{ backgroundColor: item.bgHex }}
                      />
                      <span
                        className="w-5 h-5 rounded-full border border-white/60"
                        style={{ backgroundColor: item.accentHex }}
                      />
                    </div>
                    <span className="text-xs font-semibold truncate">
                      {lang === 'ur' ? item.nameUr : item.nameEn}
                    </span>
                  </div>
                  {active && <Check className="w-4 h-4 text-[#D4A017] shrink-0" />}
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

export const ProfileThemeRowButton: React.FC<{
  lang: Language;
  className?: string;
}> = ({ lang, className = '' }) => {
  const { themeId, themeMeta, setThemeId, resetToAdminDefault, hasLocalOverride } = useTheme();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={`rounded-2xl border border-zinc-200 bg-white hover:border-[#D4A017] p-4 flex items-center justify-between gap-3 text-start transition-colors min-h-[64px] shadow-xs ${className}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-[#B8860B] flex items-center justify-center shrink-0">
            <Palette className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="font-display font-bold text-sm text-[#0D0D10]">
              {tr(lang, 'App Theme & Appearance', 'ایپ تھیم اور رنگ')}
            </div>
            <p className="text-[11px] text-zinc-500 truncate flex items-center gap-1.5 mt-0.5">
              <span
                className="w-2.5 h-2.5 rounded-full border border-zinc-300 shrink-0"
                style={{ backgroundColor: themeMeta.accentHex }}
              />
              <span className="font-semibold text-zinc-700">
                {lang === 'ur' ? themeMeta.nameUr : themeMeta.nameEn}
              </span>
              <span className="text-zinc-400">· {tr(lang, 'Tap to change', 'تبدیل کریں')}</span>
            </p>
          </div>
        </div>
        <ChevronRight className={`w-4 h-4 text-zinc-400 shrink-0 ${lang === 'ur' ? 'rotate-180' : ''}`} />
      </button>

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl border border-zinc-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-5 py-4 bg-[#0D0D10] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-[#D4A017]" />
                <h3 className="font-display font-bold text-sm">
                  {tr(lang, 'Select App Theme', 'ایپ تھیم منتخب کریں')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-2">
              <p className="text-[11px] text-zinc-500 pb-1">
                {tr(
                  lang,
                  'Choose your personal color theme. Compact 50% design:',
                  'ذاتی کلر تھیم منتخب کریں۔ کمپیکٹ بٹن ڈیزائن:'
                )}
              </p>

              <div className="space-y-1.5">
                {APP_THEMES.map((item) => {
                  const selected = themeId === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setThemeId(item.id)}
                      className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-center justify-between gap-3 min-h-[46px] ${
                        selected
                          ? 'border-[#D4A017] bg-[#D4A017]/10 ring-1 ring-[#D4A017]'
                          : 'border-zinc-200 hover:border-zinc-400 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex -space-x-1.5 shrink-0">
                          <span
                            className="w-5 h-5 rounded-full border border-zinc-400/50"
                            style={{ backgroundColor: item.bgHex }}
                          />
                          <span
                            className="w-5 h-5 rounded-full border border-white/60 shadow-xs"
                            style={{ backgroundColor: item.accentHex }}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-[#0D0D10] truncate">
                            {lang === 'ur' ? item.nameUr : item.nameEn}
                          </div>
                        </div>
                      </div>
                      {selected ? (
                        <span className="w-4 h-4 rounded-full bg-[#D4A017] text-[#0D0D10] flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </span>
                      ) : (
                        <span className="w-4 h-4 rounded-full border border-zinc-300 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {hasLocalOverride && (
                <div className="pt-2 border-t border-zinc-100 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      resetToAdminDefault();
                      setModalOpen(false);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-semibold text-zinc-600 hover:border-[#D4A017]"
                  >
                    <RefreshCw className="w-3 h-3 text-[#D4A017]" />
                    {tr(lang, 'Reset to Admin Default', 'ایڈمن کی طے شدہ تھیم')}
                  </button>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="w-full py-2 rounded-xl bg-[#0D0D10] text-[#F4C430] text-xs font-bold hover:bg-zinc-800"
                >
                  {tr(lang, 'Done', 'مکمل')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
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
      <div className="space-y-3">
        <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#D4A017]" />
          {tr(lang, '1. Select Theme Palette (5 Luxury Models)', '1. تھیم کلر ماڈل منتخب کریں (5 شاہانہ ماڈلز)')}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {APP_THEMES.map((item) => {
            const selected = activeTheme === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => pickTheme(item.id)}
                className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between gap-2.5 min-h-[50px] ${
                  selected
                    ? 'border-[#D4A017] bg-[#D4A017]/10 ring-1 ring-[#D4A017]'
                    : 'border-zinc-200 hover:border-zinc-400 bg-white'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex -space-x-1.5 shrink-0">
                    <span
                      className="w-5 h-5 rounded-full border border-zinc-400/50"
                      style={{ backgroundColor: item.bgHex }}
                    />
                    <span
                      className="w-5 h-5 rounded-full border border-white/60 shadow-xs"
                      style={{ backgroundColor: item.accentHex }}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#0D0D10] truncate">
                      {lang === 'ur' ? item.nameUr : item.nameEn}
                    </div>
                    <div className="text-[10px] text-zinc-500 truncate">
                      {lang === 'ur' ? item.descUr : item.descEn}
                    </div>
                  </div>
                </div>
                {selected ? (
                  <span className="w-4 h-4 rounded-full bg-[#D4A017] text-[#0D0D10] flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </span>
                ) : (
                  <span className="w-4 h-4 rounded-full border border-zinc-300 shrink-0" />
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
