import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  ExternalLink,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Radio,
  Send,
  Share2,
  ShieldCheck,
  User,
  Users,
  X,
} from 'lucide-react';
import type { Booking, Language, SavedContact } from '../types';

interface ShareTripStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking | null;
  passengerName: string;
  lang: Language;
}

const STORAGE_SAVED_CONTACTS = 'pr_saved_contacts';

function formatEtaClock(durationMin: number): string {
  const d = new Date(Date.now() + Math.max(1, durationMin) * 60000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function cleanPakistanPhone(raw: string): string {
  const digits = raw.replace(/\D+/g, '');
  if (digits.startsWith('92')) return digits;
  if (digits.startsWith('0')) return `92${digits.slice(1)}`;
  return digits;
}

export const ShareTripStatusModal: React.FC<ShareTripStatusModalProps> = ({
  isOpen,
  onClose,
  booking,
  passengerName,
  lang,
}) => {
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [saveQuickContact, setSaveQuickContact] = useState(false);
  const [savedContacts, setSavedContacts] = useState<SavedContact[]>([]);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  // Load saved contacts from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_SAVED_CONTACTS);
      if (raw) {
        setSavedContacts(JSON.parse(raw));
      }
    } catch {
      // ignore
    }
  }, []);

  const persistSavedContacts = (updated: SavedContact[]) => {
    setSavedContacts(updated);
    try {
      localStorage.setItem(STORAGE_SAVED_CONTACTS, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const handleAddCurrentToSaved = () => {
    if (!contactName.trim() || !contactPhone.trim()) return;
    const newEntry: SavedContact = {
      id: `cnt-${Date.now()}`,
      name: contactName.trim(),
      phone: contactPhone.trim(),
      createdAt: new Date().toISOString(),
    };
    const updated = [newEntry, ...savedContacts.filter((c) => c.phone !== newEntry.phone)].slice(0, 8);
    persistSavedContacts(updated);
    setSaveQuickContact(false);
  };

  const handleRemoveSavedContact = (id: string) => {
    const updated = savedContacts.filter((c) => c.id !== id);
    persistSavedContacts(updated);
  };

  const trackingUrl = useMemo(() => {
    if (!booking) return '';
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/track?id=${encodeURIComponent(booking.id)}`;
    }
    return `/track?id=${booking.id}`;
  }, [booking?.id]);

  const etaClock = useMemo(
    () => (booking ? formatEtaClock(booking.duration_min || 15) : '--:--'),
    [booking?.duration_min]
  );

  const statusLabel = useMemo(() => {
    if (!booking) return '';
    switch (booking.status) {
      case 'searching':
        return lang === 'ur' ? 'پرو پارٹنر کی تلاش جاری ہے' : 'Searching for verified Pro Partner';
      case 'negotiating':
        return lang === 'ur' ? 'کرائے کی بات چیت جاری ہے' : 'Pro Partner offers received';
      case 'confirmed':
        return lang === 'ur' ? 'بکنگ کنفرم ہو گئی ہے' : 'Booking Confirmed';
      case 'on_the_way':
        return lang === 'ur' ? 'پرو پارٹنر پک اپ کی طرف روانہ ہے' : 'Pro Partner On the Way to Pickup';
      case 'arrived':
        return lang === 'ur' ? 'پرو پارٹنر پک اپ پر پہنچ گیا ہے' : 'Pro Partner Arrived at Pickup';
      case 'started':
        return lang === 'ur' ? 'سفر جاری ہے' : 'Trip in Progress · Heading to Drop-off';
      case 'completed':
        return lang === 'ur' ? 'سفر بخیر و خوبی مکمل ہو گیا' : 'Trip Safely Completed';
      default:
        return booking.status.replaceAll('_', ' ').toUpperCase();
    }
  }, [booking?.status, lang]);

  const shareText = useMemo(() => {
    if (!booking) return '';
    const driverLine = booking.partner_name
      ? lang === 'ur'
        ? `ڈرائیور: ${booking.partner_name} (${booking.partner_vehicle_name || 'گاڑی'} · ${booking.partner_vehicle_number || ''})`
        : `Driver: ${booking.partner_name} (${booking.partner_vehicle_name || 'Vehicle'} · ${booking.partner_vehicle_number || ''})`
      : '';

    if (lang === 'ur') {
      return `پرو رائیڈر اے آئی — لائیو سفر کا احوال\nمسافر: ${passengerName}\nبکنگ آئی ڈی: ${booking.id}\nصورتحال: ${statusLabel}\nپک اپ: ${booking.pickup_address}\nمنزل: ${booking.dropoff_address}\nسفر کا دورانیہ: تقریباً ${booking.duration_min} منٹ (${booking.distance_km} کلومیٹر)\nمتوقع آمد: ${etaClock}\n${driverLine ? driverLine + '\n' : ''}\nلائیو روٹ اور گاڑی ٹریک کرنے کے لیے یہ لنک کھولیں:\n${trackingUrl}`;
    }

    return `PRO RIDER AI — Live Trip Status\nPassenger: ${passengerName}\nBooking ID: ${booking.id}\nStatus: ${statusLabel}\nPickup: ${booking.pickup_address}\nDrop-off: ${booking.dropoff_address}\nEstimated Travel: ~${booking.duration_min} min (${booking.distance_km} km)\nExpected Arrival: ~${etaClock}\n${driverLine ? driverLine + '\n' : ''}\nTrack my live road route and driver location here:\n${trackingUrl}`;
  }, [booking, passengerName, statusLabel, etaClock, trackingUrl, lang]);

  if (!isOpen || !booking) return null;

  const canWebShare = typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function';

  const handleWebShare = async () => {
    setShareError(null);
    if (saveQuickContact) handleAddCurrentToSaved();

    if (canWebShare) {
      try {
        await (navigator as any).share({
          title: `PRO RIDER AI · Live Trip Status (${booking.id})`,
          text: shareText,
          url: trackingUrl,
        });
        setCopyFeedback(lang === 'ur' ? 'سفر کا احوال شیئر کر دیا گیا ہے' : 'Trip status shared successfully!');
        setTimeout(() => setCopyFeedback(null), 3000);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setShareError(err.message || 'Unable to open native share sheet.');
        }
      }
    } else {
      handleCopyLink();
    }
  };

  const handleShareWhatsApp = () => {
    setShareError(null);
    if (saveQuickContact) handleAddCurrentToSaved();
    const phoneDigits = cleanPakistanPhone(contactPhone);
    const waUrl = phoneDigits
      ? `https://api.whatsapp.com/send?phone=${encodeURIComponent(phoneDigits)}&text=${encodeURIComponent(shareText)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleShareSms = () => {
    setShareError(null);
    if (saveQuickContact) handleAddCurrentToSaved();
    const rawNumber = contactPhone.trim();
    const smsUrl = rawNumber
      ? `sms:${encodeURIComponent(rawNumber)}?body=${encodeURIComponent(shareText)}`
      : `sms:?body=${encodeURIComponent(shareText)}`;
    window.location.href = smsUrl;
  };

  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(trackingUrl);
      setCopyFeedback(lang === 'ur' ? 'ٹریکنگ لنک کاپی کر لیا گیا ہے!' : 'Tracking link copied to clipboard!');
      setTimeout(() => setCopyFeedback(null), 3000);
    }
  };

  const handleCopyFullMessage = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareText);
      setCopyFeedback(lang === 'ur' ? 'مکمل تفصیلات کاپی ہو گئیں!' : 'Full trip summary copied to clipboard!');
      setTimeout(() => setCopyFeedback(null), 3000);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-trip-status-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-3xl bg-white border border-zinc-200 shadow-2xl p-6 sm:p-7 space-y-5 my-8 text-left"
        onClick={(e) => e.stopPropagation()}
        dir={lang === 'ur' ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-[#0D0D10] text-[#D4A017]">
                <Radio className="w-4 h-4" />
              </span>
              <h2 id="share-trip-status-title" className="font-display text-lg sm:text-xl font-bold text-[#0D0D10]">
                {lang === 'ur' ? 'سفر کا احوال اور لائیو ٹریکنگ شیئر کریں' : 'Share Trip Status & Live ETA'}
              </h2>
            </div>
            <p className="text-xs text-zinc-500">
              {lang === 'ur'
                ? 'فیملی یا دوستوں کو لائیو روٹ، ڈرائیور کی معلومات اور متوقع آمد کا وقت بھیجیں'
                : 'Send real-time road route, vehicle info, and ETA to trusted contacts'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-xl border border-zinc-200 text-zinc-500 hover:text-[#0D0D10] hover:bg-zinc-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Trip Preview Card */}
        <div className="rounded-2xl bg-[#0D0D10] text-white p-4 sm:p-5 space-y-4 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="text-[#D4A017] font-bold">{booking.id}</span>
              <span className="text-zinc-500">·</span>
              <span className="text-zinc-400 capitalize">{booking.service_type.replaceAll('_', ' ')}</span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-950 text-emerald-400 border border-emerald-800">
              {statusLabel}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-start gap-2.5">
              <MapPin className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <span className="text-[10px] uppercase tracking-wider text-zinc-400 block font-semibold">
                  {lang === 'ur' ? 'پک اپ' : 'Pickup'}
                </span>
                <span className="text-zinc-200 font-medium truncate block">{booking.pickup_address}</span>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Navigation className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <span className="text-[10px] uppercase tracking-wider text-zinc-400 block font-semibold">
                  {lang === 'ur' ? 'منزل' : 'Drop-off'}
                </span>
                <span className="text-zinc-200 font-medium truncate block">{booking.dropoff_address}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-zinc-800 text-center font-mono">
            <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800">
              <span className="text-[10px] text-zinc-400 block uppercase">
                {lang === 'ur' ? 'فاصلہ' : 'Distance'}
              </span>
              <span className="text-xs font-bold text-white tabular-nums">{booking.distance_km} km</span>
            </div>
            <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800">
              <span className="text-[10px] text-zinc-400 block uppercase">
                {lang === 'ur' ? 'دورانیہ' : 'Travel Time'}
              </span>
              <span className="text-xs font-bold text-white tabular-nums">~{booking.duration_min} min</span>
            </div>
            <div className="p-2 rounded-xl bg-zinc-900 border border-[#D4A017]/40">
              <span className="text-[10px] text-[#D4A017] block uppercase font-bold">
                {lang === 'ur' ? 'متوقع آمد' : 'Live ETA'}
              </span>
              <span className="text-xs font-bold text-[#F4C430] tabular-nums">~{etaClock}</span>
            </div>
          </div>

          {booking.partner_name && (
            <div className="flex items-center justify-between gap-3 text-xs pt-1 border-t border-zinc-800/60 text-zinc-300">
              <div className="flex items-center gap-2 min-w-0">
                <ShieldCheck className="w-4 h-4 text-[#D4A017] shrink-0" />
                <span className="truncate">
                  {booking.partner_name} · {booking.partner_vehicle_name} ({booking.partner_vehicle_number})
                </span>
              </div>
              <span className="font-mono text-[10px] text-emerald-400 font-bold shrink-0">VERIFIED</span>
            </div>
          )}
        </div>

        {/* Contact Selection / Emergency Contact Selector */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-[#0D0D10] flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#D4A017]" />
              <span>{lang === 'ur' ? 'رابطہ منتخب کریں یا درج کریں (اختیاری)' : 'Send to Selected Contact (Optional)'}</span>
            </label>
            {savedContacts.length > 0 && (
              <span className="text-[11px] text-zinc-500 font-medium">
                {savedContacts.length} {lang === 'ur' ? 'محفوظ رابطے' : 'saved'}
              </span>
            )}
          </div>

          {savedContacts.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {savedContacts.map((c) => (
                <div
                  key={c.id}
                  className="inline-flex items-center rounded-lg bg-zinc-100 border border-zinc-200 overflow-hidden text-xs"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setContactName(c.name);
                      setContactPhone(c.phone);
                    }}
                    className="px-2.5 py-1 text-[11px] font-semibold text-[#0D0D10] hover:bg-zinc-200 transition-colors"
                  >
                    {c.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveSavedContact(c.id)}
                    aria-label={`Remove ${c.name}`}
                    className="px-1.5 py-1 text-zinc-400 hover:text-red-600 hover:bg-zinc-200 border-l border-zinc-200"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="relative">
              <User className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3 rtl:right-3 rtl:left-auto" />
              <input
                type="text"
                placeholder={lang === 'ur' ? 'نام (مثلاً امی، بھائی، دفتر)' : 'Contact Name (e.g. Mom, Brother)'}
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="w-full pl-9 pr-3 rtl:pr-9 rtl:pl-3 py-2 rounded-xl border border-zinc-200 text-xs text-[#0D0D10] placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#D4A017]"
              />
            </div>
            <div className="relative">
              <Phone className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3 rtl:right-3 rtl:left-auto" />
              <input
                type="tel"
                placeholder="03001234567"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="w-full pl-9 pr-3 rtl:pr-9 rtl:pl-3 py-2 rounded-xl border border-zinc-200 text-xs font-mono text-[#0D0D10] placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#D4A017]"
              />
            </div>
          </div>

          {contactName.trim() && contactPhone.trim() && (
            <label className="inline-flex items-center gap-2 text-xs font-medium text-zinc-600 cursor-pointer">
              <input
                type="checkbox"
                checked={saveQuickContact}
                onChange={(e) => setSaveQuickContact(e.target.checked)}
                className="accent-[#D4A017] rounded"
              />
              <span>{lang === 'ur' ? 'آئندہ کے لیے یہ رابطہ محفوظ رکھیں' : 'Save contact for quick 1-tap sharing next time'}</span>
            </label>
          )}
        </div>

        {/* 1-Click Multi-Channel Share Actions */}
        <div className="space-y-2.5 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {canWebShare && (
              <button
                type="button"
                onClick={handleWebShare}
                className="w-full py-2.5 px-4 rounded-xl bg-[#0D0D10] text-white text-xs font-bold hover:bg-zinc-800 transition-colors inline-flex items-center justify-center gap-2 shadow-sm"
              >
                <Share2 className="w-4 h-4 text-[#D4A017]" />
                <span>{lang === 'ur' ? 'ڈیوائس شیئر کے ذریعے بھیجیں...' : 'Share via Device...'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleShareWhatsApp}
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-colors inline-flex items-center justify-center gap-2 shadow-sm ${
                canWebShare
                  ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                  : 'bg-emerald-700 text-white hover:bg-emerald-800 col-span-2'
              }`}
            >
              <MessageCircle className="w-4 h-4" />
              <span>{lang === 'ur' ? 'واٹس ایپ پر بھیجیں' : 'Send to WhatsApp'}</span>
            </button>

            <button
              type="button"
              onClick={handleShareSms}
              className="w-full py-2.5 px-4 rounded-xl border border-zinc-300 text-zinc-800 text-xs font-semibold hover:bg-zinc-50 transition-colors inline-flex items-center justify-center gap-2"
            >
              <Send className="w-3.5 h-3.5 text-zinc-600" />
              <span>{lang === 'ur' ? 'ایس ایم ایس کے ذریعے بھیجیں' : 'Send via SMS'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyLink}
              className="w-full py-2.5 px-4 rounded-xl border border-zinc-300 text-zinc-800 text-xs font-semibold hover:bg-zinc-50 transition-colors inline-flex items-center justify-center gap-2"
            >
              <Copy className="w-3.5 h-3.5 text-zinc-600" />
              <span>{lang === 'ur' ? 'ٹریکنگ لنک کاپی کریں' : 'Copy Tracking Link'}</span>
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1 text-xs">
            <button
              type="button"
              onClick={handleCopyFullMessage}
              className="text-zinc-600 hover:text-[#0D0D10] underline font-medium"
            >
              {lang === 'ur' ? 'مکمل تحریری میسج کاپی کریں' : 'Copy Full Summary Message'}
            </button>
            <a
              href={trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#B8860B] hover:text-[#0D0D10] font-semibold"
            >
              <span>{lang === 'ur' ? 'لائیو ٹریکنگ پیج دیکھیں' : 'Preview Tracking Page'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Tracking URL Bar with Copy Button */}
        <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-2 flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] text-zinc-600 truncate select-all">{trackingUrl}</span>
          <button
            type="button"
            onClick={handleCopyLink}
            aria-label="Copy Link"
            className="p-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100 shrink-0"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Feedback toasts */}
        {copyFeedback && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-300 px-3.5 py-2 text-xs font-semibold text-emerald-800 flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{copyFeedback}</span>
          </div>
        )}

        {shareError && (
          <div className="rounded-xl bg-amber-50 border border-amber-300 px-3.5 py-2 text-xs font-medium text-amber-900">
            {shareError}
          </div>
        )}
      </div>
    </div>
  );
};
