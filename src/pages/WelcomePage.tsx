import React, { useState } from 'react';
import {
  ArrowRight,
  CalendarClock,
  CarFront,
  Compass,
  FileText,
  Fuel,
  Lock,
  MapPin,
  PhoneCall,
  Route,
  ShieldCheck,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import fallbackSedanHeroImg from '../assets/images/fleet_premium_1794584050155.jpg';
import heroMobilityImg from '../assets/images/hero_mobility_pakistan_1794584048013.jpg';
import sovereignPosterImg from '../assets/images/sovereign_pakistan_hero_182601.jpg';
import { BrandLogo, LanguageToggle, PWAInstallButton, ThemeModeToggle } from '../components/BrandMark';
import { useTheme } from '../contexts/ThemeContext';
import { t, tr } from '../i18n/translations';
import type { Language } from '../types';

interface WelcomePageProps {
  lang: Language;
  onChangeLang: (l: Language) => void;
  onNavigate: (path: string) => void;
}

export const WelcomePage: React.FC<WelcomePageProps> = ({ lang, onChangeLang, onNavigate }) => {
  const { homeLayout, isDark } = useTheme();
  const [heroImgStage, setHeroImgStage] = useState<'primary' | 'fallback' | 'failed'>('primary');
  const [sovereignImgStage, setSovereignImgStage] = useState<'primary' | 'fallback' | 'hero' | 'failed'>('primary');

  const ExploreWebsiteBanner = (
    <button
      type="button"
      onClick={() => onNavigate('/website')}
      className="pr-preserve-light pr-no-recolor group w-full text-start rounded-2xl bg-gradient-to-r from-[#141418] via-[#0D0D10] to-[#231B08] text-white p-4 sm:p-5 border-2 border-[#D4A017] shadow-lg hover:shadow-xl hover:border-[#F4C430] transition-all flex items-center justify-between gap-3.5 min-h-[76px]"
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-[#F4C430] to-[#B8860B] text-[#0D0D10] flex items-center justify-center shrink-0 shadow-inner">
          <Compass className="w-5 h-5 sm:w-6 sm:h-6" />
        </div>
        <div className="min-w-0">
          <div className="font-display text-base sm:text-lg font-bold tracking-tight text-[#F4C430] leading-snug">
            {t(lang, 'exploreWebsite')}
          </div>
          <p className="text-xs sm:text-sm text-zinc-200 mt-0.5 leading-snug">
            {tr(
              lang,
              'Explore fleet tariffs, monthly packages & book directly inside the official website',
              'گاڑیوں کے ریٹس، ماہانہ پیکیجز دیکھیں اور ویب سائٹ کے اندر سے ہی فوراً بکنگ کریں'
            )}
          </p>
        </div>
      </div>
      <ArrowRight
        className={`w-5 h-5 text-[#F4C430] shrink-0 transition-transform ${
          lang === 'ur' ? 'rotate-180 group-hover:-translate-x-1' : 'group-hover:translate-x-1'
        }`}
      />
    </button>
  );

  const TopBar = (
    <header
      className={`w-full border-b backdrop-blur sticky top-0 z-30 transition-colors ${
        isDark
          ? 'border-[#D4A017]/30 bg-[#0D0D10]/95 text-white'
          : 'border-zinc-200/80 bg-white/95 text-[#0D0D10]'
      }`}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-3">
        <BrandLogo compact lang={lang} dark={isDark} />
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <ThemeModeToggle lang={lang} dark={isDark} />
          <LanguageToggle lang={lang} onChange={onChangeLang} dark={isDark} />
          <PWAInstallButton lang={lang} dark={isDark} />
        </div>
      </div>
    </header>
  );

  const FooterBar = (
    <footer
      className={`border-t py-4 px-4 sm:px-6 lg:px-8 transition-colors ${
        isDark
          ? 'border-[#D4A017]/25 bg-[#0A0A0D] text-zinc-300'
          : 'border-zinc-200 bg-[#F8F8FA] text-zinc-700'
      }`}
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-semibold">
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => onNavigate('/website')}
            className={`font-bold underline underline-offset-4 ${
              isDark ? 'text-[#F4C430] hover:text-white' : 'text-[#0D0D10] hover:text-[#B8860B]'
            }`}
          >
            {t(lang, 'exploreWebsite')}
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => onNavigate('/about')}
            className={`font-bold ${isDark ? 'text-white hover:text-[#F4C430]' : 'text-[#0D0D10] hover:text-[#B8860B]'}`}
          >
            {tr(lang, 'About Us', 'ہمارے بارے میں')}
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => onNavigate('/privacy')}
            className={`font-bold ${isDark ? 'text-white hover:text-[#F4C430]' : 'text-[#0D0D10] hover:text-[#B8860B]'}`}
          >
            {tr(lang, 'Privacy & Policy', 'پرائیویسی اور پالیسی')}
          </button>
          <span aria-hidden="true">·</span>
          <span>{tr(lang, 'PKR (Rs.)', 'روپے (PKR)')}</span>
        </div>
        <div className="flex items-center gap-3">
          <span>{t(lang, 'needHelp')}:</span>
          <a
            href="https://wa.me/923125007782"
            target="_blank"
            rel="noreferrer"
            className={`inline-flex items-center gap-1.5 font-mono font-bold ${
              isDark ? 'text-[#F4C430] hover:text-white' : 'text-[#0D0D10] hover:text-[#B8860B]'
            }`}
          >
            <PhoneCall className="w-3.5 h-3.5 text-[#D4A017]" />
            03125007782
          </a>
        </div>
      </div>
    </footer>
  );

  const HeroImageBox = (extraClass = '') => (
    <div
      className={`hero-image-container relative w-full min-h-[215px] sm:min-h-[300px] aspect-[16/9] rounded-2xl sm:rounded-3xl overflow-hidden border border-zinc-200 bg-gradient-to-br from-[#16171C] to-[#0D0D10] shadow-xl flex items-center justify-center ${extraClass}`}
    >
      {heroImgStage !== 'failed' ? (
        <img
          src={heroImgStage === 'primary' ? heroMobilityImg : fallbackSedanHeroImg}
          alt={tr(lang, 'PRO RIDER AI executive sedan in Islamabad', 'پرو رائیڈر اے آئی ایگزیکٹو سیڈان اسلام آباد')}
          onError={() => {
            setHeroImgStage((prev) => (prev === 'primary' ? 'fallback' : 'failed'));
          }}
          className="hero-image-cover absolute inset-0 w-full h-full object-cover object-center"
          loading="eager"
          decoding="async"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#18181B] via-[#0D0D10] to-[#1F1A0C] p-6">
          <CarFront className="w-16 h-16 text-[#D4A017]/60" />
        </div>
      )}
      <div className="pr-preserve-light absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex items-end justify-between gap-2 p-4 sm:p-6 pointer-events-none">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/65 border border-[#D4A017]/50 text-[11px] sm:text-xs font-semibold !text-[#F4C430] backdrop-blur-xs">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          {tr(lang, 'Islamabad · Rawalpindi · Lahore · Karachi', 'اسلام آباد · راولپنڈی · لاہور · کراچی')}
        </span>
      </div>
    </div>
  );

  // SOVEREIGN PAKISTAN POSTER LAYOUT (Exact match to reference image without duplicate HTML text/headers)
  if (homeLayout === 'sovereign') {
    const sovereignSrc =
      sovereignImgStage === 'primary'
        ? sovereignPosterImg
        : sovereignImgStage === 'fallback'
        ? '/assets/aistudio/Meta_AI_925947838_917402431363083_8268209735092311524_n_20261122_182601_f4b79422.webp'
        : heroMobilityImg;

    return (
      <div
        dir={lang === 'ur' ? 'rtl' : 'ltr'}
        className={`min-h-screen flex flex-col items-center justify-center relative overflow-x-hidden selection:bg-[#F4C430] selection:text-black py-2.5 sm:py-6 px-2 sm:px-4 transition-colors ${
          isDark ? 'bg-[#070709] text-white' : 'bg-[#F8F8FA] text-[#0D0D10]'
        }`}
      >
        {/* Floating Language & Theme Switcher (above poster on mobile so it never covers headline) */}
        <div className="w-full max-w-[460px] flex justify-end mb-2 sm:mb-0 sm:w-auto sm:fixed sm:top-5 sm:right-5 z-40">
          <div
            className={`inline-flex items-center gap-1.5 sm:gap-2 backdrop-blur-md px-2.5 py-1.5 rounded-full border shadow-xl ${
              isDark
                ? 'bg-black/85 border-[#D4A017]/40'
                : 'bg-white/95 border-zinc-200'
            }`}
          >
            <ThemeModeToggle dark={isDark} lang={lang} />
            <LanguageToggle lang={lang} onChange={onChangeLang} dark={isDark} />
            <PWAInstallButton lang={lang} dark={isDark} />
          </div>
        </div>

        {/* The Exact Pure Sovereign Poster with Hotspot Interactive Buttons */}
        <main className="w-full flex-1 flex items-center justify-center">
          <div className="relative w-full max-w-[460px] sm:max-w-[490px] aspect-[1072/2384] shrink-0 mx-auto select-none rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl border-2 border-[#D4A017]/60 bg-black">
            {sovereignImgStage !== 'failed' ? (
              <img
                src={sovereignSrc}
                alt="PRO RIDER AI — Your Ride, Your Partner, Your Pakistan"
                onError={() => {
                  setSovereignImgStage((prev) =>
                    prev === 'primary' ? 'fallback' : prev === 'fallback' ? 'hero' : 'failed'
                  );
                }}
                className="absolute inset-0 w-full h-full object-cover object-center block pointer-events-none z-0"
                loading="eager"
                decoding="async"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#14110A] via-[#070709] to-[#120E05] p-6 text-center gap-3">
                <CarFront className="w-16 h-16 text-[#F4C430]" />
                <p className="font-display text-2xl font-bold text-[#F4C430]">PRO RIDER AI</p>
                <p className="text-xs text-zinc-300">{t(lang, 'welcomeSub')}</p>
              </div>
            )}

            {/* Interactive Functional Buttons directly over image buttons */}

            {/* 1. Pick & Drop */}
            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem('pr_initial_service', 'pick_and_drop');
                sessionStorage.setItem('pr_initial_mode', 'schedule');
                onNavigate('/passenger');
              }}
              title={t(lang, 'pickAndDrop')}
              aria-label={t(lang, 'pickAndDrop')}
              className="absolute z-10 rounded-2xl cursor-pointer transition-all hover:bg-[#F4C430]/15 hover:ring-2 hover:ring-[#F4C430]/80 active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#F4C430]"
              style={{ left: '4.48%', top: '63.25%', width: '29.10%', height: '11.83%' }}
            />

            {/* 2. Ride Sharing */}
            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem('pr_initial_service', 'ride_sharing');
                sessionStorage.setItem('pr_initial_mode', 'schedule');
                onNavigate('/passenger');
              }}
              title={t(lang, 'rideSharing')}
              aria-label={t(lang, 'rideSharing')}
              className="absolute z-10 rounded-2xl cursor-pointer transition-all hover:bg-[#F4C430]/15 hover:ring-2 hover:ring-[#F4C430]/80 active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#F4C430]"
              style={{ left: '37.13%', top: '63.25%', width: '29.10%', height: '11.83%' }}
            />

            {/* 3. Fuel Sharing */}
            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem('pr_initial_service', 'fuel_sharing');
                sessionStorage.setItem('pr_initial_mode', 'schedule');
                onNavigate('/passenger');
              }}
              title={t(lang, 'fuelSharing')}
              aria-label={t(lang, 'fuelSharing')}
              className="absolute z-10 rounded-2xl cursor-pointer transition-all hover:bg-[#F4C430]/15 hover:ring-2 hover:ring-[#F4C430]/80 active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#F4C430]"
              style={{ left: '66.60%', top: '63.25%', width: '28.92%', height: '11.83%' }}
            />

            {/* 4. AS A PASSENGER -> (Opens Passenger home with 4 services including Instant Booking) */}
            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem('pr_initial_service');
                sessionStorage.removeItem('pr_initial_mode');
                onNavigate('/passenger');
              }}
              title={t(lang, 'asPassenger')}
              aria-label={t(lang, 'asPassenger')}
              className="absolute z-10 rounded-2xl cursor-pointer transition-all hover:bg-[#F4C430]/20 hover:ring-2 hover:ring-[#F4C430] active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#F4C430]"
              style={{ left: '4.20%', top: '79.87%', width: '44.31%', height: '6.54%' }}
            />

            {/* 5. AS A DRIVER PRO PARTNER -> */}
            <button
              type="button"
              onClick={() => onNavigate('/partner')}
              title={t(lang, 'asPartner')}
              aria-label={t(lang, 'asPartner')}
              className="absolute z-10 rounded-2xl cursor-pointer transition-all hover:bg-[#F4C430]/20 hover:ring-2 hover:ring-[#F4C430] active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#F4C430]"
              style={{ left: '51.12%', top: '79.87%', width: '44.40%', height: '6.54%' }}
            />

            {/* 6. Visit Website */}
            <button
              type="button"
              onClick={() => onNavigate('/website')}
              title={tr(lang, 'Visit Website', 'ویب سائٹ دیکھیں')}
              aria-label={tr(lang, 'Visit Website', 'ویب سائٹ دیکھیں')}
              className="absolute z-10 rounded-full cursor-pointer transition-all hover:bg-[#F4C430]/20 hover:ring-2 hover:ring-[#F4C430] active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#F4C430]"
              style={{ left: '30.78%', top: '88.25%', width: '38.25%', height: '4.36%' }}
            />

            {/* 7. WhatsApp 03125007782 */}
            <a
              href="https://wa.me/923125007782"
              target="_blank"
              rel="noreferrer"
              title="WhatsApp: 03125007782"
              aria-label="WhatsApp: 03125007782"
              className="absolute z-10 rounded-full cursor-pointer transition-all hover:bg-emerald-500/25 hover:ring-2 hover:ring-emerald-400 active:scale-95 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              style={{ left: '20.52%', top: '94.80%', width: '58.77%', height: '3.15%' }}
            />
          </div>
        </main>

        <div
          className={`mt-3 flex flex-wrap items-center justify-center gap-4 text-xs font-bold ${
            isDark ? 'text-zinc-300' : 'text-[#0D0D10]'
          }`}
        >
          <button
            type="button"
            onClick={() => onNavigate('/website')}
            className="hover:text-[#D4A017] transition-colors"
          >
            {tr(lang, 'Explore Website', 'ویب سائٹ دیکھیں')}
          </button>
          <span className="text-zinc-500" aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => onNavigate('/about')}
            className="hover:text-[#D4A017] transition-colors"
          >
            {tr(lang, 'About Us', 'ہمارے بارے میں')}
          </button>
          <span className="text-zinc-500" aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => onNavigate('/privacy')}
            className="hover:text-[#D4A017] transition-colors"
          >
            {tr(lang, 'Privacy & Policy', 'پرائیویسی اور پالیسی')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      dir={lang === 'ur' ? 'rtl' : 'ltr'}
      className={`min-h-screen flex flex-col overflow-x-clip transition-colors ${
        isDark ? 'bg-[#09090C] text-white' : 'bg-[#F8F8FA] text-[#0D0D10]'
      }`}
    >
      {TopBar}

      {/* 1. CLASSIC SPLIT HERO (Original Preserved Design + Full Theme & i18n Support) */}
      {homeLayout === 'classic' && (
        <main className="flex-1 flex items-center">
          <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-5 sm:py-8 lg:py-12 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-stretch">
            <div className="order-2 lg:order-1 lg:col-span-6 flex flex-col justify-center space-y-5 sm:space-y-7">
              <div className="space-y-2 sm:space-y-3">
                <p className={`text-[11px] sm:text-xs font-extrabold tracking-widest uppercase ${isDark ? 'text-[#F4C430]' : 'text-[#9A6E08]'}`}>
                  {t(lang, 'welcomeSub')}
                </p>
                <h1
                  className={`font-display text-3xl sm:text-5xl font-extrabold tracking-tight [text-wrap:balance] ${
                    isDark ? 'text-white' : 'text-[#0D0D10]'
                  } ${lang === 'ur' ? 'leading-[1.6]' : 'leading-[1.15]'}`}
                >
                  {t(lang, 'welcomeHeading')}
                </h1>
                <p className={`text-sm sm:text-base leading-relaxed max-w-xl ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                  {t(lang, 'welcomeDesc')}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:gap-3.5 pt-1">
                {ExploreWebsiteBanner}

                <button
                  type="button"
                  onClick={() => onNavigate('/passenger')}
                  className={`pr-no-recolor group w-full text-left rounded-2xl p-4 sm:p-5 border transition-all shadow-sm hover:shadow-md flex items-center justify-between gap-4 min-h-[80px] ${
                    isDark
                      ? 'bg-[#171820] text-white border-[#D4A017]/60 hover:border-[#F4C430]'
                      : 'bg-[#0D0D10] text-white border-[#0D0D10] hover:border-[#D4A017]'
                  }`}
                >
                  <div className="flex items-start gap-3.5 sm:gap-4 min-w-0">
                    <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-[#D4A017] text-[#0D0D10] flex items-center justify-center shrink-0">
                      <UserCheck className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <div className="min-w-0 text-start">
                      <div className="font-display text-base sm:text-xl font-bold tracking-tight text-white">
                        {t(lang, 'asPassenger')}
                      </div>
                      <p className="text-xs sm:text-sm text-zinc-200 mt-1 leading-snug">
                        {t(lang, 'asPassengerSub')}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className={`w-5 h-5 text-[#D4A017] shrink-0 transition-transform ${lang === 'ur' ? 'rotate-180 group-hover:-translate-x-1' : 'group-hover:translate-x-1'}`} />
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate('/partner')}
                  className={`pr-no-recolor group w-full text-left rounded-2xl p-5 sm:p-6 border-2 transition-all shadow-sm flex items-center justify-between gap-4 min-h-[84px] sm:min-h-[96px] ${
                    isDark
                      ? 'bg-[#131419] text-white border-[#D4A017]/35 hover:border-[#D4A017]'
                      : 'bg-white text-[#0D0D10] border-zinc-200 hover:border-[#D4A017]'
                  }`}
                >
                  <div className="flex items-start gap-3.5 sm:gap-4 min-w-0">
                    <div
                      className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl border flex items-center justify-center shrink-0 transition-colors ${
                        isDark
                          ? 'bg-[#1F212B] border-[#D4A017]/40 text-[#F4C430] group-hover:bg-[#D4A017] group-hover:text-[#0D0D10]'
                          : 'bg-zinc-100 border-zinc-200 text-[#0D0D10] group-hover:bg-[#D4A017] group-hover:text-[#0D0D10]'
                      }`}
                    >
                      <CarFront className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <div className="min-w-0 text-start">
                      <div className={`font-display text-base sm:text-xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-[#0D0D10]'}`}>
                        {t(lang, 'asPartner')}
                      </div>
                      <p className={`text-xs sm:text-sm mt-1 leading-snug ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                        {t(lang, 'asPartnerSub')}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className={`w-5 h-5 text-[#D4A017] shrink-0 transition-transform ${lang === 'ur' ? 'rotate-180 group-hover:-translate-x-1' : 'group-hover:translate-x-1'}`} />
                </button>
              </div>

              <div className={`flex flex-wrap items-center gap-x-4 sm:gap-x-6 gap-y-2 pt-1 text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#D4A017]" />
                  {tr(lang, 'Strict Role-Isolated Sessions', 'محفوظ اور علیحدہ مسافر/ڈرائیور سیشن')}
                </span>
                <span aria-hidden="true">·</span>
                <span>{tr(lang, 'Live OpenStreetMap Routing', 'لائیو اسٹریٹ میپ روٹنگ')}</span>
                <span aria-hidden="true">·</span>
                <span>{tr(lang, 'PKR Digital Invoices', 'پاکستانی روپے ڈیجیٹل بلنگ')}</span>
              </div>
            </div>

            <div className="order-1 lg:order-2 lg:col-span-6 flex flex-col justify-center">
              {HeroImageBox('lg:aspect-[16/10] lg:h-full lg:min-h-[440px]')}
            </div>
          </div>
        </main>
      )}



      {/* 3. EDITORIAL SMART MOBILITY SHOWCASE */}
      {homeLayout === 'editorial' && (
        <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8">
          <div className="text-center space-y-3">
            <h1
              className={`font-display text-3xl sm:text-5xl font-extrabold tracking-tight [text-wrap:balance] ${
                isDark ? 'text-white' : 'text-[#0D0D10]'
              } ${lang === 'ur' ? 'leading-[1.6]' : 'leading-tight'}`}
            >
              {t(lang, 'welcomeHeading')} —{' '}
              <span className="text-[#D4A017]">{tr(lang, 'Pakistan Smart Mobility', 'پاکستان اسمارٹ موبلٹی')}</span>
            </h1>
            <div className={`flex items-center justify-center gap-3 text-xs sm:text-sm font-semibold pt-1 ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>
              <span className="h-px w-8 sm:w-16 bg-[#D4A017]/50" />
              <span>{t(lang, 'welcomeSub')}</span>
              <span className="h-px w-8 sm:w-16 bg-[#D4A017]/50" />
            </div>
          </div>

          {HeroImageBox('max-h-[360px]')}

          {ExploreWebsiteBanner}

          {/* Two Column Structured Grid: For Passengers | For Pro Partners */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div
              className={`rounded-3xl border p-6 space-y-5 shadow-sm transition-colors ${
                isDark ? 'border-[#D4A017]/30 bg-[#131419] text-white' : 'border-zinc-200 bg-white text-[#0D0D10]'
              }`}
            >
              <div className={`flex items-center gap-3 pb-3 border-b ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
                <div className="w-10 h-10 rounded-xl bg-[#D4A017] text-[#0D0D10] flex items-center justify-center shrink-0">
                  <UserCheck className="w-5 h-5" />
                </div>
                <h2 className="font-display text-xl font-bold">
                  {tr(lang, 'For Passengers', 'مسافروں کے لیے')}
                </h2>
              </div>
              <div className="space-y-3.5 text-sm">
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-[#D4A017] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">{tr(lang, 'Book Pick & Drop', 'پِک اینڈ ڈراپ بُک کریں')}</div>
                    <p className={`text-xs ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                      {tr(lang, 'Door-to-door rides on your schedule.', 'اپنے وقت پر گھر سے منزل تک محفوظ سفر۔')}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Users className="w-5 h-5 text-[#D4A017] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">{tr(lang, 'Ride Sharing', 'رائیڈ شیئرنگ')}</div>
                    <p className={`text-xs ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                      {tr(lang, 'Share the ride, split the fare, travel smarter.', 'مشترکہ سفر کریں اور کم کرائے میں بچت پائیں۔')}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Fuel className="w-5 h-5 text-[#D4A017] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">{tr(lang, 'Fuel Sharing', 'فیول شیئرنگ')}</div>
                    <p className={`text-xs ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                      {tr(lang, 'Transparent per-km fuel-cost splitting on every trip.', 'فی کلومیٹر کے حساب سے شفاف پیٹرول شیئرنگ۔')}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CalendarClock className="w-5 h-5 text-[#D4A017] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">{tr(lang, 'Monthly Packages', 'ماہانہ پیکیجز')}</div>
                    <p className={`text-xs ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                      {tr(lang, 'Affordable office & university plans.', 'دفاتر اور یونیورسٹیوں کے لیے سستے ماہانہ پلان۔')}
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('/passenger')}
                className={`pr-no-recolor w-full py-3.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 min-h-[46px] transition-colors ${
                  isDark
                    ? 'bg-[#D4A017] text-[#0D0D10] hover:bg-[#EAB308]'
                    : 'bg-[#0D0D10] text-white hover:bg-zinc-800'
                }`}
              >
                {t(lang, 'asPassenger')}
                <ArrowRight className={`w-4 h-4 ${isDark ? 'text-[#0D0D10]' : 'text-[#D4A017]'} ${lang === 'ur' ? 'rotate-180' : ''}`} />
              </button>
            </div>

            <div
              className={`rounded-3xl border p-6 space-y-5 shadow-sm transition-colors ${
                isDark ? 'border-[#D4A017]/30 bg-[#131419] text-white' : 'border-zinc-200 bg-white text-[#0D0D10]'
              }`}
            >
              <div className={`flex items-center gap-3 pb-3 border-b ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
                <div className="w-10 h-10 rounded-xl bg-[#0D0D10] text-[#D4A017] flex items-center justify-center border border-[#D4A017]/50 shrink-0">
                  <CarFront className="w-5 h-5" />
                </div>
                <h2 className="font-display text-xl font-bold">
                  {tr(lang, 'For Pro Partners', 'ڈرائیورز / پرو پارٹنرز کے لیے')}
                </h2>
              </div>
              <div className="space-y-3.5 text-sm">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-[#D4A017] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">{tr(lang, 'Verified Requests', 'تصدیق شدہ بُکنگز')}</div>
                    <p className={`text-xs ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                      {tr(lang, 'Receive live verified passenger ride & package requests.', 'تصدیق شدہ مسافروں کی لائیو درخواستیں حاصل کریں۔')}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Route className="w-5 h-5 text-[#D4A017] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">{tr(lang, 'Smart Routing & Heatmap', 'اسمارٹ روٹنگ اور ہیٹ میپ')}</div>
                    <p className={`text-xs ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                      {tr(lang, 'Live road routing and high-demand rider clusters.', 'لائیو نقشے پر زیادہ مسافروں والے علاقے دیکھیں۔')}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Wallet className="w-5 h-5 text-[#D4A017] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">{tr(lang, 'Track PKR Earnings', 'آمدنی اور والٹ ٹریکنگ')}</div>
                    <p className={`text-xs ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                      {tr(lang, 'Transparent digital PKR invoicing & fast withdrawals.', 'صاف ڈیجیٹل انوائسز اور آسان ادائیگیاں۔')}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Lock className="w-5 h-5 text-[#D4A017] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">{tr(lang, 'Privacy Profile & Showcase', 'ڈرائیور پروفائل اور پرائیویسی')}</div>
                    <p className={`text-xs ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                      {tr(lang, 'Full control over public vs admin-only photos.', 'اپنی تصاویر کی پبلک یا پرائیویٹ سیٹنگ خود کنٹرول کریں۔')}
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('/partner')}
                className="pr-no-recolor w-full py-3.5 rounded-xl bg-[#D4A017] hover:bg-[#EAB308] text-[#0D0D10] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 min-h-[46px] transition-colors"
              >
                {t(lang, 'asPartner')}
                <ArrowRight className={`w-4 h-4 ${lang === 'ur' ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>
        </main>
      )}

      {/* 4. EXECUTIVE GOLD SPLASH (Inspired by Upload 182618 / 182727) */}
      {homeLayout === 'executive' && (
        <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-7">
          <div className="pr-preserve-light rounded-3xl overflow-hidden border-2 border-[#D4A017]/60 bg-[#0D0D10] text-white shadow-2xl">
            <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
              <div className="lg:col-span-5 p-6 sm:p-10 flex flex-col justify-between gap-5 bg-gradient-to-br from-[#0D0D10] via-[#171510] to-[#0D0D10]">
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-widest text-[#F4C430] font-bold">
                    {tr(lang, 'Welcome to PRO RIDER AI', 'پرو رائیڈر اے آئی میں خوش آمدید')}
                  </p>
                  <h1 className={`font-display text-3xl sm:text-4xl font-extrabold text-white ${lang === 'ur' ? 'leading-[1.6]' : 'leading-tight'}`}>
                    {tr(lang, 'Independent, Transparent Mobility', 'آزاد، محفوظ اور شفاف سفری نظام')}
                  </h1>
                  <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                    {t(lang, 'welcomeDesc')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => onNavigate('/website')}
                    className="pr-gold-cta pr-no-recolor inline-flex items-center gap-2 px-6 py-3 rounded-full text-xs sm:text-sm font-bold"
                  >
                    {t(lang, 'exploreWebsite')}
                    <ArrowRight className={`w-4 h-4 ${lang === 'ur' ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>
              <div className="lg:col-span-7 relative min-h-[240px] sm:min-h-[320px] aspect-[16/10] lg:aspect-auto bg-[#0D0D10]">
                {heroImgStage !== 'failed' ? (
                  <img
                    src={heroImgStage === 'primary' ? heroMobilityImg : fallbackSedanHeroImg}
                    alt={tr(lang, 'PRO RIDER AI executive sedan in Islamabad', 'پرو رائیڈر اے آئی ایگزیکٹو سیڈان اسلام آباد')}
                    onError={() => {
                      setHeroImgStage((prev) => (prev === 'primary' ? 'fallback' : 'failed'));
                    }}
                    className="hero-image-cover absolute inset-0 w-full h-full object-cover object-center"
                    loading="eager"
                    decoding="async"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#18181B] via-[#0D0D10] to-[#1F1A0C] p-6">
                    <CarFront className="w-16 h-16 text-[#D4A017]/60" />
                  </div>
                )}
                <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/75 via-transparent to-black/20 flex items-end p-5 pointer-events-none">
                  <span className="text-xs font-semibold text-[#F4C430]">
                    {t(lang, 'welcomeSub')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <button
              type="button"
              onClick={() => onNavigate('/passenger')}
              className={`pr-no-recolor group rounded-3xl border-2 p-6 text-center transition-all flex flex-col items-center gap-3 shadow-md ${
                isDark
                  ? 'border-[#D4A017]/40 bg-[#131419] text-white hover:border-[#F4C430]'
                  : 'border-[#D4A017]/50 bg-white text-[#0D0D10] hover:border-[#D4A017]'
              }`}
            >
              <div className="w-14 h-14 rounded-2xl border border-[#D4A017] bg-[#D4A017]/15 text-[#D4A017] flex items-center justify-center">
                <UserCheck className="w-7 h-7" />
              </div>
              <div className="font-display text-lg sm:text-xl font-bold">{t(lang, 'asPassenger')}</div>
              <p className={`text-xs max-w-xs ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>{t(lang, 'asPassengerSub')}</p>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('/partner')}
              className={`pr-no-recolor group rounded-3xl border-2 p-6 text-center transition-all flex flex-col items-center gap-3 shadow-md ${
                isDark
                  ? 'border-[#D4A017]/40 bg-[#131419] text-white hover:border-[#F4C430]'
                  : 'border-[#D4A017]/50 bg-white text-[#0D0D10] hover:border-[#D4A017]'
              }`}
            >
              <div className="w-14 h-14 rounded-2xl border border-[#D4A017] bg-[#0D0D10] text-[#D4A017] flex items-center justify-center">
                <CarFront className="w-7 h-7" />
              </div>
              <div className="font-display text-lg sm:text-xl font-bold">{t(lang, 'asPartner')}</div>
              <p className={`text-xs max-w-xs ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>{t(lang, 'asPartnerSub')}</p>
            </button>
          </div>

          <div className={`flex flex-wrap items-center justify-center gap-6 text-xs pt-1 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
            <span className="inline-flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-[#D4A017]" />
              {tr(lang, 'PKR Digital Invoices', 'ڈیجیٹل انوائسز')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Route className="w-4 h-4 text-[#D4A017]" />
              {tr(lang, 'Live Routing', 'لائیو روٹ ٹریکنگ')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#D4A017]" />
              {tr(lang, 'Strict Role Isolation', 'محفوظ سیشن سیکیورٹی')}
            </span>
          </div>
        </main>
      )}

      {FooterBar}
    </div>
  );
};
