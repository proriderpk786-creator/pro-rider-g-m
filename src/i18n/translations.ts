import type { BookingStatus, Language, ServiceType, VerificationStatus } from '../types';

export const TRANSLATIONS: Record<Language, Record<string, string>> = {
  en: {
    brandName: 'PRO RIDER AI',
    tagline: 'Travel with Trust',
    welcomeHeading: 'Pakistan Smart Mobility Network',
    welcomeSub: 'Pick & Drop · Ride Sharing · Fuel Sharing',
    welcomeDesc:
      'Verified Pro Partners, live route visibility, Go Now negotiation, monthly commuter scheduling, and transparent PKR digital invoicing across Islamabad, Rawalpindi, Lahore & Karachi.',
    asPassenger: 'AS A PASSENGER',
    asPassengerSub: 'Book Pick & Drop, Ride Sharing, Fuel Sharing & Monthly Packages',
    asPartner: 'AS A DRIVER / PRO PARTNER',
    asPartnerSub: 'Receive verified Passenger requests, manage trips & track earnings',
    exploreWebsite: 'Explore PRO RIDER AI Website',
    needHelp: 'Official Support & WhatsApp',
    signIn: 'Sign In',
    register: 'Create Account',
    logout: 'Sign Out',
    goNow: 'Go Now (Instant)',
    scheduleBooking: 'Schedule (Weekly / Monthly)',
    pickAndDrop: 'Pick & Drop',
    rideSharing: 'Ride Sharing',
    fuelSharing: 'Fuel Sharing',
    calculateFare: 'Calculate Exact Route & PKR Fare',
    submitBooking: 'Confirm & Broadcast Booking',
    partnerOnline: 'Go Online (Receive Live Rides)',
    partnerOffline: 'Offline',
    supportTitle: 'Official Support',
    installApp: 'Install App',
    home: 'Home',
    myBookings: 'My Bookings',
    myTrips: 'My Trips',
    earnings: 'Earnings',
    wallet: 'Wallet',
    vehicle: 'Vehicle',
    documents: 'Documents',
    notifications: 'Notifications',
    support: 'Support',
    profile: 'Profile',
    rides: 'Rides',
    themeStudio: 'Theme Studio',
  },
  ur: {
    brandName: 'پرو رائیڈر اے آئی',
    tagline: 'اعتماد کے ساتھ سفر کریں',
    welcomeHeading: 'پاکستان اسمارٹ موبلٹی نیٹ ورک',
    welcomeSub: 'پِک اینڈ ڈراپ · رائیڈ شیئرنگ · فیول شیئرنگ',
    welcomeDesc:
      'تصدیق شدہ پرو پارٹنرز، لائیو روٹ ٹریکنگ، گو ناؤ کرایہ بات چیت، ماہانہ شیڈول پیکیجز اور اسلام آباد، راولپنڈی، لاہور و کراچی میں شفاف پاکستانی روپے (PKR) بلنگ۔',
    asPassenger: 'بطور مسافر (PASSENGER)',
    asPassengerSub: 'پِک اینڈ ڈراپ، رائیڈ شیئرنگ، فیول شیئرنگ اور ماہانہ پیکیج بُک کریں',
    asPartner: 'بطور ڈرائیور / پرو پارٹنر (PRO PARTNER)',
    asPartnerSub: 'مسافروں کی بُکنگ حاصل کریں، کرایہ آفر بھیجیں اور آمدنی دیکھیں',
    exploreWebsite: 'پرو رائیڈر اے آئی ویب سائٹ دیکھیں',
    needHelp: 'آفیشل سپورٹ اور واٹس ایپ',
    signIn: 'سائن ان کریں',
    register: 'نیا اکاؤنٹ بنائیں',
    logout: 'لاگ آؤٹ',
    goNow: 'گو ناؤ (فوری سفر)',
    scheduleBooking: 'شیڈول (ہفتہ وار / ماہانہ)',
    pickAndDrop: 'پِک اینڈ ڈراپ',
    rideSharing: 'رائیڈ شیئرنگ',
    fuelSharing: 'فیول شیئرنگ',
    calculateFare: 'درست فاصلہ اور کرایہ معلوم کریں',
    submitBooking: 'بُکنگ کنفرم کریں اور ڈرائیورز کو بھیجیں',
    partnerOnline: 'آن لائن ہوں (سفری درخواستیں حاصل کریں)',
    partnerOffline: 'آف لائن',
    supportTitle: 'آفیشل سپورٹ سینٹر',
    installApp: 'ایپ انسٹال کریں',
    home: 'ہوم',
    myBookings: 'میری بکنگز',
    myTrips: 'میرے ٹرپس',
    earnings: 'آمدنی',
    wallet: 'والیٹ',
    vehicle: 'گاڑی',
    documents: 'دستاویزات',
    notifications: 'نوٹیفکیشنز',
    support: 'سپورٹ',
    profile: 'پروفائل',
    rides: 'رائیڈز',
    themeStudio: 'تھیم اسٹوڈیو',
  },
};

