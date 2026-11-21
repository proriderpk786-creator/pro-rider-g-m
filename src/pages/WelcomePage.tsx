import React from 'react';
import { ArrowRight, CarFront, Compass, PhoneCall, ShieldCheck, UserCheck } from 'lucide-react';
import { BrandLogo, LanguageToggle, PWAInstallButton } from '../components/BrandMark';
import { t } from '../i18n/translations';
import type { Language } from '../types';

interface WelcomePageProps {
  lang: Language;
  onChangeLang: (l: Language) => void;
  onNavigate: (path: string) => void;
}

export const WelcomePage: React.FC<WelcomePageProps> = ({ lang, onChangeLang, onNavigate }) => {
  return (
    <div dir={lang === 'ur' ? 'rtl' : 'ltr'} className="min-h-screen bg-white text-[#0D0D10] flex flex-col">
      {/* Clean Top Bar: Logo left, Language & Website/Install right */}
      <header className="w-full border-b border-zinc-200/80 bg-white/95 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <BrandLogo />
          <div className="flex items-center gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => onNavigate('/website')}
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700 hover:text-[#0D0D10] px-3 py-2 rounded-lg hover:bg-zinc-100 transition-colors whitespace-nowrap"
            >
              <Compass className="w-3.5 h-3.5 text-[#D4A017]" />
              {t(lang, 'exploreWebsite')}
            </button>
            <LanguageToggle lang={lang} onChange={onChangeLang} />
            <PWAInstallButton />
          </div>
        </div>
      </header>

      {/* Main Split Stage */}
      <main className="flex-1 flex items-center">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 lg:py-12 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
          {/* Left Column: Brand Statement + Two Primary Entry Buttons */}
          <div className="lg:col-span-6 flex flex-col justify-center space-y-7">
            <div className="space-y-3">
              <p className="text-xs font-semibold tracking-widest uppercase text-[#B8860B]">
                {t(lang, 'welcomeSub')}
              </p>
              <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-[#0D0D10] leading-[1.12] [text-wrap:balance]">
                {t(lang, 'welcomeHeading')}
              </h1>
              <p className="text-base text-zinc-600 leading-relaxed max-w-xl">
                {t(lang, 'welcomeDesc')}
              </p>
            </div>

            {/* Strictly ONLY TWO Large Entry Buttons */}
            <div className="grid grid-cols-1 gap-4 pt-1">
              <button
                type="button"
                onClick={() => onNavigate('/passenger')}
                className="group w-full text-left rounded-2xl bg-[#0D0D10] text-white p-6 border border-[#0D0D10] hover:border-[#D4A017] transition-all shadow-sm hover:shadow-md flex items-center justify-between gap-4 min-h-[96px]"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#D4A017] text-[#0D0D10] flex items-center justify-center shrink-0">
                    <UserCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="font-display text-lg sm:text-xl font-bold tracking-tight text-white">
                      {t(lang, 'asPassenger')}
                    </div>
                    <p className="text-xs sm:text-sm text-zinc-300 mt-1 leading-snug">
                      {t(lang, 'asPassengerSub')}
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-[#D4A017] shrink-0 transition-transform group-hover:translate-x-1" />
              </button>

              <button
                type="button"
                onClick={() => onNavigate('/partner')}
                className="group w-full text-left rounded-2xl bg-white text-[#0D0D10] p-6 border-2 border-zinc-200 hover:border-[#D4A017] hover:bg-[#FCFBF7] transition-all shadow-sm flex items-center justify-between gap-4 min-h-[96px]"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-zinc-100 border border-zinc-200 text-[#0D0D10] flex items-center justify-center shrink-0 group-hover:bg-[#0D0D10] group-hover:text-[#D4A017] transition-colors">
                    <CarFront className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="font-display text-lg sm:text-xl font-bold tracking-tight text-[#0D0D10]">
                      {t(lang, 'asPartner')}
                    </div>
                    <p className="text-xs sm:text-sm text-zinc-600 mt-1 leading-snug">
                      {t(lang, 'asPartnerSub')}
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-[#0D0D10] group-hover:text-[#B8860B] shrink-0 transition-transform group-hover:translate-x-1" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 text-xs text-zinc-500">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#D4A017]" />
                Strict Role-Isolated Sessions
              </span>
              <span aria-hidden="true">·</span>
              <span>Live OpenStreetMap Routing</span>
              <span aria-hidden="true">·</span>
              <span>PKR Digital Invoices</span>
            </div>
          </div>

          {/* Right Column: Architectural Mobility Visual */}
          <div className="lg:col-span-6 flex flex-col justify-center">
            <div className="hero-image-container relative w-full aspect-[16/10] sm:aspect-[16/9] lg:aspect-[16/10] min-h-[300px] lg:min-h-[440px] rounded-3xl overflow-hidden border border-zinc-200 bg-[#0D0D10] shadow-xl flex items-center justify-center">
              <img
                src="/src/assets/images/hero_mobility_pakistan_1794584048013.jpg"
                alt="PRO RIDER AI executive sedan in Islamabad"
                referrerPolicy="no-referrer"
                className="hero-image-cover w-full h-full object-cover object-center"
                style={{ objectFit: 'cover', objectPosition: 'center' }}
                loading="eager"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent flex flex-col justify-end p-6 sm:p-8 pointer-events-none">
                <p className="text-xs font-semibold uppercase tracking-widest text-[#F4C430]">
                  Pakistan Smart Mobility Network
                </p>
                <p className="font-display text-xl sm:text-2xl font-bold text-white mt-1">
                  Pick &amp; Drop · Ride Sharing · Fuel Sharing
                </p>
                <p className="text-xs sm:text-sm text-zinc-300 mt-1.5">
                  Islamabad · Rawalpindi · Lahore · Karachi
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Support & Website Footer */}
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
            <span>Currency: PKR (Rs.)</span>
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
    </div>
  );
};
