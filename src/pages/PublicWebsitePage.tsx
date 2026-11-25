import React, { useState } from 'react';
import {
  ArrowRight,
  Building2,
  CalendarClock,
  CarFront,
  CheckCircle2,
  ChevronDown,
  FileText,
  Fuel,
  MapPin,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import fallbackSedanHeroImg from '../assets/images/fleet_premium_1794584050155.jpg';
import heroMobilityImg from '../assets/images/hero_mobility_pakistan_1794584048013.jpg';
import { BrandLogo, LanguageToggle, PWAInstallButton, ThemeModeToggle, VehicleImage } from '../components/BrandMark';
import { ProRiderAiCopilot } from '../components/ProRiderAiCopilot';
import { useTheme } from '../contexts/ThemeContext';
import { tr, trService } from '../i18n/translations';
import type { Language, PublicConfig } from '../types';

interface PublicWebsitePageProps {
  config: PublicConfig | null;
  lang: Language;
  onChangeLang: (l: Language) => void;
  onNavigate: (path: string) => void;
}

export const PublicWebsitePage: React.FC<PublicWebsitePageProps> = ({
  config,
  lang,
  onChangeLang,
  onNavigate,
}) => {
  const { isDark } = useTheme();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [contactSent, setContactSent] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [heroImgStage, setHeroImgStage] = useState<'primary' | 'fallback' | 'failed'>('primary');

  const isUr = lang === 'ur';

  const faqs = [
    {
      q: tr(
        lang,
        'How are Passenger and Pro Partner accounts separated?',
        'مسافر اور پرو پارٹنر اکاؤنٹس کیسے علیحدہ رکھے جاتے ہیں؟'
      ),
      a: tr(
        lang,
        'PRO RIDER AI runs completely separate Passenger and Pro Partner portals with independent authentication tokens, navigation, and wallets. A Passenger account never gains Driver tools automatically.',
        'پرو رائیڈر اے آئی مسافر اور ڈرائیور کے لیے بالکل علیحدہ پورٹل، ٹوکن، مینیو اور والٹ چلاتا ہے۔ کوئی بھی اکاؤنٹ خودکار طور پر دوسرے پورٹل تک رسائی حاصل نہیں کر سکتا۔'
      ),
    },
    {
      q: tr(lang, 'How is route distance and fare calculated?', 'سفر کا فاصلہ اور کرایہ کیسے طے ہوتا ہے؟'),
      a: tr(
        lang,
        'Distances and travel durations are computed along real streets via live road routing, multiplied by Admin-regulated PKR per-km fleet tariffs.',
        'فاصلہ اور وقت اصل سڑکوں کے نقشے سے معلوم کیا جاتا ہے اور ایڈمن کے مقرر کردہ فی کلومیٹر PKR ریٹس کے مطابق شفاف کرایہ بنتا ہے۔'
      ),
    },
    {
      q: tr(
        lang,
        'Can I book recurring monthly office or university Pick & Drop?',
        'کیا میں دفتر یا یونیورسٹی کے لیے ماہانہ پِک اینڈ ڈراپ بُک کر سکتا ہوں؟'
      ),
      a: tr(
        lang,
        'Yes. Use the Schedule Booking workflow inside the Passenger App to choose Daily, Weekly, or Admin-approved Monthly Packages with fixed pickup and drop-off times.',
        'جی ہاں! مسافر ایپ میں شیڈول بُکنگ کے ذریعے روزانہ، ہفتہ وار یا ماہانہ پیکیج مقررہ پِک اپ اور ڈراپ وقت کے ساتھ بُک کر سکتے ہیں۔'
      ),
    },
    {
      q: tr(
        lang,
        'How do Pro Partners get verified before accepting trips?',
        'ڈرائیورز / پرو پارٹنرز کی تصدیق کیسے ہوتی ہے؟'
      ),
      a: tr(
        lang,
        'Drivers register through the Pro Partner portal and upload CNIC, Driving Licence, Vehicle Registration, and vehicle photos. Until Super Admin approves their documents, booking acceptance remains locked.',
        'ڈرائیور حضرات شناختی کارڈ، ڈرائیونگ لائسنس، گاڑی کی کاپی اور تصاویر اپ لوڈ کرتے ہیں۔ سپر ایڈمن کی منظوری تک بُکنگ قبول کرنے کا بٹن لاک رہتا ہے۔'
      ),
    },
  ];

  // Semantic surface & typography classes tuned for crisp Light (White) & Dark parity
  const headingColor = isDark ? 'text-white' : 'text-[#0D0D10]';
  const bodyColor = isDark ? 'text-zinc-200' : 'text-zinc-700';
  const mutedColor = isDark ? 'text-zinc-400' : 'text-zinc-600';
  const kickerColor = isDark ? 'text-[#F4C430]' : 'text-[#9A6E08]';
  const cardBase = isDark
    ? 'bg-[#131419] border border-[#D4A017]/30 text-white'
    : 'bg-white border border-zinc-200 text-[#0D0D10] shadow-[0_1px_3px_rgba(13,13,16,0.04)]';

  return (
    <div
      dir={isUr ? 'rtl' : 'ltr'}
      className={`min-h-screen flex flex-col transition-colors duration-200 selection:bg-[#F4C430] selection:text-[#0D0D10] ${
        isDark ? 'bg-[#08080B] text-white' : 'bg-white text-[#0D0D10]'
      }`}
    >
      {/* Top Navigation Bar (Strict Mobile Fit, Zero Clipping) */}
      <header
        className={`sticky top-0 z-30 backdrop-blur-md border-b transition-colors ${
          isDark
            ? 'bg-[#0D0D10]/95 border-[#D4A017]/30 text-white'
            : 'bg-white/95 border-zinc-200 text-[#0D0D10] shadow-[0_1px_4px_rgba(13,13,16,0.04)]'
        }`}
      >
        <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-1 sm:gap-6">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="shrink-0 flex items-center whitespace-nowrap min-w-0"
          >
            <BrandLogo compact lang={lang} dark={isDark} />
          </button>

          <nav
            className={`hidden lg:flex items-center gap-6 text-sm font-extrabold ${
              isDark ? 'text-zinc-200' : 'text-[#0D0D10]'
            }`}
          >
            <a
              href="#services"
              className={`transition-colors whitespace-nowrap shrink-0 underline-offset-8 hover:underline ${
                isDark ? 'hover:text-[#F4C430]' : 'hover:text-[#9A6E08]'
              }`}
            >
              {tr(lang, 'Services', 'سہولیات')}
            </a>
            <a
              href="#packages"
              className={`transition-colors whitespace-nowrap shrink-0 underline-offset-8 hover:underline ${
                isDark ? 'hover:text-[#F4C430]' : 'hover:text-[#9A6E08]'
              }`}
            >
              {tr(lang, 'Packages', 'پیکیجز')}
            </a>
            <a
              href="#fleet"
              className={`transition-colors whitespace-nowrap shrink-0 underline-offset-8 hover:underline ${
                isDark ? 'hover:text-[#F4C430]' : 'hover:text-[#9A6E08]'
              }`}
            >
              {tr(lang, 'Fleet', 'گاڑیاں')}
            </a>
            <button
              type="button"
              onClick={() => onNavigate('/about')}
              className={`transition-colors whitespace-nowrap shrink-0 underline-offset-8 hover:underline ${
                isDark ? 'hover:text-[#F4C430]' : 'hover:text-[#9A6E08]'
              }`}
            >
              {tr(lang, 'About', 'ہمارے بارے میں')}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/privacy')}
              className={`transition-colors whitespace-nowrap shrink-0 underline-offset-8 hover:underline ${
                isDark ? 'hover:text-[#F4C430]' : 'hover:text-[#9A6E08]'
              }`}
            >
              {tr(lang, 'Privacy', 'پرائیویسی')}
            </button>
          </nav>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <ThemeModeToggle dark={isDark} lang={lang} />
            <LanguageToggle lang={lang} onChange={onChangeLang} dark={isDark} />
            <div className="hidden sm:flex">
              <PWAInstallButton dark={isDark} lang={lang} />
            </div>
            <button
              type="button"
              onClick={() => onNavigate('/passenger')}
              className={`pr-no-recolor px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[10.5px] sm:text-xs font-extrabold transition-all whitespace-nowrap shrink-0 min-h-[32px] sm:min-h-[38px] ${
                isDark
                  ? 'bg-gradient-to-r from-[#F4C430] to-[#B8860B] text-[#0D0D10] shadow-lg hover:brightness-105'
                  : 'bg-[#0D0D10] text-white hover:bg-zinc-800 shadow-sm'
              }`}
            >
              {tr(lang, 'Book a Ride', 'سواری بُک کریں')}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section: Clean Balanced Two-Column Showcase in Light & Dark Mode */}
      <section
        className={`relative border-b overflow-hidden transition-colors ${
          isDark
            ? 'border-[#D4A017]/25 bg-gradient-to-b from-[#0D0D10] via-[#111218] to-[#08080B]'
            : 'border-zinc-200 bg-gradient-to-b from-[#FFFDF9] to-white'
        }`}
      >
        <div
          className={`absolute inset-0 pointer-events-none ${
            isDark
              ? 'bg-[radial-gradient(ellipse_at_top_right,_rgba(212,160,23,0.12),_transparent_55%)]'
              : 'bg-[radial-gradient(ellipse_at_top_right,_rgba(212,160,23,0.08),_transparent_55%)]'
          }`}
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16 relative z-10 space-y-8 sm:space-y-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
            {/* Editorial Text & Action Column */}
            <div className="lg:col-span-6 flex flex-col justify-center space-y-4 sm:space-y-5">
              <p className={`text-[11px] sm:text-xs font-extrabold tracking-[0.14em] uppercase ${kickerColor}`}>
                {tr(
                  lang,
                  'Pakistan Smart Mobility · Islamabad · Lahore · Karachi',
                  'پاکستان اسمارٹ موبلٹی · اسلام آباد · لاہور · کراچی'
                )}
              </p>

              <h1
                className={`font-display text-3xl sm:text-4xl lg:text-[3.1rem] font-extrabold tracking-tight [text-wrap:balance] ${headingColor} ${
                  isUr ? 'leading-[1.6]' : 'leading-[1.12]'
                }`}
              >
                {tr(
                  lang,
                  'Trusted Rides, Daily Pick & Drop & Verified Pro Partners',
                  'باعتماد سفر، روزانہ پِک اینڈ ڈراپ اور تصدیق شدہ پرو پارٹنرز'
                )}
              </h1>

              <p className={`text-sm sm:text-base lg:text-lg leading-relaxed font-medium max-w-xl ${bodyColor}`}>
                {tr(
                  lang,
                  'Built on honest service and transparent PKR fares across Islamabad, Rawalpindi, Lahore, and Karachi — with live road routing, verified drivers, and instant PDF bills.',
                  'اسلام آباد، راولپنڈی، لاہور اور کراچی میں ایماندار سروس، اصل سڑک کے حساب سے شفاف کرایہ، تصدیق شدہ ڈرائیورز اور مصدقہ پی ڈی ایف بل کے ساتھ پکا سفری نظام۔'
                )}
              </p>

              <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => onNavigate('/passenger')}
                  className={`pr-no-recolor inline-flex items-center gap-2 px-5 sm:px-6 py-3 rounded-xl text-xs sm:text-sm font-extrabold transition-all whitespace-nowrap min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A017] ${
                    isDark
                      ? 'bg-gradient-to-r from-[#F4C430] to-[#B8860B] text-[#0D0D10] shadow-lg hover:brightness-105'
                      : 'bg-[#0D0D10] text-white hover:bg-zinc-800 shadow-sm'
                  }`}
                >
                  {tr(lang, 'Book a Ride', 'سواری بُک کریں')}
                  <ArrowRight className={`w-4 h-4 ${isDark ? '' : 'text-[#F4C430]'} ${isUr ? 'rotate-180' : ''}`} />
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate('/partner')}
                  className={`pr-no-recolor inline-flex items-center gap-2 px-5 py-3 rounded-xl text-xs sm:text-sm font-extrabold border-2 transition-all whitespace-nowrap min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A017] ${
                    isDark
                      ? 'bg-[#16171F] text-white border-[#D4A017]/75 hover:border-[#F4C430] hover:bg-[#1E202B]'
                      : 'bg-white text-[#0D0D10] border-[#0D0D10] hover:bg-zinc-50'
                  }`}
                >
                  {tr(lang, 'Become a Pro Partner', 'پرو پارٹنر بنیں')}
                </button>

                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('open-prorider-ai-copilot'))}
                  className={`pr-no-recolor inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-extrabold border transition-all whitespace-nowrap min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A017] ${
                    isDark
                      ? 'bg-[#1A160B] border-[#D4A017]/60 text-[#F4C430] hover:bg-[#D4A017]/15'
                      : 'bg-[#FFFDF5] border-[#D4A017] text-[#0D0D10] hover:bg-amber-50'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#D4A017]" />
                  {tr(lang, 'AI Help', 'اے آئی مدد')}
                </button>
              </div>
            </div>

            {/* Clean Unobstructed Vehicle Showcase Column */}
            <div className="lg:col-span-6 flex">
              <div
                className={`hero-image-container relative w-full aspect-[16/10] lg:aspect-auto lg:h-full lg:min-h-[380px] rounded-3xl overflow-hidden flex items-center justify-center ${
                  isDark
                    ? 'border-2 border-[#D4A017]/50 bg-[#0D0D10] shadow-2xl'
                    : 'border border-zinc-200 bg-zinc-100 shadow-lg'
                }`}
              >
                {heroImgStage !== 'failed' ? (
                  <img
                    src={heroImgStage === 'primary' ? heroMobilityImg : fallbackSedanHeroImg}
                    alt={tr(lang, 'PRO RIDER AI Executive Sedan Fleet', 'پرو رائیڈر اے آئی ایگزیکٹو فلیٹ')}
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setHeroImgStage((prev) => (prev === 'primary' ? 'fallback' : 'failed'))
                    }
                    className="hero-image-cover w-full h-full object-cover object-center"
                    loading="eager"
                    decoding="async"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#18181B] via-[#0D0D10] to-[#1F1A0C] p-6">
                    <CarFront className="w-14 h-14 text-[#F4C430]" />
                    <span className="font-display text-sm font-bold text-[#F4C430]">PRO RIDER AI</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Crisp Framed Operational Trust Metrics Strip */}
          <div
            className={`grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 pt-6 sm:pt-8 border-t ${
              isDark ? 'border-zinc-800' : 'border-zinc-200'
            }`}
          >
            {[
              {
                val: `4 ${tr(lang, 'Cities', 'شہر')}`,
                sub: tr(lang, 'Islamabad, Rawalpindi, Lahore & Karachi', 'اسلام آباد، راولپنڈی، لاہور اور کراچی'),
              },
              {
                val: `13 ${tr(lang, 'Classes', 'اقسام')}`,
                sub: tr(lang, 'Bike & Economy to 28-Seat Coaster', 'بائیک اور اکانومی سے 28 سیٹر کوسٹر تک'),
              },
              {
                val: `100% ${tr(lang, 'Verified', 'تصدیق شدہ')}`,
                sub: tr(lang, 'CNIC, Licence & Vehicle Screening', 'شناختی کارڈ، لائسنس اور گاڑی کی جانچ'),
              },
              {
                val: `PKR ${tr(lang, 'Invoices', 'انوائسز')}`,
                sub: tr(lang, 'Transparent road-km pricing & PDF bills', 'شفاف فی کلومیٹر کرایہ اور PDF بل'),
              },
            ].map((stat) => (
              <div
                key={stat.val}
                className={`rounded-2xl p-4 sm:p-5 border transition-colors ${
                  isDark
                    ? 'bg-[#131419] border-[#D4A017]/25 text-white'
                    : 'bg-[#F8F8FA] border-zinc-200 text-[#0D0D10]'
                }`}
              >
                <div className={`font-display text-lg sm:text-2xl font-extrabold tabular-nums ${headingColor}`}>
                  {stat.val}
                </div>
                <p className={`text-[11px] sm:text-xs font-semibold mt-1 leading-snug ${mutedColor}`}>
                  {stat.sub}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services */}
      <section
        id="services"
        className={`w-full py-14 sm:py-16 transition-colors ${isDark ? 'bg-[#08080B]' : 'bg-white'}`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="max-w-2xl space-y-2.5">
            <p className={`text-xs font-extrabold uppercase tracking-widest ${kickerColor}`}>
              {tr(lang, 'Our Services', 'ہماری خدمات')}
            </p>
            <h2
              className={`font-display text-2xl sm:text-3xl font-extrabold tracking-tight ${headingColor} ${
                isUr ? 'leading-[1.6]' : 'leading-tight'
              }`}
            >
              {tr(lang, 'Three Mobility Modes Built for Pakistan', 'پاکستان کے لیے تین جدید سفری سہولیات')}
            </h2>
            <p className={`text-sm sm:text-base font-medium leading-relaxed ${bodyColor}`}>
              {tr(
                lang,
                'Whether you need immediate on-demand travel, recurring monthly office commutes, or shared inter-sector fuel splitting.',
                'فوری سفر ہو، دفتر یا یونیورسٹی کا ماہانہ پِک اینڈ ڈراپ ہو، یا شہر کے اندر فیول شیئرنگ — ہر سہولت ایک جگہ۔'
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className={`rounded-2xl p-6 sm:p-7 space-y-3.5 transition-colors ${cardBase}`}>
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                  isDark ? 'bg-[#1D1F27] text-[#F4C430] border border-[#D4A017]/30' : 'bg-[#0D0D10] text-[#F4C430]'
                }`}
              >
                <MapPin className="w-5 h-5" />
              </div>
              <h3 className={`font-display text-lg font-extrabold ${headingColor} ${isUr ? 'leading-relaxed' : ''}`}>
                01. {trService(lang, 'pick_and_drop')}
              </h3>
              <p className={`text-sm leading-relaxed font-medium ${bodyColor}`}>
                {tr(
                  lang,
                  'Dedicated private rides for on-demand Go Now trips or scheduled daily and monthly office/school commutes.',
                  'فوری گو ناؤ سفر یا روزانہ و ماہانہ دفتر/اسکول پِک اینڈ ڈراپ کے لیے مکمل نجی گاڑی۔'
                )}
              </p>
            </div>

            <div className={`rounded-2xl p-6 sm:p-7 space-y-3.5 transition-colors ${cardBase}`}>
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                  isDark ? 'bg-[#1D1F27] text-[#F4C430] border border-[#D4A017]/30' : 'bg-[#0D0D10] text-[#F4C430]'
                }`}
              >
                <Users className="w-5 h-5" />
              </div>
              <h3 className={`font-display text-lg font-extrabold ${headingColor} ${isUr ? 'leading-relaxed' : ''}`}>
                02. {trService(lang, 'ride_sharing')}
              </h3>
              <p className={`text-sm leading-relaxed font-medium ${bodyColor}`}>
                {tr(
                  lang,
                  'Reserve individual seats along verified urban corridors at lower per-seat PKR tariffs with verified co-riders.',
                  'تصدیق شدہ روٹس پر کم فی سیٹ PKR کرائے میں محفوظ سیٹ شیئرنگ بکنگ۔'
                )}
              </p>
            </div>

            <div className={`rounded-2xl p-6 sm:p-7 space-y-3.5 transition-colors ${cardBase}`}>
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                  isDark ? 'bg-[#1D1F27] text-[#F4C430] border border-[#D4A017]/30' : 'bg-[#0D0D10] text-[#F4C430]'
                }`}
              >
                <Fuel className="w-5 h-5" />
              </div>
              <h3 className={`font-display text-lg font-extrabold ${headingColor} ${isUr ? 'leading-relaxed' : ''}`}>
                03. {trService(lang, 'fuel_sharing')}
              </h3>
              <p className={`text-sm leading-relaxed font-medium ${bodyColor}`}>
                {tr(
                  lang,
                  'Transparent fuel-cost contribution for long city corridors and inter-sector commutes calculated on exact road km.',
                  'اصل سڑک کے کلومیٹر کے مطابق شفاف فیول شیئرنگ اور لمبے روٹس کی بچت۔'
                )}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section
        id="how-it-works"
        className={`w-full py-14 sm:py-16 border-y transition-colors ${
          isDark
            ? 'bg-[#0D0D10] border-[#D4A017]/25 text-white'
            : 'bg-[#F4F5F7] border-zinc-200 text-[#0D0D10]'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div
            className={`rounded-2xl p-6 sm:p-8 space-y-5 ${
              isDark
                ? 'bg-[#14151B] border border-[#D4A017]/25'
                : 'bg-white border border-zinc-200 shadow-[0_1px_3px_rgba(13,13,16,0.04)]'
            }`}
          >
            <div className="space-y-1.5">
              <p className={`text-xs font-extrabold uppercase tracking-widest ${kickerColor}`}>
                {tr(lang, 'Passenger Journey', 'مسافر کا طریقہ کار')}
              </p>
              <h2
                className={`font-display text-2xl font-extrabold ${headingColor} ${
                  isUr ? 'leading-[1.6]' : 'leading-tight'
                }`}
              >
                {tr(lang, 'Book in 4 Clear Steps', '4 آسان مراحل میں سواری بُک کریں')}
              </h2>
            </div>
            <ol className={`space-y-3.5 text-sm font-medium leading-relaxed ${bodyColor}`}>
              <li className="flex items-start gap-3">
                <span className={`font-mono font-bold tabular-nums shrink-0 ${kickerColor}`}>01.</span>
                <span>{tr(lang, 'Choose Pick & Drop, Ride Sharing, or Fuel Sharing.', 'پِک اینڈ ڈراپ، رائیڈ شیئرنگ یا فیول شیئرنگ منتخب کریں۔')}</span>
              </li>
              <li className="flex items-start gap-3">
                <span className={`font-mono font-bold tabular-nums shrink-0 ${kickerColor}`}>02.</span>
                <span>{tr(lang, 'Set Pickup & Drop-off on the live map to compute actual road distance & duration.', 'لائیو نقشے پر پِک اپ اور ڈراپ مقام منتخب کر کے درست فاصلہ دیکھیں۔')}</span>
              </li>
              <li className="flex items-start gap-3">
                <span className={`font-mono font-bold tabular-nums shrink-0 ${kickerColor}`}>03.</span>
                <span>{tr(lang, 'Pick Go Now or Schedule, choose an eligible vehicle class, and review Pro Partner offers.', 'گو ناؤ یا شیڈول منتخب کریں اور ڈرائیورز کی آفرز دیکھیں۔')}</span>
              </li>
              <li className="flex items-start gap-3">
                <span className={`font-mono font-bold tabular-nums shrink-0 ${kickerColor}`}>04.</span>
                <span>{tr(lang, 'Track your trip live, pay via Wallet or Cash, and download your official PKR PDF invoice.', 'لائیو ٹریک کریں، والٹ یا نقد ادائیگی کریں اور PKR پی ڈی ایف رسید حاصل کریں۔')}</span>
              </li>
            </ol>
            <button
              type="button"
              onClick={() => onNavigate('/passenger')}
              className={`pr-no-recolor mt-2 inline-flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-extrabold transition-colors min-h-[42px] ${
                isDark
                  ? 'bg-[#D4A017] text-[#0D0D10] hover:bg-[#EAB308]'
                  : 'bg-[#0D0D10] text-white hover:bg-zinc-800'
              }`}
            >
              {tr(lang, 'Passenger Login / Register', 'مسافر لاگ ان / رجسٹریشن')}
              <ArrowRight className={`w-4 h-4 ${isUr ? 'rotate-180' : ''}`} />
            </button>
          </div>

          <div
            className={`rounded-2xl p-6 sm:p-8 space-y-5 ${
              isDark
                ? 'bg-[#14151B] border border-[#D4A017]/25'
                : 'bg-white border border-zinc-200 shadow-[0_1px_3px_rgba(13,13,16,0.04)]'
            }`}
          >
            <div className="space-y-1.5">
              <p className={`text-xs font-extrabold uppercase tracking-widest ${kickerColor}`}>
                {tr(lang, 'Pro Partner Journey', 'ڈرائیور / پرو پارٹنر کا طریقہ کار')}
              </p>
              <h2
                className={`font-display text-2xl font-extrabold ${headingColor} ${
                  isUr ? 'leading-[1.6]' : 'leading-tight'
                }`}
              >
                {tr(lang, 'Drive & Earn with Verification', 'تصدیق کے ساتھ باعزت کمائی کریں')}
              </h2>
            </div>
            <ol className={`space-y-3.5 text-sm font-medium leading-relaxed ${bodyColor}`}>
              <li className="flex items-start gap-3">
                <span className={`font-mono font-bold tabular-nums shrink-0 ${kickerColor}`}>01.</span>
                <span>{tr(lang, 'Register as a Pro Partner with CNIC, Driving Licence, and Vehicle Registration.', 'شناختی کارڈ، ڈرائیونگ لائسنس اور گاڑی کی دستاویزات کے ساتھ رجسٹر ہوں۔')}</span>
              </li>
              <li className="flex items-start gap-3">
                <span className={`font-mono font-bold tabular-nums shrink-0 ${kickerColor}`}>02.</span>
                <span>{tr(lang, 'Complete Admin document verification to unlock live Passenger request feeds.', 'ایڈمن کی منظوری کے بعد مسافروں کی لائیو درخواستیں حاصل کریں۔')}</span>
              </li>
              <li className="flex items-start gap-3">
                <span className={`font-mono font-bold tabular-nums shrink-0 ${kickerColor}`}>03.</span>
                <span>{tr(lang, 'Accept, Skip, or Counter-Offer Passenger bookings within regulated fare limits.', 'مقررہ حد کے اندر کرایہ آفر بھیجیں یا بُکنگ قبول کریں۔')}</span>
              </li>
              <li className="flex items-start gap-3">
                <span className={`font-mono font-bold tabular-nums shrink-0 ${kickerColor}`}>04.</span>
                <span>{tr(lang, 'Manage trip milestones sequentially and withdraw net PKR earnings from your Wallet.', 'سفر کے مراحل مکمل کریں اور اپنے والٹ سے PKR آمدنی نکلوائیں۔')}</span>
              </li>
            </ol>
            <button
              type="button"
              onClick={() => onNavigate('/partner')}
              className={`pr-no-recolor mt-2 inline-flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-extrabold transition-colors min-h-[42px] ${
                isDark
                  ? 'border border-[#D4A017] text-[#F4C430] hover:bg-[#D4A017] hover:text-[#0D0D10]'
                  : 'border-2 border-[#0D0D10] text-[#0D0D10] bg-white hover:bg-[#0D0D10] hover:text-white'
              }`}
            >
              {tr(lang, 'Pro Partner Login / Register', 'پرو پارٹنر لاگ ان / رجسٹریشن')}
              <ArrowRight className={`w-4 h-4 ${isUr ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
      </section>

      {/* Monthly Packages */}
      <section
        id="packages"
        className={`w-full py-14 sm:py-16 transition-colors ${isDark ? 'bg-[#08080B]' : 'bg-white'}`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-1.5">
              <p className={`text-xs font-extrabold uppercase tracking-widest ${kickerColor}`}>
                {tr(lang, 'Monthly Packages', 'ماہانہ پیکیجز')}
              </p>
              <h2
                className={`font-display text-2xl sm:text-3xl font-extrabold tracking-tight ${headingColor} ${
                  isUr ? 'leading-[1.6]' : 'leading-tight'
                }`}
              >
                {tr(lang, 'Structured Commute Plans', 'منظم ماہانہ سفری پلانز')}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('/passenger')}
              className={`text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                isDark ? 'text-[#F4C430] hover:text-white' : 'text-[#0D0D10] hover:text-[#9A6E08]'
              }`}
            >
              {tr(lang, 'Schedule a Monthly Package', 'ماہانہ پیکیج بُک کریں')}
              <ArrowRight className={`w-3.5 h-3.5 ${isUr ? 'rotate-180' : ''}`} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {(config?.packages || []).map((pkg) => (
              <div
                key={pkg.id}
                className={`rounded-2xl p-6 flex flex-col justify-between space-y-5 transition-colors ${cardBase}`}
              >
                <div className="space-y-2.5">
                  <div className={`flex items-center justify-between text-xs font-semibold ${mutedColor}`}>
                    <span className="tabular-nums">
                      {pkg.duration_days} {tr(lang, 'Days', 'دن')} · {pkg.trips_included} {tr(lang, 'Trips', 'سفر')}
                    </span>
                    <span className={`font-extrabold tabular-nums ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}>
                      {pkg.discount_pct}% {tr(lang, 'Savings', 'بچت')}
                    </span>
                  </div>
                  <h3 className={`font-display text-lg font-extrabold ${headingColor}`}>{pkg.name}</h3>
                  <p className={`text-sm leading-relaxed font-medium ${bodyColor}`}>{pkg.description}</p>
                </div>
                <div
                  className={`pt-4 border-t flex items-center justify-between gap-3 ${
                    isDark ? 'border-zinc-800' : 'border-zinc-200'
                  }`}
                >
                  <span
                    className={`font-mono text-xl font-extrabold tabular-nums ${
                      isDark ? 'text-[#F4C430]' : 'text-[#0D0D10]'
                    }`}
                  >
                    Rs. {pkg.base_monthly_pkr.toLocaleString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      sessionStorage.setItem('pr_initial_service', pkg.service_type);
                      sessionStorage.setItem('pr_initial_mode', 'schedule');
                      sessionStorage.setItem('pr_initial_package_days', String(pkg.duration_days === 26 ? 26 : 22));
                      if (pkg.vehicle_category_id) {
                        sessionStorage.setItem('pr_initial_vehicle', pkg.vehicle_category_id);
                      }
                      onNavigate('/passenger');
                    }}
                    className={`pr-no-recolor px-4 py-2.5 rounded-xl text-xs font-extrabold transition-colors whitespace-nowrap min-h-[38px] ${
                      isDark
                        ? 'bg-[#D4A017] text-[#0D0D10] hover:bg-[#EAB308]'
                        : 'bg-[#0D0D10] text-white hover:bg-zinc-800'
                    }`}
                  >
                    {tr(lang, 'Select Plan', 'منتخب کریں')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Fleet Showcase */}
      <section
        id="fleet"
        className={`w-full border-y py-14 sm:py-16 transition-colors ${
          isDark ? 'bg-[#0D0D10] border-[#D4A017]/20' : 'bg-[#F4F5F7] border-zinc-200'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="space-y-1.5">
            <p className={`text-xs font-extrabold uppercase tracking-widest ${kickerColor}`}>
              {tr(lang, 'Fleet Categories', 'گاڑیوں کی اقسام')}
            </p>
            <h2
              className={`font-display text-2xl sm:text-3xl font-extrabold tracking-tight ${headingColor} ${
                isUr ? 'leading-[1.6]' : 'leading-tight'
              }`}
            >
              {tr(lang, 'Inspected Vehicles & Transparent Tariffs', 'معیاری گاڑیاں اور شفاف کرایہ')}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {(config?.fleet || [])
              .filter((f) => f.is_active === 1)
              .map((f) => (
                <div
                  key={f.id}
                  className={`rounded-2xl p-5 space-y-3.5 transition-colors ${cardBase}`}
                >
                  <VehicleImage src={f.image_url} alt={f.name} categorySlug={f.slug} className="w-full h-36" />
                  <div>
                    <h3 className={`font-display font-extrabold text-base ${headingColor}`}>{f.name}</h3>
                    <p className={`text-xs font-medium mt-1 leading-snug ${mutedColor}`}>{f.tagline}</p>
                  </div>
                  <div
                    className={`pt-3 border-t flex items-center justify-between text-xs ${
                      isDark ? 'border-zinc-800' : 'border-zinc-200'
                    }`}
                  >
                    <span className={`font-semibold tabular-nums ${bodyColor}`}>
                      {f.seating_capacity} {tr(lang, 'Seats', 'سیٹیں')}
                    </span>
                    <span
                      className={`font-mono font-extrabold tabular-nums ${
                        isDark ? 'text-[#F4C430]' : 'text-[#0D0D10]'
                      }`}
                    >
                      Rs. {f.per_km_min_pkr}–{f.per_km_max_pkr}/km
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </section>

      {/* Safety, Business Partnerships & FAQ */}
      <section className={`w-full py-14 sm:py-16 transition-colors ${isDark ? 'bg-[#08080B]' : 'bg-white'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-5 space-y-6">
            <div className={`rounded-2xl p-6 sm:p-7 space-y-3.5 ${cardBase}`}>
              <ShieldCheck className={`w-6 h-6 ${kickerColor}`} />
              <h3 className={`font-display text-xl font-extrabold ${headingColor}`}>
                {tr(lang, 'Safety & Trust Architecture', 'سیکیورٹی اور اعتماد کا نظام')}
              </h3>
              <ul className={`space-y-3 text-sm font-medium ${bodyColor}`}>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className={`w-4 h-4 mt-0.5 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`} />
                  <span>
                    {tr(
                      lang,
                      'CNIC, Driving Licence & Vehicle Book verification before Pro Partner activation.',
                      'پرو پارٹنر کو فعال کرنے سے پہلے شناختی کارڈ، لائسنس اور گاڑی کے کاغذات کی مکمل تصدیق۔'
                    )}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <FileText className={`w-4 h-4 mt-0.5 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`} />
                  <span>
                    {tr(
                      lang,
                      'Every trip generates a verified PDF Digital Invoice with exact transaction IDs.',
                      'ہر سفر کے مکمل ہونے پر مصدقہ PKR ڈیجیٹل PDF انوائس۔'
                    )}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CalendarClock className={`w-4 h-4 mt-0.5 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`} />
                  <span>
                    {tr(
                      lang,
                      'Live GPS sharing strictly scoped to active Passenger bookings.',
                      'خاندان کے افراد کے لیے لائیو GPS سفر ٹریکنگ لنک کی سہولت۔'
                    )}
                  </span>
                </li>
              </ul>
            </div>

            <div
              className={`rounded-2xl p-6 sm:p-7 space-y-3.5 transition-colors ${
                isDark
                  ? 'bg-[#16140D] border border-[#D4A017]/45 text-white'
                  : 'bg-[#FFFDF7] border border-[#D4A017]/55 text-[#0D0D10] shadow-[0_1px_3px_rgba(13,13,16,0.04)]'
              }`}
            >
              <Building2 className={`w-6 h-6 ${kickerColor}`} />
              <h3 className={`font-display text-xl font-extrabold ${headingColor}`}>
                {tr(lang, 'Business & University Partnerships', 'کارپوریٹ اور یونیورسٹی معاہدے')}
              </h3>
              <p className={`text-sm leading-relaxed font-medium ${bodyColor}`}>
                {tr(
                  lang,
                  'Corporate fleet scheduling, consolidated monthly PKR invoicing, and dedicated Coaster/Sedan corridors for companies and universities across Pakistan.',
                  'پاکستان بھر کی کمپنیوں اور یونیورسٹیوں کے لیے کوسٹر، ہائی ایس اور سیڈان گاڑیوں کی ماہانہ شیڈولنگ۔'
                )}
              </p>
              <a
                href="https://wa.me/923125007782"
                target="_blank"
                rel="noreferrer"
                className={`inline-flex items-center gap-2 text-xs font-extrabold hover:underline ${kickerColor}`}
              >
                {tr(lang, 'Discuss Corporate Mobility on WhatsApp (03125007782)', 'کارپوریٹ موبلٹی کے لیے واٹس ایپ کریں (03125007782)')}
              </a>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-4">
            <h3
              className={`font-display text-2xl font-extrabold ${headingColor} ${
                isUr ? 'leading-[1.6]' : 'leading-tight'
              }`}
            >
              {tr(lang, 'Frequently Asked Questions', 'اکثر پوچھے جانے والے سوالات')}
            </h3>
            <div
              className={`rounded-2xl overflow-hidden border divide-y ${
                isDark
                  ? 'bg-[#131419] border-[#D4A017]/25 divide-zinc-800'
                  : 'bg-white border-zinc-200 divide-zinc-200 shadow-[0_1px_3px_rgba(13,13,16,0.04)]'
              }`}
            >
              {faqs.map((item, idx) => (
                <div key={idx}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                    className={`w-full px-5 py-4 text-start flex items-center justify-between gap-4 font-bold text-sm sm:text-[15px] transition-colors ${
                      isDark ? 'text-white hover:bg-[#1B1D24]' : 'text-[#0D0D10] hover:bg-zinc-50'
                    }`}
                  >
                    <span className={isUr ? 'leading-relaxed' : ''}>{item.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform shrink-0 ${mutedColor} ${
                        openFaq === idx ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {openFaq === idx && (
                    <div className={`px-5 pb-5 text-sm leading-relaxed font-medium ${bodyColor}`}>{item.a}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section
        id="contact"
        className={`w-full border-t py-14 sm:py-16 transition-colors ${
          isDark ? 'bg-[#0D0D10] border-[#D4A017]/20' : 'bg-[#F4F5F7] border-zinc-200'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div className="space-y-3.5">
            <p className={`text-xs font-extrabold uppercase tracking-widest ${kickerColor}`}>
              {tr(lang, 'Contact & Support', 'رابطہ اور سپورٹ')}
            </p>
            <h2
              className={`font-display text-2xl sm:text-3xl font-extrabold ${headingColor} ${
                isUr ? 'leading-[1.6]' : 'leading-tight'
              }`}
            >
              {tr(lang, '24/7 Official Support', '24/7 آفیشل سپورٹ')}
            </h2>
            <p className={`text-sm sm:text-base font-medium leading-relaxed ${bodyColor}`}>
              {tr(
                lang,
                'Reach PRO RIDER AI operations directly on WhatsApp or email for corporate inquiries, partner onboarding, and passenger assistance.',
                'کارپوریٹ معلومات، ڈرائیور رجسٹریشن یا مسافر مدد کے لیے واٹس ایپ یا ای میل پر براہِ راست رابطہ کریں۔'
              )}
            </p>
            <div className="pt-2 space-y-2.5 text-sm">
              <a
                href="https://wa.me/923125007782"
                target="_blank"
                rel="noreferrer"
                className={`inline-flex items-center gap-2 font-mono font-extrabold transition-colors ${
                  isDark ? 'text-white hover:text-[#F4C430]' : 'text-[#0D0D10] hover:text-[#9A6E08]'
                }`}
              >
                <PhoneCall className={`w-4 h-4 ${kickerColor}`} />
                {tr(lang, 'WhatsApp / Phone: 03125007782', 'واٹس ایپ / فون: 03125007782')}
              </a>
              <p className={`font-mono text-xs font-semibold ${mutedColor}`}>
                {tr(lang, 'Official Email:', 'آفیشل ای میل:')} ProRider.pk786@gmail.com
              </p>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setContactSent(true);
            }}
            className={`rounded-2xl p-6 sm:p-7 space-y-4 ${cardBase}`}
          >
            <h3 className={`font-display font-extrabold text-lg ${headingColor}`}>
              {tr(lang, 'Send an Inquiry', 'پیغام بھیجیں')}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                required
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder={tr(lang, 'Full Name', 'مکمل نام')}
                className={`px-3.5 py-2.5 rounded-xl border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#D4A017]/35 ${
                  isDark
                    ? 'bg-[#1B1D24] border-zinc-700 text-white placeholder:text-zinc-400 focus:border-[#F4C430]'
                    : 'bg-white border-zinc-300 text-[#0D0D10] placeholder:text-zinc-500 focus:border-[#0D0D10]'
                }`}
              />
              <input
                required
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder={tr(lang, 'Mobile / WhatsApp (03...)', 'موبائل / واٹس ایپ نمبر')}
                className={`px-3.5 py-2.5 rounded-xl border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#D4A017]/35 ${
                  isDark
                    ? 'bg-[#1B1D24] border-zinc-700 text-white placeholder:text-zinc-400 focus:border-[#F4C430]'
                    : 'bg-white border-zinc-300 text-[#0D0D10] placeholder:text-zinc-500 focus:border-[#0D0D10]'
                }`}
              />
            </div>
            <textarea
              required
              rows={3}
              value={contactMessage}
              onChange={(e) => setContactMessage(e.target.value)}
              placeholder={tr(lang, 'How can our mobility team help?', 'ہم آپ کی کیا مدد کر سکتے ہیں؟')}
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#D4A017]/35 ${
                isDark
                  ? 'bg-[#1B1D24] border-zinc-700 text-white placeholder:text-zinc-400 focus:border-[#F4C430]'
                  : 'bg-white border-zinc-300 text-[#0D0D10] placeholder:text-zinc-500 focus:border-[#0D0D10]'
              }`}
            />
            {contactSent ? (
              <div className="space-y-2">
                <p className={`text-xs font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}>
                  {tr(
                    lang,
                    'Inquiry received. For immediate response, message us on WhatsApp at 03125007782.',
                    'آپ کا پیغام موصول ہو گیا ہے۔ فوری جواب کے لیے واٹس ایپ 03125007782 پر رابطہ کریں۔'
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setContactSent(false);
                    setContactName('');
                    setContactPhone('');
                    setContactMessage('');
                  }}
                  className={`text-xs font-bold underline ${kickerColor}`}
                >
                  {tr(lang, 'Send another inquiry', 'نیا پیغام بھیجیں')}
                </button>
              </div>
            ) : (
              <button
                type="submit"
                className={`pr-no-recolor px-5 py-3 rounded-xl text-xs font-extrabold transition-colors min-h-[42px] ${
                  isDark
                    ? 'bg-[#D4A017] text-[#0D0D10] hover:bg-[#EAB308]'
                    : 'bg-[#0D0D10] text-white hover:bg-zinc-800'
                }`}
              >
                {tr(lang, 'Submit Inquiry', 'پیغام ارسال کریں')}
              </button>
            )}
          </form>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer
        className={`w-full border-t py-8 transition-colors ${
          isDark
            ? 'bg-[#08080B] border-[#D4A017]/20 text-zinc-400'
            : 'bg-white border-zinc-200 text-zinc-700'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <BrandLogo compact lang={lang} dark={isDark} />
            <span className="text-xs font-medium">
              {tr(lang, 'Travel with Trust · Currency: PKR (Rs.)', 'اعتماد کے ساتھ سفر کریں · کرنسی: پاکستانی روپے')}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4 sm:gap-5 text-xs font-extrabold">
            <button
              type="button"
              onClick={() => onNavigate('/about')}
              className={isDark ? 'hover:text-[#F4C430]' : 'text-[#0D0D10] hover:text-[#9A6E08]'}
            >
              {tr(lang, 'About Us', 'ہمارے بارے میں')}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/privacy')}
              className={isDark ? 'hover:text-[#F4C430]' : 'text-[#0D0D10] hover:text-[#9A6E08]'}
            >
              {tr(lang, 'Privacy & Policy', 'پرائیویسی اور پالیسی')}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/passenger')}
              className={isDark ? 'hover:text-[#F4C430]' : 'text-[#0D0D10] hover:text-[#9A6E08]'}
            >
              {tr(lang, 'Passenger Portal', 'مسافر پورٹل')}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/partner')}
              className={isDark ? 'hover:text-[#F4C430]' : 'text-[#0D0D10] hover:text-[#9A6E08]'}
            >
              {tr(lang, 'Pro Partner Portal', 'پرو پارٹنر پورٹل')}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className={isDark ? 'hover:text-[#F4C430]' : 'text-[#0D0D10] hover:text-[#9A6E08]'}
            >
              {tr(lang, 'Home', 'ہوم')}
            </button>
          </div>
        </div>
      </footer>

      <ProRiderAiCopilot persona="general" lang={lang} />
    </div>
  );
};
