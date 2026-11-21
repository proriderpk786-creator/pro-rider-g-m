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
import { BrandLogo, LanguageToggle, PWAInstallButton, VehicleImage } from '../components/BrandMark';
import { ProRiderAiCopilot } from '../components/ProRiderAiCopilot';
import type { Language, PublicConfig } from '../types';

interface PublicWebsitePageProps {
  config: PublicConfig | null;
  lang: Language;
  onChangeLang: (l: Language) => void;
  onNavigate: (path: string) => void;
}

const FAQS = [
  {
    q: 'How are Passenger and Pro Partner accounts separated?',
    a: 'PRO RIDER AI runs completely separate Passenger and Pro Partner portals with independent authentication tokens, navigation, and wallets. A Passenger account never gains Driver tools automatically.',
  },
  {
    q: 'How is route distance and fare calculated?',
    a: 'Distances and travel durations are computed along real streets via Google Maps Platform road routing, multiplied by Admin-regulated PKR per-km fleet tariffs.',
  },
  {
    q: 'Can I book recurring monthly office or university Pick & Drop?',
    a: 'Yes. Use the Schedule Booking workflow inside the Passenger App to choose Daily, Weekly, or Admin-approved Monthly Packages with fixed pickup and drop-off times.',
  },
  {
    q: 'How do Pro Partners get verified before accepting trips?',
    a: 'Drivers register through the Pro Partner portal and upload CNIC, Driving Licence, Vehicle Registration, and vehicle photos. Until Super Admin approves their documents, booking acceptance remains locked.',
  },
];