export function t(lang: Language, key: string): string {
  return TRANSLATIONS[lang]?.[key] || TRANSLATIONS.en[key] || key;
}

export function tr(lang: Language, en: string, ur: string): string {
  return lang === 'ur' ? ur : en;
}

export function trService(lang: Language, type: ServiceType | string): string {
  if (type === 'pick_and_drop') return tr(lang, 'Pick & Drop', 'پِک اینڈ ڈراپ');
  if (type === 'ride_sharing') return tr(lang, 'Ride Sharing', 'رائیڈ شیئرنگ');
  if (type === 'fuel_sharing') return tr(lang, 'Fuel Sharing', 'فیول شیئرنگ');
  return String(type).replaceAll('_', ' ');
}

export function trBookingStatus(lang: Language, status: BookingStatus | string): string {
  switch (status) {
    case 'searching':
      return tr(lang, 'Searching Drivers', 'ڈرائیور تلاش ہو رہا ہے');
    case 'negotiating':
      return tr(lang, 'Negotiating Fare', 'کرایہ طے ہو رہا ہے');
    case 'confirmed':
      return tr(lang, 'Confirmed', 'بُکنگ کنفرم');
    case 'on_the_way':
      return tr(lang, 'Driver On The Way', 'ڈرائیور راستے میں ہے');
    case 'arrived':
      return tr(lang, 'Driver Arrived', 'ڈرائیور پہنچ گیا ہے');
    case 'started':
      return tr(lang, 'Trip In Progress', 'سفر جاری ہے');
    case 'completed':
      return tr(lang, 'Completed', 'سفر مکمل');
    case 'cancelled':
      return tr(lang, 'Cancelled', 'منسوخ');
    default:
      return String(status).replaceAll('_', ' ');
  }
}

export function trVerificationStatus(lang: Language, status: VerificationStatus | string): string {
  switch (status) {
    case 'not_registered':
      return tr(lang, 'Not Registered', 'رجسٹر نہیں');
    case 'incomplete':
      return tr(lang, 'Incomplete Profile', 'پروفائل نامکمل');
    case 'documents_pending':
      return tr(lang, 'Documents Pending', 'دستاویزات باقی ہیں');
    case 'under_review':
      return tr(lang, 'Under Admin Review', 'ایڈمن جائزے میں ہے');
    case 'approved':
      return tr(lang, 'Approved Pro Partner', 'تصدیق شدہ پرو پارٹنر');
    case 'rejected':
      return tr(lang, 'Rejected', 'مسترد');
    case 'suspended':
      return tr(lang, 'Suspended', 'معطل');
    default:
      return String(status).replaceAll('_', ' ');
  }
}

export function trPaymentStatus(lang: Language, status: string): string {
  switch (status) {
    case 'PAID':
      return tr(lang, 'PAID', 'ادائیگی مکمل');
    case 'PARTIALLY_PAID':
      return tr(lang, 'PARTIALLY PAID', 'جزوی ادائیگی');
    case 'UNPAID':
      return tr(lang, 'UNPAID', 'ادائیگی باقی');
    default:
      return status;
  }
}

export function trDay(lang: Language, day: string): string {
  if (lang !== 'ur') return day;
  const map: Record<string, string> = {
    Mon: 'پیر',
    Tue: 'منگل',
    Wed: 'بدھ',
    Thu: 'جمعرات',
    Fri: 'جمعہ',
    Sat: 'ہفتہ',
    Sun: 'اتوار',
  };
  return map[day] || day;
}
