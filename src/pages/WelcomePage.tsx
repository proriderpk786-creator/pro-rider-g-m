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
import sovereignHeroImg from '../../public/assets/aistudio/Meta_AI_922449561_2227628244634402_903597125062342127_n_20261122_182719.webp_add99c4b.jpg';
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
  const { homeLayout } = useTheme();
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  const ExploreWebsiteBanner = (
    <button
      type="button"
      onClick={() => onNavigate('/website')}
      className="pr-preserve-light group w-full text-start rounded-2xl bg-gradient-to-r from-[#141418] via-[#0D0D10] to-[#231B08] text-white p-4 sm:p-5 border-2 border-[#D4A017] shadow-lg hover:shadow-xl hover:border-[#F4C430] transition-all flex items-center justify-between gap-3.5 min-h-[76px]"
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
    <header className="w-full border-b border-zinc-200/80 bg-white/95 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-3">
        <BrandLogo compact lang={lang} />
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <ThemeModeToggle lang={lang} />
          <LanguageToggle lang={lang} onChange={onChangeLang} />
          <PWAInstallButton lang={lang} />
        </div>
      </div>
    </header>
  );

  const FooterBar = (
    <footer className="border-t border-zinc-200 bg-[#F8F8FA] py-4 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-600">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => onNavigate('/website')}
            className="font-semibold text-[#0D0D10] hover:text-[#B8860B] underline underline-offset-4"
          >
            {t(lang, 'exploreWebsite')}
          </button>
          <span aria-hidden="true">·</span>
          <span>{tr(lang, 'Currency: PKR (Rs.)', 'کرنسی: پاکستانی روپے (Rs.)')}</span>
        </div>
        <div className="flex items-center gap-3">
          <span>{t(lang, 'needHelp')}:</span>
          <a
            href="https://wa.me/923125007782"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-mono font-semibold text-[#0D0D10] hover:text-[#B8860B]"
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
      {!heroImgFailed ? (
        <img
          src={sovereignHeroImg}
          alt={tr(lang, 'PRO RIDER AI executive sedan in Islamabad', 'پرو رائیڈر اے آئی ایگزیکٹو سیڈان اسلام آباد')}
          referrerPolicy="no-referrer"
          onError={() => setHeroImgFailed(true)}
          className="hero-image-cover w-full h-full object-cover object-center"
          loading="eager"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#18181B] via-[#0D0D10] to-[#1F1A0C] p-6">
          <CarFront className="w-16 h-16 text-[#D4A017]/60" />
        </div>
      )}
      <div className="pr-preserve-light absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent flex flex-col justify-end p-4 sm:p-7 pointer-events-none">
        <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-widest !text-[#F4C430]">
          {t(lang, 'welcomeHeading')}
        </p>
        <p className="font-display text-base sm:text-2xl font-bold !text-white mt-0.5 sm:mt-1 leading-snug">
          {t(lang, 'welcomeSub')}
        </p>
        <p className="text-[11px] sm:text-sm !text-zinc-200 mt-0.5 sm:mt-1.5">
          {tr(lang, 'Islamabad · Rawalpindi · Lahore · Karachi', 'اسلام آباد · راولپنڈی · لاہور · کراچی')}
        </p>
      </div>
    </div>
  );

  // SOVEREIGN PAKISTAN POSTER LAYOUT (Exact match to reference image without duplicate HTML text/headers)
  if (homeLayout === 'sovereign') {
    return (
      <div dir={lang === 'ur' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#070709] text-white flex flex-col items-center justify-center relative overflow-x-hidden selection:bg-[#F4C430] selection:text-black py-2 sm:py-6 px-2 sm:px-4">
        {/* Floating Language & Theme Switcher in top corner */}
        <div className="fixed top-3 right-3 sm:top-5 sm:right-5 z-40 flex items-center gap-1.5 sm:gap-2 bg-black/80 backdrop-blur-md px-2.5 py-1.5 rounded-full border border-[#D4A017]/40 shadow-xl">
          <ThemeModeToggle dark={true} lang={lang} />
          <LanguageToggle lang={lang} onChange={onChangeLang} dark />
          <PWAInstallButton lang={lang} />
        </div>

        {/* The Exact Pure Sovereign Poster with Hotspot Interactive Buttons */}
        <main className="w-full flex-1 flex items-center justify-center">
          <div className="relative w-full max-w-[460px] sm:max-w-[490px] aspect-[1072/2384] mx-auto select-none rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl border border-[#D4A017]/40 bg-black">
            <img
              src="/assets/aistudio/Meta_AI_925947838_917402431363083_8268209735092311524_n_20261122_182601_f4b79422.webp"
              alt="PRO RIDER AI — Your Ride, Your Partner, Your Pakistan"
              className="w-full h-full object-cover block pointer-events-none"
              loading="eager"
            />

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
              className="absolute rounded-2xl cursor-pointer transition-all hover:bg-[#F4C430]/15 hover:ring-2 hover:ring-[#F4C430]/80 active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#F4C430]"
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
              className="absolute rounded-2xl cursor-pointer transition-all hover:bg-[#F4C430]/15 hover:ring-2 hover:ring-[#F4C430]/80 active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#F4C430]"
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
              className="absolute rounded-2xl cursor-pointer transition-all hover:bg-[#F4C430]/15 hover:ring-2 hover:ring-[#F4C430]/80 active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#F4C430]"
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
              className="absolute rounded-2xl cursor-pointer transition-all hover:bg-[#F4C430]/20 hover:ring-2 hover:ring-[#F4C430] active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#F4C430]"
              style={{ left: '4.20%', top: '79.87%', width: '44.31%', height: '6.54%' }}
            />

            {/* 5. AS A DRIVER PRO PARTNER -> */}
            <button
              type="button"
              onClick={() => onNavigate('/partner')}
              title={t(lang, 'asPartner')}
              aria-label={t(lang, 'asPartner')}
              className="absolute rounded-2xl cursor-pointer transition-all hover:bg-[#F4C430]/20 hover:ring-2 hover:ring-[#F4C430] active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#F4C430]"
              style={{ left: '51.12%', top: '79.87%', width: '44.40%', height: '6.54%' }}
            />

            {/* 6. Visit Website */}
            <button
              type="button"
              onClick={() => onNavigate('/website')}
              title={tr(lang, 'Visit Website', 'ویب سائٹ دیکھیں')}
              aria-label={tr(lang, 'Visit Website', 'ویب سائٹ دیکھیں')}
              className="absolute rounded-full cursor-pointer transition-all hover:bg-[#F4C430]/20 hover:ring-2 hover:ring-[#F4C430] active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#F4C430]"
              style={{ left: '30.78%', top: '88.25%', width: '38.25%', height: '4.36%' }}
            />

            {/* 7. WhatsApp 03125007782 */}
            <a
              href="https://wa.me/923125007782"
              target="_blank"
              rel="noreferrer"
              title="WhatsApp: 03125007782"
              aria-label="WhatsApp: 03125007782"
              className="absolute rounded-full cursor-pointer transition-all hover:bg-emerald-500/25 hover:ring-2 hover:ring-emerald-400 active:scale-95 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              style={{ left: '20.52%', top: '94.80%', width: '58.77%', height: '3.15%' }}
            />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div dir={lang === 'ur' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#F8F8FA] text-[#0D0D10] flex flex-col overflow-x-clip">
      {TopBar}

      {/* 1. CLASSIC SPLIT HERO (Original Preserved Design + Full Theme & i18n Support) */}
      {homeLayout === 'classic' && (
        <main className="flex-1 flex items-center">
          <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-5 sm:py-8 lg:py-12 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-stretch">
            <div className="order-2 lg:order-1 lg:col-span-6 flex flex-col justify-center space-y-5 sm:space-y-7">
              <div className="space-y-2 sm:space-y-3">
                <p className="text-[11px] sm:text-xs font-semibold tracking-widest uppercase text-[#B8860B]">
                  {t(lang, 'welcomeSub')}
                </p>
                <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-[#0D0D10] leading-[1.15] [text-wrap:balance]">
                  {t(lang, 'welcomeHeading')}
                </h1>
                <p className="text-sm sm:text-base text-zinc-600 leading-relaxed max-w-xl">
                  {t(lang, 'welcomeDesc')}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:gap-3.5 pt-1">
                {ExploreWebsiteBanner}

                <button
                  type="button"
                  onClick={() => onNavigate('/passenger')}
                  className="group w-full text-left rounded-2xl bg-[#0D0D10] text-white p-4 sm:p-5 border border-[#0D0D10] hover:border-[#D4A017] transition-all shadow-sm hover:shadow-md flex items-center justify-between gap-4 min-h-[80px]"
                >
                  <div className="flex items-start gap-3.5 sm:gap-4 min-w-0">
                    <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-[#D4A017] text-[#0D0D10] flex items-center justify-center shrink-0">
                      <UserCheck className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <div className="min-w-0 text-start">
                      <div className="font-display text-base sm:text-xl font-bold tracking-tight">
                        {t(lang, 'asPassenger')}
                      </div>
                      <p className="text-xs sm:text-sm opacity-85 mt-1 leading-snug">
                        {t(lang, 'asPassengerSub')}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className={`w-5 h-5 text-[#D4A017] shrink-0 transition-transform ${lang === 'ur' ? 'rotate-180 group-hover:-translate-x-1' : 'group-hover:translate-x-1'}`} />
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate('/partner')}
                  className="group w-full text-left rounded-2xl bg-white text-[#0D0D10] p-5 sm:p-6 border-2 border-zinc-200 hover:border-[#D4A017] transition-all shadow-sm flex items-center justify-between gap-4 min-h-[84px] sm:min-h-[96px]"
                >
                  <div className="flex items-start gap-3.5 sm:gap-4 min-w-0">
                    <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-zinc-100 border border-zinc-200 text-[#0D0D10] flex items-center justify-center shrink-0 group-hover:bg-[#D4A017] group-hover:text-[#0D0D10] transition-colors">
                      <CarFront className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <div className="min-w-0 text-start">
                      <div className="font-display text-base sm:text-xl font-bold tracking-tight text-[#0D0D10]">
                        {t(lang, 'asPartner')}
                      </div>
                      <p className="text-xs sm:text-sm text-zinc-600 mt-1 leading-snug">
                        {t(lang, 'asPartnerSub')}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className={`w-5 h-5 text-[#D4A017] shrink-0 transition-transform ${lang === 'ur' ? 'rotate-180 group-hover:-translate-x-1' : 'group-hover:translate-x-1'}`} />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 sm:gap-x-6 gap-y-2 pt-1 text-xs text-zinc-500">
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



      {/* 3. EDITORIAL SMART MOBILITY SHOWCASE (Inspired by Upload 182539 / 182554) */}
      {homeLayout === 'editorial' && (
        <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8">
          <div className="text-center space-y-3">
            <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
              PRO RIDER AI — {tr(lang, "Pakistan's Smart Ride Is", 'پاکستان کی اسمارٹ سواری')}{' '}
              <span className="text-[#D4A017]">{tr(lang, 'Here', 'حاضر ہے')}</span>
            </h1>
            <div className="flex items-center justify-center gap-3 text-xs sm:text-sm font-semibold text-zinc-600 pt-1">
              <span className="h-px w-8 sm:w-16 bg-[#D4A017]/50" />
              <span>{t(lang, 'welcomeSub')}</span>
              <span className="h-px w-8 sm:w-16 bg-[#D4A017]/50" />
            </div>
          </div>

          {HeroImageBox('max-h-[360px]')}

          {ExploreWebsiteBanner}

          {/* Two Column Structured Grid: For Passengers | For Pro Partners */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-3xl border border-zinc-200 bg-white p-6 space-y-5 shadow-sm">
              <div className="flex items-center gap-3 pb-3 border-b border-zinc-200">
                <div className="w-10 h-10 rounded-xl bg-[#D4A017] text-[#0D0D10] flex items-center justify-center">
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
                    <p className="text-xs text-zinc-500">
                      {tr(lang, 'Door-to-door rides on your schedule.', 'اپنے وقت پر گھر سے منزل تک محفوظ سفر۔')}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Users className="w-5 h-5 text-[#D4A017] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">{tr(lang, 'Ride Sharing', 'رائیڈ شیئرنگ')}</div>
                    <p className="text-xs text-zinc-500">
                      {tr(lang, 'Share the ride, split the fare, travel smarter.', 'مشترکہ سفر کریں اور کم کرائے میں بچت پائیں۔')}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Fuel className="w-5 h-5 text-[#D4A017] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">{tr(lang, 'Fuel Sharing', 'فیول شیئرنگ')}</div>
                    <p className="text-xs text-zinc-500">
                      {tr(lang, 'Transparent per-km fuel-cost splitting on every trip.', 'فی کلومیٹر کے حساب سے شفاف پیٹرول شیئرنگ۔')}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CalendarClock className="w-5 h-5 text-[#D4A017] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">{tr(lang, 'Monthly Packages', 'ماہانہ پیکیجز')}</div>
                    <p className="text-xs text-zinc-500">
                      {tr(lang, 'Affordable office & university plans.', 'دفاتر اور یونیورسٹیوں کے لیے سستے ماہانہ پلان۔')}
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('/passenger')}
                className="w-full py-3.5 rounded-xl bg-[#0D0D10] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 min-h-[46px]"
              >
                {t(lang, 'asPassenger')}
                <ArrowRight className={`w-4 h-4 text-[#D4A017] ${lang === 'ur' ? 'rotate-180' : ''}`} />
              </button>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-6 space-y-5 shadow-sm">
              <div className="flex items-center gap-3 pb-3 border-b border-zinc-200">
                <div className="w-10 h-10 rounded-xl bg-[#0D0D10] text-[#D4A017] flex items-center justify-center border border-[#D4A017]/50">
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
                    <p className="text-xs text-zinc-500">
                      {tr(lang, 'Receive live verified passenger ride & package requests.', 'تصدیق شدہ مسافروں کی لائیو درخواستیں حاصل کریں۔')}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Route className="w-5 h-5 text-[#D4A017] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">{tr(lang, 'Smart Routing & Heatmap', 'اسمارٹ روٹنگ اور ہیٹ میپ')}</div>
                    <p className="text-xs text-zinc-500">
                      {tr(lang, 'Live road routing and high-demand rider clusters.', 'لائیو نقشے پر زیادہ مسافروں والے علاقے دیکھیں۔')}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Wallet className="w-5 h-5 text-[#D4A017] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">{tr(lang, 'Track PKR Earnings', 'آمدنی اور والٹ ٹریکنگ')}</div>
                    <p className="text-xs text-zinc-500">
                      {tr(lang, 'Transparent digital PKR invoicing & fast withdrawals.', 'صاف ڈیجیٹل انوائسز اور آسان ادائیگیاں۔')}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Lock className="w-5 h-5 text-[#D4A017] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">{tr(lang, 'Privacy Profile & Showcase', 'ڈرائیور پروفائل اور پرائیویسی')}</div>
                    <p className="text-xs text-zinc-500">
                      {tr(lang, 'Full control over public vs admin-only photos.', 'اپنی تصاویر کی پبلک یا پرائیویٹ سیٹنگ خود کنٹرول کریں۔')}
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('/partner')}
                className="w-full py-3.5 rounded-xl bg-[#D4A017] text-[#0D0D10] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 min-h-[46px]"
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
                  <h1 className="font-display text-3xl sm:text-4xl font-extrabold leading-tight text-white">
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
                    className="pr-gold-cta inline-flex items-center gap-2 px-6 py-3 rounded-full text-xs sm:text-sm font-bold"
                  >
                    {t(lang, 'exploreWebsite')}
                    <ArrowRight className={`w-4 h-4 ${lang === 'ur' ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>
              <div className="lg:col-span-7 relative min-h-[240px] sm:min-h-[320px]">
                <img
                  src={sovereignHeroImg}
                  alt="PRO RIDER AI"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover object-center"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/20 flex items-end p-5">
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
              className="group rounded-3xl border-2 border-[#D4A017]/50 bg-white p-6 text-center hover:border-[#D4A017] transition-all flex flex-col items-center gap-3 shadow-md"
            >
              <div className="w-14 h-14 rounded-2xl border border-[#D4A017] bg-[#D4A017]/15 text-[#D4A017] flex items-center justify-center">
                <UserCheck className="w-7 h-7" />
              </div>
              <div className="font-display text-lg sm:text-xl font-bold">{t(lang, 'asPassenger')}</div>
              <p className="text-xs text-zinc-500 max-w-xs">{t(lang, 'asPassengerSub')}</p>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('/partner')}
              className="group rounded-3xl border-2 border-[#D4A017]/50 bg-white p-6 text-center hover:border-[#D4A017] transition-all flex flex-col items-center gap-3 shadow-md"
            >
              <div className="w-14 h-14 rounded-2xl border border-[#D4A017] bg-[#0D0D10] text-[#D4A017] flex items-center justify-center">
                <CarFront className="w-7 h-7" />
              </div>
              <div className="font-display text-lg sm:text-xl font-bold">{t(lang, 'asPartner')}</div>
              <p className="text-xs text-zinc-500 max-w-xs">{t(lang, 'asPartnerSub')}</p>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-zinc-500 pt-1">
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
