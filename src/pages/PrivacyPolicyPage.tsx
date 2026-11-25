import React from 'react';
import {
  CheckCircle2,
  EyeOff,
  FileCheck2,
  Lock,
  PhoneCall,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { BrandLogo, LanguageToggle, ThemeModeToggle } from '../components/BrandMark';
import { useTheme } from '../contexts/ThemeContext';
import { tr } from '../i18n/translations';
import type { Language } from '../types';

interface PrivacyPolicyPageProps {
  lang: Language;
  onChangeLang: (l: Language) => void;
  onNavigate: (path: string) => void;
}

export const PrivacyPolicyPage: React.FC<PrivacyPolicyPageProps> = ({
  lang,
  onChangeLang,
  onNavigate,
}) => {
  const { isDark } = useTheme();
  const isUr = lang === 'ur';

  const headingColor = isDark ? 'text-white' : 'text-[#0D0D10]';
  const bodyColor = isDark ? 'text-zinc-200' : 'text-zinc-800';
  const mutedColor = isDark ? 'text-zinc-400' : 'text-zinc-600';
  const kickerColor = isDark ? 'text-[#F4C430]' : 'text-[#8C6200]';
  const cardBase = isDark
    ? 'bg-[#131419] border border-[#D4A017]/30 text-white'
    : 'bg-white border border-zinc-200 text-[#0D0D10] shadow-[0_1px_3px_rgba(13,13,16,0.05)]';

  const commitments = [
    {
      icon: EyeOff,
      title: tr(
        lang,
        '1. We Never Sell or Leak Your Personal Data',
        '1. ہم آپ کی کوئی بھی ذاتی معلومات کسی کو نہیں بیچتے یا بھیجتے'
      ),
      points: [
        tr(
          lang,
          'Your mobile number, full name, email address, CNIC, driving licence, vehicle registration, and home or workplace addresses belong strictly to you — we NEVER sell, rent, trade, or send your personal information to any third party, advertiser, or outside broker.',
          'آپ کا موبائل نمبر، نام، ای میل، شناختی کارڈ، ڈرائیونگ لائسنس، گاڑی کی کاپی اور گھر یا دفتر کے پتے مکمل طور پر امانت ہیں۔ ہم آپ کی کوئی بھی ذاتی معلومات کسی تیسرے فریق، اشتہاری کمپنی یا غیر متعلقہ شخص کو ہرگز نہیں بھیجتے اور نہ فروخت کرتے ہیں۔'
        ),
        tr(
          lang,
          'Partner identity and vehicle documents are accessible solely to authorized Super Admin verification reviewers and remain safely saved inside your account.',
          'پرو پارٹنر کی دستاویزات صرف تصدیق کے لیے مجاز سپر ایڈمن دیکھ سکتے ہیں اور آپ کے اکاؤنٹ میں مکمل حفاظت سے محفوظ رہتی ہیں۔'
        ),
      ],
    },
    {
      icon: RefreshCw,
      title: tr(
        lang,
        '2. Honest Vehicle Guarantee & Fair Money-Back Refund Policy',
        '2. گاڑی خرابی، متبادل اور پیسوں کی واپسی کی ایماندار پالیسی'
      ),
      points: [
        tr(
          lang,
          'We stand honestly behind every booking and vehicle assignment. If a dispatched or provided vehicle cannot run, suffers mechanical failure, fails safety standards, or does not arrive as promised, PRO RIDER AI accepts full responsibility: we immediately dispatch a verified replacement vehicle OR return 100% of your paid/advance fare fairly without excuses.',
          'ہم اپنی سروس کی پوری دیانتداری سے ذمہ داری قبول کرتے ہیں۔ اگر کسی مسافر کو فراہم کی گئی گاڑی چل نہ سکے، راستے میں خراب ہو جائے، وعدے کے مطابق نہ پہنچے یا معیار پر پوری نہ اترے تو فوراً متبادل تصدیق شدہ گاڑی دی جائے گی یا آپ کے ادا شدہ پورے پیسے بغیر کسی حیلے بہانے کے واپس کیے جائیں گے۔'
        ),
        tr(
          lang,
          'Every fare adjustment, pre-dispatch cancellation, wallet top-up, and Pro Partner payout is recorded with exact PKR invoice logs for fair dispute resolution.',
          'ہر کرایہ، ایڈوانس ادائیگی، والٹ بیلنس اور کینسلیشن کا تحریری PKR ریکارڈ رکھا جاتا ہے تاکہ کسی کے ساتھ ناانصافی نہ ہو۔'
        ),
      ],
    },
    {
      icon: Lock,
      title: tr(
        lang,
        '3. Strict Role & Account Isolation',
        '3. مسافر، ڈرائیور اور ایڈمن اکاؤنٹس کی مکمل علیحدگی'
      ),
      points: [
        tr(
          lang,
          'Passenger, Pro Partner, and Super Admin portals operate in strictly isolated environments. Passenger bookings never expose private contact credentials until a verified trip match occurs, and no account can cross into another portal without explicit authorization.',
          'مسافر، پرو پارٹنر اور ایڈمن پورٹلز بالکل علیحدہ رکھے گئے ہیں۔ جب تک تصدیق شدہ رائیڈ طے نہ ہو، کسی کی ذاتی تفصیل غیر ضروری طور پر ظاہر نہیں کی جاتی۔'
        ),
      ],
    },
    {
      icon: ShieldCheck,
      title: tr(
        lang,
        '4. Trip-Scoped Live GPS Location Only',
        '4. صرف فعال سفر کے دوران لائیو لوکیشن شیئرنگ'
      ),
      points: [
        tr(
          lang,
          'GPS tracking is used exclusively to calculate accurate street distances and share live active-trip safety links. Once a trip is marked Completed or Cancelled, live trip tracking stops immediately.',
          'لائیو جی پی ایس صرف درست فاصلہ نکالنے اور فعال سفر کے دوران خاندان کو حفاظت کے لیے ٹریکنگ لنک دکھانے کے لیے چلتا ہے۔ سفر ختم یا کینسل ہوتے ہی لائیو ٹریکنگ خودکار طور پر بند ہو جاتی ہے۔'
        ),
      ],
    },
    {
      icon: FileCheck2,
      title: tr(
        lang,
        '5. Transparent Documents & Showcase Photo Control',
        '5. دستاویزات اور گاڑی کی تصاویر پر آپ کا مکمل اختیار'
      ),
      points: [
        tr(
          lang,
          'Pro Partners retain control over their showcase vehicle photos with explicit Public Showcase vs Admin-Only visibility switches, and stored document numbers persist cleanly so partners do not have to re-enter them repeatedly.',
          'پرو پارٹنر اپنی گاڑی کی تصاویر کو پبلک دکھانے یا صرف ایڈمن تک محدود رکھنے کا اختیار رکھتے ہیں، اور ایک بار جمع کرائے گئے شناختی و لائسنس نمبر محفوظ رہتے ہیں۔'
        ),
      ],
    },
  ];

  return (
    <div
      dir={isUr ? 'rtl' : 'ltr'}
      className={`min-h-screen flex flex-col transition-colors duration-200 ${
        isDark ? 'bg-[#08080B] text-white' : 'bg-white text-[#0D0D10]'
      }`}
    >
      {/* Top Navbar */}
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
              className="whitespace-nowrap shrink-0 hover:text-[#D4A017] transition-colors"
            >
              {tr(lang, 'About Us', 'ہمارے بارے میں')}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/privacy')}
              className="whitespace-nowrap shrink-0 text-[#D4A017] underline underline-offset-8"
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
        {/* Hero Header */}
        <section
          className={`border-b py-10 sm:py-16 ${
            isDark
              ? 'bg-gradient-to-b from-[#0D0D10] to-[#08080B] border-[#D4A017]/25'
              : 'bg-[#F8F8FA] border-zinc-200'
          }`}
        >
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
            <p className={`text-xs font-extrabold uppercase tracking-[0.16em] ${kickerColor}`}>
              {tr(lang, 'PRO RIDER AI · Privacy, Fairness & Accountability Charter', 'پرو رائیڈر اے آئی · پرائیویسی، دیانتداری اور تحفظ کی پالیسی')}
            </p>
            <h1
              className={`font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight ${headingColor} ${
                isUr ? 'leading-[1.6]' : 'leading-tight'
              }`}
            >
              {tr(
                lang,
                'Honest Policies Built on Trust, Data Protection & Fair Accountability',
                'اعتماد، دیانتداری اور آپ کے حق کے تحفظ پر مبنی مضبوط پالیسی'
              )}
            </h1>
            <p className={`text-base sm:text-lg font-semibold leading-relaxed ${bodyColor}`}>
              {tr(
                lang,
                'Good businesses stand by their word in writing. Below are our clear, plain-language commitments covering your personal data, vehicle reliability, honest refunds, and direct 24/7 accountability.',
                'اچھے اور ایماندار اداروں کا اصول واضح اور تحریری ہوتا ہے۔ ذیل میں ہماری پکی اور صاف پالیسی درج ہے کہ ہم آپ کے ڈیٹا، گاڑی کی ضمانت اور پیسوں کی واپسی کے حوالے سے کس بات کے پابند ہیں۔'
              )}
            </p>
          </div>
        </section>

        {/* Core Policy Cards */}
        <section className="py-12 sm:py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            {commitments.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className={`rounded-2xl p-6 sm:p-8 space-y-4 ${cardBase}`}>
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                        isDark
                          ? 'bg-[#1D1F27] text-[#F4C430] border border-[#D4A017]/30'
                          : 'bg-[#0D0D10] text-[#F4C430]'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <h2
                      className={`font-display text-xl sm:text-2xl font-extrabold ${headingColor} ${
                        isUr ? 'leading-[1.55]' : 'leading-snug'
                      }`}
                    >
                      {item.title}
                    </h2>
                  </div>

                  <div className="space-y-3">
                    {item.points.map((pt, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <CheckCircle2
                          className={`w-4 h-4 mt-1 shrink-0 ${
                            isDark ? 'text-emerald-400' : 'text-emerald-700'
                          }`}
                        />
                        <p className={`text-sm sm:text-base font-semibold leading-relaxed ${bodyColor}`}>
                          {pt}
                        </p>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}

            {/* Direct Accountability Box */}
            <div
              className={`rounded-2xl p-6 sm:p-8 space-y-4 ${
                isDark
                  ? 'bg-[#16140D] border-2 border-[#D4A017]/60 text-white'
                  : 'bg-[#FFFDF7] border-2 border-[#D4A017] text-[#0D0D10]'
              }`}
            >
              <h3 className={`font-display text-xl font-extrabold ${headingColor}`}>
                {tr(lang, 'Direct Human Accountability & Refund Desk', 'براہِ راست شکایت، مدد اور ریفنڈ رابطہ')}
              </h3>
              <p className={`text-sm sm:text-base font-semibold leading-relaxed ${bodyColor}`}>
                {tr(
                  lang,
                  'If any Passenger or Pro Partner ever faces a fare dispute, vehicle breakdown, or privacy concern, contact our operations desk directly — we accept every valid claim fairly and resolve issues rapidly.',
                  'اگر کسی مسافر یا پرو پارٹنر کو کرایہ، گاڑی کی خرابی یا پرائیویسی سے متعلق کوئی بھی مسئلہ درپیش ہو تو براہِ راست ہماری ٹیم سے رابطہ کریں — ہم ہر جائز معاملے کو فوری اور ایمانداری سے حل کرتے ہیں۔'
                )}
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-1 text-sm font-extrabold">
                <a
                  href="https://wa.me/923125007782"
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl ${
                    isDark ? 'bg-[#D4A017] text-[#0D0D10]' : 'bg-[#0D0D10] text-white'
                  }`}
                >
                  <PhoneCall className="w-4 h-4" />
                  WhatsApp / Call: 03125007782
                </a>
                <span className={`font-mono text-xs sm:text-sm ${mutedColor}`}>
                  Email: ProRider.pk786@gmail.com
                </span>
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
            <button type="button" onClick={() => onNavigate('/about')} className="hover:text-[#D4A017]">
              {tr(lang, 'About Us', 'ہمارے بارے میں')}
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
