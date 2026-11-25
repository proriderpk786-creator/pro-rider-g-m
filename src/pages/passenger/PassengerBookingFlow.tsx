import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  Edit2,
  FileText,
  Loader2,
  MapPin,
  Minus,
  Phone,
  Plus,
  Share2,
  ShieldCheck,
  Users,
  Fuel,
  CarFront,
  ArrowRight,
  Zap,
} from 'lucide-react';
import { AnalogClockPicker } from '../../components/AnalogClockPicker';
import { VehicleImage } from '../../components/BrandMark';
import { InvoiceViewerModal } from '../../components/InvoiceViewerModal';
import { LocationAutocomplete, reverseGeocodePakistan } from '../../components/LocationAutocomplete';
import { ShareTripStatusModal } from '../../components/ShareTripStatusModal';
import { StreetMap } from '../../components/StreetMap';
import { DEFAULT_PUBLIC_CONFIG } from '../../config/defaultConfig';
import { useFirebase } from '../../contexts/FirebaseContext';
import { useToast } from '../../contexts/ToastContext';
import { tr, trBookingStatus, trDay, trService } from '../../i18n/translations';
import type {
  Booking,
  DemandMapData,
  FleetCategory,
  Language,
  MapPoint,
  PublicConfig,
  RouteResult,
  ServiceType,
} from '../../types';
import { apiRequest, isBackendOfflineError } from '../../utils/api';
import { downloadBookingPdf } from '../../utils/pdfGenerator';

const getLocalPassengerBookingsKey = (userId?: string) => `pr_local_bookings_passenger_${userId || 'guest'}`;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isRawCoordsLabel(val?: string | null): boolean {
  return Boolean(val && /^-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?$/.test(val.trim()));
}

interface PassengerBookingFlowProps {
  lang: Language;
  config: PublicConfig | null;
  bookings: Booking[];
  demandData?: DemandMapData | null;
  passengerId?: string;
  passengerName: string;
  livePartnerLocations: Record<string, { lat: number; lng: number }>;
  onRefreshBookings: () => Promise<void>;
  onBookingCreated?: (booking: Booking) => void;
  onGoToBookings: (tab?: 'pending' | 'active') => void;
}

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export type BookingStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

function getNumberedSteps(lang: Language, mode: 'go_now' | 'schedule'): Array<{ step: BookingStep; title: string; short: string }> {
  if (mode === 'go_now') {
    return [
      { step: 1, title: tr(lang, 'Select pickup', 'پِک اپ مقام منتخب کریں'), short: tr(lang, 'Pickup', 'پِک اپ') },
      { step: 2, title: tr(lang, 'Select drop-off', 'ڈراپ آف مقام منتخب کریں'), short: tr(lang, 'Drop-off', 'ڈراپ آف') },
      { step: 5, title: tr(lang, 'Choose fleet vehicle', 'گاڑی منتخب کریں'), short: tr(lang, 'Fleet', 'گاڑی') },
      { step: 6, title: tr(lang, 'Fare & confirmation', 'کرایہ اور تصدیق'), short: tr(lang, 'Confirm', 'تصدیق') },
    ];
  }
  return [
    { step: 1, title: tr(lang, 'Select pickup', 'پِک اپ مقام منتخب کریں'), short: tr(lang, 'Pickup', 'پِک اپ') },
    { step: 2, title: tr(lang, 'Select drop-off', 'ڈراپ آف مقام منتخب کریں'), short: tr(lang, 'Drop-off', 'ڈراپ آف') },
    { step: 3, title: tr(lang, 'Pickup & drop-off time', 'پِک اپ اور ڈراپ آف کا وقت'), short: tr(lang, 'Time', 'وقت') },
    { step: 4, title: tr(lang, 'Date, package & days', 'تاریخ، پیکیج اور سفر کے دن'), short: tr(lang, 'Days', 'دن') },
    { step: 5, title: tr(lang, 'Choose fleet vehicle', 'گاڑی کی کیٹیگری منتخب کریں'), short: tr(lang, 'Fleet', 'گاڑی') },
    { step: 6, title: tr(lang, 'Billing & confirmation', 'بلنگ اور بُکنگ تصدیق'), short: tr(lang, 'Billing', 'بلنگ') },
  ];
}