export const PublicWebsitePage: React.FC<PublicWebsitePageProps> = ({
  config,
  lang,
  onChangeLang,
  onNavigate,
}) => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [contactSent, setContactSent] = useState(false);

  return (
    <div dir={lang === 'ur' ? 'rtl' : 'ltr'} className="min-h-screen bg-white text-[#0D0D10]">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          <button type="button" onClick={() => onNavigate('/')} className="shrink-0">
            <BrandLogo compact />
          </button>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-600">
            <a href="#services" className="hover:text-[#0D0D10] whitespace-nowrap shrink-0">Services</a>
            <a href="#how-it-works" className="hover:text-[#0D0D10] whitespace-nowrap shrink-0">How It Works</a>
            <a href="#packages" className="hover:text-[#0D0D10] whitespace-nowrap shrink-0">Packages</a>
            <a href="#fleet" className="hover:text-[#0D0D10] whitespace-nowrap shrink-0">Fleet</a>
            <a href="#contact" className="hover:text-[#0D0D10] whitespace-nowrap shrink-0">Contact</a>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <LanguageToggle lang={lang} onChange={onChangeLang} />
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => onNavigate('/passenger')}
              className="px-4 py-2 rounded-lg bg-[#0D0D10] text-white text-xs font-semibold hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0"
            >
              Book a Ride
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="border-b border-zinc-200 bg-[#F8F8FA]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#B8860B]">
              Travel with Trust · Pakistan Mobility Platform
            </p>
            <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-[#0D0D10] leading-[1.1] [text-wrap:balance]">
              Smart Urban Travel, Daily Commutes &amp; Verified Pro Partners
            </h1>
            <p className="text-base text-zinc-600 leading-relaxed max-w-xl">
              PRO RIDER AI connects Passengers and verified Pro Partners across Islamabad, Rawalpindi, Lahore, and Karachi with live Google Maps road routing, transparent PKR fares, and downloadable digital invoices.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => onNavigate('/passenger')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#D4A017] text-[#0D0D10] text-sm font-bold hover:bg-[#EAB308] transition-colors whitespace-nowrap"
              >
                Book a Ride
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/partner')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0D0D10] text-white text-sm font-semibold hover:bg-zinc-800 transition-colors whitespace-nowrap"
              >
                Become a Pro Partner
              </button>
              <a
                href="#services"
                className="inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold text-zinc-700 hover:text-[#0D0D10]"
              >
                Explore Services
              </a>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="h-full min-h-[300px] rounded-3xl overflow-hidden border border-zinc-200 bg-[#0D0D10]">
              <img
                src="/src/assets/images/hero_mobility_pakistan_1794584048013.jpg"
                alt="PRO RIDER AI Fleet"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* About & Core Capabilities */}
      <section id="services" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-10">
        <div className="max-w-2xl space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#B8860B]">Our Services</p>
          <h2 className="font-display text-3xl font-bold tracking-tight">Three Mobility Modes Built for Pakistan</h2>
          <p className="text-sm text-zinc-600">
            Whether you need immediate on-demand travel, recurring monthly office commutes, or shared inter-sector fuel splitting.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-2xl border border-zinc-200 p-6 bg-white space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#0D0D10] text-[#D4A017] flex items-center justify-center">
              <MapPin className="w-5 h-5" />
            </div>
            <h3 className="font-display text-lg font-bold">01. Pick &amp; Drop</h3>
            <p className="text-sm text-zinc-600 leading-relaxed">
              Dedicated private rides for on-demand Go Now trips or scheduled daily and monthly office/school commutes.
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 p-6 bg-white space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#0D0D10] text-[#D4A017] flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="font-display text-lg font-bold">02. Ride Sharing</h3>
            <p className="text-sm text-zinc-600 leading-relaxed">
              Reserve individual seats along verified urban corridors at lower per-seat PKR tariffs with verified co-riders.
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 p-6 bg-white space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#0D0D10] text-[#D4A017] flex items-center justify-center">
              <Fuel className="w-5 h-5" />
            </div>
            <h3 className="font-display text-lg font-bold">03. Fuel Sharing</h3>
            <p className="text-sm text-zinc-600 leading-relaxed">
              Transparent fuel-cost contribution for long city corridors and inter-sector commutes calculated on exact OSRM road km.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="bg-[#0D0D10] text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#D4A017]">Passenger Journey</p>
            <h2 className="font-display text-2xl font-bold">Book in 4 Clear Steps</h2>
            <ol className="space-y-3 text-sm text-zinc-300">
              <li>01. Choose Pick &amp; Drop, Ride Sharing, or Fuel Sharing.</li>
              <li>02. Set Pickup &amp; Drop-off on the live Google Map to compute actual road distance &amp; duration.</li>
              <li>03. Pick Go Now or Schedule, choose an eligible vehicle class, and review Pro Partner offers.</li>
              <li>04. Track your trip live, pay via Wallet or Cash, and download your corporate PKR PDF invoice.</li>
            </ol>
            <button
              type="button"
              onClick={() => onNavigate('/passenger')}
              className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold"
            >
              Passenger Login / Register
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#D4A017]">Pro Partner Journey</p>
            <h2 className="font-display text-2xl font-bold">Drive &amp; Earn with Verification</h2>
            <ol className="space-y-3 text-sm text-zinc-300">
              <li>01. Register as a Pro Partner with CNIC, Driving Licence, and Vehicle Registration.</li>
              <li>02. Complete Admin document verification to unlock live Passenger request feeds.</li>
              <li>03. Accept, Skip, or Counter-Offer Passenger bookings within Admin-regulated fare limits.</li>
              <li>04. Manage trip milestones sequentially and withdraw net PKR earnings from your Driver Wallet.</li>
            </ol>
            <button
              type="button"
              onClick={() => onNavigate('/partner')}
              className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[#D4A017] text-[#D4A017] text-xs font-bold hover:bg-[#D4A017] hover:text-[#0D0D10] transition-colors"
            >
              Pro Partner Login / Register
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Monthly Packages */}
      <section id="packages" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#B8860B]">Monthly Packages</p>
            <h2 className="font-display text-3xl font-bold tracking-tight mt-1">Structured Commute Plans</h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/passenger')}
            className="text-xs font-bold text-[#0D0D10] hover:text-[#B8860B] inline-flex items-center gap-1"
          >
            Schedule a Monthly Package <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(config?.packages || []).map((pkg) => (
            <div key={pkg.id} className="rounded-2xl border border-zinc-200 p-6 bg-white flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>{pkg.duration_days} Days · {pkg.trips_included} Trips</span>
                  <span className="font-semibold text-emerald-700">{pkg.discount_pct}% Savings</span>
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
                  Select Plan
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Fleet Showcase */}
      <section id="fleet" className="bg-[#F8F8FA] border-y border-zinc-200 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#B8860B]">Fleet Categories</p>
            <h2 className="font-display text-3xl font-bold tracking-tight mt-1">Inspected Vehicles &amp; Transparent Tariffs</h2>
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
                  <span className="text-zinc-600">{f.seating_capacity} Seats</span>
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
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl border border-zinc-200 p-6 space-y-3">
            <ShieldCheck className="w-6 h-6 text-[#D4A017]" />
            <h3 className="font-display text-xl font-bold">Safety &amp; Trust Architecture</h3>
            <ul className="space-y-2 text-sm text-zinc-600">
              <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" /> CNIC, Driving Licence &amp; Vehicle Book verification before Pro Partner activation.</li>
              <li className="flex items-start gap-2"><FileText className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" /> Every trip generates a verified PDF Digital Invoice with exact transaction IDs.</li>
              <li className="flex items-start gap-2"><CalendarClock className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" /> Live GPS sharing strictly scoped to active Passenger bookings.</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-[#0D0D10] text-white p-6 space-y-3">
            <Building2 className="w-6 h-6 text-[#D4A017]" />
            <h3 className="font-display text-xl font-bold">Business &amp; University Partnerships</h3>
            <p className="text-sm text-zinc-300 leading-relaxed">
              Corporate fleet scheduling, consolidated monthly PKR invoicing, and dedicated Coaster/Sedan corridors for companies and universities across Pakistan.
            </p>
            <a
              href="https://wa.me/923125007782"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-xs font-bold text-[#D4A017] hover:underline"
            >
              Discuss Corporate Mobility on WhatsApp (03125007782)
            </a>
          </div>
        </div>

        <div className="lg:col-span-7 space-y-4">
          <h3 className="font-display text-2xl font-bold">Frequently Asked Questions</h3>
          <div className="divide-y divide-zinc-200 border border-zinc-200 rounded-2xl overflow-hidden">
            {FAQS.map((item, idx) => (
              <div key={idx} className="bg-white">
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 font-semibold text-sm hover:bg-zinc-50"
                >
                  <span>{item.q}</span>
                  <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${openFaq === idx ? 'rotate-180' : ''}`} />
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
            <p className="text-xs font-semibold uppercase tracking-widest text-[#B8860B]">Contact &amp; Support</p>
            <h2 className="font-display text-3xl font-bold">24/7 Official Support</h2>
            <p className="text-sm text-zinc-600">
              Reach PRO RIDER AI operations directly on WhatsApp or email for corporate inquiries, partner onboarding, and passenger assistance.
            </p>
            <div className="pt-2 space-y-2 text-sm">
              <a
                href="https://wa.me/923125007782"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 font-mono font-bold text-[#0D0D10] hover:text-[#B8860B]"
              >
                <PhoneCall className="w-4 h-4 text-[#D4A017]" />
                WhatsApp / Phone: 03125007782
              </a>
              <p className="text-zinc-600 font-mono text-xs">Official Email: ProRider.pk786@gmail.com</p>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setContactSent(true);
            }}
            className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4"
          >
            <h3 className="font-display font-bold text-base">Send an Inquiry</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input required placeholder="Full Name" className="px-3.5 py-2.5 rounded-xl border border-zinc-200 text-sm" />
              <input required placeholder="Mobile / WhatsApp (03...)" className="px-3.5 py-2.5 rounded-xl border border-zinc-200 text-sm" />
            </div>
            <textarea required rows={3} placeholder="How can our mobility team help?" className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 text-sm" />
            {contactSent ? (
              <p className="text-xs font-semibold text-emerald-700">
                Inquiry received. For immediate response, message us on WhatsApp at 03125007782.
              </p>
            ) : (
              <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#0D0D10] text-white text-xs font-bold hover:bg-zinc-800">
                Submit Inquiry
              </button>
            )}
          </form>
        </div>
      </section>
      <ProRiderAiCopilot persona="general" lang={lang} />
    </div>
  );
};
