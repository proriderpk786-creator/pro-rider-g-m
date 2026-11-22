import React, { useState } from 'react';
import {
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  FileText,
  Fuel,
  MapPin,
  PhoneCall,
  ShieldCheck,
  Users,
} from 'lucide-react';
import heroMobilityImg from '../assets/images/hero_mobility_pakistan_1794584048013.jpg';
import { BrandLogo, LanguageToggle, PWAInstallButton, VehicleImage } from '../components/BrandMark';
import { ProRiderAiCopilot } from '../components/ProRiderAiCopilot';
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
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [contactSent, setContactSent] = useState(false);

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

  return (
    <div dir={lang === 'ur' ? 'rtl' : 'ltr'} className="min-h-screen bg-white text-[#0D0D10]">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <button type="button" onClick={() => onNavigate('/')} className="shrink-0">
            <BrandLogo compact lang={lang} />
          </button>

          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-zinc-600">
            <a href="#services" className="hover:text-[#0D0D10] whitespace-nowrap shrink-0">
              {tr(lang, 'Services', 'سہولیات')}
            </a>
            <a href="#how-it-works" className="hover:text-[#0D0D10] whitespace-nowrap shrink-0">
              {tr(lang, 'How It Works', 'طریقہ کار')}
            </a>
            <a href="#packages" className="hover:text-[#0D0D10] whitespace-nowrap shrink-0">
              {tr(lang, 'Packages', 'پیکیجز')}
            </a>
            <a href="#fleet" className="hover:text-[#0D0D10] whitespace-nowrap shrink-0">
              {tr(lang, 'Fleet', 'گاڑیاں')}
            </a>
            <a href="#contact" className="hover:text-[#0D0D10] whitespace-nowrap shrink-0">
              {tr(lang, 'Contact', 'رابطہ')}
            </a>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <LanguageToggle lang={lang} onChange={onChangeLang} />
            <PWAInstallButton lang={lang} />
            <button
              type="button"
              onClick={() => onNavigate('/passenger')}
              className="px-3.5 py-2 rounded-lg bg-[#0D0D10] text-white text-xs font-semibold hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0"
            >
              {tr(lang, 'Book a Ride', 'سواری بُک کریں')}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="border-b border-zinc-200 bg-[#F8F8FA]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          <div className="lg:col-span-6 flex flex-col justify-center space-y-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#B8860B]">
              {tr(lang, 'Travel with Trust · Pakistan Mobility Platform', 'اعتماد کے ساتھ سفر کریں · پاکستان اسمارٹ موبلٹی')}
            </p>
            <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-[#0D0D10] leading-[1.12] [text-wrap:balance]">
              {tr(
                lang,
                'Smart Urban Travel, Daily Commutes & Verified Pro Partners',
                'جدید شہری سفر، روزانہ پِک اینڈ ڈراپ اور تصدیق شدہ پرو پارٹنرز'
              )}
            </h1>
            <p className="text-sm sm:text-base text-zinc-600 leading-relaxed max-w-xl">
              {tr(
                lang,
                'PRO RIDER AI connects Passengers and verified Pro Partners across Islamabad, Rawalpindi, Lahore, and Karachi with live road routing, transparent PKR fares, and downloadable digital invoices.',
                'پرو رائیڈر اے آئی اسلام آباد، راولپنڈی، لاہور اور کراچی میں مسافروں کو تصدیق شدہ ڈرائیورز کے ساتھ لائیو نقشے، شفاف PKR کرایہ اور ڈیجیٹل انوائس کے ساتھ جوڑتا ہے۔'
              )}
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => onNavigate('/passenger')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#D4A017] text-[#0D0D10] text-sm font-bold hover:bg-[#EAB308] transition-colors whitespace-nowrap"
              >
                {tr(lang, 'Book a Ride', 'سواری بُک کریں')}
                <ArrowRight className={`w-4 h-4 ${lang === 'ur' ? 'rotate-180' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/partner')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0D0D10] text-white text-sm font-semibold hover:bg-zinc-800 transition-colors whitespace-nowrap"
              >
                {tr(lang, 'Become a Pro Partner', 'پرو پارٹنر بنیں')}
              </button>
              <a
                href="#services"
                className="inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold text-zinc-700 hover:text-[#0D0D10]"
              >
                {tr(lang, 'Explore Services', 'سہولیات دیکھیں')}
              </a>
            </div>
          </div>

          <div className="lg:col-span-6 flex items-center justify-center">
            <div className="hero-image-container relative w-full min-h-[220px] aspect-[16/9] lg:aspect-[16/10] lg:min-h-[360px] max-h-[500px] rounded-2xl sm:rounded-3xl overflow-hidden border border-zinc-200 bg-[#0D0D10] shadow-xl flex items-center justify-center">
              <img
                src={heroMobilityImg}
                alt="PRO RIDER AI Fleet"
                referrerPolicy="no-referrer"
                className="hero-image-cover w-full h-full object-cover object-center"
                loading="eager"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-8">
        <div className="max-w-2xl space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#B8860B]">
            {tr(lang, 'Our Services', 'ہماری خدمات')}
          </p>
          <h2 className="font-display text-3xl font-bold tracking-tight">
            {tr(lang, 'Three Mobility Modes Built for Pakistan', 'پاکستان کے لیے تین جدید سفری سہولیات')}
          </h2>
          <p className="text-sm text-zinc-600">
            {tr(
              lang,
              'Whether you need immediate on-demand travel, recurring monthly office commutes, or shared inter-sector fuel splitting.',
              'فوری سفر ہو، دفتر یا یونیورسٹی کا ماہانہ پِک اینڈ ڈراپ ہو، یا شہر کے اندر فیول شیئرنگ — ہر سہولت ایک جگہ۔'
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-2xl border border-zinc-200 p-6 bg-white space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#0D0D10] text-[#D4A017] flex items-center justify-center">
              <MapPin className="w-5 h-5" />
            </div>
            <h3 className="font-display text-lg font-bold">01. {trService(lang, 'pick_and_drop')}</h3>
            <p className="text-sm text-zinc-600 leading-relaxed">
              {tr(
                lang,
                'Dedicated private rides for on-demand Go Now trips or scheduled daily and monthly office/school commutes.',
                'فوری گو ناؤ سفر یا روزانہ و ماہانہ دفتر/اسکول پِک اینڈ ڈراپ کے لیے مکمل نجی گاڑی۔'
              )}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 p-6 bg-white space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#0D0D10] text-[#D4A017] flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="font-display text-lg font-bold">02. {trService(lang, 'ride_sharing')}</h3>
            <p className="text-sm text-zinc-600 leading-relaxed">
              {tr(
                lang,
                'Reserve individual seats along verified urban corridors at lower per-seat PKR tariffs with verified co-riders.',
                'تصدیق شدہ روٹس پر کم فی سیٹ PKR کرائے میں محفوظ سیٹ شیئرنگ بکنگ۔'
              )}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 p-6 bg-white space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#0D0D10] text-[#D4A017] flex items-center justify-center">
              <Fuel className="w-5 h-5" />
            </div>
            <h3 className="font-display text-lg font-bold">03. {trService(lang, 'fuel_sharing')}</h3>
            <p className="text-sm text-zinc-600 leading-relaxed">
              {tr(
                lang,
                'Transparent fuel-cost contribution for long city corridors and inter-sector commutes calculated on exact road km.',
                'اصل سڑک کے کلومیٹر کے مطابق شفاف فیول شیئرنگ اور لمبے روٹس کی بچت۔'
              )}
            </p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="pr-preserve-light bg-[#0D0D10] text-white py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#D4A017]">
              {tr(lang, 'Passenger Journey', 'مسافر کا طریقہ کار')}
            </p>
            <h2 className="font-display text-2xl font-bold">{tr(lang, 'Book in 4 Clear Steps', '4 آسان مراحل میں سواری بُک کریں')}</h2>
            <ol className="space-y-3 text-sm text-zinc-300">
              <li>01. {tr(lang, 'Choose Pick & Drop, Ride Sharing, or Fuel Sharing.', 'پِک اینڈ ڈراپ، رائیڈ شیئرنگ یا فیول شیئرنگ منتخب کریں۔')}</li>
              <li>02. {tr(lang, 'Set Pickup & Drop-off on the live map to compute actual road distance & duration.', 'لائیو نقشے پر پِک اپ اور ڈراپ مقام منتخب کر کے درست فاصلہ دیکھیں۔')}</li>
              <li>03. {tr(lang, 'Pick Go Now or Schedule, choose an eligible vehicle class, and review Pro Partner offers.', 'گو ناؤ یا شیڈول منتخب کریں اور ڈرائیورز کی آفرز دیکھیں۔')}</li>
              <li>04. {tr(lang, 'Track your trip live, pay via Wallet or Cash, and download your official PKR PDF invoice.', 'لائیو ٹریک کریں، والٹ یا نقد ادائیگی کریں اور PKR پی ڈی ایف رسید حاصل کریں۔')}</li>
            </ol>
            <button
              type="button"
              onClick={() => onNavigate('/passenger')}
              className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold"
            >
              {tr(lang, 'Passenger Login / Register', 'مسافر لاگ ان / رجسٹریشن')}
              <ArrowRight className={`w-4 h-4 ${lang === 'ur' ? 'rotate-180' : ''}`} />
            </button>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#D4A017]">
              {tr(lang, 'Pro Partner Journey', 'ڈرائیور / پرو پارٹنر کا طریقہ کار')}
            </p>
            <h2 className="font-display text-2xl font-bold">
              {tr(lang, 'Drive & Earn with Verification', 'تصدیق کے ساتھ باعزت کمائی کریں')}
            </h2>
            <ol className="space-y-3 text-sm text-zinc-300">
              <li>01. {tr(lang, 'Register as a Pro Partner with CNIC, Driving Licence, and Vehicle Registration.', 'شناختی کارڈ، ڈرائیونگ لائسنس اور گاڑی کی دستاویزات کے ساتھ رجسٹر ہوں۔')}</li>
              <li>02. {tr(lang, 'Complete Admin document verification to unlock live Passenger request feeds.', 'ایڈمن کی منظوری کے بعد مسافروں کی لائیو درخواستیں حاصل کریں۔')}</li>
              <li>03. {tr(lang, 'Accept, Skip, or Counter-Offer Passenger bookings within regulated fare limits.', 'مقررہ حد کے اندر کرایہ آفر بھیجیں یا بُکنگ قبول کریں۔')}</li>
              <li>04. {tr(lang, 'Manage trip milestones sequentially and withdraw net PKR earnings from your Wallet.', 'سفر کے مراحل مکمل کریں اور اپنے والٹ سے PKR آمدنی نکلوائیں۔')}</li>
            </ol>
            <button
              type="button"
              onClick={() => onNavigate('/partner')}
              className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[#D4A017] text-[#D4A017] text-xs font-bold hover:bg-[#D4A017] hover:text-[#0D0D10] transition-colors"
            >
              {tr(lang, 'Pro Partner Login / Register', 'پرو پارٹنر لاگ ان / رجسٹریشن')}
              <ArrowRight className={`w-4 h-4 ${lang === 'ur' ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
      </section>

      {/* Monthly Packages */}
      <section id="packages" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#B8860B]">
              {tr(lang, 'Monthly Packages', 'ماہانہ پیکیجز')}
            </p>
            <h2 className="font-display text-3xl font-bold tracking-tight mt-1">
              {tr(lang, 'Structured Commute Plans', 'منظم ماہانہ سفری پلانز')}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/passenger')}
            className="text-xs font-bold text-[#0D0D10] hover:text-[#B8860B] inline-flex items-center gap-1"
          >
            {tr(lang, 'Schedule a Monthly Package', 'ماہانہ پیکیج بُک کریں')}
            <ArrowRight className={`w-3.5 h-3.5 ${lang === 'ur' ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(config?.packages || []).map((pkg) => (
            <div key={pkg.id} className="rounded-2xl border border-zinc-200 p-6 bg-white flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>
                    {pkg.duration_days} {tr(lang, 'Days', 'دن')} · {pkg.trips_included} {tr(lang, 'Trips', 'سفر')}
                  </span>
                  <span className="font-semibold text-emerald-700">
                    {pkg.discount_pct}% {tr(lang, 'Savings', 'بچت')}
                  </span>
                </div>
                <h3 className="font-display text-lg font-bold">{pkg.name}</h3>
                <p className="text-sm text-zinc-600">{pkg.description}</p>
              </div>
              <div className="pt-4 border-t border-zinc-100 flex items-center justify-between">
                <span className="font-mono text-xl font-bold text-[#0D0D10]">
                  Rs. {pkg.base_monthly_pkr.toLocaleString()}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('/passenger')}
                  className="px-4 py-2 rounded-lg bg-[#0D0D10] text-white text-xs font-semibold hover:bg-zinc-800"
                >
                  {tr(lang, 'Select Plan', 'منتخب کریں')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Fleet Showcase */}
      <section id="fleet" className="bg-[#F8F8FA] border-y border-zinc-200 py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#B8860B]">
              {tr(lang, 'Fleet Categories', 'گاڑیوں کی اقسام')}
            </p>
            <h2 className="font-display text-3xl font-bold tracking-tight mt-1">
              {tr(lang, 'Inspected Vehicles & Transparent Tariffs', 'معیاری گاڑیاں اور شفاف کرایہ')}
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {(config?.fleet || []).filter((f) => f.is_active === 1).map((f) => (
              <div key={f.id} className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3">
                <VehicleImage src={f.image_url} alt={f.name} className="w-full h-36" />
                <div>
                  <h3 className="font-display font-bold text-base">{f.name}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">{f.tagline}</p>
                </div>
                <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-xs">
                  <span className="text-zinc-600">
                    {f.seating_capacity} {tr(lang, 'Seats', 'سیٹیں')}
                  </span>
                  <span className="font-mono font-bold text-[#0D0D10]">
                    Rs. {f.per_km_min_pkr}–{f.per_km_max_pkr}/km
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Safety, Business Partnerships & FAQ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl border border-zinc-200 p-6 bg-white space-y-3">
            <ShieldCheck className="w-6 h-6 text-[#D4A017]" />
            <h3 className="font-display text-xl font-bold">
              {tr(lang, 'Safety & Trust Architecture', 'سیکیورٹی اور اعتماد کا نظام')}
            </h3>
            <ul className="space-y-2 text-sm text-zinc-600">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
                {tr(
                  lang,
                  'CNIC, Driving Licence & Vehicle Book verification before Pro Partner activation.',
                  'پرو پارٹنر کو فعال کرنے سے پہلے شناختی کارڈ، لائسنس اور گاڑی کے کاغذات کی مکمل تصدیق۔'
                )}
              </li>
              <li className="flex items-start gap-2">
                <FileText className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
                {tr(
                  lang,
                  'Every trip generates a verified PDF Digital Invoice with exact transaction IDs.',
                  'ہر سفر کے مکمل ہونے پر مصدقہ PKR ڈیجیٹل PDF انوائس۔'
                )}
              </li>
              <li className="flex items-start gap-2">
                <CalendarClock className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
                {tr(
                  lang,
                  'Live GPS sharing strictly scoped to active Passenger bookings.',
                  'خاندان کے افراد کے لیے لائیو GPS سفر ٹریکنگ لنک کی سہولت۔'
                )}
              </li>
            </ul>
          </div>

          <div className="pr-preserve-light rounded-2xl border border-[#D4A017]/40 bg-[#0D0D10] text-white p-6 space-y-3">
            <Building2 className="w-6 h-6 text-[#D4A017]" />
            <h3 className="font-display text-xl font-bold">
              {tr(lang, 'Business & University Partnerships', 'کارپوریٹ اور یونیورسٹی معاہدے')}
            </h3>
            <p className="text-sm text-zinc-300 leading-relaxed">
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
              className="inline-flex items-center gap-2 text-xs font-bold text-[#D4A017] hover:underline"
            >
              {tr(lang, 'Discuss Corporate Mobility on WhatsApp (03125007782)', 'کارپوریٹ موبلٹی کے لیے واٹس ایپ کریں (03125007782)')}
            </a>
          </div>
        </div>

        <div className="lg:col-span-7 space-y-4">
          <h3 className="font-display text-2xl font-bold">
            {tr(lang, 'Frequently Asked Questions', 'اکثر پوچھے جانے والے سوالات')}
          </h3>
          <div className="divide-y divide-zinc-200 border border-zinc-200 rounded-2xl overflow-hidden">
            {faqs.map((item, idx) => (
              <div key={idx} className="bg-white">
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full px-5 py-4 text-start flex items-center justify-between gap-4 font-semibold text-sm hover:bg-zinc-50"
                >
                  <span>{item.q}</span>
                  <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform shrink-0 ${openFaq === idx ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === idx && (
                  <div className="px-5 pb-4 text-sm text-zinc-600 leading-relaxed">{item.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="border-t border-zinc-200 bg-[#F8F8FA] py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#B8860B]">
              {tr(lang, 'Contact & Support', 'رابطہ اور سپورٹ')}
            </p>
            <h2 className="font-display text-3xl font-bold">{tr(lang, '24/7 Official Support', '24/7 آفیشل سپورٹ')}</h2>
            <p className="text-sm text-zinc-600">
              {tr(
                lang,
                'Reach PRO RIDER AI operations directly on WhatsApp or email for corporate inquiries, partner onboarding, and passenger assistance.',
                'کارپوریٹ معلومات، ڈرائیور رجسٹریشن یا مسافر مدد کے لیے واٹس ایپ یا ای میل پر براہِ راست رابطہ کریں۔'
              )}
            </p>
            <div className="pt-2 space-y-2 text-sm">
              <a
                href="https://wa.me/923125007782"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 font-mono font-bold text-[#0D0D10] hover:text-[#B8860B]"
              >
                <PhoneCall className="w-4 h-4 text-[#D4A017]" />
                {tr(lang, 'WhatsApp / Phone: 03125007782', 'واٹس ایپ / فون: 03125007782')}
              </a>
              <p className="text-zinc-600 font-mono text-xs">
                {tr(lang, 'Official Email:', 'آفیشل ای میل:')} ProRider.pk786@gmail.com
              </p>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setContactSent(true);
            }}
            className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4"
          >
            <h3 className="font-display font-bold text-base">{tr(lang, 'Send an Inquiry', 'پیغام بھیجیں')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input required placeholder={tr(lang, 'Full Name', 'مکمل نام')} className="px-3.5 py-2.5 rounded-xl border border-zinc-200 text-sm" />
              <input required placeholder={tr(lang, 'Mobile / WhatsApp (03...)', 'موبائل / واٹس ایپ نمبر')} className="px-3.5 py-2.5 rounded-xl border border-zinc-200 text-sm" />
            </div>
            <textarea
              required
              rows={3}
              placeholder={tr(lang, 'How can our mobility team help?', 'ہم آپ کی کیا مدد کر سکتے ہیں؟')}
              className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 text-sm"
            />
            {contactSent ? (
              <p className="text-xs font-semibold text-emerald-700">
                {tr(
                  lang,
                  'Inquiry received. For immediate response, message us on WhatsApp at 03125007782.',
                  'آپ کا پیغام موصول ہو گیا ہے۔ فوری جواب کے لیے واٹس ایپ 03125007782 پر رابطہ کریں۔'
                )}
              </p>
            ) : (
              <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#0D0D10] text-white text-xs font-bold hover:bg-zinc-800">
                {tr(lang, 'Submit Inquiry', 'پیغام ارسال کریں')}
              </button>
            )}
          </form>
        </div>
      </section>
      <ProRiderAiCopilot persona="general" lang={lang} showFloatingOnMobile />
    </div>
  );
};
