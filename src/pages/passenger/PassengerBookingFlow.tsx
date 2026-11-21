import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CalendarClock,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  Edit2,
  Flame,
  Fuel,
  Info,
  Loader2,
  MapPin,
  Minus,
  Navigation,
  Phone,
  Plus,
  Radio,
  Share2,
  Sparkles,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { AnalogClockPicker } from '../../components/AnalogClockPicker';
import { VehicleImage } from '../../components/BrandMark';
import { LocationAutocomplete } from '../../components/LocationAutocomplete';
import { ShareTripStatusModal } from '../../components/ShareTripStatusModal';
import { StreetMap, type MapFocusTarget } from '../../components/StreetMap';
import { DEFAULT_PUBLIC_CONFIG } from '../../config/defaultConfig';
import { useFirebase } from '../../contexts/FirebaseContext';
import { t } from '../../i18n/translations';
import type {
  Booking,
  DemandHotspot,
  DemandMapData,
  FleetCategory,
  Language,
  MapPoint,
  PublicConfig,
  RouteResult,
  ServiceType,
} from '../../types';
import { apiRequest, isBackendOfflineError } from '../../utils/api';
import { downloadBookingPdf, shareBookingPdf } from '../../utils/pdfGenerator';

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

export type BookingStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const PassengerBookingFlow: React.FC<PassengerBookingFlowProps> = ({
  lang,
  config,
  bookings,
  demandData = null,
  passengerName,
  livePartnerLocations,
  onRefreshBookings,
  onGoToBookings,
}) => {
  const { firebaseUser, syncBookingSummary } = useFirebase();

  // Wizard Step (1 to 9)
  const [currentStep, setCurrentStep] = useState<BookingStep>(1);

  // Step 1: Mode & Service Type
  const [bookingMode, setBookingMode] = useState<'go_now' | 'schedule'>('schedule');
  const [serviceType, setServiceType] = useState<ServiceType>('pick_and_drop');

  // Step 2: Pickup
  const [pickup, setPickup] = useState<MapPoint | null>({
    label: 'Partal, Panjguran, Zone IV, Islamabad',
    lat: 33.664963,
    lng: 73.087013,
  });
  const [tempPickupQuery, setTempPickupQuery] = useState('');

  // Step 3: Drop-off
  const [dropoff, setDropoff] = useState<MapPoint | null>({
    label: 'Ameer-e-Millat Road, E-11, Islamabad',
    lat: 33.7025,
    lng: 72.9785,
  });
  const [tempDropoffQuery, setTempDropoffQuery] = useState('');

  // Routing State
  const [route, setRoute] = useState<RouteResult | null>({
    distanceKm: 30.4,
    durationMin: 31,
    coordinates: [
      [33.664963, 73.087013],
      [33.682, 73.045],
      [33.7025, 72.9785],
    ],
  });
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  // Step 4: Time Selection
  const [pickupTime, setPickupTime] = useState('9:15 AM');
  const [dropoffTime, setDropoffTime] = useState('6:00 PM');
  const [activeClockTarget, setActiveClockTarget] = useState<'pickup' | 'dropoff' | null>(null);

  // Step 5: Schedule (22 days vs 26 days packages, travel days, passenger count)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [selectedPackageDays, setSelectedPackageDays] = useState<number>(22);
  const [travelDays, setTravelDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [passengersCount, setPassengersCount] = useState<number>(1);
  const [returnJourney, setReturnJourney] = useState<boolean>(true);

  // Step 6: Vehicle Selection
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('fleet-economy');

  // Step 7: Fare Breakdown & Counter Offer
  const [offeredFare, setOfferedFare] = useState<number>(33440);

  // Step 8: Review & Payment
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'wallet' | 'jazzcash_easypaisa'>('cash');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Step 9: Confirmed Booking Details
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);

  // Secondary State
  const [focusTarget, setFocusTarget] = useState<MapFocusTarget | null>(null);
  const [shareModalBooking, setShareModalBooking] = useState<Booking | null>(null);
  const [viewActiveTripTab, setViewActiveTripTab] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [counterDrafts, setCounterDrafts] = useState<Record<string, string>>({});

  // Active ongoing booking if any
  const activeBooking = useMemo(
    () =>
      (Array.isArray(bookings) ? bookings : []).find((b) =>
        ['searching', 'negotiating', 'confirmed', 'on_the_way', 'arrived', 'started'].includes(b.status)
      ) || null,
    [bookings]
  );

  // Compute road route when pickup & dropoff change (with direct OSRM + Haversine fallback on static hosting)
  useEffect(() => {
    if (!pickup || !dropoff) {
      return;
    }
    let cancelled = false;
    (async () => {
      setRouteLoading(true);
      setRouteError(null);
      try {
        const res = await apiRequest<RouteResult>(
          `/api/map/route?fromLat=${pickup.lat}&fromLng=${pickup.lng}&toLat=${dropoff.lat}&toLng=${dropoff.lng}`
        );
        if (!cancelled && res?.distanceKm) {
          setRoute(res);
          return;
        }
      } catch {
        // Fallback to direct OSRM browser query on static Vercel hosting
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
              : [[pickup.lat, pickup.lng] as [number, number], [dropoff.lat, dropoff.lng] as [number, number]];
            setRoute({
              distanceKm: Math.max(1, Math.round((firstRoute.distance / 1000) * 10) / 10),
              durationMin: Math.max(3, Math.round(firstRoute.duration / 60)),
              coordinates: coords,
            });
            return;
          }
        }
      } catch {
        // Fallback to Haversine geodesic distance with 1.25x road factor
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
      if (!cancelled) setRouteLoading(false);
    })().finally(() => {
      if (!cancelled) setRouteLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [pickup, dropoff]);

  // Dynamic cross-calculation rate resolver for each vehicle
  const calculateVehiclePrice = (v: FleetCategory) => {
    const dist = route?.distanceKm || 30.4;
    const dailyTrips = returnJourney ? 2 : 1;
    const totalKm = dist * dailyTrips * selectedPackageDays;

    // Use admin-configured min/max rates or defaults matching the formula
    let ratePerKm = (v.per_km_min_pkr + v.per_km_max_pkr) / 2;

    // Base discount for monthly package commitments
    if (bookingMode === 'schedule') {
      if (v.slug.includes('economy')) {
        ratePerKm = serviceType === 'pick_and_drop' ? 25 : serviceType === 'ride_sharing' ? 20 : 18;
      } else if (v.slug.includes('comfort-plus')) {
        ratePerKm = 40;
      } else if (v.slug === 'comfort') {
        ratePerKm = 30; // +5 Rs/km over economy monthly
      } else if (v.slug.includes('sedan') || v.slug.includes('suv')) {
        ratePerKm = 60; // +20 Rs/km tier
      } else if (v.slug.includes('premium')) {
        ratePerKm = 75;
      } else if (v.slug.includes('luxury')) {
        ratePerKm = 100; // +10% luxury markup tier
      } else if (v.slug.includes('van-7')) {
        ratePerKm = 22.5; // in 20-30 range
      } else if (v.slug.includes('van-12')) {
        ratePerKm = 21.25;
      } else if (v.slug.includes('van-15')) {
        ratePerKm = 20.5; // in 15-25 range
      } else if (v.slug.includes('coaster')) {
        ratePerKm = 17.25; // in 12-25 range
      } else if (v.slug.includes('bike')) {
        ratePerKm = 12;
      } else if (v.slug.includes('rickshaw')) {
        ratePerKm = 16;
      }
    }

    const calculatedTotal = Math.round(totalKm * ratePerKm);
    return {
      ratePerKm,
      totalKm: Math.round(totalKm * 10) / 10,
      totalPrice: calculatedTotal,
    };
  };

  // Eligible vehicles from config or static DEFAULT_PUBLIC_CONFIG fallback
  const vehiclesList = useMemo<FleetCategory[]>(() => {
    const sourceFleet = config?.fleet?.length ? config.fleet : DEFAULT_PUBLIC_CONFIG.fleet;
    return sourceFleet.filter((f) => f.is_active === 1);
  }, [config?.fleet]);

  const selectedVehicle = useMemo(() => {
    return vehiclesList.find((v) => v.id === selectedVehicleId) || vehiclesList[0] || null;
  }, [vehiclesList, selectedVehicleId]);

  // Reference Fare calculation
  const referenceFare = useMemo(() => {
    if (!selectedVehicle) return 33440;
    const calc = calculateVehiclePrice(selectedVehicle);
    return calc.totalPrice;
  }, [selectedVehicle, route?.distanceKm, returnJourney, selectedPackageDays, serviceType, bookingMode]);

  // Keep offered fare synced with reference fare by default
  useEffect(() => {
    setOfferedFare(referenceFare);
  }, [referenceFare]);

  // Min allowable offer (10% below reference fare)
  const minOfferFare = Math.round(referenceFare * 0.9);

  // Stepper label progression
  const stepperLabels = [
    { step: 2, label: 'Pickup' },
    { step: 3, label: 'Drop-off' },
    { step: 4, label: 'Time' },
    { step: 5, label: 'Schedule' },
    { step: 6, label: 'Vehicle' },
    { step: 7, label: 'Fare' },
    { step: 8, label: 'Confirm...' },
  ];

  // Submit Booking to Backend (or local+Firestore when static Vercel hosting is active)
  const handleConfirmBooking = async () => {
    if (!pickup || !dropoff || !selectedVehicle) {
      setSubmitError('Please complete all booking steps.');
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
          distanceKm: route?.distanceKm || 30.4,
          durationMin: route?.durationMin || 31,
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
        setCurrentStep(9);
        if (firebaseUser?.emailVerified) {
          void syncBookingSummary({
            bookingCode: res.booking.id,
            bookingMode,
            serviceType,
            pickupAddress: pickup.label,
            dropoffAddress: dropoff.label,
            distanceKm: route?.distanceKm || 30.4,
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
          distance_km: route?.distanceKm || 30.4,
          duration_min: route?.durationMin || 31,
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
        setCurrentStep(9);
        await onRefreshBookings();
        return;
      }
      setSubmitError(err.message || 'Unable to confirm booking. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // WhatsApp Share Generator
  const handleShareWhatsApp = () => {
    const booking = confirmedBooking || activeBooking;
    if (!booking) return;

    const summaryText = `*PRO RIDER AI — BOOKING INVOICE*
Invoice: ${booking.invoice_number}
Booking ID: ${booking.id}
Service: ${serviceType === 'pick_and_drop' ? 'Monthly Pick & Drop' : serviceType === 'ride_sharing' ? 'Ride Sharing' : 'Fuel Sharing'}
Pickup: ${booking.pickup_address}
Drop-off: ${booking.dropoff_address}
Distance: ${booking.distance_km} km
Schedule: ${selectedPackageDays} days (${pickupTime} → ${dropoffTime})
Travel Days: ${travelDays.join(', ')}
Vehicle: ${selectedVehicle?.name || 'Standard Economy'}
Seats: ${passengersCount}
Monthly Fare: Rs. ${(booking.agreed_fare_pkr || booking.proposed_fare_pkr || offeredFare).toLocaleString()}
Status: PENDING ASSIGNMENT

Official Support: 03125007782
PRO RIDER AI — Travel with Trust`;

    const url = `https://wa.me/923125007782?text=${encodeURIComponent(summaryText)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Active Trip Banner if user has ongoing ride */}
      {activeBooking && (
        <div className="rounded-2xl bg-[#0D0D10] text-white p-4 border border-[#D4A017]/40 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#D4A017] text-[#0D0D10] flex items-center justify-center font-bold">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-[#D4A017] uppercase tracking-wider">
                Active Booking: {activeBooking.id}
              </p>
              <p className="text-xs text-zinc-300">
                {activeBooking.status.replaceAll('_', ' ').toUpperCase()} · Rs.{' '}
                {(activeBooking.agreed_fare_pkr || activeBooking.proposed_fare_pkr).toLocaleString()}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setViewActiveTripTab(!viewActiveTripTab)}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs font-semibold hover:bg-zinc-700 text-[#D4A017] transition-colors"
          >
            {viewActiveTripTab ? 'New Booking' : 'Track Active'}
          </button>
        </div>
      )}

      {/* VIEW ACTIVE TRIP PANEL */}
      {viewActiveTripTab && activeBooking && (
        <div className="rounded-3xl border border-zinc-200 bg-white p-5 space-y-4 shadow-sm animate-in fade-in">
          <div className="flex items-center justify-between border-b pb-3">
            <h2 className="font-display text-lg font-bold text-[#0D0D10]">Live Trip Tracking</h2>
            <button
              type="button"
              onClick={() => setShareModalBooking(activeBooking)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#D4A017] text-[#0D0D10] text-xs font-bold"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share Status
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-zinc-50 border">
              <span className="text-zinc-500 block">Pickup</span>
              <span className="font-semibold">{activeBooking.pickup_address}</span>
            </div>
            <div className="p-3 rounded-xl bg-zinc-50 border">
              <span className="text-zinc-500 block">Drop-off</span>
              <span className="font-semibold">{activeBooking.dropoff_address}</span>
            </div>
          </div>
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => downloadBookingPdf(activeBooking, 'passenger', passengerName)}
              className="px-4 py-2 rounded-xl bg-[#0D0D10] text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-[#D4A017]" />
              Download PDF Bill
            </button>
            <button
              type="button"
              onClick={() => setViewActiveTripTab(false)}
              className="px-4 py-2 rounded-xl border text-xs font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* TOP HEADER & STEPPER BAR (matching screenshots 2, 3, 5, 7, 10, 12) */}
      {!viewActiveTripTab && (
        <div className="rounded-3xl bg-[#0D0D10] text-white p-5 sm:p-6 shadow-xl border border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-[#F4C430] flex items-center gap-2">
              Book a ride
            </h1>
            <button
              type="button"
              onClick={() => {
                if (currentStep > 1 && currentStep < 9) setCurrentStep((s) => (s - 1) as BookingStep);
                else onGoToBookings();
              }}
              className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              title="Close or Back"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 7-Segment Progress Stepper */}
          <div className="space-y-2">
            <div className="grid grid-cols-7 gap-1.5">
              {stepperLabels.map((item) => {
                const isPassed = currentStep >= item.step;
                return (
                  <div key={item.step} className="flex flex-col gap-1">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        isPassed ? 'bg-[#F4C430]' : 'bg-zinc-800'
                      }`}
                    />
                    <span
                      className={`text-[10px] text-center truncate ${
                        isPassed ? 'text-[#F4C430] font-semibold' : 'text-zinc-500'
                      }`}
                    >
                      {item.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* STEP 1: SERVICE & MODE SELECTION (matching screenshot 01_725cfdbc.jpeg) */}
      {!viewActiveTripTab && currentStep === 1 && (
        <div className="bg-white rounded-3xl border border-zinc-200 p-6 sm:p-8 space-y-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#F4C430] text-[#0D0D10] flex items-center justify-center font-bold">
              <Car className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-[#0D0D10]">
                {serviceType === 'pick_and_drop'
                  ? 'Pick & Drop Service'
                  : serviceType === 'ride_sharing'
                  ? 'Ride Sharing'
                  : 'Carpooling / Fuel Sharing'}
              </h2>
              <p className="text-xs text-zinc-500">Share a drive on the same route</p>
            </div>
          </div>

          {/* Speech bubble card (matching screenshot 01) */}
          <div className="relative rounded-2xl bg-[#F8F8FA] border border-zinc-200 p-5 shadow-xs">
            <p className="text-sm text-zinc-700 leading-relaxed font-medium">
              Carpooling lets you share a car with people going on the same route. The fare is shared among riders.
            </p>
          </div>

          {/* Mode Selector Chips */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                id: 'pick_and_drop',
                title: 'Pick & Drop',
                desc: 'Dedicated daily office / university route',
                icon: CalendarClock,
              },
              {
                id: 'ride_sharing',
                title: 'Ride Sharing',
                desc: 'Verified commuters heading the same way',
                icon: Users,
              },
              {
                id: 'fuel_sharing',
                title: 'Fuel Sharing',
                desc: 'Split fuel costs with verified car owners',
                icon: Fuel,
              },
            ].map((m) => {
              const Icon = m.icon;
              const active = serviceType === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setServiceType(m.id as ServiceType)}
                  className={`p-4 rounded-2xl border text-left transition-all ${
                    active
                      ? 'border-[#F4C430] bg-[#FFFBEB] shadow-sm ring-2 ring-[#F4C430]/40'
                      : 'border-zinc-200 bg-white hover:bg-zinc-50'
                  }`}
                >
                  <Icon className={`w-5 h-5 mb-2 ${active ? 'text-[#B45309]' : 'text-zinc-500'}`} />
                  <p className="font-bold text-sm text-[#0D0D10]">{m.title}</p>
                  <p className="text-[11px] text-zinc-500 mt-1 leading-normal">{m.desc}</p>
                </button>
              );
            })}
          </div>

          {/* CTA Yellow Button */}
          <button
            type="button"
            onClick={() => setCurrentStep(2)}
            className="w-full py-4 rounded-2xl bg-[#F4C430] text-[#0D0D10] font-bold text-base hover:bg-[#E5B520] transition-colors shadow-md flex items-center justify-center gap-2"
          >
            <Car className="w-5 h-5" />
            Book a ride
          </button>
        </div>
      )}

      {/* STEP 2: SELECT PICKUP LOCATION (matching screenshot 1_85f0b054.jpeg) */}
      {!viewActiveTripTab && currentStep === 2 && (
        <div className="bg-white rounded-3xl border border-zinc-200 overflow-hidden shadow-sm space-y-0">
          <div className="p-4 sm:p-5 border-b border-zinc-100 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="p-2 rounded-xl hover:bg-zinc-100 text-zinc-700"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="font-display text-lg font-bold text-[#0D0D10]">Select pickup</h2>
          </div>

          {/* Search Box */}
          <div className="p-4 bg-white border-b border-zinc-100">
            <LocationAutocomplete
              label="Pickup Location"
              placeholder="Search area, sector, block, phase, street..."
              value={pickup}
              pinColor="green"
              onSelect={(pt) => {
                setPickup(pt);
              }}
            />
          </div>

          {/* Interactive Map with Center Pin */}
          <div className="relative">
            <StreetMap
              pickup={pickup}
              dropoff={null}
              route={null}
              heightClass="h-[320px] sm:h-[380px]"
              onMapPick={(lat, lng) => {
                setPickup({
                  label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
                  lat,
                  lng,
                });
              }}
            />
            {/* Centered Yellow Teardrop Pin */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-20 pb-8">
              <div className="w-9 h-9 rounded-full bg-[#F4C430] border-2 border-black flex items-center justify-center shadow-lg">
                <div className="w-3.5 h-3.5 rounded-full bg-black" />
              </div>
            </div>
          </div>

          {/* Bottom Card (matching screenshot 1) */}
          <div className="p-5 bg-white space-y-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">PICKUP LOCATION</p>
              <p className="font-bold text-sm text-[#0D0D10] mt-0.5">{pickup?.label || 'Finding address...'}</p>
              <p className="text-xs text-zinc-400 font-mono mt-0.5">
                {pickup ? `${pickup.lat.toFixed(6)}, ${pickup.lng.toFixed(6)}` : '33.664963, 73.087013'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="py-3 px-4 rounded-2xl border border-zinc-300 text-zinc-800 font-bold text-sm hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                className="py-3 px-4 rounded-2xl bg-[#F4C430] text-[#0D0D10] font-bold text-sm hover:bg-[#E5B520] shadow-sm"
              >
                Select
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: DROP-OFF LOCATION & ROUTE (matching screenshot 2_3bc3de51.jpeg) */}
      {!viewActiveTripTab && currentStep === 3 && (
        <div className="bg-white rounded-3xl border border-zinc-200 p-5 sm:p-6 space-y-5 shadow-sm">
          {/* Pickup and Drop-off Cards with Edit Pencil */}
          <div className="space-y-3">
            <div className="p-4 rounded-2xl border border-zinc-200 bg-white flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-6 h-6 rounded-full bg-[#F4C430] flex items-center justify-center shrink-0 mt-0.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-black" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">PICKUP</p>
                  <p className="text-sm font-bold text-[#0D0D10] truncate">{pickup?.label}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-2xl border border-zinc-200 bg-white flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center text-white shrink-0 mt-0.5">
                  <MapPin className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">DROP-OFF</p>
                  <LocationAutocomplete
                    label="Drop-off Destination"
                    placeholder="Search drop-off destination..."
                    value={dropoff}
                    pinColor="red"
                    onSelect={(pt) => setDropoff(pt)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Map Polyline Route */}
          <div className="rounded-2xl overflow-hidden border border-zinc-200">
            <StreetMap
              pickup={pickup}
              dropoff={dropoff}
              route={route}
              heightClass="h-[240px] sm:h-[280px]"
            />
          </div>

          {/* Stats: Distance & Drive Time (matching screenshot 2) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-[#0D0D10] text-white">
              <span className="text-[11px] text-zinc-400 block font-medium">Distance</span>
              <span className="font-display text-2xl font-bold text-[#F4C430] mt-0.5 block">
                {route?.distanceKm ? `${route.distanceKm} km` : '30.4 km'}
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-[#0D0D10] text-white">
              <span className="text-[11px] text-zinc-400 block font-medium">Drive time</span>
              <span className="font-display text-2xl font-bold text-[#F4C430] mt-0.5 block">
                {route?.durationMin ? `~${route.durationMin} min` : '~31 min'}
              </span>
            </div>
          </div>

          {/* Bottom Nav Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="py-3 px-4 rounded-2xl border border-zinc-300 text-zinc-800 font-bold text-sm hover:bg-zinc-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setCurrentStep(4)}
              className="py-3 px-4 rounded-2xl bg-[#0D0D10] text-white font-bold text-sm hover:bg-zinc-800 shadow-sm"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: PICKUP & DROP-OFF TIME (matching screenshots 3 & 4) */}
      {!viewActiveTripTab && currentStep === 4 && (
        <div className="bg-white rounded-3xl border border-zinc-200 p-6 sm:p-8 space-y-6 shadow-sm">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#0D0D10]">Pickup &amp; drop-off time</h2>
            <p className="text-xs text-zinc-500 mt-1">Set daily morning pickup and evening return times.</p>
          </div>

          {/* Inputs for Pickup and Drop-off Time */}
          <div className="space-y-4">
            <div
              onClick={() => setActiveClockTarget('pickup')}
              className="p-5 rounded-3xl border-2 border-[#F4C430] bg-white cursor-pointer hover:bg-amber-50/20 transition-all shadow-xs"
            >
              <div className="flex items-center justify-between text-xs font-bold text-zinc-800 mb-2">
                <span className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#D4A017]" /> Pickup time
                </span>
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              </div>
              <div className="h-10 px-4 rounded-xl bg-zinc-100 flex items-center font-display text-lg font-bold text-[#0D0D10]">
                {pickupTime}
              </div>
            </div>

            <div
              onClick={() => setActiveClockTarget('dropoff')}
              className="p-5 rounded-3xl border-2 border-zinc-200 bg-white cursor-pointer hover:bg-zinc-50 transition-all shadow-xs"
            >
              <div className="flex items-center justify-between text-xs font-bold text-zinc-800 mb-2">
                <span className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#D4A017]" /> Drop-off time
                </span>
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              </div>
              <div className="h-10 px-4 rounded-xl bg-zinc-100 flex items-center font-display text-lg font-bold text-[#0D0D10]">
                {dropoffTime}
              </div>
            </div>
          </div>

          <p className="text-xs text-zinc-500">
            This route takes about {route?.durationMin || 22} min by road.
          </p>

          {/* Analog Clock Picker Modal (matching screenshot 4) */}
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

          {/* Bottom Nav Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-4">
            <button
              type="button"
              onClick={() => setCurrentStep(3)}
              className="py-3.5 px-4 rounded-2xl border border-zinc-300 text-zinc-800 font-bold text-sm hover:bg-zinc-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setCurrentStep(5)}
              className="py-3.5 px-4 rounded-2xl bg-zinc-700 text-white font-bold text-sm hover:bg-zinc-800 shadow-sm"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: SCHEDULE, PACKAGES & PASSENGERS (matching screenshots 5 & 6) */}
      {!viewActiveTripTab && currentStep === 5 && (
        <div className="bg-white rounded-3xl border border-zinc-200 p-6 sm:p-8 space-y-6 shadow-sm">
          {/* Start Date */}
          <div>
            <label className="block text-xs font-bold text-zinc-800 mb-2">Start date</label>
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

          {/* Package Toggle Chips (22 days vs 26 days) */}
          <div>
            <label className="block text-xs font-bold text-zinc-800 mb-2">Package</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedPackageDays(22);
                  setTravelDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
                }}
                className={`p-4 rounded-2xl border text-center transition-all ${
                  selectedPackageDays === 22
                    ? 'border-[#F4C430] bg-[#F4C430] text-[#0D0D10] font-bold shadow-sm'
                    : 'border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700'
                }`}
              >
                <span className="block text-lg font-display font-bold">22 days</span>
                <span className="text-xs opacity-80">Mon – Fri</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedPackageDays(26);
                  setTravelDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
                }}
                className={`p-4 rounded-2xl border text-center transition-all ${
                  selectedPackageDays === 26
                    ? 'border-[#F4C430] bg-[#F4C430] text-[#0D0D10] font-bold shadow-sm'
                    : 'border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700'
                }`}
              >
                <span className="block text-lg font-display font-bold">26 days</span>
                <span className="text-xs opacity-80">Mon – Sat</span>
              </button>
            </div>
          </div>

          {/* Travel Days Pills */}
          <div>
            <label className="block text-xs font-bold text-zinc-800 mb-2">Travel days</label>
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
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                      active
                        ? 'bg-[#F4C430] text-[#0D0D10] shadow-xs'
                        : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-zinc-500 mt-2 font-medium">
              {travelDays.join(', ')} · {pickupTime} → {dropoffTime} · about {selectedPackageDays} trips a month
            </p>
          </div>

          {/* Passengers Counter */}
          <div>
            <label className="block text-xs font-bold text-zinc-800 mb-2">Passengers</label>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setPassengersCount((c) => Math.max(1, c - 1))}
                className="w-10 h-10 rounded-full border border-zinc-300 flex items-center justify-center text-zinc-700 hover:bg-zinc-100 font-bold"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="font-display text-2xl font-bold text-[#0D0D10] w-8 text-center">
                {passengersCount}
              </span>
              <button
                type="button"
                onClick={() => setPassengersCount((c) => Math.min(28, c + 1))}
                className="w-10 h-10 rounded-full border border-zinc-300 flex items-center justify-center text-zinc-700 hover:bg-zinc-100 font-bold"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
              Cars are booked whole. In 7+ seat vans and coasters each passenger pays a lower per-passenger fare.
            </p>
          </div>

          {/* Bottom Nav Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-4">
            <button
              type="button"
              onClick={() => setCurrentStep(4)}
              className="py-3.5 px-4 rounded-2xl border border-zinc-300 text-zinc-800 font-bold text-sm hover:bg-zinc-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setCurrentStep(6)}
              className="py-3.5 px-4 rounded-2xl bg-zinc-700 text-white font-bold text-sm hover:bg-zinc-800 shadow-sm"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* STEP 6: CHOOSE VEHICLE CLASS (matching screenshots 7, 8 & 9) */}
      {!viewActiveTripTab && currentStep === 6 && (
        <div className="bg-white rounded-3xl border border-zinc-200 p-6 sm:p-8 space-y-5 shadow-sm">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#0D0D10]">Choose your vehicle class</h2>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
              Monthly package for {selectedPackageDays} travel days, return trip. 7+ seaters are priced per passenger.
            </p>
          </div>

          {/* Vehicle Cards List */}
          <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
            {vehiclesList.map((vehicle) => {
              const active = selectedVehicleId === vehicle.id;
              const pricing = calculateVehiclePrice(vehicle);

              return (
                <div
                  key={vehicle.id}
                  onClick={() => setSelectedVehicleId(vehicle.id)}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between gap-4 ${
                    active
                      ? 'border-[#F4C430] bg-[#FFFBEB] shadow-sm ring-1 ring-[#F4C430]'
                      : 'border-zinc-200 bg-white hover:border-zinc-300'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <VehicleImage
                      src={vehicle.image_url}
                      alt={vehicle.name}
                      className="w-20 h-14 rounded-xl object-cover bg-zinc-100 shrink-0 border"
                    />
                    <div className="min-w-0">
                      <p className="font-display font-bold text-sm text-[#0D0D10] truncate">
                        {vehicle.name}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5 truncate">
                        {vehicle.tagline || `${vehicle.seating_capacity} seats`}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="font-display font-bold text-base text-[#0D0D10]">
                      Rs {pricing.totalPrice.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-zinc-400">per month · {passengersCount} passenger</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Nav Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-3">
            <button
              type="button"
              onClick={() => setCurrentStep(5)}
              className="py-3.5 px-4 rounded-2xl border border-zinc-300 text-zinc-800 font-bold text-sm hover:bg-zinc-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setCurrentStep(7)}
              className="py-3.5 px-4 rounded-2xl bg-zinc-700 text-white font-bold text-sm hover:bg-zinc-800 shadow-sm"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* STEP 7: FARE BREAKDOWN & NEGOTIATION (matching screenshots 10 & 11) */}
      {!viewActiveTripTab && currentStep === 7 && (
        <div className="bg-white rounded-3xl border border-zinc-200 p-6 sm:p-8 space-y-6 shadow-sm">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#0D0D10]">Review &amp; confirm</h2>
          </div>

          {/* Review Summary Card (matching screenshot 10) */}
          <div className="divide-y divide-zinc-100 text-xs text-zinc-700">
            <div className="py-2.5 flex justify-between">
              <span className="text-zinc-500">Booking type</span>
              <span className="font-semibold text-right">
                {serviceType === 'pick_and_drop'
                  ? 'Monthly Pick & Drop'
                  : serviceType === 'ride_sharing'
                  ? 'Ride Sharing'
                  : 'Fuel Sharing'}
              </span>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <span className="text-zinc-500 shrink-0">Pickup</span>
              <span className="font-semibold text-right truncate max-w-[280px]">{pickup?.label}</span>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <span className="text-zinc-500 shrink-0">Drop-off</span>
              <span className="font-semibold text-right truncate max-w-[280px]">{dropoff?.label}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-zinc-500">Distance</span>
              <span className="font-semibold">{route?.distanceKm || 30.4} km · ~{route?.durationMin || 31} min</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-zinc-500">Date</span>
              <span className="font-semibold">{startDate}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-zinc-500">Pickup time</span>
              <span className="font-semibold">{pickupTime}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-zinc-500">Drop-off time</span>
              <span className="font-semibold">{dropoffTime}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-zinc-500">Package</span>
              <span className="font-semibold">{selectedPackageDays} days / month</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-zinc-500">Travel days</span>
              <span className="font-semibold">{travelDays.join(', ')}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-zinc-500">Vehicle</span>
              <span className="font-semibold">{selectedVehicle?.name || 'Economy'}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-zinc-500">Passengers</span>
              <span className="font-semibold">{passengersCount}</span>
            </div>
          </div>

          {/* Obsidian Black Fare Breakdown Card (matching screenshot 11) */}
          <div className="rounded-3xl bg-[#0D0D10] text-white p-6 space-y-3 shadow-lg">
            <p className="text-xs font-bold text-[#F4C430] uppercase tracking-wider">Fare breakdown</p>
            <div className="space-y-2 text-xs text-zinc-300">
              <div className="flex justify-between">
                <span>Route</span>
                <span className="font-mono">
                  {route?.distanceKm || 30.4} km × {returnJourney ? 2 : 1} (return) × {selectedPackageDays} days ={' '}
                  {Math.round((route?.distanceKm || 30.4) * (returnJourney ? 2 : 1) * selectedPackageDays * 10) / 10} km
                </span>
              </div>
              <div className="flex justify-between">
                <span>Pick &amp; Drop rate</span>
                <span className="font-mono">
                  Rs {selectedVehicle ? calculateVehiclePrice(selectedVehicle).ratePerKm : 25}/km
                </span>
              </div>
              <div className="flex justify-between">
                <span>Booking</span>
                <span>{selectedVehicle && selectedVehicle.seating_capacity >= 7 ? 'Per passenger' : 'Whole vehicle'}</span>
              </div>
            </div>
            <div className="border-t border-zinc-800 pt-3 flex items-baseline justify-between">
              <span className="text-sm font-semibold">Reference fare (monthly)</span>
              <span className="font-display text-2xl font-bold text-[#F4C430]">
                Rs {referenceFare.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Offer Your Fare Counter (matching screenshot 11) */}
          <div className="p-5 rounded-3xl border border-zinc-200 bg-white space-y-3 shadow-xs">
            <div>
              <p className="font-bold text-sm text-[#0D0D10]">Offer your fare · کرایہ پیشکش</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Up to 10% below the reference fare. The Pro Partner must accept it.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setOfferedFare((f) => Math.max(minOfferFare, f - 250))}
                className="w-12 h-12 rounded-full border border-zinc-300 flex items-center justify-center text-zinc-800 hover:bg-zinc-100 font-bold"
              >
                <Minus className="w-5 h-5" />
              </button>
              <div className="text-center">
                <span className="font-display text-2xl font-bold text-[#0D0D10]">
                  Rs {offeredFare.toLocaleString()}
                </span>
                <span className="block text-[11px] text-zinc-400 mt-0.5">
                  {offeredFare === referenceFare
                    ? 'Reference fare'
                    : offeredFare < referenceFare
                    ? `Discount: -Rs ${(referenceFare - offeredFare).toLocaleString()}`
                    : `Added Tip: +Rs ${(offeredFare - referenceFare).toLocaleString()}`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOfferedFare((f) => f + 250)}
                className="w-12 h-12 rounded-full border border-zinc-300 flex items-center justify-center text-zinc-800 hover:bg-zinc-100 font-bold"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Bottom Nav Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-3">
            <button
              type="button"
              onClick={() => setCurrentStep(6)}
              className="py-3.5 px-4 rounded-2xl border border-zinc-300 text-zinc-800 font-bold text-sm hover:bg-zinc-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setCurrentStep(8)}
              className="py-3.5 px-4 rounded-2xl bg-[#F4C430] text-[#0D0D10] font-bold text-sm hover:bg-[#E5B520] shadow-sm"
            >
              Continue to Confirm
            </button>
          </div>
        </div>
      )}

      {/* STEP 8: FINAL REVIEW & PAYMENT (Pre-Confirmation) */}
      {!viewActiveTripTab && currentStep === 8 && (
        <div className="bg-white rounded-3xl border border-zinc-200 p-6 sm:p-8 space-y-6 shadow-sm">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#0D0D10]">Payment &amp; Final Confirmation</h2>
            <p className="text-xs text-zinc-500 mt-1">Select your preferred settlement method for the trip.</p>
          </div>

          {/* Payment Method Cards */}
          <div className="space-y-3">
            {[
              {
                id: 'cash',
                label: 'Cash on Pickup / Trip Completion',
                desc: 'Pay driver directly on daily or monthly basis',
              },
              {
                id: 'wallet',
                label: 'PRO RIDER Digital Wallet',
                desc: 'Direct deduction from wallet balance with invoice receipt',
              },
              {
                id: 'jazzcash_easypaisa',
                label: 'JazzCash / EasyPaisa / Bank Transfer',
                desc: 'Digital online settlement to driver or company',
              },
            ].map((p) => (
              <div
                key={p.id}
                onClick={() => setPaymentMethod(p.id as any)}
                className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                  paymentMethod === p.id
                    ? 'border-[#F4C430] bg-[#FFFBEB] ring-1 ring-[#F4C430]'
                    : 'border-zinc-200 bg-white hover:bg-zinc-50'
                }`}
              >
                <p className="font-bold text-sm text-[#0D0D10]">{p.label}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{p.desc}</p>
              </div>
            ))}
          </div>

          {/* Driver Notes */}
          <div>
            <label className="block text-xs font-bold text-zinc-800 mb-1">
              Instructions or Landmark for Driver (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Near gate 2, please call before arriving..."
              className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 text-xs focus:ring-2 focus:ring-[#F4C430]"
            />
          </div>

          {/* Submit Error */}
          {submitError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Bottom Nav Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => setCurrentStep(7)}
              className="py-3.5 px-4 rounded-2xl border border-zinc-300 text-zinc-800 font-bold text-sm hover:bg-zinc-50"
            >
              Back
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
                  Confirming...
                </>
              ) : (
                'Confirm Booking'
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 9: BOOKING CONFIRMED & WHATSAPP BILL INVOICE (matching screenshot 12_d9881a32.jpeg) */}
      {!viewActiveTripTab && currentStep === 9 && (
        <div className="bg-white rounded-3xl border border-zinc-200 p-6 sm:p-8 space-y-6 shadow-sm text-center animate-in fade-in zoom-in-95">
          {/* Yellow Circular Checkmark Badge */}
          <div className="w-20 h-20 rounded-full border-4 border-[#F4C430] flex items-center justify-center mx-auto text-[#F4C430]">
            <Check className="w-10 h-10 stroke-[3.5]" />
          </div>

          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0D0D10]">
              Booking confirmed!
            </h2>
            <p className="text-xs text-zinc-600 mt-2 max-w-md mx-auto leading-relaxed">
              Your request is saved as <strong>Pending</strong>. Our team has been notified and will assign a driver.
            </p>
          </div>

          {/* Action: Also send on WhatsApp (matching screenshot 12) */}
          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="w-full py-4 rounded-2xl bg-[#F4C430] text-[#0D0D10] font-bold text-sm hover:bg-[#E5B520] transition-colors shadow-md flex items-center justify-center gap-2"
          >
            <Phone className="w-4 h-4 fill-current" />
            Also send on WhatsApp
          </button>

          {/* Action: Download PDF Invoice */}
          {confirmedBooking && (
            <button
              type="button"
              onClick={() => downloadBookingPdf(confirmedBooking, 'passenger', passengerName)}
              className="w-full py-3.5 rounded-2xl border border-zinc-200 text-zinc-800 font-semibold text-xs hover:bg-zinc-50 flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4 text-[#D4A017]" />
              Download Official Digital Bill (PDF)
            </button>
          )}

          {/* Action: Done Button */}
          <button
            type="button"
            onClick={() => {
              setCurrentStep(1);
              onGoToBookings();
            }}
            className="w-full py-3.5 rounded-2xl border border-zinc-300 text-zinc-800 font-bold text-sm hover:bg-zinc-50"
          >
            Done
          </button>
        </div>
      )}

      {/* Share Trip Status Modal */}
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
