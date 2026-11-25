import React from 'react';
import {
  ArrowRight,
  CarFront,
  CheckCircle2,
  FileText,
  Fuel,
  MapPin,
  PhoneCall,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import { BrandLogo, LanguageToggle, ThemeModeToggle } from '../components/BrandMark';
import { useTheme } from '../contexts/ThemeContext';
import { tr } from '../i18n/translations';
import type { Language } from '../types';

interface AboutPageProps {
  lang: Language;
  onChangeLang: (l: Language) => void;
  onNavigate: (path: string) => void;
}

export const AboutPage: React.FC<AboutPageProps> = ({ lang, onChangeLang, onNavigate }) => {
  const { isDark } = useTheme();
  const isUr = lang === 'ur';

  const headingColor = isDark ? 'text-white' : 'text-[#0D0D10]';
  const bodyColor = isDark ? 'text-zinc-200' : 'text-zinc-800';
  const mutedColor = isDark ? 'text-zinc-400' : 'text-zinc-600';
  const kickerColor = isDark ? 'text-[#F4C430]' : 'text-[#8C6200]';
  const cardBase = isDark
    ? 'bg-[#131419] border border-[#D4A017]/30 text-white'
    : 'bg-white border border-zinc-200 text-[#0D0D10] shadow-[0_1px_3px_rgba(13,13,16,0.05)]';

  const passengerSteps = [
    {
      num: '01',
      title: tr(lang, 'Choose Your Travel Mode', 'سفر کی قسم منتخب کریں'),
      desc: tr(
        lang,
        'Open the Passenger Portal and select Instant Booking for immediate dispatch, or choose Pick & Drop, Ride Sharing, or Fuel Sharing for scheduled daily and monthly travel.',
        'مسافر پورٹل کھول کر فوری روانگی کے لیے انسٹنٹ بکنگ منتخب کریں، یا روزانہ و ماہانہ سفر کے لیے پک اینڈ ڈراپ، رائیڈ شیئرنگ یا فیول شیئرنگ چُنیں۔'
      ),
    },
    {
      num: '02',
      title: tr(lang, 'Pin Pickup & Drop-off on Live Map', 'لائیو نقشے پر پِک اپ اور منزل لگائیں'),
      desc: tr(
        lang,
        'Search your sector, street, or phase or drag the pin directly on the map. Real road distance, estimated minutes, and regulated PKR fares appear immediately.',
        'اپنا سیکٹر، سڑک یا فیز تلاش کریں یا نقشے پر پن لگائیں۔ اصل سڑک کا فاصلہ، وقت اور شفاف PKR کرایہ فوراً سامنے آ جائے گا۔'
      ),
    },
    {
      num: '03',
      title: tr(lang, 'Set Schedule & Vehicle Class', 'اوقاتِ کار اور گاڑی کی قسم منتخب کریں'),
      desc: tr(
        lang,
        'Pick travel timings, days, seats, and select from 13 verified classes ranging from Bike, Alto, and Cultus to Corolla, Civic, 7-Seater Vans, and 28-Seat Coasters.',
        'اپنے اوقات، سفر کے دن اور سیٹیں طے کریں اور بائیک، آلٹو، کلٹس سے لے کر کرولا، سوک، 7 سیٹر وین اور 28 سیٹر کوسٹر تک 13 اقسام میں سے گاڑی چُنیں۔'
      ),
    },
    {
      num: '04',
      title: tr(lang, 'Confirm, Track Live & Download Invoice', 'تصدیق، لائیو ٹریکنگ اور پی ڈی ایف رسید'),
      desc: tr(
        lang,
        'Review Pro Partner offers or confirm directly, share your live trip link with family, pay via Cash, Wallet, JazzCash, or EasyPaisa, and download an official PDF bill.',
        'ڈرائیورز کی آفرز دیکھ کر تصدیق کریں، خاندان کے ساتھ لائیو ٹریکنگ لنک شیئر کریں، نقد، والٹ، جاز کیش یا ایزی پیسہ سے ادائیگی کریں اور سرکاری PDF بل حاصل کریں۔'
      ),
    },
  ];

  const partnerSteps = [
    {
      num: '01',
      title: tr(lang, 'Register Once & Upload Documents', 'ایک بار رجسٹریشن اور دستاویزات جمع کروائیں'),
      desc: tr(
        lang,
        'Create your Pro Partner account and submit your CNIC, Driving Licence, Vehicle Registration, and car photos. Your entered IDs stay securely saved in your account — no repeated re-typing.',
        'پرو پارٹنر اکاؤنٹ بنا کر اپنا شناختی کارڈ، ڈرائیونگ لائسنس، گاڑی کی کاپی اور تصاویر اپ لوڈ کریں۔ آپ کی درج کردہ تفصیلات محفوظ رہتی ہیں تاکہ بار بار نہ لکھنی پڑیں۔'
      ),
    },
    {
      num: '02',
      title: tr(lang, 'Admin Verification & Account Activation', 'ایڈمن تصدیق اور اکاؤنٹ کی بحالی'),
      desc: tr(
        lang,
        'Super Admin verifies every document manually. Once approved, switch Online to receive live Passenger requests in your city across Islamabad, Rawalpindi, Lahore, and Karachi.',
        'سپر ایڈمن آپ کی دستاویزات کی خود تصدیق کرتا ہے۔ منظوری کے بعد آن لائن ہو کر اسلام آباد، راولپنڈی، لاہور اور کراچی میں مسافروں کی لائیو درخواستیں حاصل کریں۔'
      ),
    },
    {
      num: '03',
      title: tr(lang, 'Inspect Ride Card & Send Fair Offer', 'رائیڈ کارڈ دیکھیں اور مناسب آفر بھیجیں'),
      desc: tr(
        lang,
        'Each ride card cleanly highlights Pickup, Drop-off, Timing, and Proposed Fare. Open Details anytime to view full map routes, passenger notes, or send a regulated counter-offer.',
        'ہر کارڈ پر پِک اپ، منزل، وقت اور کرایہ صاف لکھا ہوتا ہے۔ مکمل نقشہ، مسافر کی تفصیل یا جوابی کرایہ آفر کے لیے ویو ڈیٹیل کھولیں۔'
      ),
    },
    {
      num: '04',
      title: tr(lang, 'Complete Trip & Withdraw PKR Earnings', 'سفر مکمل کریں اور کمائی نکلوائیں'),
      desc: tr(
        lang,
        'Follow trip milestones (On the Way, Arrived, Started, Completed). Your net PKR earnings settle directly in your Partner Wallet with transparent history.',
        'سفر کے مراحل مکمل کریں اور اپنی حلال کمائی شفاف حساب کے ساتھ براہِ راست پارٹنر والٹ میں حاصل کریں۔'
      ),
    },
  ];

  return (
    <div
      dir={isUr ? 'rtl' : 'ltr'}
      className={`min-h-screen flex flex-col transition-colors duration-200 ${
        isDark ? 'bg-[#08080B] text-white' : 'bg-white text-[#0D0D10]'
      }`}
    >
      {/* Top Navbar (Strict Mobile Fit, Zero Clipping) */}
      <header
        className={`sticky top-0 z-30 backdrop-blur-md border-b ${
          isDark
            ? 'bg-[#0D0D10]/95 border-[#D4A017]/30 text-white'
            : 'bg-white/95 border-zinc-200 text-[#0D0D10] shadow-[0_1px_4px_rgba(13,13,16,0.04)]'
        }`}
      >
        <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-1.5 sm:gap-6">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="shrink-0 flex items-center whitespace-nowrap"
          >
            <BrandLogo compact lang={lang} dark={isDark} />
          </button>

          <nav
            className={`hidden md:flex items-center gap-6 text-sm font-extrabold ${
              isDark ? 'text-zinc-200' : 'text-[#0D0D10]'
            }`}
          >
            <button
              type="button"
              onClick={() => onNavigate('/website')}
              className="whitespace-nowrap shrink-0 hover:text-[#D4A017] transition-colors"
            >
              {tr(lang, 'Website', 'ویب سائٹ')}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/about')}
              className="whitespace-nowrap shrink-0 text-[#D4A017] underline underline-offset-8"
            >
              {tr(lang, 'About Us', 'ہمارے بارے میں')}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/privacy')}
              className="whitespace-nowrap shrink-0 hover:text-[#D4A017] transition-colors"
            >
              {tr(lang, 'Privacy & Policy', 'پرائیویسی اور پالیسی')}
            </button>
          </nav>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <ThemeModeToggle dark={isDark} lang={lang} />
            <LanguageToggle lang={lang} onChange={onChangeLang} dark={isDark} />
            <button
              type="button"
              onClick={() => onNavigate('/passenger')}
              className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-extrabold transition-all whitespace-nowrap shrink-0 min-h-[34px] sm:min-h-[38px] ${
                isDark
                  ? 'bg-gradient-to-r from-[#F4C430] to-[#B8860B] text-[#0D0D10]'
                  : 'bg-[#0D0D10] text-white hover:bg-zinc-800'
              }`}
            >
              {tr(lang, 'Book a Ride', 'سواری بُک کریں')}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Intro Banner */}
        <section
          className={`border-b py-10 sm:py-16 ${
            isDark
              ? 'bg-gradient-to-b from-[#0D0D10] to-[#08080B] border-[#D4A017]/25'
              : 'bg-[#F8F8FA] border-zinc-200'
          }`}
        >
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-5">
            <p className={`text-xs font-extrabold uppercase tracking-[0.16em] ${kickerColor}`}>
              {tr(lang, 'About PRO RIDER AI · How The Platform Works', 'پرو رائیڈر اے آئی کا تعارف اور مکمل طریقہ کار')}
            </p>
            <h1
              className={`font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight ${headingColor} ${
                isUr ? 'leading-[1.6]' : 'leading-tight'
              }`}
            >
              {tr(
                lang,
                'Built for Honest Travel, Verified Drivers & Transparent PKR Fares',
                'ایماندار سفری نظام، تصدیق شدہ ڈرائیورز اور شفاف کرایوں کی ضمانت'
              )}
            </h1>
            <p className={`text-base sm:text-lg font-semibold leading-relaxed max-w-3xl ${bodyColor}`}>
              {tr(
                lang,
                'PRO RIDER AI is Pakistan’s structured mobility platform connecting everyday Passengers and verified Pro Partners across Islamabad, Rawalpindi, Lahore, and Karachi. Whether booking an urgent ride, a monthly office Pick & Drop, or sharing daily fuel costs, every fare, route, and trip is handled openly with written digital accountability.',
                'پرو رائیڈر اے آئی پاکستان کا مضبوط اور منظم سفری پلیٹ فارم ہے جو اسلام آباد، راولپنڈی، لاہور اور کراچی میں مسافروں اور تصدیق شدہ پرو پارٹنرز کو آپس میں جوڑتا ہے۔ فوری سفر ہو، دفتر یا یونیورسٹی کا ماہانہ پک اینڈ ڈراپ ہو، یا روزانہ فیول شیئرنگ — ہر مرحلہ شفاف حساب اور مکمل تحریری ریکارڈ کے ساتھ چلتا ہے۔'
              )}
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={() => onNavigate('/passenger')}
                className={`inline-flex items-center gap-2 px-5 py-3 rounded-xl text-xs sm:text-sm font-extrabold transition-colors whitespace-nowrap ${
                  isDark
                    ? 'bg-[#D4A017] text-[#0D0D10] hover:bg-[#EAB308]'
                    : 'bg-[#0D0D10] text-white hover:bg-zinc-800'
                }`}
              >
                {tr(lang, 'Start Booking as Passenger', 'مسافر کے طور پر بُک کریں')}
                <ArrowRight className={`w-4 h-4 ${isUr ? 'rotate-180' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/partner')}
                className={`inline-flex items-center gap-2 px-5 py-3 rounded-xl text-xs sm:text-sm font-extrabold border-2 transition-colors whitespace-nowrap ${
                  isDark
                    ? 'border-[#D4A017]/70 text-[#F4C430] hover:bg-[#D4A017]/10'
                    : 'border-[#0D0D10] text-[#0D0D10] bg-white hover:bg-zinc-50'
                }`}
              >
                {tr(lang, 'Join as Pro Partner', 'پرو پارٹنر بنیں')}
              </button>
            </div>
          </div>
        </section>

        {/* How Landing Page & Portals Work */}
        <section className="py-12 sm:py-16">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            <div className="space-y-1.5">
              <p className={`text-xs font-extrabold uppercase tracking-widest ${kickerColor}`}>
                {tr(lang, 'Landing Page & Portals Architecture', 'لینڈنگ پیج اور پورٹلز کا نظام')}
              </p>
              <h2 className={`font-display text-2xl sm:text-3xl font-extrabold ${headingColor} ${isUr ? 'leading-[1.6]' : ''}`}>
                {tr(lang, 'Three Dedicated Portals, Zero Confusion', 'تین الگ اور واضح پورٹل — مکمل وضاحت کے ساتھ')}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className={`rounded-2xl p-6 space-y-3 ${cardBase}`}>
                <UserCheck className={`w-6 h-6 ${kickerColor}`} />
                <h3 className={`font-display text-lg font-extrabold ${headingColor}`}>
                  {tr(lang, 'Passenger Portal', 'مسافر پورٹل')}
                </h3>
                <p className={`text-sm font-semibold leading-relaxed ${bodyColor}`}>
                  {tr(
                    lang,
                    'One tap from the Landing Page opens your booking hub: choose Instant Booking, Pick & Drop, Ride Sharing, or Fuel Sharing, set live map pins, view driver bids, and manage trips.',
                    'لینڈنگ پیج سے ایک کلک میں بُکنگ ڈیش بورڈ کھلتا ہے جہاں انسٹنٹ بکنگ، پک اینڈ ڈراپ، رائیڈ شیئرنگ یا فیول شیئرنگ کے ذریعے لائیو نقشے پر سفر بک کیا جاتا ہے۔'
                  )}
                </p>
              </div>

              <div className={`rounded-2xl p-6 space-y-3 ${cardBase}`}>
                <CarFront className={`w-6 h-6 ${kickerColor}`} />
                <h3 className={`font-display text-lg font-extrabold ${headingColor}`}>
                  {tr(lang, 'Pro Partner Portal', 'پرو پارٹنر / ڈرائیور پورٹل')}
                </h3>
                <p className={`text-sm font-semibold leading-relaxed ${bodyColor}`}>
                  {tr(
                    lang,
                    'Drivers register separately, upload documents once for Admin approval, go Online, view clean ride cards with fare & route details, and withdraw PKR earnings.',
                    'ڈرائیورز علیحدہ پورٹل میں رجسٹر ہوتے ہیں، ایک بار دستاویزات اپ لوڈ کر کے ایڈمن سے منظوری لیتے ہیں اور لائیو درخواستیں قبول کر کے باعزت کمائی کرتے ہیں۔'
                  )}
                </p>
              </div>

              <div className={`rounded-2xl p-6 space-y-3 ${cardBase}`}>
                <ShieldCheck className={`w-6 h-6 ${kickerColor}`} />
                <h3 className={`font-display text-lg font-extrabold ${headingColor}`}>
                  {tr(lang, 'Public Website & Live Tracking', 'پبلک ویب سائٹ اور لائیو ٹریکنگ')}
                </h3>
                <p className={`text-sm font-semibold leading-relaxed ${bodyColor}`}>
                  {tr(
                    lang,
                    'Visitors browse fleets, transparent per-km rates, monthly plans, and shared trip tracking links anytime without logging in.',
                    'کوئی بھی صارف لاگ ان کیے بغیر گاڑیوں کی اقسام، فی کلومیٹر ریٹس، ماہانہ پیکیجز اور خاندان کا لائیو ٹریکنگ لنک دیکھ سکتا ہے۔'
                  )}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How Passengers Book */}
        <section
          className={`border-y py-12 sm:py-16 ${
            isDark ? 'bg-[#0D0D10] border-[#D4A017]/20' : 'bg-[#F8F8FA] border-zinc-200'
          }`}
        >
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-7">
            <div className="space-y-1.5">
              <p className={`text-xs font-extrabold uppercase tracking-widest ${kickerColor}`}>
                {tr(lang, 'Step-by-Step Passenger Guide', 'مسافر کے لیے مکمل گائیڈ')}
              </p>
              <h2 className={`font-display text-2xl sm:text-3xl font-extrabold ${headingColor} ${isUr ? 'leading-[1.6]' : ''}`}>
                {tr(lang, 'How a Passenger Books & Rides', 'مسافر سواری کیسے بُک کر سکتا ہے؟')}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {passengerSteps.map((step) => (
                <div key={step.num} className={`rounded-2xl p-6 space-y-2.5 ${cardBase}`}>
                  <div className="flex items-center gap-3">
                    <span
                      className={`font-mono text-sm font-extrabold px-2.5 py-1 rounded-lg ${
                        isDark ? 'bg-[#D4A017] text-[#0D0D10]' : 'bg-[#0D0D10] text-[#F4C430]'
                      }`}
                    >
                      {step.num}
                    </span>
                    <h3 className={`font-display text-lg font-extrabold ${headingColor} ${isUr ? 'leading-relaxed' : ''}`}>
                      {step.title}
                    </h3>
                  </div>
                  <p className={`text-sm font-semibold leading-relaxed ${bodyColor}`}>{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How Drivers / Pro Partners Work */}
        <section className="py-12 sm:py-16">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-7">
            <div className="space-y-1.5">
              <p className={`text-xs font-extrabold uppercase tracking-widest ${kickerColor}`}>
                {tr(lang, 'Step-by-Step Pro Partner Guide', 'ڈرائیور / پرو پارٹنر کے لیے مکمل گائیڈ')}
              </p>
              <h2 className={`font-display text-2xl sm:text-3xl font-extrabold ${headingColor} ${isUr ? 'leading-[1.6]' : ''}`}>
                {tr(lang, 'How a Driver Joins & Operates', 'ڈرائیور کیسے شامل ہو اور کام کرے؟')}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {partnerSteps.map((step) => (
                <div key={step.num} className={`rounded-2xl p-6 space-y-2.5 ${cardBase}`}>
                  <div className="flex items-center gap-3">
                    <span
                      className={`font-mono text-sm font-extrabold px-2.5 py-1 rounded-lg ${
                        isDark ? 'bg-[#D4A017] text-[#0D0D10]' : 'bg-[#0D0D10] text-[#F4C430]'
                      }`}
                    >
                      {step.num}
                    </span>
                    <h3 className={`font-display text-lg font-extrabold ${headingColor} ${isUr ? 'leading-relaxed' : ''}`}>
                      {step.title}
                    </h3>
                  </div>
                  <p className={`text-sm font-semibold leading-relaxed ${bodyColor}`}>{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Services Summary + Direct Support */}
        <section
          className={`border-t py-12 sm:py-14 ${
            isDark ? 'bg-[#0D0D10] border-[#D4A017]/25' : 'bg-[#F8F8FA] border-zinc-200'
          }`}
        >
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className={`rounded-2xl p-6 space-y-3 ${cardBase}`}>
              <h3 className={`font-display text-xl font-extrabold ${headingColor}`}>
                {tr(lang, 'Core Mobility Guarantees', 'بنیادی سفری سہولیات')}
              </h3>
              <ul className={`space-y-2.5 text-sm font-semibold ${bodyColor}`}>
                <li className="flex items-center gap-2.5">
                  <MapPin className={`w-4 h-4 shrink-0 ${kickerColor}`} />
                  <span>{tr(lang, 'Instant On-Demand Rides & Monthly Pick & Drop', 'فوری رائیڈ اور ماہانہ پک اینڈ ڈراپ')}</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Users className={`w-4 h-4 shrink-0 ${kickerColor}`} />
                  <span>{tr(lang, 'Verified Seat-by-Seat Ride Sharing', 'تصدیق شدہ رائیڈ شیئرنگ')}</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Fuel className={`w-4 h-4 shrink-0 ${kickerColor}`} />
                  <span>{tr(lang, 'Transparent Road-KM Fuel Sharing', 'اصل سڑک کے حساب سے فیول شیئرنگ')}</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <FileText className={`w-4 h-4 shrink-0 ${kickerColor}`} />
                  <span>{tr(lang, 'Instant Digital PKR PDF Receipts', 'ہر سفر کی مصدقہ PKR پی ڈی ایف رسید')}</span>
                </li>
              </ul>
            </div>

            <div className={`rounded-2xl p-6 space-y-4 ${cardBase}`}>
              <CheckCircle2 className={`w-7 h-7 ${kickerColor}`} />
              <h3 className={`font-display text-xl font-extrabold ${headingColor}`}>
                {tr(lang, 'Read Our Honest Privacy & Refund Pledge', 'ہماری دیانتدار پرائیویسی اور ریفنڈ پالیسی پڑھیں')}
              </h3>
              <p className={`text-sm font-semibold leading-relaxed ${bodyColor}`}>
                {tr(
                  lang,
                  'We never sell your personal information, and we stand 100% behind every ride — including honest vehicle replacement or fair money-back guarantees.',
                  'ہم آپ کی ذاتی معلومات کبھی کسی کو نہیں بھیجتے اور گاڑی خرابی یا سروس نہ چلنے کی صورت میں پیسوں کی مکمل واپسی یا متبادل گاڑی کی ذمہ داری قبول کرتے ہیں۔'
                )}
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate('/privacy')}
                  className={`px-4 py-2.5 rounded-xl text-xs font-extrabold transition-colors ${
                    isDark
                      ? 'bg-[#D4A017] text-[#0D0D10] hover:bg-[#EAB308]'
                      : 'bg-[#0D0D10] text-white hover:bg-zinc-800'
                  }`}
                >
                  {tr(lang, 'View Privacy & Policy', 'پرائیویسی اور پالیسی دیکھیں')}
                </button>
                <a
                  href="https://wa.me/923125007782"
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-xs font-extrabold ${
                    isDark ? 'border-zinc-700 text-white hover:border-[#D4A017]' : 'border-zinc-300 text-[#0D0D10] hover:bg-zinc-50'
                  }`}
                >
                  <PhoneCall className="w-3.5 h-3.5 text-[#D4A017]" />
                  03125007782
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer
        className={`w-full border-t py-7 ${
          isDark ? 'bg-[#08080B] border-[#D4A017]/20 text-zinc-400' : 'bg-white border-zinc-200 text-zinc-700'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandLogo compact lang={lang} dark={isDark} />
            <span className={`text-xs font-semibold ${mutedColor}`}>
              {tr(lang, 'Travel with Trust · Currency: PKR (Rs.)', 'اعتماد کے ساتھ سفر کریں · کرنسی: پاکستانی روپے')}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs font-extrabold">
            <button type="button" onClick={() => onNavigate('/website')} className="hover:text-[#D4A017]">
              {tr(lang, 'Website', 'ویب سائٹ')}
            </button>
            <button type="button" onClick={() => onNavigate('/privacy')} className="hover:text-[#D4A017]">
              {tr(lang, 'Privacy Policy', 'پرائیویسی پالیسی')}
            </button>
            <button type="button" onClick={() => onNavigate('/passenger')} className="hover:text-[#D4A017]">
              {tr(lang, 'Passenger', 'مسافر')}
            </button>
            <button type="button" onClick={() => onNavigate('/partner')} className="hover:text-[#D4A017]">
              {tr(lang, 'Pro Partner', 'پرو پارٹنر')}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
