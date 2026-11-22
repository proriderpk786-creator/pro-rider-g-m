import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Check,
  ChevronDown,
  Clock,
  Download,
  Edit2,
  Loader2,
  MapPin,
  Minus,
  Phone,
  Plus,
  Share2,
  Users,
  Fuel,
  CarFront,
  ArrowRight,
  Zap,
} from 'lucide-react';
import { AnalogClockPicker } from '../../components/AnalogClockPicker';
import { VehicleImage } from '../../components/BrandMark';
import { LocationAutocomplete, reverseGeocodePakistan } from '../../components/LocationAutocomplete';
import { ShareTripStatusModal } from '../../components/ShareTripStatusModal';
import { StreetMap } from '../../components/StreetMap';
import { DEFAULT_PUBLIC_CONFIG } from '../../config/defaultConfig';
import { useFirebase } from '../../contexts/FirebaseContext';
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

const LOCAL_PASSENGER_BOOKINGS_KEY = 'pr_local_bookings_passenger';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface PassengerBookingFlowProps {
  lang: Language;
  config: PublicConfig | null;
  bookings: Booking[];
  demandData?: DemandMapData | null;
  passengerName: string;
  livePartnerLocations: Record<string, { lat: number; lng: number }>;
  onRefreshBookings: () => Promise<void>;
  onGoToBookings: () => void;
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
  passengerName,
  livePartnerLocations,
  onRefreshBookings,
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
  // If user came from a specific button on welcome page, jump straight to Step 1!
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
  const [dropoff, setDropoff] = useState<MapPoint | null>({
    label: 'Ameer-e-Millat Road, E-11, Islamabad',
    lat: 33.7025,
    lng: 72.9785,
  });

  // Routing State
  const [route, setRoute] = useState<RouteResult | null>({
    distanceKm: 18.4,
    durationMin: 21,
    coordinates: [
      [33.664963, 73.087013],
      [33.682, 73.045],
      [33.7025, 72.9785],
    ],
  });
  const [routeLoading, setRouteLoading] = useState(false);

  // Step 3: Time Selection
  const [pickupTime, setPickupTime] = useState('9:15 AM');
  const [dropoffTime, setDropoffTime] = useState('6:00 PM');
  const [activeClockTarget, setActiveClockTarget] = useState<'pickup' | 'dropoff' | null>(null);

  // Step 4: Date, Package & Travel Days
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [selectedPackageDays, setSelectedPackageDays] = useState<number>(22);
  const [travelDays, setTravelDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [passengersCount, setPassengersCount] = useState<number>(1);
  const [returnJourney, setReturnJourney] = useState<boolean>(true);

  // Step 5: Fleet Vehicle Selection
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('fleet-economy');

  // Step 6: Billing & Confirmation
  const [offeredFare, setOfferedFare] = useState<number>(20240);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'wallet' | 'jazzcash_easypaisa'>('cash');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Step 7: Confirmed Receipt
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);

  // Secondary Active Trip Drawer State
  const [shareModalBooking, setShareModalBooking] = useState<Booking | null>(null);
  const [viewActiveTripTab, setViewActiveTripTab] = useState(false);

  // Real-time drag-to-pin geocode state
  const [resolvingAddress, setResolvingAddress] = useState<'pickup' | 'dropoff' | null>(null);
  const geocodeTimerRef = useRef<number | null>(null);
  const userTouchedPickupRef = useRef(false);

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
        setPickup({ label: tr(lang, 'Finding address...', 'پتہ تلاش کیا جا رہا ہے...'), lat, lng });
        setResolvingAddress('pickup');
        try {
          const resolved = await reverseGeocodePakistan(lat, lng);
          if (!userTouchedPickupRef.current) {
            setPickup({ label: resolved || `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng });
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
  }, []);

  const handleLiveMapCenterChange = (target: 'pickup' | 'dropoff', lat: number, lng: number) => {
    const fallbackCoords = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    if (target === 'pickup') {
      userTouchedPickupRef.current = true;
      setPickup({ label: tr(lang, 'Finding address...', 'پتہ تلاش کیا جا رہا ہے...'), lat, lng });
    } else {
      setDropoff({ label: tr(lang, 'Finding address...', 'پتہ تلاش کیا جا رہا ہے...'), lat, lng });
    }
    setResolvingAddress(target);
    if (geocodeTimerRef.current) {
      window.clearTimeout(geocodeTimerRef.current);
    }
    geocodeTimerRef.current = window.setTimeout(async () => {
      try {
        const resolved = await reverseGeocodePakistan(lat, lng);
        if (target === 'pickup') {
          setPickup({ label: resolved || fallbackCoords, lat, lng });
        } else {
          setDropoff({ label: resolved || fallbackCoords, lat, lng });
        }
      } finally {
        setResolvingAddress((curr) => (curr === target ? null : curr));
      }
    }, 300);
  };

  // Active ongoing booking if any
  const activeBooking = useMemo(
    () =>
      (Array.isArray(bookings) ? bookings : []).find((b) =>
        ['searching', 'negotiating', 'confirmed', 'on_the_way', 'arrived', 'started'].includes(b.status)
      ) || null,
    [bookings]
  );

  // Compute road route whenever pickup or dropoff coordinates change
  useEffect(() => {
    if (!pickup || !dropoff) {
      return;
    }
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
    } else if (v.slug.includes('sedan') || v.slug.includes('suv')) {
      ratePerKm = 60;
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

    const calculatedTotal = Math.round(totalKm * ratePerKm);
    return {
      ratePerKm,
      totalKm,
      totalPrice: calculatedTotal,
    };
  };

  const vehiclesList = useMemo<FleetCategory[]>(() => {
    const sourceFleet = config?.fleet?.length ? config.fleet : DEFAULT_PUBLIC_CONFIG.fleet;
    return sourceFleet.filter((f) => f.is_active === 1);
  }, [config?.fleet]);

  const selectedVehicle = useMemo(() => {
    return vehiclesList.find((v) => v.id === selectedVehicleId) || vehiclesList[0] || null;
  }, [vehiclesList, selectedVehicleId]);

  const referenceFare = useMemo(() => {
    if (!selectedVehicle) return 20240;
    return calculateVehiclePrice(selectedVehicle).totalPrice;
  }, [selectedVehicle, route?.distanceKm, returnJourney, selectedPackageDays, serviceType]);

  useEffect(() => {
    setOfferedFare(referenceFare);
  }, [referenceFare]);

  const minOfferFare = Math.round(referenceFare * 0.9);

  // Confirm & Submit Booking
  const handleConfirmBooking = async () => {
    if (!pickup || !dropoff || !selectedVehicle) {
      setSubmitError(tr(lang, 'Please complete all booking steps.', 'براہ کرم بُکنگ کے تمام مراحل مکمل کریں۔'));
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const calc = calculateVehiclePrice(selectedVehicle);
    try {
      const res = await apiRequest<{ booking: Booking }>('/api/passenger/bookings', {
        method: 'POST',
        role: 'passenger',
        body: {
          bookingMode,
          serviceType,
          pickupAddress: pickup.label,
          pickupLat: pickup.lat,
          pickupLng: pickup.lng,
          dropoffAddress: dropoff.label,
          dropoffLat: dropoff.lat,
          dropoffLng: dropoff.lng,
          distanceKm: route?.distanceKm || 18.4,
          durationMin: route?.durationMin || 21,
          vehicleCategoryId: selectedVehicle.id,
          seatsRequested: passengersCount,
          pickupDate: startDate,
          pickupTime,
          expectedDropoffDate: startDate,
          expectedDropoffTime: dropoffTime,
          returnJourney,
          scheduleDays: travelDays,
          notes,
          proposedFarePkr: offeredFare,
        },
      });

      if (res?.booking) {
        setConfirmedBooking(res.booking);
        setCurrentStep(7);
        if (firebaseUser?.emailVerified) {
          void syncBookingSummary({
            bookingCode: res.booking.id,
            bookingMode,
            serviceType,
            pickupAddress: pickup.label,
            dropoffAddress: dropoff.label,
            distanceKm: route?.distanceKm || 18.4,
            farePkr: offeredFare,
            status: res.booking.status || 'searching',
          }).catch(() => {});
        }
        await onRefreshBookings();
      }
    } catch (err: any) {
      if (isBackendOfflineError(err)) {
        const nowIso = new Date().toISOString();
        const codeSuffix = String(Date.now()).slice(-6);
        const localBooking: Booking = {
          id: `BK-${codeSuffix}`,
          invoice_number: `INV-PR-${codeSuffix}`,
          passenger_id: firebaseUser?.uid || 'local-passenger',
          partner_id: null,
          booking_mode: bookingMode,
          service_type: serviceType,
          status: 'searching',
          pickup_address: pickup.label,
          pickup_lat: pickup.lat,
          pickup_lng: pickup.lng,
          dropoff_address: dropoff.label,
          dropoff_lat: dropoff.lat,
          dropoff_lng: dropoff.lng,
          distance_km: route?.distanceKm || 18.4,
          duration_min: route?.durationMin || 21,
          vehicle_category_id: selectedVehicle.id,
          vehicle_category_name: selectedVehicle.name,
          seats_requested: passengersCount,
          pickup_date: startDate,
          pickup_time: pickupTime,
          expected_dropoff_date: startDate,
          expected_dropoff_time: dropoffTime,
          actual_dropoff_time: null,
          return_journey: returnJourney ? 1 : 0,
          package_id: null,
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
          const existingRaw = localStorage.getItem(LOCAL_PASSENGER_BOOKINGS_KEY);
          const existing = existingRaw ? (JSON.parse(existingRaw) as Booking[]) : [];
          const next = [localBooking, ...(Array.isArray(existing) ? existing : [])];
          localStorage.setItem(LOCAL_PASSENGER_BOOKINGS_KEY, JSON.stringify(next));
        } catch {
          // ignore storage quota errors
        }
        if (firebaseUser?.emailVerified) {
          void syncBookingSummary({
            bookingCode: localBooking.id,
            bookingMode,
            serviceType,
            pickupAddress: pickup.label,
            dropoffAddress: dropoff.label,
            distanceKm: localBooking.distance_km,
            farePkr: offeredFare,
            status: 'searching',
          }).catch(() => {});
        }
        setConfirmedBooking(localBooking);
        setCurrentStep(7);
        await onRefreshBookings();
        return;
      }
      setSubmitError(err.message || 'Unable to confirm booking. Please try again.');
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
                className="ml-1.5 px-2.5 py-1 rounded-full bg-zinc-800 border border-[#D4A017]/50 text-[#F4C430] text-[11px] font-semibold whitespace-nowrap shrink-0 hover:bg-zinc-700"
              >
                {tr(lang, 'Active Ride', 'جاری رائیڈ')}
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
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => downloadBookingPdf(activeBooking, 'passenger', passengerName)}
                className="px-4 py-2.5 rounded-xl bg-[#0D0D10] text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-[#D4A017]" />
                {tr(lang, 'Download PDF Bill', 'پی ڈی ایف بل ڈاؤن لوڈ')}
              </button>
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
        <div className="max-w-4xl w-full mx-auto p-4 sm:p-8 space-y-7">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#D4A017]/60 bg-gradient-to-r from-[#D4A017]/15 to-[#B8860B]/15 text-[11px] font-bold uppercase tracking-widest text-[#B8860B] shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#D4A017] animate-pulse" />
              {passengerName} · {tr(lang, 'Pakistan Smart Mobility Network', 'پاکستان اسمارٹ موبلٹی نیٹ ورک')}
            </div>
            <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-[#0D0D10] leading-tight">
              {tr(lang, 'Select Your Service', 'اپنی سفری سروس منتخب کریں')}
            </h1>
            <p className="text-sm sm:text-base text-zinc-600 max-w-xl mx-auto leading-relaxed">
              {tr(
                lang,
                'Choose Instant Booking for immediate point-to-point dispatch, or Pick & Drop, Ride Sharing & Fuel Sharing for regular commute.',
                'فوری ون ٹائم سفر کے لیے انسٹنٹ بکنگ منتخب کریں، یا روزمرہ سفر کے لیے پک اینڈ ڈراپ، رائیڈ شیئرنگ اور فیول شیئرنگ چنیں۔'
              )}
            </p>
          </div>

          {/* 4 Smart, Modern, Sleek Service Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {/* 1. Instant Booking (Highlighted Sovereign Gold Style) */}
            <button
              type="button"
              onClick={() => {
                setBookingMode('go_now');
                setServiceType('pick_and_drop');
                setCurrentStep(1);
              }}
              className="group relative rounded-3xl border-2 border-[#D4A017] bg-gradient-to-br from-[#16161B] via-[#0D0D10] to-[#261E0A] text-white p-6 sm:p-7 text-start shadow-xl hover:shadow-2xl hover:border-[#F4C430] active:scale-[0.99] transition-all flex flex-col justify-between gap-5 min-h-[190px]"
            >
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#F4C430] to-[#B8860B] text-[#0D0D10] flex items-center justify-center font-bold shadow-lg group-hover:scale-105 transition-transform">
                  <Zap className="w-6 h-6 fill-[#0D0D10]" />
                </div>
                <span className="px-3 py-1 rounded-full bg-[#F4C430] text-[#0D0D10] font-bold text-[10px] uppercase tracking-widest shadow-sm">
                  {tr(lang, 'Fast Dispatch', 'فوری روانگی · ون ٹائم')}
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-[#F4C430]">
                    {tr(lang, 'Instant Booking', 'انسٹنٹ بکنگ')}
                  </h2>
                  <ArrowRight className={`w-5 h-5 text-[#F4C430] transition-transform ${lang === 'ur' ? 'rotate-180 group-hover:-translate-x-1' : 'group-hover:translate-x-1'}`} />
                </div>
                <p className="text-xs sm:text-sm text-zinc-300 leading-snug">
                  {tr(
                    lang,
                    'Entire vehicle for you. Automatic distance calculation via live map.',
                    'پوری گاڑی آپ کے لیے۔ میپ سے خودکار فاصلہ اور فوری قریبی ڈرائیور کی روانگی۔'
                  )}
                </p>
                <div className="pt-2 flex flex-wrap gap-1.5 text-[11px] font-mono text-zinc-300">
                  <span className="px-2 py-0.5 rounded-md bg-white/10 text-[#F4C430] font-bold">
                    Economy Rs 55/km
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-white/10">
                    Comfort Rs 65/km
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-white/10">
                    Sedan Rs 100/km
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-white/10 text-emerald-300">
                    Bike Rs 25/km · Rickshaw Rs 30/km
                  </span>
                </div>
              </div>
            </button>

            {/* 2. Pick & Drop */}
            <button
              type="button"
              onClick={() => {
                setBookingMode('schedule');
                setServiceType('pick_and_drop');
                setCurrentStep(1);
              }}
              className="group relative rounded-3xl border-2 border-zinc-200 bg-white text-[#0D0D10] p-6 sm:p-7 text-start shadow-sm hover:border-[#D4A017] hover:shadow-lg active:scale-[0.99] transition-all flex flex-col justify-between gap-5 min-h-[190px]"
            >
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-zinc-100 border border-zinc-200 text-[#0D0D10] flex items-center justify-center font-bold group-hover:bg-[#D4A017] group-hover:text-[#0D0D10] transition-all shadow-sm">
                  <MapPin className="w-6 h-6" />
                </div>
                <span className="px-3 py-1 rounded-full bg-zinc-100 text-zinc-800 font-bold text-[10px] uppercase tracking-widest border border-zinc-200">
                  {tr(lang, 'Scheduled Commute', 'ماہانہ و روزانہ')}
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-[#0D0D10]">
                    {tr(lang, 'Pick & Drop', 'پک اینڈ ڈراپ')}
                  </h2>
                  <ArrowRight className={`w-5 h-5 text-[#D4A017] transition-transform ${lang === 'ur' ? 'rotate-180 group-hover:-translate-x-1' : 'group-hover:translate-x-1'}`} />
                </div>
                <p className="text-xs sm:text-sm text-zinc-600 leading-snug">
                  {tr(
                    lang,
                    'Fixed schedule door-to-door office & university commute packages.',
                    'دفاتر اور کالج/یونیورسٹی کے لیے باقاعدہ صبح اور شام فکس روٹ پیکیج۔'
                  )}
                </p>
                <div className="pt-2 flex flex-wrap gap-1.5 text-[11px] font-mono text-zinc-600">
                  <span className="px-2 py-0.5 rounded-md bg-zinc-100 font-semibold">
                    22 / 30 {tr(lang, 'Days Package', 'دن کا پیکیج')}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-zinc-100">
                    {tr(lang, 'Door-to-door', 'گھر سے دفتر')}
                  </span>
                </div>
              </div>
            </button>

            {/* 3. Ride Sharing */}
            <button
              type="button"
              onClick={() => {
                setBookingMode('schedule');
                setServiceType('ride_sharing');
                setCurrentStep(1);
              }}
              className="group relative rounded-3xl border-2 border-zinc-200 bg-white text-[#0D0D10] p-6 sm:p-7 text-start shadow-sm hover:border-[#D4A017] hover:shadow-lg active:scale-[0.99] transition-all flex flex-col justify-between gap-5 min-h-[190px]"
            >
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-zinc-100 border border-zinc-200 text-[#0D0D10] flex items-center justify-center font-bold group-hover:bg-[#D4A017] group-hover:text-[#0D0D10] transition-all shadow-sm">
                  <Users className="w-6 h-6" />
                </div>
                <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-900 font-bold text-[10px] uppercase tracking-widest border border-amber-200">
                  {tr(lang, 'Carpool & Split', 'مشترکہ رائیڈ')}
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-[#0D0D10]">
                    {tr(lang, 'Ride Sharing', 'رائیڈ شیئرنگ')}
                  </h2>
                  <ArrowRight className={`w-5 h-5 text-[#D4A017] transition-transform ${lang === 'ur' ? 'rotate-180 group-hover:-translate-x-1' : 'group-hover:translate-x-1'}`} />
                </div>
                <p className="text-xs sm:text-sm text-zinc-600 leading-snug">
                  {tr(
                    lang,
                    'Share the commute with verified co-passengers and split fares.',
                    'تصدیق شدہ مسافروں کے ساتھ سفر اور کرایہ شیئر کر کے سستی سواری پائیں۔'
                  )}
                </p>
                <div className="pt-2 flex flex-wrap gap-1.5 text-[11px] font-mono text-zinc-600">
                  <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 font-semibold">
                    {tr(lang, 'Split by Seat', 'فی سیٹ بچت')}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-zinc-100">
                    {tr(lang, 'Verified Riders', 'تصدیق شدہ مسافر')}
                  </span>
                </div>
              </div>
            </button>

            {/* 4. Fuel Sharing */}
            <button
              type="button"
              onClick={() => {
                setBookingMode('schedule');
                setServiceType('fuel_sharing');
                setCurrentStep(1);
              }}
              className="group relative rounded-3xl border-2 border-zinc-200 bg-white text-[#0D0D10] p-6 sm:p-7 text-start shadow-sm hover:border-[#D4A017] hover:shadow-lg active:scale-[0.99] transition-all flex flex-col justify-between gap-5 min-h-[190px]"
            >
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-zinc-100 border border-zinc-200 text-[#0D0D10] flex items-center justify-center font-bold group-hover:bg-[#D4A017] group-hover:text-[#0D0D10] transition-all shadow-sm">
                  <Fuel className="w-6 h-6" />
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-900 font-bold text-[10px] uppercase tracking-widest border border-emerald-200">
                  {tr(lang, 'Fair Fuel Split', 'فی کلومیٹر فیول')}
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-[#0D0D10]">
                    {tr(lang, 'Fuel Sharing', 'فیول شیئرنگ')}
                  </h2>
                  <ArrowRight className={`w-5 h-5 text-[#D4A017] transition-transform ${lang === 'ur' ? 'rotate-180 group-hover:-translate-x-1' : 'group-hover:translate-x-1'}`} />
                </div>
                <p className="text-xs sm:text-sm text-zinc-600 leading-snug">
                  {tr(
                    lang,
                    'Transparent per-km fuel cost splitting for intercity and long distance trips.',
                    'انٹرسٹی اور لمبے فاصلے کے لیے پیٹرول/سی این جی لاگت کی شفاف اور عادلانہ تقسیم۔'
                  )}
                </p>
                <div className="pt-2 flex flex-wrap gap-1.5 text-[11px] font-mono text-zinc-600">
                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-semibold">
                    {tr(lang, 'Per-KM Split', 'فی کلومیٹر ایندھن لاگت')}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-zinc-100">
                    {tr(lang, 'Intercity & Long Trips', 'انٹرسٹی و طویل سفر')}
                  </span>
                </div>
              </div>
            </button>
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
                className="px-2.5 py-1.5 rounded-xl bg-[#0D0D10] text-[#F4C430] text-[11px] font-bold whitespace-nowrap shrink-0"
              >
                {tr(lang, 'Active', 'جاری')}
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
                onLocateUser={(lat, lng) => handleLiveMapCenterChange('pickup', lat, lng)}
              />
            </div>
            {/* Centered Gold Pin */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-20 pb-7">
              <div className="flex flex-col items-center">
                <div className="w-9 h-9 rounded-full bg-[#F4C430] border-[3px] border-[#0D0D10] flex items-center justify-center shadow-lg">
                  <div className="w-3 h-3 rounded-full bg-[#0D0D10]" />
                </div>
                <div className="w-0.5 h-3 bg-[#0D0D10] rounded-full -mt-0.5" />
              </div>
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
                  <span className="truncate">{pickup?.label || tr(lang, 'Finding address...', 'پتہ تلاش کیا جا رہا ہے...')}</span>
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
                disabled={!pickup || resolvingAddress === 'pickup'}
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
                <span className="font-semibold text-[#0D0D10]">A:</span> {pickup?.label}
              </button>
              <span className="font-mono font-bold text-[#0D0D10] tabular-nums shrink-0">
                {routeLoading
                  ? tr(lang, 'Calculating...', 'حساب ہو رہا ہے...')
                  : `${route?.distanceKm || 18.4} km · ~${route?.durationMin || 21} ${tr(lang, 'min', 'منٹ')}`}
              </span>
            </div>
          </div>

          <div className="relative flex-1 min-h-[380px]">
            <div className="absolute inset-0">
              <StreetMap
                center={dropoff ? [dropoff.lat, dropoff.lng] : [33.7025, 72.9785]}
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
                onLocateUser={(lat, lng) => handleLiveMapCenterChange('dropoff', lat, lng)}
              />
            </div>
            {/* Centered Red Drop-off Pin */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-20 pb-7">
              <div className="flex flex-col items-center">
                <div className="w-9 h-9 rounded-full bg-red-600 border-[3px] border-white flex items-center justify-center shadow-lg text-white">
                  <MapPin className="w-4 h-4" />
                </div>
                <div className="w-0.5 h-3 bg-red-700 rounded-full -mt-0.5" />
              </div>
            </div>
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
                  <span className="truncate">{dropoff?.label || tr(lang, 'Finding address...', 'پتہ تلاش کیا جا رہا ہے...')}</span>
                </p>
                <p className="text-[11px] text-zinc-400 font-mono tabular-nums mt-0.5">
                  {dropoff ? `${dropoff.lat.toFixed(6)}, ${dropoff.lng.toFixed(6)}` : '33.702500, 72.978500'}
                </p>
              </div>

              <div className="text-right shrink-0 bg-[#0D0D10] text-white px-3 py-1.5 rounded-xl">
                <span className="block text-[10px] text-zinc-400">{tr(lang, 'Distance', 'فاصلہ')}</span>
                <span className="font-mono font-bold text-xs text-[#F4C430] tabular-nums">
                  {routeLoading ? '...' : `${route?.distanceKm || 18.4} km`}
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
                disabled={!dropoff || resolvingAddress === 'dropoff' || routeLoading}
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
              <div
                onClick={() => setActiveClockTarget('pickup')}
                className="p-4 sm:p-5 rounded-2xl border-2 border-[#F4C430] bg-white cursor-pointer hover:bg-amber-50/20 transition-all"
              >
                <div className="flex items-center justify-between text-xs font-bold text-zinc-800 mb-2">
                  <span className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#D4A017]" /> {tr(lang, 'Pickup time', 'پِک اپ کا وقت')}
                  </span>
                  <ChevronDown className="w-4 h-4 text-zinc-400" />
                </div>
                <div className="h-11 px-4 rounded-xl bg-zinc-100 flex items-center font-display text-lg font-bold text-[#0D0D10] tabular-nums">
                  {pickupTime}
                </div>
              </div>

              <div
                onClick={() => setActiveClockTarget('dropoff')}
                className="p-4 sm:p-5 rounded-2xl border-2 border-zinc-200 bg-white cursor-pointer hover:bg-zinc-50 transition-all"
              >
                <div className="flex items-center justify-between text-xs font-bold text-zinc-800 mb-2">
                  <span className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#D4A017]" /> {tr(lang, 'Drop-off time', 'ڈراپ آف کا وقت')}
                  </span>
                  <ChevronDown className="w-4 h-4 text-zinc-400" />
                </div>
                <div className="h-11 px-4 rounded-xl bg-zinc-100 flex items-center font-display text-lg font-bold text-[#0D0D10] tabular-nums">
                  {dropoffTime}
                </div>
              </div>
            </div>

            {activeClockTarget && (
              <AnalogClockPicker
                value={activeClockTarget === 'pickup' ? pickupTime : dropoffTime}
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
                onClick={() => setCurrentStep(4)}
                className="py-3.5 px-4 rounded-2xl bg-[#F4C430] text-[#0D0D10] font-bold text-sm hover:bg-[#E5B520] shadow-sm"
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
                  <label className="block text-xs font-bold text-zinc-800 mb-2">
                    {tr(lang, 'Start date', 'سفر شروع کرنے کی تاریخ')}
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-zinc-200 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-[#F4C430]"
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
                              setTravelDays([...travelDays, day]);
                            }
                          }}
                          className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                            active ? 'bg-[#F4C430] text-[#0D0D10]' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                          }`}
                        >
                          {trDay(lang, day)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-zinc-800">
                      {tr(lang, 'Trip direction', 'سفر کی نوعیت')}
                    </label>
                    <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-xl mt-1.5">
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

                  <div>
                    <label className="block text-xs font-bold text-zinc-800">
                      {tr(lang, 'Passengers', 'مسافروں کی تعداد')}
                    </label>
                    <div className="flex items-center gap-3 mt-1.5">
                      <button
                        type="button"
                        onClick={() => setPassengersCount((c) => Math.max(1, c - 1))}
                        className="w-10 h-10 rounded-full border border-zinc-300 flex items-center justify-center text-zinc-700 hover:bg-zinc-100"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="font-display text-xl font-bold text-[#0D0D10] w-6 text-center tabular-nums">
                        {passengersCount}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPassengersCount((c) => Math.min(28, c + 1))}
                        className="w-10 h-10 rounded-full border border-zinc-300 flex items-center justify-center text-zinc-700 hover:bg-zinc-100"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

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
                onClick={() => setCurrentStep(5)}
                className="py-3.5 px-4 rounded-2xl bg-[#F4C430] text-[#0D0D10] font-bold text-sm hover:bg-[#E5B520] shadow-sm"
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
                        {returnJourney ? tr(lang, 'Return trip', 'دو طرفہ سفر') : tr(lang, 'One-way', 'یک طرفہ')}
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
                          : `Rs ${pricing.ratePerKm}/km`}
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
                      {selectedVehicle?.name || 'Economy'} ({passengersCount} {tr(lang, 'pax', 'مسافر')})
                    </span>
                  </div>
                </div>

                {/* Obsidian Fare Breakdown */}
                <div className="rounded-2xl bg-[#0D0D10] text-white p-5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-[#F4C430] uppercase tracking-wider">
                      {bookingMode === 'go_now'
                        ? tr(lang, 'Instant Trip Fare Breakdown', 'انسٹنٹ سفر کرایہ کی تفصیل')
                        : tr(lang, 'Fare breakdown', 'کرایہ کی تفصیل')}
                    </p>
                    {bookingMode === 'go_now' && (
                      <span className="px-2 py-0.5 rounded-full bg-[#F4C430] text-[#0D0D10] font-bold text-[10px]">
                        {tr(lang, 'Entire Vehicle', 'پوری گاڑی')}
                      </span>
                    )}
                  </div>

                  {bookingMode === 'go_now' ? (
                    <>
                      <div className="flex justify-between text-xs text-zinc-300 font-mono tabular-nums">
                        <span>{tr(lang, 'Trip distance', 'سفر کا فاصلہ')}</span>
                        <span>{route?.distanceKm || 18.4} km</span>
                      </div>
                      <div className="flex justify-between text-xs text-zinc-300 font-mono tabular-nums">
                        <span>{tr(lang, 'Vehicle rate per km', 'گاڑی ریٹ فی کلومیٹر')}</span>
                        <span>Rs {selectedVehicle ? calculateVehiclePrice(selectedVehicle).ratePerKm : 55}/km</span>
                      </div>
                      <div className="flex justify-between text-xs text-zinc-300 font-mono tabular-nums">
                        <span>{tr(lang, 'Automatic calculation', 'خودکار حساب کتاب')}</span>
                        <span>
                          {route?.distanceKm || 18.4} km × Rs {selectedVehicle ? calculateVehiclePrice(selectedVehicle).ratePerKm : 55} = Rs {referenceFare.toLocaleString()}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between text-xs text-zinc-300 font-mono tabular-nums">
                        <span>{tr(lang, 'Monthly distance', 'ماہانہ فاصلہ')}</span>
                        <span>
                          {route?.distanceKm || 18.4} km × {returnJourney ? 2 : 1} × {selectedPackageDays}{tr(lang, 'd', 'دن')} ={' '}
                          {Math.round((route?.distanceKm || 18.4) * (returnJourney ? 2 : 1) * selectedPackageDays * 10) / 10}{' '}
                          km
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-zinc-300 font-mono tabular-nums">
                        <span>{tr(lang, 'Rate', 'ریٹ')}</span>
                        <span>Rs {selectedVehicle ? calculateVehiclePrice(selectedVehicle).ratePerKm : 25}/km</span>
                      </div>
                    </>
                  )}

                  <div className="border-t border-zinc-800 pt-3 flex items-baseline justify-between">
                    <span className="text-sm font-semibold">
                      {bookingMode === 'go_now'
                        ? tr(lang, 'Total Trip Fare', 'کل سفر کا کرایہ')
                        : tr(lang, 'Reference monthly fare', 'مقررہ ماہانہ کرایہ')}
                    </span>
                    <span className="font-display text-2xl font-bold text-[#F4C430] tabular-nums">
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
                    { id: 'cash', label: tr(lang, 'Cash on Pickup / Monthly', 'پِک اپ پر نقد / ماہانہ ادائیگی') },
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
                onClick={handleConfirmBooking}
                className="py-3.5 px-4 rounded-2xl bg-[#F4C430] text-[#0D0D10] font-bold text-sm hover:bg-[#E5B520] shadow-md flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {tr(lang, 'Confirming...', 'تصدیق ہو رہی ہے...')}
                  </>
                ) : (
                  tr(lang, 'Confirm Booking', 'بُکنگ کنفرم کریں')
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 7: CONFIRMED RECEIPT & WHATSAPP / PDF */}
      {!viewActiveTripTab && currentStep === 7 && (
        <div className="max-w-xl w-full mx-auto p-4 sm:p-8">
          <div className="bg-white rounded-3xl border border-zinc-200 p-6 sm:p-8 space-y-5 shadow-sm text-center">
            <div className="w-20 h-20 rounded-full border-4 border-[#F4C430] flex items-center justify-center mx-auto text-[#F4C430]">
              <Check className="w-10 h-10 stroke-[3.5]" />
            </div>

            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0D0D10]">
                {tr(lang, 'Booking confirmed!', 'بُکنگ کنفرم ہو گئی!')}
              </h2>
              <p className="text-xs text-zinc-600 mt-2 max-w-md mx-auto leading-relaxed">
                {tr(
                  lang,
                  'Your ride request is saved as Pending. Verified Pro Partners are notified immediately.',
                  'آپ کی بُکنگ محفوظ ہو چکی ہے اور تصدیق شدہ پرو پارٹنرز کو فوری اطلاع بھیج دی گئی ہے۔'
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="w-full py-3.5 rounded-2xl bg-[#F4C430] text-[#0D0D10] font-bold text-sm hover:bg-[#E5B520] transition-colors shadow-sm flex items-center justify-center gap-2"
            >
              <Phone className="w-4 h-4 fill-current" />
              {tr(lang, 'Also send on WhatsApp', 'واٹس ایپ پر بھی بھیجیں')}
            </button>

            {confirmedBooking && (
              <button
                type="button"
                onClick={() => downloadBookingPdf(confirmedBooking, 'passenger', passengerName)}
                className="w-full py-3.5 rounded-2xl border border-zinc-200 text-zinc-800 font-semibold text-xs hover:bg-zinc-50 flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4 text-[#D4A017]" />
                {tr(lang, 'Download Official Digital Bill (PDF)', 'آفیشل ڈیجیٹل بل (PDF) ڈاؤن لوڈ کریں')}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setCurrentStep(1);
                onGoToBookings();
              }}
              className="w-full py-3.5 rounded-2xl border border-zinc-300 text-zinc-800 font-bold text-sm hover:bg-zinc-50"
            >
              {tr(lang, 'Done', 'مکمل')}
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
    </div>
  );
};
