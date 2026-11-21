import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bookmark, CalendarClock, Check, CheckCircle2, Clock, Download, Flame, Fuel, Loader2, MapPin, Navigation, Radio, Share2, Trash2, Users, X, Zap } from 'lucide-react';
import { VehicleImage } from '../../components/BrandMark';
import { LocationAutocomplete } from '../../components/LocationAutocomplete';
import { ShareTripStatusModal } from '../../components/ShareTripStatusModal';
import { StreetMap, type MapFocusTarget } from '../../components/StreetMap';
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
import { apiRequest } from '../../utils/api';
import { downloadBookingPdf, shareBookingPdf } from '../../utils/pdfGenerator';

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
  const { firebaseUser, savedPlaces, savePlace, removeSavedPlace, syncBookingSummary } = useFirebase();
  const [focusTarget, setFocusTarget] = useState<MapFocusTarget | null>(null);

  // Ordered Step Form State (Screens 4-8)
  const [bookingMode, setBookingMode] = useState<'go_now' | 'schedule'>('go_now');
  const [serviceType, setServiceType] = useState<ServiceType>('pick_and_drop');
  const [pickup, setPickup] = useState<MapPoint | null>(null);
  const [dropoff, setDropoff] = useState<MapPoint | null>(null);
  const [pickMode, setPickMode] = useState<'pickup' | 'dropoff' | null>(null);

  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const [pickupDate, setPickupDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pickupTime, setPickupTime] = useState('08:00');
  const [expectedDropoffDate, setExpectedDropoffDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expectedDropoffTime, setExpectedDropoffTime] = useState('09:00');
  const [scheduleType, setScheduleType] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('daily');
  const [selectedDays, setSelectedDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [returnJourney, setReturnJourney] = useState(false);
  const [packageId, setPackageId] = useState<string>('');
  const [notes, setNotes] = useState('');

  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [seatsRequested, setSeatsRequested] = useState<number>(1);
  const [proposedFare, setProposedFare] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [counterDrafts, setCounterDrafts] = useState<Record<string, string>>({});
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [shareModalBooking, setShareModalBooking] = useState<Booking | null>(null);

  // Active ongoing or searching/negotiating booking to surface live status (Screens 9-11)
  const activeBooking = useMemo(
    () =>
      bookings.find((b) =>
        ['searching', 'negotiating', 'confirmed', 'on_the_way', 'arrived', 'started'].includes(b.status)
      ) || null,
    [bookings]
  );

  // Eligible vehicles filtered by active status and selected service
  const eligibleVehicles = useMemo<FleetCategory[]>(() => {
    const list = (config?.fleet || []).filter(
      (f) => f.is_active === 1 && f.services_eligible.includes(serviceType)
    );
    return list;
  }, [config, serviceType]);

  useEffect(() => {
    if (eligibleVehicles.length > 0 && !eligibleVehicles.some((v) => v.id === selectedVehicleId)) {
      setSelectedVehicleId(eligibleVehicles[0].id);
    }
  }, [eligibleVehicles, selectedVehicleId]);

  const selectedVehicle = useMemo(
    () => eligibleVehicles.find((v) => v.id === selectedVehicleId) || null,
    [eligibleVehicles, selectedVehicleId]
  );

  // Compute OSRM real road route whenever pickup & dropoff change
  useEffect(() => {
    if (!pickup || !dropoff) {
      setRoute(null);
      setRouteError(null);
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
        if (!cancelled) setRoute(res);
      } catch (err: any) {
        if (!cancelled) {
          setRoute(null);
          setRouteError(err.message || 'Unable to compute real road route');
        }
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pickup, dropoff]);

  // Estimate fare from real OSRM road distance + Admin-configured fleet rates
  const fareEstimate = useMemo(() => {
    if (!selectedVehicle || !route) return null;
    if (bookingMode === 'schedule' && packageId) {
      const pkg = config?.packages.find((p) => p.id === packageId);
      if (pkg) {
        return { min: pkg.base_monthly_pkr, max: pkg.base_monthly_pkr, mid: pkg.base_monthly_pkr };
      }
    }
    const base = Number(selectedVehicle.base_fare_pkr);
    let min = Math.round(base + route.distanceKm * Number(selectedVehicle.per_km_min_pkr));
    let max = Math.round(base + route.distanceKm * Number(selectedVehicle.per_km_max_pkr));
    if (serviceType === 'ride_sharing') {
      const divisor = Math.max(2, selectedVehicle.seating_capacity - 1);
      min = Math.round((min / divisor) * seatsRequested);
      max = Math.round((max / divisor) * seatsRequested);
    } else if (serviceType === 'fuel_sharing') {
      min = Math.round(min * 0.65);
      max = Math.round(max * 0.65);
    }
    if (returnJourney && bookingMode === 'schedule') {
      min = Math.round(min * 1.85);
      max = Math.round(max * 1.85);
    }
    return { min, max, mid: Math.round((min + max) / 2) };
  }, [selectedVehicle, route, serviceType, seatsRequested, returnJourney, bookingMode, packageId, config]);

  useEffect(() => {
    if (fareEstimate) {
      setProposedFare(String(fareEstimate.mid));
    } else {
      setProposedFare('');
    }
  }, [fareEstimate?.mid]);

  const handleMapPick = async (lat: number, lng: number) => {
    const target = pickMode;
    setPickMode(null);
    if (!target) return;
    try {
      const rev = await apiRequest<{ label: string; lat: number; lng: number }>(
        `/api/map/reverse?lat=${lat}&lng=${lng}`
      );
      const pt = { label: rev.label, lat: rev.lat, lng: rev.lng };
      if (target === 'pickup') setPickup(pt);
      else setDropoff(pt);
    } catch {
      const pt = { label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng };
      if (target === 'pickup') setPickup(pt);
      else setDropoff(pt);
    }
  };

  const handleSubmitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pickup || !dropoff || !route || !selectedVehicle) {
      setSubmitError('Please select Pickup, Drop-off (with valid road route), and an eligible Vehicle.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const createdRes = await apiRequest<{ booking: Booking }>('/api/passenger/bookings', {
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
          distanceKm: route.distanceKm,
          durationMin: route.durationMin,
          vehicleCategoryId: selectedVehicle.id,
          seatsRequested,
          pickupDate: bookingMode === 'go_now' ? new Date().toISOString().slice(0, 10) : pickupDate,
          pickupTime: bookingMode === 'go_now' ? new Date().toTimeString().slice(0, 5) : pickupTime,
          expectedDropoffDate: bookingMode === 'schedule' ? expectedDropoffDate : undefined,
          expectedDropoffTime: bookingMode === 'schedule' ? expectedDropoffTime : undefined,
          returnJourney: bookingMode === 'schedule' ? returnJourney : false,
          packageId: bookingMode === 'schedule' && packageId ? packageId : null,
          scheduleDays: bookingMode === 'schedule' ? selectedDays : [],
          notes,
          proposedFarePkr: proposedFare ? Number(proposedFare) : undefined,
        },
      });
      if (firebaseUser?.emailVerified && createdRes?.booking) {
        void syncBookingSummary({
          bookingCode: createdRes.booking.id,
          bookingMode,
          serviceType,
          pickupAddress: pickup.label,
          dropoffAddress: dropoff.label,
          distanceKm: route.distanceKm,
          farePkr: Number(createdRes.booking.proposed_fare_pkr || proposedFare || 0),
          status: createdRes.booking.status || 'searching',
        }).catch(() => {});
      }
      await onRefreshBookings();
    } catch (err: any) {
      setSubmitError(err.message || 'Unable to submit booking');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptOffer = async (bookingId: string, offerId: string) => {
    setActionBusy(offerId);
    try {
      await apiRequest(`/api/passenger/bookings/${bookingId}/accept-offer`, {
        method: 'POST',
        role: 'passenger',
        body: { offerId },
      });
      await onRefreshBookings();
    } finally {
      setActionBusy(null);
    }
  };

  const handleRejectOffer = async (bookingId: string, offerId: string) => {
    setActionBusy(offerId);
    try {
      await apiRequest(`/api/passenger/bookings/${bookingId}/reject-offer`, {
        method: 'POST',
        role: 'passenger',
        body: { offerId },
      });
      await onRefreshBookings();
    } finally {
      setActionBusy(null);
    }
  };

  const handleCounterOffer = async (bookingId: string, partnerId: string) => {
    const val = Number(counterDrafts[partnerId]);
    if (!Number.isFinite(val) || val <= 0) return;
    setActionBusy(partnerId);
    try {
      await apiRequest(`/api/passenger/bookings/${bookingId}/counter`, {
        method: 'POST',
        role: 'passenger',
        body: { partnerId, amountPkr: val },
      });
      await onRefreshBookings();
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setActionBusy(null);
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    setActionBusy(bookingId);
    try {
      await apiRequest(`/api/passenger/bookings/${bookingId}/cancel`, {
        method: 'POST',
        role: 'passenger',
      });
      await onRefreshBookings();
    } finally {
      setActionBusy(null);
    }
  };

  // Determine map overlay markers when viewing active booking vs creating new booking
  const mapPickup: MapPoint | null = activeBooking
    ? { label: activeBooking.pickup_address, lat: activeBooking.pickup_lat, lng: activeBooking.pickup_lng }
    : pickup;
  const mapDropoff: MapPoint | null = activeBooking
    ? { label: activeBooking.dropoff_address, lat: activeBooking.dropoff_lat, lng: activeBooking.dropoff_lng }
    : dropoff;

  const activeLiveLoc = activeBooking
    ? livePartnerLocations[activeBooking.id] ||
      (activeBooking.partner_lat && activeBooking.partner_lng
        ? { lat: activeBooking.partner_lat, lng: activeBooking.partner_lng }
        : null)
    : null;

  const surgeHotspots = useMemo<DemandHotspot[]>(
    () => (demandData?.hotspots || []).filter((hs) => hs.demandLevel === 'high' || hs.surgeMultiplier >= 1.2),
    [demandData]
  );

  const pickupSurgeHotspot = useMemo<DemandHotspot | null>(() => {
    if (!mapPickup || !demandData?.hotspots?.length) return null;
    const toRad = (d: number) => (d * Math.PI) / 180;
    for (const hs of demandData.hotspots) {
      if (hs.surgeMultiplier < 1.15 && hs.demandLevel === 'low') continue;
      const dLat = toRad(hs.lat - mapPickup.lat);
      const dLng = toRad(hs.lng - mapPickup.lng);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(mapPickup.lat)) * Math.cos(toRad(hs.lat)) * Math.sin(dLng / 2) ** 2;
      const km = 2 * 6371 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (km <= Math.max(hs.radiusKm, 4.5)) {
        return hs;
      }
    }
    return null;
  }, [mapPickup, demandData]);

  return (
    <div className="space-y-6">
      {/* Screen 4: Large Interactive Street Map with D3 Surge Overlay */}
      <StreetMap
        pickup={mapPickup}
        dropoff={mapDropoff}
        route={route}
        onRouteComputed={(computed) => {
          if (!activeBooking && computed) {
            setRoute(computed);
            setRouteError(null);
          }
        }}
        livePartner={
          activeBooking && ['confirmed', 'on_the_way', 'arrived', 'started'].includes(activeBooking.status) && activeLiveLoc
            ? { lat: activeLiveLoc.lat, lng: activeLiveLoc.lng, label: activeBooking.partner_name || 'Pro Partner' }
            : null
        }
        zones={config?.zones || []}
        demandData={demandData}
        demandAudience="passenger"
        focusTarget={focusTarget}
        pickMode={pickMode}
        onMapPick={handleMapPick}
        routeError={routeError}
        heightClass="h-[300px] sm:h-[360px] lg:h-[400px]"
      />

      {/* Active D3 Surge Zones Quick Strip + Selected Pickup Surge Notice */}
      {(surgeHotspots.length > 0 || pickupSurgeHotspot) && (
        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 space-y-2">
          {surgeHotspots.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0D0D10]">
                <Flame className="w-4 h-4 text-red-600" />
                <span>High-Demand Surge Sectors (Click to View on Map)</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {surgeHotspots.slice(0, 4).map((hs) => (
                  <button
                    key={hs.id}
                    type="button"
                    onClick={() =>
                      setFocusTarget({ lat: hs.lat, lng: hs.lng, zoom: 13, ts: Date.now() })
                    }
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold border transition-colors ${
                      hs.demandLevel === 'high'
                        ? 'bg-red-50 text-red-800 border-red-200 hover:bg-red-100'
                        : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
                    }`}
                  >
                    {hs.areaName} · {hs.surgeMultiplier.toFixed(2)}x
                  </button>
                ))}
              </div>
            </div>
          )}

          {pickupSurgeHotspot && (
            <div className="rounded-xl bg-amber-50 border border-amber-300 px-3 py-2 flex items-start gap-2 text-xs text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>
                <strong>Surge Area Notice:</strong> Pickup near{' '}
                <strong>
                  {pickupSurgeHotspot.areaName}, {pickupSurgeHotspot.city}
                </strong>{' '}
                is experiencing{' '}
                {pickupSurgeHotspot.demandLevel === 'high' ? 'high surge demand' : 'elevated demand'} (
                <span className="font-mono font-bold tabular-nums">
                  {pickupSurgeHotspot.surgeMultiplier.toFixed(2)}x
                </span>
                {' · '}
                {pickupSurgeHotspot.activeBookings} active trip(s)). Driver counter-offers may reflect peak area activity.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Screens 9, 10, 11: Active Booking Offers, Confirmation & Live Trip Tracking */}
      {activeBooking && (
        <div className="rounded-2xl border border-[#D4A017]/60 bg-white p-5 sm:p-6 space-y-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
                <span>{activeBooking.id}</span>
                <span aria-hidden="true">·</span>
                <span>{activeBooking.service_type.replaceAll('_', ' ').toUpperCase()}</span>
                <span aria-hidden="true">·</span>
                <span>{activeBooking.distance_km} km</span>
              </div>
              <h2 className="font-display text-xl font-bold text-[#0D0D10] mt-1">
                {activeBooking.status === 'searching' && 'Searching for Verified Pro Partners...'}
                {activeBooking.status === 'negotiating' && 'Pro Partner Fare Offers Received'}
                {activeBooking.status === 'confirmed' && 'Booking Confirmed'}
                {activeBooking.status === 'on_the_way' && 'Pro Partner on the Way'}
                {activeBooking.status === 'arrived' && 'Pro Partner Arrived at Pickup'}
                {activeBooking.status === 'started' && 'Trip in Progress'}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShareModalBooking(activeBooking)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold hover:bg-[#EAB308] shadow-sm transition-colors"
                title="Send live road route and ETA to contact"
              >
                <Radio className="w-3.5 h-3.5 text-[#0D0D10]" />
                <span>{t(lang, 'shareTripStatus')}</span>
              </button>
              {['confirmed', 'on_the_way', 'arrived', 'started'].includes(activeBooking.status) && (
                <>
                  <button
                    type="button"
                    onClick={() => downloadBookingPdf(activeBooking, 'passenger', passengerName)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0D0D10] text-white text-xs font-semibold hover:bg-zinc-800"
                  >
                    <Download className="w-3.5 h-3.5 text-[#D4A017]" />
                    {t(lang, 'downloadPdf')}
                  </button>
                  <button
                    type="button"
                    onClick={() => shareBookingPdf(activeBooking, 'passenger', passengerName)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200 text-xs font-semibold hover:bg-zinc-50"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    {t(lang, 'sharePdf')}
                  </button>
                </>
              )}
              {['searching', 'negotiating', 'confirmed'].includes(activeBooking.status) && (
                <button
                  type="button"
                  disabled={actionBusy === activeBooking.id}
                  onClick={() => handleCancelBooking(activeBooking.id)}
                  className="px-3.5 py-2 rounded-xl border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-50"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>

          {/* Route Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-100">
              <span className="text-zinc-500 block">Pickup</span>
              <span className="font-semibold text-[#0D0D10]">{activeBooking.pickup_address}</span>
            </div>
            <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-100">
              <span className="text-zinc-500 block">Drop-off</span>
              <span className="font-semibold text-[#0D0D10]">{activeBooking.dropoff_address}</span>
            </div>
            <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-100">
              <span className="text-zinc-500 block">Proposed / Agreed Fare</span>
              <span className="font-mono text-base font-bold text-[#0D0D10]">
                Rs. {(activeBooking.agreed_fare_pkr || activeBooking.proposed_fare_pkr).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Trip Status Timeline (Screen 11) */}
          {['confirmed', 'on_the_way', 'arrived', 'started'].includes(activeBooking.status) && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {[
                  { key: 'confirmed', label: 'Booking Confirmed' },
                  { key: 'on_the_way', label: 'Pro Partner on the Way' },
                  { key: 'arrived', label: 'Arrived at Pickup' },
                  { key: 'started', label: 'Trip Started' },
                ].map((step, i) => {
                  const order = ['confirmed', 'on_the_way', 'arrived', 'started'];
                  const reached = order.indexOf(activeBooking.status) >= i;
                  return (
                    <div
                      key={step.key}
                      className={`p-2.5 rounded-xl border flex items-center gap-2 ${
                        reached
                          ? 'bg-[#0D0D10] text-white border-[#0D0D10]'
                          : 'bg-zinc-50 text-zinc-400 border-zinc-200'
                      }`}
                    >
                      <CheckCircle2 className={`w-4 h-4 shrink-0 ${reached ? 'text-[#D4A017]' : 'text-zinc-300'}`} />
                      <span className="font-medium leading-tight">{step.label}</span>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-600 pt-1">
                <span>
                  Assigned Partner: <strong className="text-[#0D0D10]">{activeBooking.partner_name}</strong> ·{' '}
                  {activeBooking.partner_vehicle_name} ({activeBooking.partner_vehicle_number})
                </span>
                <span>
                  {activeLiveLoc
                    ? `Live GPS Active (${activeLiveLoc.lat.toFixed(4)}, ${activeLiveLoc.lng.toFixed(4)})`
                    : 'Awaiting live GPS broadcast from Pro Partner'}
                </span>
              </div>
            </div>
          )}

          {/* Offers & Negotiation (Screen 9) */}
          {['searching', 'negotiating'].includes(activeBooking.status) && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Driver / Pro Partner Offers
              </h3>
              {(activeBooking.offers || []).filter((o) => o.sender_role === 'partner' && o.status === 'pending').length === 0 ? (
                <p className="text-sm text-zinc-500 py-2">
                  Request sent to eligible approved Pro Partners. Offers will appear here in real time.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(activeBooking.offers || [])
                    .filter((o) => o.sender_role === 'partner' && o.status === 'pending')
                    .map((offer) => (
                      <div key={offer.id} className="rounded-xl border border-zinc-200 p-4 space-y-3 bg-[#F8F8FA]">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-sm text-[#0D0D10]">{offer.partner_name}</p>
                            <p className="text-xs text-zinc-500">
                              {offer.partner_vehicle_name} · {offer.partner_vehicle_number}
                            </p>
                          </div>
                          <span className="font-mono text-lg font-bold text-[#0D0D10]">
                            Rs. {offer.amount_pkr.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={actionBusy === offer.id}
                            onClick={() => handleAcceptOffer(activeBooking.id, offer.id)}
                            className="flex-1 py-2 px-3 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 inline-flex items-center justify-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" /> Accept Offer
                          </button>
                          <button
                            type="button"
                            disabled={actionBusy === offer.id}
                            onClick={() => handleRejectOffer(activeBooking.id, offer.id)}
                            className="py-2 px-3 rounded-lg border border-zinc-300 text-zinc-700 text-xs font-semibold hover:bg-white inline-flex items-center gap-1"
                          >
                            <X className="w-3.5 h-3.5" /> Reject
                          </button>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="number"
                            placeholder="Counter Rs."
                            value={counterDrafts[offer.partner_id] || ''}
                            onChange={(e) =>
                              setCounterDrafts((d) => ({ ...d, [offer.partner_id]: e.target.value }))
                            }
                            className="w-32 px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-xs font-mono"
                          />
                          <button
                            type="button"
                            disabled={actionBusy === offer.partner_id}
                            onClick={() => handleCounterOffer(activeBooking.id, offer.partner_id)}
                            className="px-3 py-1.5 rounded-lg bg-[#0D0D10] text-white text-xs font-semibold"
                          >
                            Counter Offer
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={onGoToBookings}
              className="text-xs font-semibold text-[#B8860B] hover:underline"
            >
              View All in My Bookings →
            </button>
          </div>
        </div>
      )}

      {/* Screens 4, 5, 6, 7, 8: Main Services + GO NOW / SCHEDULE Ordered Booking Panel */}
      <form onSubmit={handleSubmitBooking} className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 space-y-6">
        {/* Step 1: 3 Service Cards in One Row */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-[#0D0D10]">1. Select Service</h2>
            {/* GO NOW / SCHEDULE Mode Switch */}
            <div className="inline-flex rounded-xl bg-zinc-100 p-1 gap-1">
              <button
                type="button"
                onClick={() => setBookingMode('go_now')}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                  bookingMode === 'go_now'
                    ? 'bg-[#D4A017] text-[#0D0D10]'
                    : 'text-zinc-600 hover:text-[#0D0D10]'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                {t(lang, 'goNow')}
              </button>
              <button
                type="button"
                onClick={() => setBookingMode('schedule')}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                  bookingMode === 'schedule'
                    ? 'bg-[#0D0D10] text-white'
                    : 'text-zinc-600 hover:text-[#0D0D10]'
                }`}
              >
                <CalendarClock className="w-3.5 h-3.5" />
                {t(lang, 'schedule')}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
            {[
              { id: 'pick_and_drop' as ServiceType, label: t(lang, 'pickAndDrop'), sub: 'Private Dedicated', icon: MapPin },
              { id: 'ride_sharing' as ServiceType, label: t(lang, 'rideSharing'), sub: 'Per-Seat Commute', icon: Users },
              { id: 'fuel_sharing' as ServiceType, label: t(lang, 'fuelSharing'), sub: 'Cost Split Pool', icon: Fuel },
            ].map((srv) => {
              const Icon = srv.icon;
              const active = serviceType === srv.id;
              return (
                <button
                  key={srv.id}
                  type="button"
                  onClick={() => setServiceType(srv.id)}
                  className={`p-3.5 sm:p-4 rounded-xl border text-left transition-all ${
                    active
                      ? 'bg-[#0D0D10] text-white border-[#0D0D10] shadow-sm'
                      : 'bg-white text-[#0D0D10] border-zinc-200 hover:border-[#D4A017]'
                  }`}
                >
                  <Icon className={`w-5 h-5 mb-2 ${active ? 'text-[#D4A017]' : 'text-zinc-600'}`} />
                  <div className="font-display text-xs sm:text-sm font-bold leading-tight">{srv.label}</div>
                  <div className={`text-[11px] mt-0.5 hidden sm:block ${active ? 'text-zinc-300' : 'text-zinc-500'}`}>
                    {srv.sub}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Cloud Saved Places Chips (when signed in with Google) */}
        {firebaseUser && (
          <div className="rounded-xl bg-[#F8F8FA] border border-zinc-200 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="inline-flex items-center gap-1 font-bold text-[#0D0D10] mr-1">
                <Bookmark className="w-3.5 h-3.5 text-[#D4A017]" />
                Saved Places:
              </span>
              {savedPlaces.length === 0 ? (
                <span className="text-zinc-500 text-[11px]">No saved places yet — select a pickup or drop-off to bookmark.</span>
              ) : (
                savedPlaces.map((sp) => (
                  <div key={sp.id} className="inline-flex items-center rounded-lg bg-white border border-zinc-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        if (!pickup) setPickup({ label: sp.address, lat: sp.lat, lng: sp.lng });
                        else setDropoff({ label: sp.address, lat: sp.lat, lng: sp.lng });
                      }}
                      className="px-2.5 py-1 text-[11px] font-semibold text-[#0D0D10] hover:bg-zinc-50"
                      title={sp.address}
                    >
                      {sp.label}
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeSavedPlace(sp.id).catch(() => {})}
                      aria-label={`Remove ${sp.label}`}
                      className="px-1.5 py-1 text-zinc-400 hover:text-red-600 border-l border-zinc-100"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {pickup && (
                <button
                  type="button"
                  onClick={() =>
                    void savePlace({
                      label: pickup.label.split(',')[0].slice(0, 32) || 'Pickup Spot',
                      address: pickup.label,
                      lat: pickup.lat,
                      lng: pickup.lng,
                      category: 'favorite',
                    }).catch(() => {})
                  }
                  className="px-2.5 py-1 rounded-lg bg-[#0D0D10] text-white text-[11px] font-semibold hover:bg-zinc-800"
                >
                  + Save Pickup
                </button>
              )}
              {dropoff && (
                <button
                  type="button"
                  onClick={() =>
                    void savePlace({
                      label: dropoff.label.split(',')[0].slice(0, 32) || 'Destination',
                      address: dropoff.label,
                      lat: dropoff.lat,
                      lng: dropoff.lng,
                      category: 'favorite',
                    }).catch(() => {})
                  }
                  className="px-2.5 py-1 rounded-lg bg-[#D4A017] text-[#0D0D10] text-[11px] font-bold hover:bg-[#EAB308]"
                >
                  + Save Drop-off
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 2 & 3: Pickup MUST be entered before Drop-off */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <LocationAutocomplete
            label="2. Pickup Location"
            placeholder={t(lang, 'pickupPlaceholder')}
            value={pickup}
            onSelect={setPickup}
            onRequestMapPick={() => setPickMode('pickup')}
            pinColor="green"
          />
          <LocationAutocomplete
            label="3. Drop-off Location"
            placeholder={pickup ? t(lang, 'dropoffPlaceholder') : 'Enter pickup location first...'}
            value={dropoff}
            onSelect={setDropoff}
            onRequestMapPick={() => setPickMode('dropoff')}
            pinColor="red"
            disabled={!pickup}
          />
        </div>

        {/* Step 4 & 5: Schedule Fields (When SCHEDULE mode is active) */}
        {bookingMode === 'schedule' && (
          <div className="rounded-xl bg-[#F8F8FA] border border-zinc-200 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-[#0D0D10]">4 &amp; 5. Schedule Dates, Days &amp; Monthly Packages</span>
              <div className="flex items-center gap-1 text-xs">
                {(['daily', 'weekly', 'monthly', 'custom'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      setScheduleType(st);
                      if (st !== 'monthly') setPackageId('');
                    }}
                    className={`px-2.5 py-1 rounded-lg font-semibold capitalize ${
                      scheduleType === st ? 'bg-[#0D0D10] text-white' : 'bg-white border border-zinc-200 text-zinc-600'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-600 mb-1">Start Date</label>
                <input
                  type="date"
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 bg-white text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-zinc-600 mb-1">Pickup Time</label>
                <input
                  type="time"
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 bg-white text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-zinc-600 mb-1">End / Drop Date</label>
                <input
                  type="date"
                  value={expectedDropoffDate}
                  onChange={(e) => setExpectedDropoffDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 bg-white text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-zinc-600 mb-1">Expected Drop Time</label>
                <input
                  type="time"
                  value={expectedDropoffTime}
                  onChange={(e) => setExpectedDropoffTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 bg-white text-xs"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-zinc-600 mr-1">Days:</span>
                {WEEK_DAYS.map((day) => {
                  const on = selectedDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() =>
                        setSelectedDays((prev) => (on ? prev.filter((d) => d !== day) : [...prev, day]))
                      }
                      className={`px-2 py-1 rounded-md text-[11px] font-semibold ${
                        on ? 'bg-[#D4A017] text-[#0D0D10]' : 'bg-white border border-zinc-200 text-zinc-500'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>

              <label className="inline-flex items-center gap-2 text-xs font-medium text-zinc-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={returnJourney}
                  onChange={(e) => setReturnJourney(e.target.checked)}
                  className="accent-[#D4A017]"
                />
                Include Return Journey
              </label>
            </div>

            {scheduleType === 'monthly' && (config?.packages || []).length > 0 && (
              <div>
                <label className="block text-[11px] font-semibold text-zinc-600 mb-1">Monthly Package Selection</label>
                <select
                  value={packageId}
                  onChange={(e) => setPackageId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 bg-white text-xs"
                >
                  <option value="">Custom Monthly Pricing (Route-based)</option>
                  {(config?.packages || []).map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name} — Rs. {pkg.base_monthly_pkr.toLocaleString()} ({pkg.trips_included} trips)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-zinc-600 mb-1">Additional Instructions</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Gate number, landmark, or morning pickup note..."
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 bg-white text-xs"
              />
            </div>
          </div>
        )}

        {/* Step 6 & 7: Eligible Vehicle Selection & Seats */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-sm font-bold text-[#0D0D10]">6. Select Eligible Vehicle Category</h3>
            {serviceType === 'ride_sharing' && selectedVehicle && (
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-zinc-600">7. Seats:</span>
                <select
                  value={seatsRequested}
                  onChange={(e) => setSeatsRequested(Number(e.target.value))}
                  className="px-2.5 py-1 rounded-lg border border-zinc-200 bg-white font-mono"
                >
                  {Array.from({ length: selectedVehicle.seating_capacity }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? 'Seat' : 'Seats'}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {eligibleVehicles.map((v) => {
              const selected = v.id === selectedVehicleId;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedVehicleId(v.id)}
                  className={`rounded-xl border p-3 text-left transition-all flex flex-col justify-between gap-2 ${
                    selected
                      ? 'border-[#D4A017] bg-[#FCFBF7] ring-1 ring-[#D4A017]'
                      : 'border-zinc-200 bg-white hover:border-zinc-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <VehicleImage src={v.image_url} alt={v.name} className="w-16 h-12" />
                    <div className="min-w-0">
                      <div className="font-display font-bold text-xs text-[#0D0D10] truncate">{v.name}</div>
                      <div className="text-[11px] text-zinc-500">Up to {v.seating_capacity} seats</div>
                      <div className="font-mono text-[11px] font-semibold text-[#B8860B] mt-0.5">
                        Rs. {v.per_km_min_pkr}–{v.per_km_max_pkr}/km
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 8, 9, 10: Real Distance, Travel Time, Estimated Fare & Submit */}
        <div className="rounded-xl bg-[#0D0D10] text-white p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="grid grid-cols-3 gap-4 sm:gap-8">
            <div>
              <span className="text-[11px] text-zinc-400 block">8. Road Distance</span>
              <span className="font-mono text-base sm:text-lg font-bold inline-flex items-center gap-1">
                <Navigation className="w-3.5 h-3.5 text-[#D4A017]" />
                {routeLoading ? '...' : route ? `${route.distanceKm} km` : '—'}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-zinc-400 block">9. Travel Time</span>
              <span className="font-mono text-base sm:text-lg font-bold inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-[#D4A017]" />
                {routeLoading ? '...' : route ? `${route.durationMin} min` : '—'}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-zinc-400 block">10. Estimated Fare</span>
              <span className="font-mono text-base sm:text-lg font-bold text-[#F4C430]">
                {fareEstimate
                  ? fareEstimate.min === fareEstimate.max
                    ? `Rs. ${fareEstimate.min.toLocaleString()}`
                    : `Rs. ${fareEstimate.min.toLocaleString()}–${fareEstimate.max.toLocaleString()}`
                  : '—'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {fareEstimate && (
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-zinc-300">Your Offer (Rs.):</label>
                <input
                  type="number"
                  value={proposedFare}
                  onChange={(e) => setProposedFare(e.target.value)}
                  className="w-24 px-2.5 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white font-mono text-xs"
                />
              </div>
            )}
            <button
              type="submit"
              disabled={submitting || !route || !selectedVehicle}
              className="px-6 py-3 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold hover:bg-[#EAB308] transition-colors disabled:opacity-50 inline-flex items-center gap-2 whitespace-nowrap"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {bookingMode === 'go_now' ? t(lang, 'findPartner') : t(lang, 'confirmSchedule')}
            </button>
          </div>
        </div>

        {submitError && (
          <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            {submitError}
          </p>
        )}
      </form>

      <ShareTripStatusModal
        isOpen={Boolean(shareModalBooking)}
        onClose={() => setShareModalBooking(null)}
        booking={shareModalBooking}
        passengerName={passengerName}
        lang={lang}
      />
    </div>
  );
};