export const PassengerBookingFlow: React.FC<PassengerBookingFlowProps> = ({
  lang,
  config,
  bookings,
  passengerId,
  passengerName,
  livePartnerLocations,
  onRefreshBookings,
  onBookingCreated,
  onGoToBookings,
}) => {
  const { firebaseUser, syncBookingSummary } = useFirebase();

  // Initialize booking mode & service type (supports direct launch from home poster buttons)
  const [bookingMode, setBookingMode] = useState<'go_now' | 'schedule'>(() => {
    try {
      const saved = sessionStorage.getItem('pr_initial_mode');
      return saved === 'go_now' ? 'go_now' : 'schedule';
    } catch {
      return 'schedule';
    }
  });

  const [serviceType, setServiceType] = useState<ServiceType>(() => {
    try {
      const saved = sessionStorage.getItem('pr_initial_service');
      return saved ? (saved as ServiceType) : 'pick_and_drop';
    } catch {
      return 'pick_and_drop';
    }
  });

  // 0 = Service Selector Home Screen (Instant Booking, Pick & Drop, Ride Sharing, Fuel Sharing)
  // If user came from a specific button on welcome/website page, jump straight to Step 1!
  const [currentStep, setCurrentStep] = useState<BookingStep>(() => {
    try {
      const saved = sessionStorage.getItem('pr_initial_service');
      if (saved) {
        sessionStorage.removeItem('pr_initial_service');
        sessionStorage.removeItem('pr_initial_mode');
        return 1;
      }
    } catch {}
    return 0;
  });

  // Step 1: Pickup
  const [pickup, setPickup] = useState<MapPoint | null>({
    label: 'Faizabad Interchange, Islamabad / Rawalpindi',
    lat: 33.664963,
    lng: 73.087013,
  });

  // Step 2: Drop-off
  const [dropoff, setDropoff] = useState<MapPoint | null>(null);

  // Routing State (computed dynamically once drop-off pin is placed)
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  // Step 3: Time Selection (must be explicitly confirmed via clock before advancing)
  const [pickupTime, setPickupTime] = useState('');
  const [dropoffTime, setDropoffTime] = useState('');
  const [activeClockTarget, setActiveClockTarget] = useState<'pickup' | 'dropoff' | null>(null);

  // Step 4: Date, Package, Travel Days & Passengers (date & passengers must be explicitly selected)
  const [startDate, setStartDate] = useState('');
  const [selectedPackageDays, setSelectedPackageDays] = useState<number>(() => {
    try {
      const pkgDays = Number(sessionStorage.getItem('pr_initial_package_days') || '');
      sessionStorage.removeItem('pr_initial_package_days');
      return pkgDays === 26 ? 26 : 22;
    } catch {
      return 22;
    }
  });
  const [travelDays, setTravelDays] = useState<string[]>(() =>
    selectedPackageDays === 26
      ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  );
  const [passengersCount, setPassengersCount] = useState<number>(() =>
    bookingMode === 'go_now' ? 1 : 0
  );
  const [returnJourney, setReturnJourney] = useState<boolean>(true);

  // Step 5: Fleet Vehicle Selection
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(() => {
    try {
      const savedVeh = sessionStorage.getItem('pr_initial_vehicle');
      sessionStorage.removeItem('pr_initial_vehicle');
      return savedVeh || 'fleet-economy';
    } catch {
      return 'fleet-economy';
    }
  });

  // Step 6: Billing & Confirmation + Final Review Modal
  const [offeredFare, setOfferedFare] = useState<number>(20240);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'wallet' | 'jazzcash_easypaisa'>('cash');
  const [notes, setNotes] = useState('');
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Step 7: Confirmed Receipt
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);

  const resetWizardInputs = (mode: 'go_now' | 'schedule', pkgDays = 22) => {
    setDropoff(null);
    setRoute(null);
    setPickupTime('');
    setDropoffTime('');
    setActiveClockTarget(null);
    setStartDate('');
    setSelectedPackageDays(pkgDays);
    setTravelDays(pkgDays === 26 ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    setPassengersCount(mode === 'go_now' ? 1 : 0);
    setReturnJourney(true);
    setNotes('');
    setShowReviewModal(false);
    setSubmitError(null);
  };

  // Secondary Active Trip Drawer State
  const [shareModalBooking, setShareModalBooking] = useState<Booking | null>(null);
  const [invoiceModalBooking, setInvoiceModalBooking] = useState<Booking | null>(null);
  const [viewActiveTripTab, setViewActiveTripTab] = useState(false);

  // Real-time drag-to-pin geocode state
  const [resolvingAddress, setResolvingAddress] = useState<'pickup' | 'dropoff' | null>(null);
  const [isMapPinMoving, setIsMapPinMoving] = useState(false);
  const geocodeTimerRef = useRef<number | null>(null);
  const geocodeSeqRef = useRef<{ pickup: number; dropoff: number }>({ pickup: 0, dropoff: 0 });
  const userTouchedPickupRef = useRef(false);
  const userTouchedDropoffRef = useRef(false);

  useEffect(() => {
    return () => {
      if (geocodeTimerRef.current) {
        window.clearTimeout(geocodeTimerRef.current);
      }
    };
  }, []);

  // Capture live current GPS location automatically on open when browser grants permission
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (userTouchedPickupRef.current) return;
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const seq = ++geocodeSeqRef.current.pickup;
        setPickup({ label: '', lat, lng });
        setResolvingAddress('pickup');
        try {
          const resolved = await reverseGeocodePakistan(lat, lng);
          if (!userTouchedPickupRef.current && geocodeSeqRef.current.pickup === seq) {
            const cleanLabel =
              resolved && !isRawCoordsLabel(resolved)
                ? resolved
                : tr(lang, 'Selected Pickup Pin', 'منتخب شدہ پِک اپ مقام');
            setPickup((curr) =>
              curr ? { ...curr, label: cleanLabel } : { label: cleanLabel, lat, lng }
            );
          }
        } finally {
          setResolvingAddress((curr) => (curr === 'pickup' ? null : curr));
        }
      },
      () => {
        // Ignore silently if permission not yet granted; manual GPS button remains ready
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  }, [lang]);

  const handleLiveMapCenterChange = (target: 'pickup' | 'dropoff', lat: number, lng: number) => {
    const seq = ++geocodeSeqRef.current[target];
    if (target === 'pickup') {
      userTouchedPickupRef.current = true;
      setPickup({ label: '', lat, lng });
    } else {
      userTouchedDropoffRef.current = true;
      setDropoff({ label: '', lat, lng });
    }
    setResolvingAddress(target);
    if (geocodeTimerRef.current) {
      window.clearTimeout(geocodeTimerRef.current);
    }
    geocodeTimerRef.current = window.setTimeout(async () => {
      try {
        const resolved = await reverseGeocodePakistan(lat, lng);
        if (geocodeSeqRef.current[target] !== seq) return;
        const cleanLabel =
          resolved && !isRawCoordsLabel(resolved)
            ? resolved
            : target === 'pickup'
            ? tr(lang, 'Selected Pickup Pin', 'منتخب شدہ پِک اپ مقام')
            : tr(lang, 'Selected Drop-off Pin', 'منتخب شدہ ڈراپ آف مقام');
        if (target === 'pickup') {
          setPickup((curr) =>
            curr ? { ...curr, label: cleanLabel } : { label: cleanLabel, lat, lng }
          );
        } else {
          setDropoff((curr) =>
            curr ? { ...curr, label: cleanLabel } : { label: cleanLabel, lat, lng }
          );
        }
      } finally {
        if (geocodeSeqRef.current[target] === seq) {
          setResolvingAddress((curr) => (curr === target ? null : curr));
        }
      }
    }, 220);
  };

  // Active ongoing booking if any
  const activeBooking = useMemo(
    () =>
      (Array.isArray(bookings) ? bookings : []).find((b) =>
        ['searching', 'negotiating', 'confirmed', 'on_the_way', 'arrived', 'started'].includes(b.status)
      ) || null,
    [bookings]
  );

  // Live non-duplicate pending/new request counters per category
  const categoryPendingCounts = useMemo(() => {
    const safeList = Array.isArray(bookings) ? bookings : [];
    const seenIds = new Set<string>();
    const counts = { instant: 0, pick_and_drop: 0, ride_sharing: 0, fuel_sharing: 0 };
    for (const b of safeList) {
      if (!b?.id || seenIds.has(b.id)) continue;
      seenIds.add(b.id);
      const st = String(b.status || '').toLowerCase();
      if (st !== 'searching' && st !== 'negotiating') continue;
      if (b.booking_mode === 'go_now') {
        counts.instant += 1;
      } else if (b.service_type === 'pick_and_drop') {
        counts.pick_and_drop += 1;
      } else if (b.service_type === 'ride_sharing') {
        counts.ride_sharing += 1;
      } else if (b.service_type === 'fuel_sharing') {
        counts.fuel_sharing += 1;
      }
    }
    return counts;
  }, [bookings]);

  // Compute road route whenever pickup or dropoff coordinates change
  useEffect(() => {
    if (!pickup || !dropoff) {
      setRoute(null);
      return;
    }
    // Immediate Haversine estimate so distance never stays blank while live road routing resolves
    const straightInit = haversineKm(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
    const roadEstKm = Math.max(1, Math.round(straightInit * 1.25 * 10) / 10);
    setRoute((prev) => ({
      distanceKm: roadEstKm,
      durationMin: Math.max(4, Math.round(roadEstKm * 1.8)),
      coordinates:
        prev?.coordinates && prev.coordinates.length >= 2
          ? prev.coordinates
          : [
              [pickup.lat, pickup.lng],
              [dropoff.lat, dropoff.lng],
            ],
    }));

    let cancelled = false;
    (async () => {
      setRouteLoading(true);
      try {
        const res = await apiRequest<RouteResult>(
          `/api/map/route?fromLat=${pickup.lat}&fromLng=${pickup.lng}&toLat=${dropoff.lat}&toLng=${dropoff.lng}`
        );
        if (!cancelled && res?.distanceKm) {
          setRoute(res);
          return;
        }
      } catch {
        // Fallback to direct OSRM browser query on static hosting
      }

      try {
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}?overview=full&geometries=geojson`;
        const osrmRes = await fetch(osrmUrl);
        if (osrmRes.ok) {
          const osrmData = await osrmRes.json();
          const firstRoute = osrmData?.routes?.[0];
          if (!cancelled && firstRoute) {
            const coords = Array.isArray(firstRoute.geometry?.coordinates)
              ? firstRoute.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number])
              : [
                  [pickup.lat, pickup.lng] as [number, number],
                  [dropoff.lat, dropoff.lng] as [number, number],
                ];
            setRoute({
              distanceKm: Math.max(1, Math.round((firstRoute.distance / 1000) * 10) / 10),
              durationMin: Math.max(3, Math.round(firstRoute.duration / 60)),
              coordinates: coords,
            });
            return;
          }
        }
      } catch {
        // Fallback to Haversine road estimate
      }

      if (!cancelled) {
        const straight = haversineKm(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
        const roadKm = Math.max(1, Math.round(straight * 1.25 * 10) / 10);
        const estMin = Math.max(4, Math.round(roadKm * 1.8));
        setRoute({
          distanceKm: roadKm,
          durationMin: estMin,
          coordinates: [
            [pickup.lat, pickup.lng],
            [dropoff.lat, dropoff.lng],
          ],
        });
      }
    })().finally(() => {
      if (!cancelled) setRouteLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng]);

  // Dynamic rate resolver per fleet vehicle
  const calculateVehiclePrice = (v: FleetCategory) => {
    const dist = route?.distanceKm || 18.4;

    // 1. INSTANT BOOKING (Entire vehicle, single point-to-point trip, automatic per-km calculation)
    if (bookingMode === 'go_now') {
      let ratePerKm = 55; // Default Economy: Rs 55/km

      if (v.slug.includes('bike')) {
        ratePerKm = 25; // Motorbike Rs 25/km
      } else if (v.slug.includes('rickshaw')) {
        ratePerKm = 30; // Rickshaw Rs 30/km
      } else if (v.slug.includes('economy')) {
        ratePerKm = 55; // Economy Rs 55/km
      } else if (v.slug === 'comfort') {
        ratePerKm = 65; // Comfort Rs 65/km
      } else if (v.slug.includes('comfort-plus')) {
        ratePerKm = 80; // Comfort Plus Rs 80/km
      } else if (v.slug.includes('sedan')) {
        ratePerKm = 100; // Sedan Rs 100/km
      } else if (v.slug.includes('suv')) {
        ratePerKm = 120; // SUV Rs 120/km (+20)
      } else if (v.slug.includes('premium')) {
        ratePerKm = 140; // Premium Rs 140/km (+20)
      } else if (v.slug.includes('luxury')) {
        ratePerKm = 160; // Luxury Rs 160/km (+20)
      } else if (v.slug.includes('van-7')) {
        ratePerKm = 180; // Van 7-seater Rs 180/km
      } else if (v.slug.includes('van-12')) {
        ratePerKm = 200; // Van 12-seater Rs 200/km
      } else if (v.slug.includes('van-15')) {
        ratePerKm = 220; // Van 15-seater Rs 220/km
      } else if (v.slug.includes('coaster')) {
        ratePerKm = 250; // Coaster Rs 250/km
      } else {
        ratePerKm = (v.per_km_min_pkr + v.per_km_max_pkr) / 2 || 60;
      }

      const totalKm = Math.round(dist * 10) / 10;
      const calculatedTotal = Math.max(ratePerKm, Math.round(totalKm * ratePerKm));

      return {
        ratePerKm,
        totalKm,
        totalPrice: calculatedTotal,
      };
    }

    // 2. SCHEDULED / MONTHLY PACKAGES (Pick & Drop, Ride Sharing, Fuel Sharing)
    const dailyTrips = returnJourney ? 2 : 1;
    const totalKm = Math.round(dist * dailyTrips * selectedPackageDays * 10) / 10;

    let ratePerKm = (v.per_km_min_pkr + v.per_km_max_pkr) / 2;

    if (v.slug.includes('economy')) {
      ratePerKm = serviceType === 'pick_and_drop' ? 25 : serviceType === 'ride_sharing' ? 20 : 18;
    } else if (v.slug.includes('comfort-plus')) {
      ratePerKm = 40;
    } else if (v.slug === 'comfort') {
      ratePerKm = 30;
    } else if (v.slug.includes('sedan')) {
      ratePerKm = 60;
    } else if (v.slug.includes('suv')) {
      ratePerKm = 70;
    } else if (v.slug.includes('premium')) {
      ratePerKm = 75;
    } else if (v.slug.includes('luxury')) {
      ratePerKm = 100;
    } else if (v.slug.includes('van-7')) {
      ratePerKm = 22.5;
    } else if (v.slug.includes('van-12')) {
      ratePerKm = 21.25;
    } else if (v.slug.includes('van-15')) {
      ratePerKm = 20.5;
    } else if (v.slug.includes('coaster')) {
      ratePerKm = 17.25;
    } else if (v.slug.includes('bike')) {
      ratePerKm = 12;
    } else if (v.slug.includes('rickshaw')) {
      ratePerKm = 16;
    }

    // Pick & Drop hires the entire vehicle (do NOT multiply by passenger count);
    // Ride Sharing & Fuel Sharing are per-seat services.
    const billableSeats = serviceType === 'pick_and_drop' ? 1 : Math.max(1, passengersCount);
    const calculatedTotal = Math.round(totalKm * ratePerKm * billableSeats);
    return {
      ratePerKm,
      totalKm,
      totalPrice: calculatedTotal,
    };
  };

  const vehiclesList = useMemo<FleetCategory[]>(() => {
    const sourceFleet = config?.fleet?.length ? config.fleet : DEFAULT_PUBLIC_CONFIG.fleet;
    const minSeats = bookingMode === 'go_now' ? 1 : Math.max(1, passengersCount);
    return sourceFleet.filter((f) => {
      if (f.is_active !== 1) return false;
      if (Array.isArray(f.services_eligible) && f.services_eligible.length > 0) {
        if (!f.services_eligible.includes(serviceType)) return false;
      }
      if (Number(f.seating_capacity || 1) < minSeats) return false;
      return true;
    });
  }, [config?.fleet, serviceType, bookingMode, passengersCount]);

  useEffect(() => {
    if (vehiclesList.length > 0 && !vehiclesList.some((v) => v.id === selectedVehicleId)) {
      setSelectedVehicleId(vehiclesList[0].id);
    }
  }, [vehiclesList, selectedVehicleId]);

  const selectedVehicle = useMemo(() => {
    return vehiclesList.find((v) => v.id === selectedVehicleId) || vehiclesList[0] || null;
  }, [vehiclesList, selectedVehicleId]);

  const referenceFare = useMemo(() => {
    if (!selectedVehicle) return 20240;
    return calculateVehiclePrice(selectedVehicle).totalPrice;
  }, [selectedVehicle, route?.distanceKm, returnJourney, selectedPackageDays, serviceType, bookingMode, passengersCount]);

  useEffect(() => {
    setOfferedFare(referenceFare);
  }, [referenceFare]);

  const minOfferFare = Math.round(referenceFare * 0.9);

  const toast = useToast();

  // Confirm & Submit Booking
  const handleConfirmBooking = async () => {
    if (!pickup || !dropoff || !selectedVehicle) {
      const msg = tr(lang, 'Please complete all booking steps.', 'براہ کرم بُکنگ کے تمام مراحل مکمل کریں۔');
      setSubmitError(msg);
      toast.warning(msg);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const calc = calculateVehiclePrice(selectedVehicle);
    const pickupAddrLabel =
      pickup.label && !isRawCoordsLabel(pickup.label)
        ? pickup.label
        : `Pin (${pickup.lat.toFixed(4)}, ${pickup.lng.toFixed(4)})`;
    const dropoffAddrLabel =
      dropoff.label && !isRawCoordsLabel(dropoff.label)
        ? dropoff.label
        : `Pin (${dropoff.lat.toFixed(4)}, ${dropoff.lng.toFixed(4)})`;
    try {
      const res = await apiRequest<{ booking: Booking }>('/api/passenger/bookings', {
        method: 'POST',
        role: 'passenger',
        body: {
          passengerName,
          bookingMode,
          serviceType,
          pickupAddress: pickupAddrLabel,
          pickupLat: pickup.lat,
          pickupLng: pickup.lng,
          dropoffAddress: dropoffAddrLabel,
          dropoffLat: dropoff.lat,
          dropoffLng: dropoff.lng,
          distanceKm: route?.distanceKm || calc.totalKm || 10,
          durationMin: route?.durationMin || 20,
          vehicleCategoryId: selectedVehicle.id,
          seatsRequested: Math.max(1, passengersCount),
          pickupDate: startDate || new Date().toISOString().slice(0, 10),
          pickupTime: pickupTime || '9:15 AM',
          expectedDropoffDate: startDate || new Date().toISOString().slice(0, 10),
          expectedDropoffTime: dropoffTime || '6:00 PM',
          returnJourney,
          packageId: bookingMode === 'schedule' ? (selectedPackageDays === 22 ? 'pkg-22-days' : 'pkg-26-days') : undefined,
          packageDays: bookingMode === 'schedule' ? selectedPackageDays : undefined,
          scheduleDays: travelDays,
          notes,
          proposedFarePkr: offeredFare,
        },
      });

      if (res?.booking) {
        const createdBooking: Booking = {
          ...res.booking,
          vehicle_category_name: res.booking.vehicle_category_name || selectedVehicle.name,
          schedule_days: Array.isArray(res.booking.schedule_days) ? res.booking.schedule_days : travelDays,
        };
        setConfirmedBooking(createdBooking);
        setShowReviewModal(false);
        setCurrentStep(7);
        onBookingCreated?.(createdBooking);
        if (firebaseUser?.emailVerified) {
          void syncBookingSummary({
            bookingCode: createdBooking.id,
            bookingMode,
            serviceType,
            pickupAddress: pickupAddrLabel,
            dropoffAddress: dropoffAddrLabel,
            distanceKm: createdBooking.distance_km || route?.distanceKm || 10,
            farePkr: offeredFare,
            status: createdBooking.status || 'searching',
          }).catch(() => {});
        }
        toast.success(
          tr(
            lang,
            `Booking ${createdBooking.id} submitted! Awaiting Pro Partner confirmation.`,
            `بُکنگ ${createdBooking.id} جمع ہو گئی! پرو پارٹنر کی تصدیق کا انتظار ہے۔`
          )
        );
        await onRefreshBookings();
      }
    } catch (err: any) {
      if (isBackendOfflineError(err)) {
        const nowIso = new Date().toISOString();
        const codeSuffix = String(Date.now()).slice(-6);
        const ownerId = passengerId || firebaseUser?.uid || 'local-passenger';
        const localBooking: Booking = {
          id: `BK-${codeSuffix}`,
          invoice_number: `INV-PR-${codeSuffix}`,
          passenger_id: ownerId,
          partner_id: null,
          booking_mode: bookingMode,
          service_type: serviceType,
          status: 'searching',
          pickup_address: pickupAddrLabel,
          pickup_lat: pickup.lat,
          pickup_lng: pickup.lng,
          dropoff_address: dropoffAddrLabel,
          dropoff_lat: dropoff.lat,
          dropoff_lng: dropoff.lng,
          distance_km: route?.distanceKm || calc.totalKm || 10,
          duration_min: route?.durationMin || 20,
          vehicle_category_id: selectedVehicle.id,
          vehicle_category_name: selectedVehicle.name,
          seats_requested: Math.max(1, passengersCount),
          pickup_date: startDate || new Date().toISOString().slice(0, 10),
          pickup_time: pickupTime || '9:15 AM',
          expected_dropoff_date: startDate || new Date().toISOString().slice(0, 10),
          expected_dropoff_time: dropoffTime || '6:00 PM',
          actual_dropoff_time: null,
          return_journey: returnJourney ? 1 : 0,
          package_id: bookingMode === 'schedule' ? (selectedPackageDays === 22 ? 'pkg-22-days' : 'pkg-26-days') : null,
          schedule_days: travelDays,
          notes,
          proposed_fare_pkr: offeredFare,
          agreed_fare_pkr: offeredFare,
          total_bill_pkr: offeredFare,
          amount_paid_pkr: paymentMethod === 'wallet' ? offeredFare : 0,
          commission_pkr: Math.round(offeredFare * 0.15),
          commission_pct: 15,
          driver_payout_pkr: Math.round(offeredFare * 0.85),
          base_fare_pkr: 0,
          rate_per_km_pkr: calc.ratePerKm,
          payment_status: paymentMethod === 'wallet' ? 'PAID' : 'UNPAID',
          created_at: nowIso,
        };
        try {
          const storageKeys = Array.from(
            new Set([ownerId, firebaseUser?.uid].filter((v): v is string => Boolean(v)))
          );
          for (const id of storageKeys) {
            const uKey = getLocalPassengerBookingsKey(id);
            const existingRaw = localStorage.getItem(uKey);
            const existing = existingRaw ? (JSON.parse(existingRaw) as Booking[]) : [];
            const next = [localBooking, ...(Array.isArray(existing) ? existing.filter((b) => b.id !== localBooking.id) : [])];
            localStorage.setItem(uKey, JSON.stringify(next));
          }
        } catch {
          // ignore storage quota errors
        }
        onBookingCreated?.(localBooking);
        if (firebaseUser?.emailVerified) {
          void syncBookingSummary({
            bookingCode: localBooking.id,
            bookingMode,
            serviceType,
            pickupAddress: pickupAddrLabel,
            dropoffAddress: dropoffAddrLabel,
            distanceKm: localBooking.distance_km,
            farePkr: offeredFare,
            status: 'searching',
          }).catch(() => {});
        }
        setConfirmedBooking(localBooking);
        setShowReviewModal(false);
        setCurrentStep(7);
        toast.success(
          tr(
            lang,
            `Booking ${localBooking.id} submitted! Awaiting Pro Partner confirmation.`,
            `بُکنگ ${localBooking.id} جمع ہو گئی! پرو پارٹنر کی تصدیق کا انتظار ہے۔`
          )
        );
        await onRefreshBookings();
        return;
      }
      const errMsg = err.message || tr(lang, 'Unable to confirm booking. Please try again.', 'بُکنگ مکمل نہیں ہو سکی۔ براہ کرم دوبارہ کوشش کریں۔');
      setSubmitError(errMsg);
      toast.error(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleShareWhatsApp = () => {
    const booking = confirmedBooking || activeBooking;
    if (!booking) return;

    const isInstant = booking.booking_mode === 'go_now' || bookingMode === 'go_now';
    const serviceName = isInstant
      ? 'Instant Booking (Go Now · Entire Vehicle)'
      : serviceType === 'pick_and_drop'
      ? 'Monthly Pick & Drop'
      : serviceType === 'ride_sharing'
      ? 'Ride Sharing'
      : 'Fuel Sharing';

    const fareTitle = isInstant ? 'Total Trip Fare' : 'Monthly Fare';
    const scheduleLine = isInstant
      ? 'Timing: Immediate Dispatch (Go Now · Point-to-Point)'
      : `Schedule: ${selectedPackageDays} days (${pickupTime} -> ${dropoffTime})\nTravel Days: ${travelDays.join(', ')}`;

    const summaryText = `*PRO RIDER AI — ${isInstant ? 'INSTANT TRIP BOOKING' : 'BOOKING INVOICE'}*
Invoice: ${booking.invoice_number}
Booking ID: ${booking.id}
Service: ${serviceName}
Pickup: ${booking.pickup_address}
Drop-off: ${booking.dropoff_address}
Distance: ${booking.distance_km} km
${scheduleLine}
Vehicle: ${selectedVehicle?.name || 'Standard Economy'}
Seats: ${passengersCount}
${fareTitle}: Rs. ${(booking.agreed_fare_pkr || booking.proposed_fare_pkr || offeredFare).toLocaleString()}
Status: PENDING ASSIGNMENT

Official Support: 03125007782
PRO RIDER AI — Travel with Trust`;

    const url = `https://wa.me/923125007782?text=${encodeURIComponent(summaryText)}`;
    window.open(url, '_blank');
  };

  const numberedSteps = getNumberedSteps(lang, bookingMode);
  const activeStepMeta = numberedSteps.find((s) => s.step === currentStep) || numberedSteps[0];
  const isFullMapStep = !viewActiveTripTab && (currentStep === 1 || currentStep === 2);

  return (
    <div className={isFullMapStep ? 'flex-1 flex flex-col w-full bg-white' : 'flex-1 flex flex-col w-full'}>
      {/* COMPACT NUMBERED STEP BAR (Shown cleanly on Steps 3-6 after map picking) */}
      {!viewActiveTripTab && currentStep >= 3 && currentStep <= 6 && (
        <div className="bg-[#0D0D10] text-white px-3.5 sm:px-6 h-11 flex items-center justify-between gap-2 shrink-0 border-b border-zinc-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => {
                if (bookingMode === 'go_now') {
                  if (currentStep === 6) setCurrentStep(5);
                  else if (currentStep === 5) setCurrentStep(2);
                  else if (currentStep === 2) setCurrentStep(1);
                  else setCurrentStep(0);
                } else {
                  setCurrentStep((s) => (s - 1) as BookingStep);
                }
              }}
              aria-label={tr(lang, 'Go to previous step', 'پچھلے مرحلے پر جائیں')}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-800 text-zinc-200 shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="w-6 h-6 rounded-full bg-[#F4C430] text-[#0D0D10] font-mono font-bold text-xs flex items-center justify-center shrink-0 tabular-nums">
              {currentStep}
            </span>
            <h1 className="font-display text-sm sm:text-base font-bold text-white truncate">
              {activeStepMeta.title}
            </h1>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {numberedSteps.map((item) => {
              const isCurrent = currentStep === item.step;
              const isDone = currentStep > item.step;
              const canJump = isDone;
              return (
                <button
                  key={item.step}
                  type="button"
                  disabled={!canJump}
                  onClick={() => canJump && setCurrentStep(item.step)}
                  title={`${tr(lang, 'Step', 'مرحلہ')} ${item.step}: ${item.short}`}
                  aria-label={`${tr(lang, 'Step', 'مرحلہ')} ${item.step}: ${item.short}`}
                  className={`w-6 h-6 rounded-full text-[11px] font-mono font-bold flex items-center justify-center transition-colors tabular-nums ${
                    isCurrent
                      ? 'bg-[#F4C430] text-[#0D0D10]'
                      : isDone
                      ? 'bg-zinc-700 text-[#F4C430] hover:bg-zinc-600 cursor-pointer'
                      : 'bg-zinc-900 text-zinc-500 border border-zinc-800 cursor-default'
                  }`}
                >
                  {isDone ? <Check className="w-3 h-3" /> : item.step}
                </button>
              );
            })}

            {activeBooking && (
              <button
                type="button"
                onClick={() => setViewActiveTripTab(true)}
                className={`ml-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap shrink-0 border ${
                  ['searching', 'negotiating'].includes(activeBooking.status)
                    ? 'bg-amber-950/80 border-amber-400/60 text-amber-300 hover:bg-amber-900'
                    : 'bg-emerald-950/80 border-emerald-400/60 text-emerald-300 hover:bg-emerald-900'
                }`}
              >
                {['searching', 'negotiating'].includes(activeBooking.status)
                  ? tr(lang, 'Pending Ride', 'پینڈنگ رائیڈ')
                  : tr(lang, 'Active Ride', 'ایکٹیو رائیڈ')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* VIEW ACTIVE TRIP PANEL */}
      {viewActiveTripTab && activeBooking && (
        <div className="max-w-3xl w-full mx-auto p-4 sm:p-6">
          <div className="rounded-3xl border border-zinc-200 bg-white p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h2 className="font-display text-lg font-bold text-[#0D0D10]">
                  {tr(lang, 'Active Booking', 'جاری بُکنگ')} · {activeBooking.id}
                </h2>
                <p className="text-xs text-zinc-500">
                  {trBookingStatus(lang, activeBooking.status)} · Rs.{' '}
                  {(activeBooking.agreed_fare_pkr || activeBooking.proposed_fare_pkr).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShareModalBooking(activeBooking)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold"
              >
                <Share2 className="w-3.5 h-3.5" />
                {tr(lang, 'Share', 'شیئر کریں')}
              </button>
            </div>
            <StreetMap
              pickup={{ label: activeBooking.pickup_address, lat: activeBooking.pickup_lat, lng: activeBooking.pickup_lng }}
              dropoff={{ label: activeBooking.dropoff_address, lat: activeBooking.dropoff_lat, lng: activeBooking.dropoff_lng }}
              livePartner={livePartnerLocations[activeBooking.id] || null}
              showDemandLayer={false}
              controlsLayout="compact-picker"
              heightClass="h-[240px]"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200">
                <span className="text-zinc-500 block">{tr(lang, 'Pickup', 'پِک اپ')}</span>
                <span className="font-semibold text-[#0D0D10]">{activeBooking.pickup_address}</span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200">
                <span className="text-zinc-500 block">{tr(lang, 'Drop-off', 'ڈراپ آف')}</span>
                <span className="font-semibold text-[#0D0D10]">{activeBooking.dropoff_address}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInvoiceModalBooking(activeBooking)}
                  className="px-4 py-2.5 rounded-xl border border-zinc-300 bg-white text-[#0D0D10] text-xs font-bold inline-flex items-center gap-1.5 hover:bg-zinc-50"
                >
                  <FileText className="w-3.5 h-3.5 text-[#D4A017]" />
                  {tr(lang, 'View Invoice', 'انوائس دیکھیں')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    downloadBookingPdf(activeBooking, 'passenger', passengerName);
                    toast.info(tr(lang, 'PDF invoice downloaded.', 'پی ڈی ایف انوائس ڈاؤن لوڈ ہو گئی۔'));
                  }}
                  className="px-4 py-2.5 rounded-xl bg-[#0D0D10] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-[#D4A017]" />
                  {tr(lang, 'Download PDF Bill', 'پی ڈی ایف بل ڈاؤن لوڈ')}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setViewActiveTripTab(false)}
                className="px-4 py-2.5 rounded-xl border border-zinc-300 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                {tr(lang, 'Back to Map Booking', 'میپ بُکنگ پر واپس جائیں')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 0: SERVICE SELECTOR HOME SCREEN (Instant Booking, Pick & Drop, Ride Sharing, Fuel Sharing) */}
      {!viewActiveTripTab && currentStep === 0 && (
        <div className="flex-1 flex flex-col w-full">
          {/* Slim Single-Line Sub-Navigation Bar directly under Top Header */}
          <nav
            aria-label={tr(lang, 'Pending bookings by category', 'بُکنگز کی کیٹگریز')}
            className="w-full border-b border-zinc-200 bg-white/95 px-3 sm:px-6 h-10 flex items-center"
          >
            <div className="max-w-5xl mx-auto w-full flex items-center justify-start sm:justify-center gap-2 overflow-x-auto no-scrollbar whitespace-nowrap">
              {[
                {
                  key: 'instant',
                  label: tr(lang, 'Instant', 'انسٹنٹ'),
                  count: categoryPendingCounts.instant,
                },
                {
                  key: 'pick_and_drop',
                  label: tr(lang, 'Pick & Drop', 'پک اینڈ ڈراپ'),
                  count: categoryPendingCounts.pick_and_drop,
                },
                {
                  key: 'ride_sharing',
                  label: tr(lang, 'Ride Sharing', 'رائیڈ شیئرنگ'),
                  count: categoryPendingCounts.ride_sharing,
                },
                {
                  key: 'fuel_sharing',
                  label: tr(lang, 'Fuel Sharing', 'فیول شیئرنگ'),
                  count: categoryPendingCounts.fuel_sharing,
                },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onGoToBookings('pending')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-200 bg-zinc-50 hover:border-[#D4A017] hover:bg-amber-50/40 text-[11px] font-extrabold text-[#0D0D10] transition-colors shrink-0 whitespace-nowrap"
                >
                  <span>{item.label}</span>
                  <span className="font-mono text-[10px] font-extrabold text-[#9A6E08] tabular-nums">
                    ({item.count})
                  </span>
                </button>
              ))}
            </div>
          </nav>

          <div className="max-w-4xl w-full mx-auto p-4 sm:p-8 space-y-6">
            <div className="text-center space-y-2">
              <p className="text-xs font-extrabold uppercase tracking-widest text-[#9A6E08]">
                {tr(lang, `Welcome, ${passengerName}`, `خوش آمدید، ${passengerName}`)}
              </p>
              <h1
                className={`font-display text-2xl sm:text-4xl font-extrabold tracking-tight text-[#0D0D10] ${
                  lang === 'ur' ? 'leading-[1.6]' : 'leading-tight'
                }`}
              >
                {tr(lang, 'Select Your Service', 'اپنی سفری سروس منتخب کریں')}
              </h1>
              <p className="text-sm font-semibold text-zinc-700 max-w-xl mx-auto leading-relaxed">
                {tr(
                  lang,
                  'Choose Instant Booking for immediate dispatch, or Pick & Drop, Ride Sharing & Fuel Sharing for scheduled daily and monthly commutes.',
                  'فوری روانگی کے لیے انسٹنٹ بکنگ منتخب کریں، یا روزانہ و ماہانہ سفر کے لیے پک اینڈ ڈراپ، رائیڈ شیئرنگ اور فیول شیئرنگ چُنیں۔'
                )}
              </p>
            </div>

            {/* 4 Clean Primary Booking Category Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
              {/* 1. Instant Booking */}
              <button
                type="button"
                onClick={() => {
                  setBookingMode('go_now');
                  setServiceType('pick_and_drop');
                  resetWizardInputs('go_now');
                  setCurrentStep(1);
                }}
                className="group relative rounded-2xl border-2 border-[#D4A017] bg-gradient-to-br from-[#16161B] via-[#0D0D10] to-[#261E0A] text-white p-4 sm:p-5 text-start shadow-md hover:shadow-lg hover:border-[#F4C430] active:scale-[0.99] transition-all flex flex-col justify-between gap-3 min-h-[104px]"
              >
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#F4C430] to-[#B8860B] text-[#0D0D10] flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform">
                    <Zap className="w-4 h-4 fill-[#0D0D10]" />
                  </div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#F4C430]">
                    {tr(lang, 'Fast Dispatch', 'فوری روانگی')}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-base font-extrabold text-[#F4C430]">
                      {tr(lang, 'INSTANT BOOKING', 'انسٹنٹ بکنگ')}
                    </h2>
                    <ArrowRight
                      className={`w-4 h-4 text-[#F4C430] transition-transform ${
                        lang === 'ur' ? 'rotate-180 group-hover:-translate-x-1' : 'group-hover:translate-x-1'
                      }`}
                    />
                  </div>
                  <p className="text-xs font-medium text-zinc-200 leading-snug">
                    {tr(
                      lang,
                      'Private vehicle dispatched immediately to your pickup pin.',
                      'پوری گاڑی آپ کے لیے، قریبی ڈرائیور کے ساتھ فوری روانگی۔'
                    )}
                  </p>
                </div>
              </button>

              {/* 2. Pick & Drop */}
              <button
                type="button"
                onClick={() => {
                  setBookingMode('schedule');
                  setServiceType('pick_and_drop');
                  resetWizardInputs('schedule', 22);
                  setCurrentStep(1);
                }}
                className="group relative rounded-2xl border-2 border-zinc-200 bg-white text-[#0D0D10] p-4 sm:p-5 text-start shadow-xs hover:border-[#D4A017] hover:shadow-md active:scale-[0.99] transition-all flex flex-col justify-between gap-3 min-h-[104px]"
              >
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-lg bg-zinc-100 border border-zinc-200 text-[#0D0D10] flex items-center justify-center font-bold group-hover:bg-[#D4A017] transition-all shadow-xs">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#9A6E08]">
                    {tr(lang, 'Monthly Plan', 'ماہانہ پلان')}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-base font-extrabold text-[#0D0D10]">
                      {tr(lang, 'PICK & DROP', 'پک اینڈ ڈراپ')}
                    </h2>
                    <ArrowRight
                      className={`w-4 h-4 text-[#D4A017] transition-transform ${
                        lang === 'ur' ? 'rotate-180 group-hover:-translate-x-1' : 'group-hover:translate-x-1'
                      }`}
                    />
                  </div>
                  <p className="text-xs font-semibold text-zinc-700 leading-snug">
                    {tr(
                      lang,
                      'Scheduled door-to-door office, school & university commute.',
                      'دفاتر، اسکول اور یونیورسٹی کے لیے باقاعدہ ماہانہ پیکیج۔'
                    )}
                  </p>
                </div>
              </button>

              {/* 3. Ride Sharing */}
              <button
                type="button"
                onClick={() => {
                  setBookingMode('schedule');
                  setServiceType('ride_sharing');
                  resetWizardInputs('schedule', 22);
                  setCurrentStep(1);
                }}
                className="group relative rounded-2xl border-2 border-zinc-200 bg-white text-[#0D0D10] p-4 sm:p-5 text-start shadow-xs hover:border-[#D4A017] hover:shadow-md active:scale-[0.99] transition-all flex flex-col justify-between gap-3 min-h-[104px]"
              >
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-lg bg-zinc-100 border border-zinc-200 text-[#0D0D10] flex items-center justify-center font-bold group-hover:bg-[#D4A017] transition-all shadow-xs">
                    <Users className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#9A6E08]">
                    {tr(lang, 'Monthly Carpool', 'ماہانہ مشترکہ')}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-base font-extrabold text-[#0D0D10]">
                      {tr(lang, 'RIDE SHARING', 'رائیڈ شیئرنگ')}
                    </h2>
                    <ArrowRight
                      className={`w-4 h-4 text-[#D4A017] transition-transform ${
                        lang === 'ur' ? 'rotate-180 group-hover:-translate-x-1' : 'group-hover:translate-x-1'
                      }`}
                    />
                  </div>
                  <p className="text-xs font-semibold text-zinc-700 leading-snug">
                    {tr(
                      lang,
                      'Share daily routes with verified co-riders and split fares.',
                      'تصدیق شدہ مسافروں کے ساتھ سفر اور کرایہ شیئر کریں۔'
                    )}
                  </p>
                </div>
              </button>

              {/* 4. Fuel Sharing */}
              <button
                type="button"
                onClick={() => {
                  setBookingMode('schedule');
                  setServiceType('fuel_sharing');
                  resetWizardInputs('schedule', 22);
                  setCurrentStep(1);
                }}
                className="group relative rounded-2xl border-2 border-zinc-200 bg-white text-[#0D0D10] p-4 sm:p-5 text-start shadow-xs hover:border-[#D4A017] hover:shadow-md active:scale-[0.99] transition-all flex flex-col justify-between gap-3 min-h-[104px]"
              >
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-lg bg-zinc-100 border border-zinc-200 text-[#0D0D10] flex items-center justify-center font-bold group-hover:bg-[#D4A017] transition-all shadow-xs">
                    <Fuel className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-800">
                    {tr(lang, 'Fuel Split', 'فیول شیئر')}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-base font-extrabold text-[#0D0D10]">
                      {tr(lang, 'FUEL SHARING', 'فیول شیئرنگ')}
                    </h2>
                    <ArrowRight
                      className={`w-4 h-4 text-[#D4A017] transition-transform ${
                        lang === 'ur' ? 'rotate-180 group-hover:-translate-x-1' : 'group-hover:translate-x-1'
                      }`}
                    />
                  </div>
                  <p className="text-xs font-semibold text-zinc-700 leading-snug">
                    {tr(
                      lang,
                      'Transparent per-km fuel cost splitting for city corridors.',
                      'روزانہ اور ماہانہ سفر کے لیے اصل سڑک کے حساب سے فیول تقسیم۔'
                    )}
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 1: CLEAN FULL-OPEN MAP PICKUP (Matches reference layout directly) */}
      {!viewActiveTripTab && currentStep === 1 && (
        <div className="flex-1 flex flex-col min-h-[calc(100dvh-6.25rem)] md:min-h-[calc(100vh-3.5rem)] bg-white">
          {/* Clean Top Row: Back to Services + Small Step Circle 1 + Search Bar */}
          <div className="px-3 py-2 bg-white border-b border-zinc-100 flex items-center gap-2 z-30 shrink-0">
            <button
              type="button"
              onClick={() => setCurrentStep(0)}
              aria-label={tr(lang, 'Back to Services', 'سروسز پر واپس')}
              className="w-8 h-8 rounded-full border border-zinc-200 flex items-center justify-center text-zinc-700 hover:bg-zinc-50 shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="w-7 h-7 rounded-full bg-[#F4C430] text-[#0D0D10] font-mono font-bold text-xs flex items-center justify-center shrink-0 tabular-nums shadow-xs">
              1
            </span>
            <div className="flex-1 min-w-0">
              <LocationAutocomplete
                compactBar
                placeholder={tr(lang, 'Search area, sector, block, phase, street...', 'علاقہ، سیکٹر، بلاک، فیز یا سڑک تلاش کریں...')}
                value={pickup}
                pinColor="green"
                onSelect={(pt) => {
                  if (pt) {
                    userTouchedPickupRef.current = true;
                    setPickup(pt);
                    setResolvingAddress(null);
                  }
                }}
              />
            </div>
            {activeBooking && (
              <button
                type="button"
                onClick={() => setViewActiveTripTab(true)}
                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap shrink-0 ${
                  ['searching', 'negotiating'].includes(activeBooking.status)
                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                    : 'bg-[#0D0D10] text-[#F4C430]'
                }`}
              >
                {['searching', 'negotiating'].includes(activeBooking.status)
                  ? tr(lang, 'Pending', 'پینڈنگ')
                  : tr(lang, 'Active', 'ایکٹیو')}
              </button>
            )}
          </div>

          {/* Full-Height Open Map Canvas (absolute inset-0 prevents 0px collapse!) */}
          <div className="relative flex-1 min-h-[380px]">
            <div className="absolute inset-0">
              <StreetMap
                center={pickup ? [pickup.lat, pickup.lng] : [33.664963, 73.087013]}
                zoom={15}
                pickup={pickup}
                dropoff={null}
                route={null}
                showDemandLayer={false}
                centerPinMode
                hideMarkers
                fullBleed
                controlsLayout="compact-picker"
                heightClass="h-full"
                onCenterChange={(lat, lng) => handleLiveMapCenterChange('pickup', lat, lng)}
                onMoveStateChange={(moving) => setIsMapPinMoving(moving)}
                onLocateUser={(lat, lng) => handleLiveMapCenterChange('pickup', lat, lng)}
              />
            </div>
            {/* Centered Gold Pin (Lifts while panning, drops at exact crosshair) */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-20">
              <div className="relative flex flex-col items-center -translate-y-4">
                <div
                  className={`flex flex-col items-center transition-transform duration-150 ${
                    isMapPinMoving ? '-translate-y-2.5 scale-110' : 'translate-y-0 scale-100'
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-[#F4C430] border-[3px] border-[#0D0D10] flex items-center justify-center shadow-lg">
                    <div className="w-3 h-3 rounded-full bg-[#0D0D10]" />
                  </div>
                  <div className="w-0.5 h-3.5 bg-[#0D0D10] rounded-full -mt-0.5" />
                </div>
                <div
                  className={`rounded-full bg-[#0D0D10]/70 transition-all duration-150 ${
                    isMapPinMoving ? 'w-2.5 h-1 opacity-50 mt-1' : 'w-2 h-2 opacity-90 -mt-0.5 border border-white'
                  }`}
                />
              </div>
            </div>
            <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-[#0D0D10]/85 text-white text-[11px] font-semibold shadow backdrop-blur whitespace-nowrap">
              {tr(lang, 'Drag map or tap anywhere to move pin', 'پن لگانے کے لیے نقشہ گھمائیں یا مطلوبہ جگہ پر ٹیپ کریں')}
            </div>
          </div>

          {/* Clean Bottom Sheet matching reference Cancel / Select */}
          <div className="px-4 py-3.5 sm:px-6 bg-white border-t border-zinc-200 space-y-3 shrink-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                    {tr(lang, 'PICKUP LOCATION', 'پِک اپ کا مقام')}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setServiceType((prev) =>
                        prev === 'pick_and_drop'
                          ? 'ride_sharing'
                          : prev === 'ride_sharing'
                          ? 'fuel_sharing'
                          : 'pick_and_drop'
                      )
                    }
                    className="text-[11px] font-semibold text-[#B8860B] hover:text-[#0D0D10] whitespace-nowrap"
                  >
                    {trService(lang, serviceType)} ▾
                  </button>
                </div>
                <p className="font-bold text-sm sm:text-base text-[#0D0D10] leading-snug flex items-center gap-2 truncate mt-0.5">
                  {resolvingAddress === 'pickup' && (
                    <Loader2 className="w-3.5 h-3.5 text-[#D4A017] animate-spin shrink-0" />
                  )}
                  <span className="truncate">
                    {resolvingAddress === 'pickup' && (!pickup?.label || isRawCoordsLabel(pickup.label))
                      ? tr(lang, 'Updating address...', 'پتہ تلاش کیا جا رہا ہے...')
                      : pickup?.label && !isRawCoordsLabel(pickup.label)
                      ? pickup.label
                      : tr(lang, 'Selected Pickup Pin', 'منتخب شدہ پِک اپ مقام')}
                  </span>
                </p>
                <p className="text-[11px] text-zinc-400 font-mono tabular-nums mt-0.5">
                  {pickup ? `${pickup.lat.toFixed(6)}, ${pickup.lng.toFixed(6)}` : '33.664963, 73.087013'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  userTouchedPickupRef.current = false;
                  if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                      (pos) => handleLiveMapCenterChange('pickup', pos.coords.latitude, pos.coords.longitude),
                      () =>
                        setPickup({
                          label: 'Faizabad Interchange, Islamabad / Rawalpindi',
                          lat: 33.664963,
                          lng: 73.087013,
                        })
                    );
                  }
                }}
                className="py-3.5 px-4 rounded-2xl border border-zinc-300 text-zinc-800 font-bold text-sm hover:bg-zinc-50 transition-colors"
              >
                {tr(lang, 'Reset GPS', 'جی پی ایس ری سیٹ')}
              </button>
              <button
                type="button"
                disabled={!pickup}
                onClick={() => setCurrentStep(2)}
                className="py-3.5 px-4 rounded-2xl bg-[#F4C430] text-[#0D0D10] font-bold text-sm hover:bg-[#E5B520] shadow-sm disabled:opacity-60 transition-colors"
              >
                {tr(lang, 'Select', 'منتخب کریں')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: FULL-OPEN MAP DROP-OFF (Auto-converts from Step 1 Select) */}
      {!viewActiveTripTab && currentStep === 2 && (
        <div className="flex-1 flex flex-col min-h-[calc(100dvh-6.25rem)] md:min-h-[calc(100vh-3.5rem)] bg-white">
          <div className="px-3 py-2 bg-white border-b border-zinc-100 z-30 space-y-1.5 shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                aria-label={tr(lang, 'Back to Pickup', 'پِک اپ پر واپس')}
                className="w-8 h-8 rounded-full border border-zinc-200 flex items-center justify-center text-zinc-700 hover:bg-zinc-50 shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <span className="w-7 h-7 rounded-full bg-red-600 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0 tabular-nums shadow-xs">
                2
              </span>
              <div className="flex-1 min-w-0">
                <LocationAutocomplete
                  compactBar
                  placeholder={tr(lang, 'Search drop-off area, sector, plaza, road...', 'منزل کا علاقہ، سیکٹر، پلازہ یا سڑک تلاش کریں...')}
                  value={dropoff}
                  pinColor="red"
                  onSelect={(pt) => {
                    if (pt) {
                      userTouchedDropoffRef.current = true;
                      setDropoff(pt);
                      setResolvingAddress(null);
                    }
                  }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs px-1 text-zinc-500">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="truncate max-w-[65%] text-left hover:text-[#0D0D10] transition-colors"
              >
                <span className="font-semibold text-[#0D0D10]">A:</span>{' '}
                {pickup?.label && !isRawCoordsLabel(pickup.label)
                  ? pickup.label
                  : tr(lang, 'Pickup Pin Set', 'پِک اپ پن سیٹ ہے')}
              </button>
              <span className="font-mono font-bold text-[#0D0D10] tabular-nums shrink-0">
                {!dropoff
                  ? tr(lang, 'Set drop-off pin', 'منزل کی پن لگائیں')
                  : routeLoading
                  ? tr(lang, 'Calculating...', 'حساب ہو رہا ہے...')
                  : route
                  ? `${route.distanceKm} km · ~${route.durationMin} ${tr(lang, 'min', 'منٹ')}`
                  : tr(lang, 'Calculating...', 'حساب ہو رہا ہے...')}
              </span>
            </div>
          </div>

          <div className="relative flex-1 min-h-[380px]">
            <div className="absolute inset-0">
              <StreetMap
                center={dropoff ? [dropoff.lat, dropoff.lng] : pickup ? [pickup.lat, pickup.lng] : [33.7025, 72.9785]}
                zoom={14}
                pickup={pickup}
                dropoff={dropoff}
                route={route}
                showDemandLayer={false}
                centerPinMode
                hideMarkers={false}
                fullBleed
                controlsLayout="compact-picker"
                heightClass="h-full"
                onCenterChange={(lat, lng) => handleLiveMapCenterChange('dropoff', lat, lng)}
                onMoveStateChange={(moving) => setIsMapPinMoving(moving)}
                onLocateUser={(lat, lng) => handleLiveMapCenterChange('dropoff', lat, lng)}
              />
            </div>
            {/* Centered Red Drop-off Pin (Lifts while panning, drops at exact crosshair) */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-20">
              <div className="relative flex flex-col items-center -translate-y-4">
                <div
                  className={`flex flex-col items-center transition-transform duration-150 ${
                    isMapPinMoving ? '-translate-y-2.5 scale-110' : 'translate-y-0 scale-100'
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-red-600 border-[3px] border-white flex items-center justify-center shadow-lg text-white">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div className="w-0.5 h-3.5 bg-red-700 rounded-full -mt-0.5" />
                </div>
                <div
                  className={`rounded-full bg-red-700/75 transition-all duration-150 ${
                    isMapPinMoving ? 'w-2.5 h-1 opacity-50 mt-1' : 'w-2 h-2 opacity-90 -mt-0.5 border border-white'
                  }`}
                />
              </div>
            </div>
            {!dropoff && (
              <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-red-600 text-white text-[11px] font-bold shadow whitespace-nowrap">
                {tr(lang, 'Drag map or tap destination on map', 'منزل کا پن لگانے کے لیے نقشہ گھمائیں یا جگہ پر ٹیپ کریں')}
              </div>
            )}
          </div>

          <div className="px-4 py-3.5 sm:px-6 bg-white border-t border-zinc-200 space-y-3 shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  {tr(lang, 'DROP-OFF LOCATION', 'ڈراپ آف کا مقام')}
                </p>
                <p className="font-bold text-sm sm:text-base text-[#0D0D10] leading-snug flex items-center gap-2 truncate mt-0.5">
                  {resolvingAddress === 'dropoff' && (
                    <Loader2 className="w-3.5 h-3.5 text-red-600 animate-spin shrink-0" />
                  )}
                  <span className="truncate">
                    {!dropoff
                      ? tr(lang, 'Move map or tap to place drop-off pin', 'منزل کے لیے نقشہ گھمائیں یا ٹیپ کریں')
                      : resolvingAddress === 'dropoff' && (!dropoff.label || isRawCoordsLabel(dropoff.label))
                      ? tr(lang, 'Updating destination...', 'منزل کا پتہ تلاش کیا جا رہا ہے...')
                      : dropoff.label && !isRawCoordsLabel(dropoff.label)
                      ? dropoff.label
                      : tr(lang, 'Selected Drop-off Pin', 'منتخب شدہ ڈراپ آف مقام')}
                  </span>
                </p>
                <p className="text-[11px] text-zinc-400 font-mono tabular-nums mt-0.5">
                  {dropoff
                    ? `${dropoff.lat.toFixed(6)}, ${dropoff.lng.toFixed(6)}`
                    : tr(lang, 'Pin not set yet', 'ابھی پن سیٹ نہیں ہوئی')}
                </p>
              </div>

              <div className="text-right shrink-0 bg-[#0D0D10] text-white px-3 py-1.5 rounded-xl">
                <span className="block text-[10px] text-zinc-400">{tr(lang, 'Distance', 'فاصلہ')}</span>
                <span className="font-mono font-bold text-xs text-[#F4C430] tabular-nums">
                  {!dropoff
                    ? '-- km'
                    : routeLoading || !route
                    ? '...'
                    : `${route.distanceKm} km`}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="py-3.5 px-4 rounded-2xl border border-zinc-300 text-zinc-800 font-bold text-sm hover:bg-zinc-50"
              >
                {tr(lang, 'Back', 'واپس')}
              </button>
              <button
                type="button"
                disabled={!dropoff}
                onClick={() => {
                  if (bookingMode === 'go_now') {
                    setCurrentStep(5);
                  } else {
                    setCurrentStep(3);
                  }
                }}
                className="py-3.5 px-4 rounded-2xl bg-[#F4C430] text-[#0D0D10] font-bold text-sm hover:bg-[#E5B520] shadow-sm disabled:opacity-60 transition-colors"
              >
                {tr(lang, 'Select', 'منتخب کریں')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: PICKUP & DROP-OFF TIME */}
      {!viewActiveTripTab && currentStep === 3 && (
        <div className="max-w-3xl w-full mx-auto p-4 sm:p-8 space-y-5">
          {/* Clean Unboxed Route Strip */}
          <div className="rounded-2xl bg-[#0D0D10] text-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0 space-y-1 text-xs">
              <p className="truncate">
                <span className="text-[#F4C430] font-bold">A:</span> {pickup?.label}
              </p>
              <p className="truncate">
                <span className="text-red-400 font-bold">B:</span> {dropoff?.label}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0 font-mono text-xs tabular-nums">
              <span className="text-[#F4C430] font-bold">{route?.distanceKm || 18.4} km</span>
              <span className="text-zinc-500">·</span>
              <span className="text-zinc-200">~{route?.durationMin || 21} min</span>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-zinc-200 p-5 sm:p-7 space-y-5 shadow-sm">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#F4C430] text-[#0D0D10] font-mono font-bold text-xs flex items-center justify-center">
                  3
                </span>
                <h2 className="font-display text-xl sm:text-2xl font-bold text-[#0D0D10]">
                  {tr(lang, 'Pickup & drop-off time', 'پِک اپ اور ڈراپ آف کا وقت')}
                </h2>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                {tr(
                  lang,
                  'Select morning pickup and evening return times for your daily schedule.',
                  'اپنے روزانہ شیڈول کے لیے صبح پِک اپ اور شام واپسی کا وقت منتخب کریں۔'
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setActiveClockTarget('pickup')}
                className={`p-4 sm:p-5 rounded-2xl border-2 text-start transition-all ${
                  pickupTime
                    ? 'border-emerald-500/70 bg-white hover:bg-emerald-50/10'
                    : 'border-[#F4C430] bg-amber-50/20 hover:bg-amber-50/40'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold text-zinc-800 mb-2">
                  <span className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#D4A017]" /> {tr(lang, 'Pickup time', 'پِک اپ کا وقت')}
                  </span>
                  <span className={`text-[11px] font-bold ${pickupTime ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {pickupTime ? tr(lang, 'Selected', 'منتخب شدہ') : tr(lang, 'Required', 'لازمی')}
                  </span>
                </div>
                <div className="h-11 px-4 rounded-xl bg-zinc-100 flex items-center justify-between font-display text-base sm:text-lg font-bold tabular-nums">
                  <span className={pickupTime ? 'text-[#0D0D10]' : 'text-zinc-400 text-sm font-sans font-semibold'}>
                    {pickupTime || tr(lang, 'Tap to select pickup time', 'پِک اپ کا وقت منتخب کریں')}
                  </span>
                  <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveClockTarget('dropoff')}
                className={`p-4 sm:p-5 rounded-2xl border-2 text-start transition-all ${
                  dropoffTime
                    ? 'border-emerald-500/70 bg-white hover:bg-emerald-50/10'
                    : 'border-[#F4C430] bg-amber-50/20 hover:bg-amber-50/40'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold text-zinc-800 mb-2">
                  <span className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#D4A017]" /> {tr(lang, 'Drop-off time', 'ڈراپ آف کا وقت')}
                  </span>
                  <span className={`text-[11px] font-bold ${dropoffTime ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {dropoffTime ? tr(lang, 'Selected', 'منتخب شدہ') : tr(lang, 'Required', 'لازمی')}
                  </span>
                </div>
                <div className="h-11 px-4 rounded-xl bg-zinc-100 flex items-center justify-between font-display text-base sm:text-lg font-bold tabular-nums">
                  <span className={dropoffTime ? 'text-[#0D0D10]' : 'text-zinc-400 text-sm font-sans font-semibold'}>
                    {dropoffTime || tr(lang, 'Tap to select drop-off time', 'ڈراپ آف کا وقت منتخب کریں')}
                  </span>
                  <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                </div>
              </button>
            </div>

            {(!pickupTime || !dropoffTime) && (
              <div className="px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  {tr(
                    lang,
                    'Please select both Pickup time and Drop-off time from the clock before continuing.',
                    'آگے بڑھنے کے لیے براہ کرم گھڑی سے پِک اپ اور ڈراپ آف دونوں اوقات منتخب کریں۔'
                  )}
                </span>
              </div>
            )}

            {activeClockTarget && (
              <AnalogClockPicker
                lang={lang}
                title={
                  activeClockTarget === 'pickup'
                    ? tr(lang, 'Select Pickup Time', 'پِک اپ کا وقت منتخب کریں')
                    : tr(lang, 'Select Drop-off Time', 'ڈراپ آف کا وقت منتخب کریں')
                }
                value={
                  activeClockTarget === 'pickup'
                    ? pickupTime || '9:15 AM'
                    : dropoffTime || '6:00 PM'
                }
                onChange={(newTime) => {
                  if (activeClockTarget === 'pickup') setPickupTime(newTime);
                  else setDropoffTime(newTime);
                }}
                onClose={() => setActiveClockTarget(null)}
              />
            )}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="py-3.5 px-4 rounded-2xl border border-zinc-300 text-zinc-800 font-bold text-sm hover:bg-zinc-50"
              >
                {tr(lang, 'Back', 'واپس')}
              </button>
              <button
                type="button"
                disabled={!pickupTime || !dropoffTime}
                onClick={() => setCurrentStep(4)}
                className="py-3.5 px-4 rounded-2xl bg-[#F4C430] text-[#0D0D10] font-bold text-sm hover:bg-[#E5B520] shadow-sm disabled:opacity-45 disabled:cursor-not-allowed transition-opacity"
              >
                {tr(lang, 'Confirm Time & Next', 'وقت کنفرم کریں اور آگے بڑھیں')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: DATE, PACKAGE & TRAVEL DAYS */}
      {!viewActiveTripTab && currentStep === 4 && (
        <div className="max-w-4xl w-full mx-auto p-4 sm:p-8">
          <div className="bg-white rounded-3xl border border-zinc-200 p-5 sm:p-7 space-y-6 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#F4C430] text-[#0D0D10] font-mono font-bold text-xs flex items-center justify-center">
                4
              </span>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#0D0D10]">
                {tr(lang, 'Start date, package & days', 'آغاز کی تاریخ، پیکیج اور دن')}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Left: Start date + Package */}
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-zinc-800">
                      {tr(lang, 'Start date', 'سفر شروع کرنے کی تاریخ')}
                    </label>
                    <span className={`text-[11px] font-bold ${startDate ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {startDate ? tr(lang, 'Selected', 'منتخب شدہ') : tr(lang, 'Required', 'لازمی')}
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="date"
                      min={new Date().toISOString().slice(0, 10)}
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className={`w-full px-4 py-3 rounded-2xl border-2 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-[#F4C430] ${
                        startDate ? 'border-emerald-500/60' : 'border-[#F4C430]'
                      }`}
                    />
                    <Calendar className="w-5 h-5 text-zinc-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-800 mb-2">
                    {tr(lang, 'Monthly package', 'ماہانہ پیکیج')}
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPackageDays(22);
                        setTravelDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
                      }}
                      className={`p-3.5 rounded-2xl border text-center transition-all ${
                        selectedPackageDays === 22
                          ? 'border-[#F4C430] bg-[#F4C430] text-[#0D0D10] font-bold shadow-sm'
                          : 'border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700'
                      }`}
                    >
                      <span className="block text-lg font-display font-bold tabular-nums">
                        {tr(lang, '22 days', '22 دن')}
                      </span>
                      <span className="text-xs opacity-80">{tr(lang, 'Mon – Fri', 'پیر تا جمعہ')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPackageDays(26);
                        setTravelDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
                      }}
                      className={`p-3.5 rounded-2xl border text-center transition-all ${
                        selectedPackageDays === 26
                          ? 'border-[#F4C430] bg-[#F4C430] text-[#0D0D10] font-bold shadow-sm'
                          : 'border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700'
                      }`}
                    >
                      <span className="block text-lg font-display font-bold tabular-nums">
                        {tr(lang, '26 days', '26 دن')}
                      </span>
                      <span className="text-xs opacity-80">{tr(lang, 'Mon – Sat', 'پیر تا ہفتہ')}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Right: Travel Days + Return + Passengers */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-800 mb-2">
                    {tr(lang, 'Travel days', 'سفر کے دن')}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {WEEK_DAYS.map((day) => {
                      const active = travelDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            if (active) {
                              if (travelDays.length > 1) setTravelDays(travelDays.filter((d) => d !== day));
                            } else {
                              setTravelDays((prev) =>
                                WEEK_DAYS.filter((d) => d === day || prev.includes(d))
                              );
                            }
                          }}
                          className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all inline-flex items-center gap-1 ${
                            active
                              ? 'bg-[#F4C430] border-[#B8860B] text-[#0D0D10] shadow-xs'
                              : 'bg-zinc-100 border-zinc-200 text-zinc-700 hover:bg-zinc-200'
                          }`}
                        >
                          {active && <Check className="w-3 h-3" />}
                          <span>{trDay(lang, day)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-zinc-800">
                      {tr(lang, 'Trip direction', 'سفر کی نوعیت')}
                    </label>
                    <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-xl mt-1.5 w-fit">
                      <button
                        type="button"
                        onClick={() => setReturnJourney(true)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                          returnJourney ? 'bg-[#0D0D10] text-[#F4C430]' : 'text-zinc-600'
                        }`}
                      >
                        {tr(lang, 'Return (2-Way)', 'دو طرفہ (واپسی سمیت)')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setReturnJourney(false)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                          !returnJourney ? 'bg-[#0D0D10] text-[#F4C430]' : 'text-zinc-600'
                        }`}
                      >
                        {tr(lang, 'One-Way', 'یک طرفہ')}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="block text-xs font-bold text-zinc-800">
                        {tr(lang, 'Passengers / Seats', 'مسافروں کی تعداد / سیٹیں')}
                      </label>
                      <span className={`text-[11px] font-bold ${passengersCount >= 1 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {passengersCount >= 1 ? tr(lang, 'Selected', 'منتخب شدہ') : tr(lang, 'Required', 'لازمی')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[1, 2, 3, 4].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setPassengersCount(num)}
                          className={`w-9 h-9 rounded-xl font-mono font-bold text-xs border transition-all ${
                            passengersCount === num
                              ? 'bg-[#F4C430] border-[#B8860B] text-[#0D0D10] shadow-xs'
                              : 'bg-white border-zinc-300 text-zinc-800 hover:bg-zinc-50'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                      <div className="flex items-center gap-1.5 ml-1">
                        <button
                          type="button"
                          onClick={() => setPassengersCount((c) => Math.max(1, c - 1))}
                          className="w-9 h-9 rounded-full border border-zinc-300 flex items-center justify-center text-zinc-700 hover:bg-zinc-100"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-display text-lg font-bold text-[#0D0D10] w-6 text-center tabular-nums">
                          {passengersCount >= 1 ? passengersCount : '—'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPassengersCount((c) => Math.min(28, Math.max(0, c) + 1))}
                          className="w-9 h-9 rounded-full border border-zinc-300 flex items-center justify-center text-zinc-700 hover:bg-zinc-100"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {(!startDate || passengersCount < 1 || travelDays.length === 0) && (
              <div className="px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  {tr(
                    lang,
                    `Please select: ${[!startDate && 'Start Date', passengersCount < 1 && 'Passengers / Seats', travelDays.length === 0 && 'Travel Days'].filter(Boolean).join(', ')}`,
                    `آگے بڑھنے کے لیے منتخب کریں: ${[!startDate && 'آغاز کی تاریخ', passengersCount < 1 && 'مسافروں کی تعداد / سیٹیں', travelDays.length === 0 && 'سفر کے دن'].filter(Boolean).join('، ')}`
                  )}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                className="py-3.5 px-4 rounded-2xl border border-zinc-300 text-zinc-800 font-bold text-sm hover:bg-zinc-50"
              >
                {tr(lang, 'Back', 'واپس')}
              </button>
              <button
                type="button"
                disabled={!startDate || passengersCount < 1 || travelDays.length === 0}
                onClick={() => setCurrentStep(5)}
                className="py-3.5 px-4 rounded-2xl bg-[#F4C430] text-[#0D0D10] font-bold text-sm hover:bg-[#E5B520] shadow-sm disabled:opacity-45 disabled:cursor-not-allowed transition-opacity"
              >
                {tr(lang, 'Choose Fleet Vehicle', 'گاڑی منتخب کریں')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 5: CHOOSE FLEET VEHICLE */}
      {!viewActiveTripTab && currentStep === 5 && (
        <div className="max-w-5xl w-full mx-auto p-4 sm:p-8">
          <div className="bg-white rounded-3xl border border-zinc-200 p-5 sm:p-7 space-y-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#F4C430] text-[#0D0D10] font-mono font-bold text-xs flex items-center justify-center">
                  5
                </span>
                <div>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-[#0D0D10]">
                    {tr(lang, 'Choose your vehicle class', 'اپنی گاڑی کی کیٹیگری منتخب کریں')}
                  </h2>
                  <p className="text-xs text-zinc-500">
                    {bookingMode === 'go_now' ? (
                      <span className="inline-flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-[#0D0D10]">{route?.distanceKm || 18.4} km</span>
                        <span>·</span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[11px]">
                          {tr(lang, 'Instant Booking (Entire Vehicle · Point-to-Point)', 'انسٹنٹ بُکنگ (پوری گاڑی · یک طرفہ سفر)')}
                        </span>
                      </span>
                    ) : (
                      <>
                        {route?.distanceKm || 18.4} km · {selectedPackageDays} {tr(lang, 'days', 'دن')} ·{' '}
                        {returnJourney ? tr(lang, 'Return trip', 'دو طرفہ سفر') : tr(lang, 'One-way', 'یک طرفہ')} ·{' '}
                        {Math.max(1, passengersCount)} {tr(lang, 'pax', 'مسافر')}
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[540px] overflow-y-auto pr-1">
              {vehiclesList.map((vehicle) => {
                const active = selectedVehicleId === vehicle.id;
                const pricing = calculateVehiclePrice(vehicle);

                return (
                  <div
                    key={vehicle.id}
                    onClick={() => setSelectedVehicleId(vehicle.id)}
                    className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      active
                        ? 'border-[#F4C430] bg-[#FFFBEB] shadow-sm'
                        : 'border-zinc-200 bg-white hover:border-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <VehicleImage
                        src={vehicle.image_url}
                        alt={vehicle.name}
                        className="w-20 h-14 rounded-xl object-cover bg-zinc-100 shrink-0 border"
                      />
                      <div className="min-w-0">
                        <p className="font-display font-bold text-sm text-[#0D0D10] truncate">{vehicle.name}</p>
                        <p className="text-xs text-zinc-500 mt-0.5 truncate">
                          {vehicle.tagline || `${vehicle.seating_capacity} ${tr(lang, 'seats', 'سیٹیں')}`}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="font-display font-bold text-base text-[#0D0D10] tabular-nums">
                        Rs {pricing.totalPrice.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-zinc-500 font-mono font-semibold">
                        {bookingMode === 'go_now'
                          ? `Rs ${pricing.ratePerKm}/km · ${pricing.totalKm} km`
                          : serviceType === 'pick_and_drop'
                          ? `Rs ${pricing.ratePerKm}/km · ${tr(lang, 'Full vehicle', 'مکمل گاڑی')}`
                          : `Rs ${pricing.ratePerKm}/km × ${Math.max(1, passengersCount)}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCurrentStep(bookingMode === 'go_now' ? 2 : 4)}
                className="py-3.5 px-4 rounded-2xl border border-zinc-300 text-zinc-800 font-bold text-sm hover:bg-zinc-50"
              >
                {tr(lang, 'Back', 'واپس')}
              </button>
              <button
                type="button"
                onClick={() => setCurrentStep(6)}
                className="py-3.5 px-4 rounded-2xl bg-[#F4C430] text-[#0D0D10] font-bold text-sm hover:bg-[#E5B520] shadow-sm"
              >
                {tr(lang, 'Continue to Billing', 'بلنگ کی طرف بڑھیں')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 6: BILLING, OFFER FARE & FINAL CONFIRMATION */}
      {!viewActiveTripTab && currentStep === 6 && (
        <div className="max-w-5xl w-full mx-auto p-4 sm:p-8">
          <div className="bg-white rounded-3xl border border-zinc-200 p-5 sm:p-7 space-y-6 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#F4C430] text-[#0D0D10] font-mono font-bold text-xs flex items-center justify-center">
                6
              </span>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#0D0D10]">
                {tr(lang, 'Billing & Final Confirmation', 'بلنگ اور حتمی تصدیق')}
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Left Column: Summary + Fare Breakdown */}
              <div className="space-y-4">
                <div className="divide-y divide-zinc-100 text-xs text-zinc-700 border border-zinc-200 rounded-2xl px-4">
                  <div className="py-2.5 flex justify-between items-center gap-2">
                    <span className="text-zinc-500">{tr(lang, 'Service', 'سروس')}</span>
                    <span className="font-semibold">{trService(lang, serviceType)}</span>
                  </div>
                  <div className="py-2.5 flex justify-between items-center gap-3">
                    <span className="text-zinc-500 shrink-0">{tr(lang, 'Pickup', 'پِک اپ')}</span>
                    <button
                      type="button"
                      onClick={() => setCurrentStep(1)}
                      className="font-semibold text-right truncate max-w-[230px] inline-flex items-center gap-1 hover:text-[#B8860B]"
                    >
                      <span className="truncate">{pickup?.label}</span>
                      <Edit2 className="w-3 h-3 shrink-0 text-zinc-400" />
                    </button>
                  </div>
                  <div className="py-2.5 flex justify-between items-center gap-3">
                    <span className="text-zinc-500 shrink-0">{tr(lang, 'Drop-off', 'ڈراپ آف')}</span>
                    <button
                      type="button"
                      onClick={() => setCurrentStep(2)}
                      className="font-semibold text-right truncate max-w-[230px] inline-flex items-center gap-1 hover:text-[#B8860B]"
                    >
                      <span className="truncate">{dropoff?.label}</span>
                      <Edit2 className="w-3 h-3 shrink-0 text-zinc-400" />
                    </button>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-zinc-500">{tr(lang, 'Route', 'روٹ')}</span>
                    <span className="font-semibold font-mono tabular-nums">
                      {route?.distanceKm || 18.4} km · ~{route?.durationMin || 21} {tr(lang, 'min', 'منٹ')}
                    </span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-zinc-500">{tr(lang, 'Timing', 'وقت')}</span>
                    <span className="font-semibold font-mono tabular-nums">
                      {bookingMode === 'go_now'
                        ? tr(lang, 'Immediate / Go Now (Real-time Dispatch)', 'فوری روانگی (Go Now)')
                        : `${pickupTime} → ${dropoffTime}`}
                    </span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-zinc-500">{tr(lang, 'Schedule', 'شیڈول')}</span>
                    <span className="font-semibold">
                      {bookingMode === 'go_now'
                        ? tr(lang, 'One-time Point-to-Point Trip (Entire Vehicle)', 'یک طرفہ پوائنٹ ٹو پوائنٹ سفر (پوری گاڑی)')
                        : `${startDate} · ${selectedPackageDays}${tr(lang, 'd', 'دن')} (${travelDays.map((d) => trDay(lang, d)).join(', ')})`}
                    </span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-zinc-500">{tr(lang, 'Fleet', 'گاڑی')}</span>
                    <span className="font-semibold">
                      {selectedVehicle?.name || 'Economy'} ({Math.max(1, passengersCount)} {tr(lang, 'pax', 'مسافر')})
                    </span>
                  </div>
                </div>

                {/* Obsidian Fare Breakdown */}
                <div
                  className="pr-preserve-light rounded-2xl p-5 space-y-2.5 border border-[#D4A017]/30"
                  style={{ backgroundColor: '#0D0D10', color: '#FFFFFF' }}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#F4C430' }}>
                      {bookingMode === 'go_now'
                        ? tr(lang, 'Instant Trip Fare Breakdown', 'انسٹنٹ سفر کرایہ کی تفصیل')
                        : tr(lang, 'Fare breakdown', 'کرایہ کی تفصیل')}
                    </p>
                    {(bookingMode === 'go_now' || serviceType === 'pick_and_drop') && (
                      <span
                        className="px-2 py-0.5 rounded-full font-bold text-[10px]"
                        style={{ backgroundColor: '#F4C430', color: '#0D0D10' }}
                      >
                        {tr(lang, 'Entire Vehicle', 'مکمل گاڑی')}
                      </span>
                    )}
                  </div>

                  {bookingMode === 'go_now' ? (
                    <>
                      <div className="flex justify-between gap-2 text-xs font-mono tabular-nums" style={{ color: '#D4D4D8' }}>
                        <span>{tr(lang, 'Trip distance', 'سفر کا فاصلہ')}</span>
                        <span className="font-bold" style={{ color: '#FFFFFF' }}>{route?.distanceKm || 18.4} km</span>
                      </div>
                      <div className="flex justify-between gap-2 text-xs font-mono tabular-nums" style={{ color: '#D4D4D8' }}>
                        <span>{tr(lang, 'Vehicle rate per km', 'گاڑی ریٹ فی کلومیٹر')}</span>
                        <span className="font-bold" style={{ color: '#FFFFFF' }}>
                          Rs {selectedVehicle ? calculateVehiclePrice(selectedVehicle).ratePerKm : 55}/km
                        </span>
                      </div>
                      <div className="flex justify-between gap-2 text-xs font-mono tabular-nums" style={{ color: '#D4D4D8' }}>
                        <span>{tr(lang, 'Automatic calculation', 'خودکار حساب کتاب')}</span>
                        <span className="text-right">
                          {route?.distanceKm || 18.4} km × Rs {selectedVehicle ? calculateVehiclePrice(selectedVehicle).ratePerKm : 55} = Rs {referenceFare.toLocaleString()}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between items-center gap-2 text-xs font-mono tabular-nums" style={{ color: '#D4D4D8' }}>
                        <span className="shrink-0">{tr(lang, 'Monthly distance', 'ماہانہ فاصلہ')}</span>
                        <span className="text-right">
                          {route?.distanceKm || 18.4} km × {returnJourney ? 2 : 1} × {selectedPackageDays}{tr(lang, 'd', 'دن')} ={' '}
                          <strong style={{ color: '#FFFFFF' }}>
                            {Math.round((route?.distanceKm || 18.4) * (returnJourney ? 2 : 1) * selectedPackageDays * 10) / 10} km
                          </strong>
                        </span>
                      </div>
                      <div className="flex justify-between items-center gap-2 text-xs font-mono tabular-nums" style={{ color: '#D4D4D8' }}>
                        <span>{tr(lang, 'Rate', 'ریٹ')}</span>
                        <span className="font-bold" style={{ color: '#FFFFFF' }}>
                          Rs {selectedVehicle ? calculateVehiclePrice(selectedVehicle).ratePerKm : 25}/km
                        </span>
                      </div>
                      <div className="flex justify-between items-center gap-2 text-xs font-mono tabular-nums" style={{ color: '#D4D4D8' }}>
                        <span>{tr(lang, 'Passengers / Billing', 'مسافر / بلنگ')}</span>
                        <span className="font-bold" style={{ color: '#F4C430' }}>
                          {serviceType === 'pick_and_drop'
                            ? tr(lang, `${Math.max(1, passengersCount)} pax (Full vehicle)`, `${Math.max(1, passengersCount)} مسافر (مکمل گاڑی)`)
                            : tr(lang, `× ${Math.max(1, passengersCount)} seats`, `× ${Math.max(1, passengersCount)} سیٹیں`)}
                        </span>
                      </div>
                    </>
                  )}

                  <div className="border-t border-zinc-800 pt-3 flex items-baseline justify-between">
                    <span className="text-sm font-semibold" style={{ color: '#FFFFFF' }}>
                      {bookingMode === 'go_now'
                        ? tr(lang, 'Total Trip Fare', 'کل سفر کا کرایہ')
                        : tr(lang, 'Reference monthly fare', 'مقررہ ماہانہ کرایہ')}
                    </span>
                    <span className="font-display text-2xl font-bold tabular-nums" style={{ color: '#F4C430' }}>
                      Rs {referenceFare.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column: Offer Fare + Payment Method + Notes */}
              <div className="space-y-4">
                <div className="p-4 rounded-2xl border border-zinc-200 bg-zinc-50/60 space-y-3">
                  <div>
                    <p className="font-bold text-sm text-[#0D0D10]">
                      {tr(lang, 'Offer your fare', 'اپنا کرایہ آفر کریں')}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {tr(lang, 'Up to 10% below reference fare.', 'مقررہ کرایہ سے 10 فیصد تک کم آفر کر سکتے ہیں۔')}
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => setOfferedFare((f) => Math.max(minOfferFare, f - (bookingMode === 'go_now' ? 50 : 250)))}
                      className="w-11 h-11 rounded-full bg-white border border-zinc-300 flex items-center justify-center text-zinc-800 hover:bg-zinc-100"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <div className="text-center">
                      <span className="font-display text-2xl font-bold text-[#0D0D10] tabular-nums">
                        Rs {offeredFare.toLocaleString()}
                      </span>
                      <span className="block text-[11px] text-zinc-500">
                        {offeredFare === referenceFare
                          ? tr(lang, 'Standard rate', 'معیاری ریٹ')
                          : offeredFare < referenceFare
                          ? `-Rs ${(referenceFare - offeredFare).toLocaleString()} ${tr(lang, 'discount', 'رعایت')}`
                          : `+Rs ${(offeredFare - referenceFare).toLocaleString()} ${tr(lang, 'bonus', 'اضافی آفر')}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOfferedFare((f) => f + (bookingMode === 'go_now' ? 50 : 250))}
                      className="w-11 h-11 rounded-full bg-white border border-zinc-300 flex items-center justify-center text-zinc-800 hover:bg-zinc-100"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-zinc-800">
                    {tr(lang, 'Payment Method', 'ادائیگی کا طریقہ')}
                  </label>
                  {[
                    {
                      id: 'cash',
                      label:
                        bookingMode === 'go_now'
                          ? tr(lang, 'Cash on Ride Completion', 'سفر مکمل ہونے پر نقد ادائیگی')
                          : tr(lang, 'Monthly Cash Settlement', 'ماہانہ نقد ادائیگی'),
                    },
                    { id: 'wallet', label: tr(lang, 'PRO RIDER Digital Wallet', 'پرو رائیڈر ڈیجیٹل والیٹ') },
                    { id: 'jazzcash_easypaisa', label: tr(lang, 'JazzCash / EasyPaisa / Bank', 'جاز کیش / ایزی پیسہ / بینک') },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPaymentMethod(p.id as any)}
                      className={`w-full text-left px-4 py-3 rounded-xl border text-xs font-bold transition-colors ${
                        paymentMethod === p.id
                          ? 'border-[#F4C430] bg-[#FFFBEB] text-[#0D0D10]'
                          : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-800 mb-1">
                    {tr(lang, 'Landmark or Driver Instructions (Optional)', 'قریبی نشانی یا ڈرائیور کے لیے ہدایات (اختیاری)')}
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={tr(lang, 'e.g. Gate 2 near main road...', 'مثال: مین روڈ کے قریب گیٹ نمبر 2...')}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#F4C430]"
                  />
                </div>
              </div>
            </div>

            {submitError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setCurrentStep(5)}
                className="py-3.5 px-4 rounded-2xl border border-zinc-300 text-zinc-800 font-bold text-sm hover:bg-zinc-50"
              >
                {tr(lang, 'Back', 'واپس')}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setSubmitError(null);
                  setShowReviewModal(true);
                }}
                className="py-3.5 px-4 rounded-2xl bg-[#F4C430] text-[#0D0D10] font-bold text-sm hover:bg-[#E5B520] shadow-md flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                {tr(lang, 'Review & Confirm', 'تفصیلات چیک کریں')}
              </button>
            </div>
          </div>

          {/* Final Pre-Submission Review Modal */}
          {showReviewModal && (
            <div
              className="fixed inset-0 z-[9995] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
              onClick={() => !submitting && setShowReviewModal(false)}
            >
              <div
                className="pr-preserve-light w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border-2 border-[#D4A017]"
                style={{ backgroundColor: '#FFFFFF', color: '#0D0D10' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-5 flex items-start justify-between gap-3" style={{ backgroundColor: '#0D0D10', color: '#FFFFFF' }}>
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: '#F4C430', color: '#0D0D10' }}
                    >
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-display text-base sm:text-lg font-bold" style={{ color: '#F4C430' }}>
                        {tr(lang, 'Final Booking Review', 'بُکنگ کی حتمی جانچ پڑتال')}
                      </h3>
                      <p className="text-xs mt-0.5" style={{ color: '#D4D4D8' }}>
                        {tr(
                          lang,
                          'Please review every detail carefully before submitting your booking.',
                          'بُکنگ جمع کرانے سے پہلے براہ کرم تمام تفصیلات ایک بار تسلی سے چیک کر لیں۔'
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-5 space-y-3 max-h-[65vh] overflow-y-auto text-xs">
                  <div className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 px-3.5" style={{ backgroundColor: '#FAFAFA' }}>
                    <div className="py-2.5 flex justify-between gap-3">
                      <span style={{ color: '#52525B' }}>{tr(lang, 'Service', 'سروس')}</span>
                      <span className="font-bold text-right" style={{ color: '#0D0D10' }}>
                        {bookingMode === 'go_now'
                          ? tr(lang, 'Instant Booking (Entire Vehicle)', 'انسٹنٹ بُکنگ (پوری گاڑی)')
                          : trService(lang, serviceType)}
                      </span>
                    </div>
                    <div className="py-2.5 flex justify-between gap-3">
                      <span className="shrink-0" style={{ color: '#52525B' }}>{tr(lang, 'Pickup (A)', 'پِک اپ (A)')}</span>
                      <span className="font-semibold text-right" style={{ color: '#0D0D10' }}>{pickup?.label}</span>
                    </div>
                    <div className="py-2.5 flex justify-between gap-3">
                      <span className="shrink-0" style={{ color: '#52525B' }}>{tr(lang, 'Drop-off (B)', 'ڈراپ آف (B)')}</span>
                      <span className="font-semibold text-right" style={{ color: '#0D0D10' }}>{dropoff?.label}</span>
                    </div>
                    <div className="py-2.5 flex justify-between gap-3">
                      <span style={{ color: '#52525B' }}>{tr(lang, 'Distance', 'فاصلہ')}</span>
                      <span className="font-mono font-bold" style={{ color: '#0D0D10' }}>
                        {route?.distanceKm || 18.4} km · ~{route?.durationMin || 21} {tr(lang, 'min', 'منٹ')}
                      </span>
                    </div>
                    {bookingMode === 'schedule' && (
                      <>
                        <div className="py-2.5 flex justify-between gap-3">
                          <span style={{ color: '#52525B' }}>{tr(lang, 'Timing', 'اوقات')}</span>
                          <span className="font-mono font-bold" style={{ color: '#0D0D10' }}>
                            {pickupTime} → {dropoffTime}
                          </span>
                        </div>
                        <div className="py-2.5 flex justify-between gap-3">
                          <span style={{ color: '#52525B' }}>{tr(lang, 'Start Date & Package', 'تاریخ اور پیکیج')}</span>
                          <span className="font-bold text-right" style={{ color: '#0D0D10' }}>
                            {startDate} · {selectedPackageDays} {tr(lang, 'days', 'دن')} ({returnJourney ? tr(lang, 'Return 2-Way', 'دو طرفہ') : tr(lang, 'One-Way', 'یک طرفہ')})
                          </span>
                        </div>
                        <div className="py-2.5 flex justify-between gap-3">
                          <span style={{ color: '#52525B' }}>{tr(lang, 'Travel Days', 'سفر کے دن')}</span>
                          <span className="font-semibold text-right" style={{ color: '#0D0D10' }}>
                            {travelDays.map((d) => trDay(lang, d)).join(', ')}
                          </span>
                        </div>
                      </>
                    )}
                    <div className="py-2.5 flex justify-between gap-3">
                      <span style={{ color: '#52525B' }}>{tr(lang, 'Vehicle & Passengers', 'گاڑی اور مسافر')}</span>
                      <span className="font-bold text-right" style={{ color: '#0D0D10' }}>
                        {selectedVehicle?.name} · {Math.max(1, passengersCount)} {tr(lang, 'pax', 'مسافر')}
                      </span>
                    </div>
                    <div className="py-2.5 flex justify-between gap-3">
                      <span style={{ color: '#52525B' }}>{tr(lang, 'Payment Method', 'ادائیگی')}</span>
                      <span className="font-semibold" style={{ color: '#0D0D10' }}>
                        {paymentMethod === 'cash'
                          ? tr(lang, 'Cash Settlement', 'نقد ادائیگی')
                          : paymentMethod === 'wallet'
                          ? tr(lang, 'PRO RIDER Wallet', 'پرو رائیڈر والٹ')
                          : 'JazzCash / EasyPaisa / Bank'}
                      </span>
                    </div>
                    {notes.trim() && (
                      <div className="py-2.5 flex justify-between gap-3">
                        <span style={{ color: '#52525B' }}>{tr(lang, 'Notes', 'ہدایات')}</span>
                        <span className="font-medium text-right" style={{ color: '#0D0D10' }}>{notes}</span>
                      </div>
                    )}
                  </div>

                  <div
                    className="rounded-2xl p-4 flex items-center justify-between"
                    style={{ backgroundColor: '#0D0D10', color: '#FFFFFF' }}
                  >
                    <div>
                      <span className="text-[11px] uppercase tracking-wider font-bold block" style={{ color: '#A1A1AA' }}>
                        {tr(lang, 'Final Offered Fare', 'حتمی آفر کرایہ')}
                      </span>
                      <span className="text-[11px]" style={{ color: '#D4D4D8' }}>
                        Rs {selectedVehicle ? calculateVehiclePrice(selectedVehicle).ratePerKm : 25}/km
                      </span>
                    </div>
                    <span className="font-display text-2xl font-extrabold tabular-nums" style={{ color: '#F4C430' }}>
                      Rs {offeredFare.toLocaleString()}
                    </span>
                  </div>

                  {submitError && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{submitError}</span>
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-zinc-200 grid grid-cols-2 gap-3" style={{ backgroundColor: '#FAFAFA' }}>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setShowReviewModal(false)}
                    className="py-3 px-4 rounded-2xl border border-zinc-300 font-bold text-xs sm:text-sm"
                    style={{ backgroundColor: '#FFFFFF', color: '#0D0D10' }}
                  >
                    {tr(lang, 'Go Back & Edit', 'واپس جا کر تبدیل کریں')}
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleConfirmBooking}
                    className="py-3 px-4 rounded-2xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-md"
                    style={{ backgroundColor: '#F4C430', color: '#0D0D10' }}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {tr(lang, 'Submitting...', 'بُک ہو رہا ہے...')}
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        {tr(lang, 'Yes, Confirm Booking', 'جی ہاں، بُکنگ کنفرم کریں')}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 7: REQUEST SUBMITTED (PENDING) RECEIPT & WHATSAPP / PDF */}
      {!viewActiveTripTab && currentStep === 7 && (
        <div className="max-w-xl w-full mx-auto p-4 sm:p-8">
          <div className="bg-white rounded-3xl border border-zinc-200 p-6 sm:p-8 space-y-5 shadow-sm text-center">
            <div className="w-20 h-20 rounded-full border-4 border-amber-400 bg-amber-50 flex items-center justify-center mx-auto text-amber-600">
              <Clock className="w-10 h-10 stroke-[2.5]" />
            </div>

            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold uppercase tracking-wider">
                {tr(lang, 'Status: Pending Confirmation', 'حالت: پینڈنگ (تصدیق کے انتظار میں)')}
              </span>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0D0D10]">
                {tr(lang, 'Booking Submitted — Pending', 'بُکنگ جمع ہو گئی — پینڈنگ')}
              </h2>
              <p className="text-xs text-zinc-600 mt-1 max-w-md mx-auto leading-relaxed">
                {tr(
                  lang,
                  'Your ride request is in Pending status while verified Pro Partners review it. As soon as a Pro Partner confirms, your bell will ring and the ride will automatically move to Active.',
                  'آپ کی بُکنگ اس وقت پینڈنگ میں ہے اور تصدیق شدہ پرو پارٹنرز کو بھیج دی گئی ہے۔ جیسے ہی ڈرائیور اسے کنفرم کرے گا، بیل بجے گی اور یہ خودکار طور پر ایکٹیو ٹیب میں آ جائے گی۔'
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setCurrentStep(1);
                onGoToBookings('pending');
              }}
              className="w-full py-3.5 rounded-2xl bg-[#0D0D10] text-[#F4C430] font-bold text-sm hover:bg-zinc-900 transition-colors shadow-sm"
            >
              {tr(lang, 'Track in My Bookings (Pending)', 'میری بکنگز میں پینڈنگ حالت دیکھیں')}
            </button>

            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="w-full py-3.5 rounded-2xl bg-[#F4C430] text-[#0D0D10] font-bold text-sm hover:bg-[#E5B520] transition-colors shadow-sm flex items-center justify-center gap-2"
            >
              <Phone className="w-4 h-4 fill-current" />
              {tr(lang, 'Also send on WhatsApp', 'واٹس ایپ پر بھی بھیجیں')}
            </button>

            {confirmedBooking && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setInvoiceModalBooking(confirmedBooking)}
                  className="w-full py-3.5 rounded-2xl border border-zinc-200 bg-white text-[#0D0D10] font-bold text-xs hover:bg-zinc-50 flex items-center justify-center gap-2"
                >
                  <FileText className="w-4 h-4 text-[#D4A017]" />
                  {tr(lang, 'View & Print Invoice', 'انوائس دیکھیں / پرنٹ')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    downloadBookingPdf(confirmedBooking, 'passenger', passengerName);
                    toast.info(tr(lang, 'PDF invoice downloaded.', 'پی ڈی ایف انوائس ڈاؤن لوڈ ہو گئی۔'));
                  }}
                  className="w-full py-3.5 rounded-2xl border border-zinc-200 text-zinc-800 font-semibold text-xs hover:bg-zinc-50 flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4 text-[#D4A017]" />
                  {tr(lang, 'Download PDF Bill', 'پی ڈی ایف بل ڈاؤن لوڈ')}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                resetWizardInputs(bookingMode);
                setCurrentStep(0);
              }}
              className="w-full py-3 rounded-2xl border border-zinc-200 text-zinc-700 font-semibold text-xs hover:bg-zinc-50"
            >
              {tr(lang, 'Book Another Ride', 'ایک اور رائیڈ بُک کریں')}
            </button>
          </div>
        </div>
      )}

      {shareModalBooking && (
        <ShareTripStatusModal
          isOpen={Boolean(shareModalBooking)}
          booking={shareModalBooking}
          lang={lang}
          passengerName={passengerName}
          onClose={() => setShareModalBooking(null)}
        />
      )}

      <InvoiceViewerModal
        booking={invoiceModalBooking}
        viewerRole="passenger"
        passengerName={passengerName}
        lang={lang}
        onClose={() => setInvoiceModalBooking(null)}
      />
    </div>
  );
};
