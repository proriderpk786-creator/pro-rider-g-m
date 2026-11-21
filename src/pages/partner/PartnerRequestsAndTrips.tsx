import React, { useEffect, useState } from 'react';
import {
  Check,
  Download,
  Lock,
  MapPin,
  Navigation,
  Radio,
  SkipForward,
  X,
} from 'lucide-react';
import { StreetMap, type MapFocusTarget } from '../../components/StreetMap';
import { apiRequest } from '../../utils/api';
import { downloadBookingPdf } from '../../utils/pdfGenerator';
import type { Booking, DemandMapData, PartnerProfile, RouteResult, ServiceZone } from '../../types';

// Screens 20 & 21: Pro Partner Home / Eligible Passenger Requests
export const PartnerRequestsView: React.FC<{
  approved: boolean;
  profile: PartnerProfile;
  requests: Booking[];
  demandData?: DemandMapData | null;
  zones?: ServiceZone[];
  onRefresh: () => Promise<void>;
  onGoToDocs: () => void;
}> = ({ approved, profile, requests, demandData = null, zones = [], onRefresh, onGoToDocs }) => {
  const [selectedRequest, setSelectedRequest] = useState<Booking | null>(null);
  const [previewRoute, setPreviewRoute] = useState<RouteResult | null>(null);
  const [focusTarget, setFocusTarget] = useState<MapFocusTarget | null>(null);
  const [offerDrafts, setOfferDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedRequest) {
      setPreviewRoute(null);
      return;
    }
    let cancelled = false;
    apiRequest<RouteResult>(
      `/api/map/route?fromLat=${selectedRequest.pickup_lat}&fromLng=${selectedRequest.pickup_lng}&toLat=${selectedRequest.dropoff_lat}&toLng=${selectedRequest.dropoff_lng}`
    )
      .then((res) => {
        if (!cancelled) setPreviewRoute(res);
      })
      .catch(() => {
        if (!cancelled) setPreviewRoute(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRequest?.id]);

  const handleAccept = async (bookingId: string) => {
    setBusyId(bookingId);
    setError(null);
    try {
      await apiRequest(`/api/partner/requests/${bookingId}/accept`, {
        method: 'POST',
        role: 'partner',
      });
      setSelectedRequest(null);
      await onRefresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleCounter = async (bookingId: string) => {
    const amt = Number(offerDrafts[bookingId]);
    if (!Number.isFinite(amt) || amt <= 0) return;
    setBusyId(bookingId);
    setError(null);
    try {
      await apiRequest(`/api/partner/requests/${bookingId}/offer`, {
        method: 'POST',
        role: 'partner',
        body: { amountPkr: amt },
      });
      await onRefresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleSkip = async (bookingId: string) => {
    setBusyId(bookingId);
    try {
      await apiRequest(`/api/partner/requests/${bookingId}/skip`, {
        method: 'POST',
        role: 'partner',
      });
      if (selectedRequest?.id === bookingId) setSelectedRequest(null);
      await onRefresh();
    } finally {
      setBusyId(null);
    }
  };

  if (!approved) {
    return (
      <div className="rounded-3xl border border-amber-300 bg-white p-8 max-w-2xl mx-auto text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-[#0D0D10] text-[#D4A017] flex items-center justify-center mx-auto">
          <Lock className="w-7 h-7" />
        </div>
        <h2 className="font-display text-2xl font-bold text-[#0D0D10]">
          Document Verification Required
        </h2>
        <p className="text-sm text-zinc-600 leading-relaxed">
          Current Status: <strong className="uppercase">{profile.verification_status.replaceAll('_', ' ')}</strong>.
          Unapproved Pro Partners cannot accept Passenger requests. Complete your CNIC, Driving Licence, and Vehicle uploads for Super Admin approval.
        </p>
        <button
          type="button"
          onClick={onGoToDocs}
          className="px-6 py-3 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold hover:bg-[#EAB308]"
        >
          Complete Registration &amp; Upload Documents
        </button>
      </div>
    );
  }

  const topHotspots = demandData?.hotspots || [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Route Preview & Live D3 Demand Heatmap */}
        <div className="lg:col-span-6 space-y-3">
          <StreetMap
            pickup={
              selectedRequest
                ? { label: selectedRequest.pickup_address, lat: selectedRequest.pickup_lat, lng: selectedRequest.pickup_lng }
                : null
            }
            dropoff={
              selectedRequest
                ? { label: selectedRequest.dropoff_address, lat: selectedRequest.dropoff_lat, lng: selectedRequest.dropoff_lng }
                : null
            }
            route={previewRoute}
            zones={zones}
            demandData={demandData}
            demandAudience="partner"
            focusTarget={focusTarget}
            heightClass="h-[340px] lg:h-[440px]"
          />
          {selectedRequest && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between font-mono">
                <span className="font-bold text-[#0D0D10]">{selectedRequest.id}</span>
                <button type="button" onClick={() => setSelectedRequest(null)} className="text-zinc-500 hover:text-[#0D0D10]">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-zinc-600">
                Passenger: <strong>{selectedRequest.passenger_display}</strong> (contact protected until confirmed)
              </p>
              <p className="text-zinc-600">
                Schedule: {selectedRequest.pickup_date} · {selectedRequest.pickup_time} ({selectedRequest.booking_mode.replaceAll('_', ' ')})
              </p>
            </div>
          )}

          {topHotspots.length > 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-sm font-bold text-[#0D0D10]">
                    High-Demand Positioning Zones
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    Click any sector to focus the D3 demand map toward peak requests
                  </p>
                </div>
                <span className="font-mono text-[11px] font-bold text-[#0D0D10] tabular-nums">
                  {demandData?.totalOpenRequests ?? 0} Open · {demandData?.totalActiveBookings ?? 0} Active
                </span>
              </div>
              <div className="divide-y divide-zinc-100">
                {topHotspots.slice(0, 5).map((hs) => (
                  <button
                    key={hs.id}
                    type="button"
                    onClick={() =>
                      setFocusTarget({ lat: hs.lat, lng: hs.lng, zoom: 13, ts: Date.now() })
                    }
                    className="w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-zinc-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#0D0D10] truncate">
                        {hs.areaName}
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        {hs.city} · {hs.openRequests} open · {hs.activeBookings} active
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          hs.demandLevel === 'high'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : hs.demandLevel === 'medium'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {hs.demandLevel === 'high' ? 'High Surge' : hs.demandLevel === 'medium' ? 'Busy' : 'Normal'}
                      </span>
                      <span className="font-mono text-xs font-bold text-[#0D0D10] tabular-nums w-12 text-right">
                        {hs.surgeMultiplier.toFixed(2)}x
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Eligible Real Passenger Booking Requests */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl font-bold text-[#0D0D10]">Eligible Passenger Requests</h2>
              <p className="text-xs text-zinc-500">Live saved bookings matching your approved vehicle &amp; services</p>
            </div>
            <span className="font-mono text-xs font-bold text-[#0D0D10]">{requests.length} Open</span>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2 text-xs text-red-700 font-medium">
              {error}
            </div>
          )}

          {requests.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
              No eligible Passenger requests right now. Keep Online status active to receive real-time broadcasts.
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => (
                <div key={req.id} className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3.5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
                        <span className="font-bold text-[#0D0D10]">{req.id}</span>
                        <span aria-hidden="true">·</span>
                        <span>{req.service_type.replaceAll('_', ' ').toUpperCase()}</span>
                        <span aria-hidden="true">·</span>
                        <span>{req.seats_requested} Seat(s)</span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-1">
                        {req.pickup_date} at {req.pickup_time} · {req.vehicle_category_name}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-lg font-bold text-[#0D0D10]">
                        Rs. {Number(req.proposed_fare_pkr).toLocaleString()}
                      </span>
                      <span className="block text-[11px] text-zinc-500 font-mono">
                        {req.distance_km} km · ~{req.duration_min} min
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-emerald-700 mt-0.5 shrink-0" />
                      <span>{req.pickup_address}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Navigation className="w-3.5 h-3.5 text-red-600 mt-0.5 shrink-0" />
                      <span>{req.dropoff_address}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-100">
                    <button
                      type="button"
                      disabled={busyId === req.id}
                      onClick={() => handleAccept(req.id)}
                      className="flex-1 py-2 px-3 rounded-xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 inline-flex items-center justify-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" /> ACCEPT
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedRequest(req)}
                      className="py-2 px-3 rounded-xl border border-zinc-200 text-xs font-semibold hover:bg-zinc-50"
                    >
                      VIEW ROUTE
                    </button>
                    <button
                      type="button"
                      disabled={busyId === req.id}
                      onClick={() => handleSkip(req.id)}
                      className="py-2 px-3 rounded-xl border border-zinc-200 text-zinc-600 text-xs font-semibold hover:bg-zinc-50 inline-flex items-center gap-1"
                    >
                      <SkipForward className="w-3.5 h-3.5" /> SKIP
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Counter Offer Rs."
                      value={offerDrafts[req.id] || ''}
                      onChange={(e) => setOfferDrafts((d) => ({ ...d, [req.id]: e.target.value }))}
                      className="flex-1 px-3 py-2 rounded-xl border border-zinc-200 text-xs font-mono"
                    />
                    <button
                      type="button"
                      disabled={busyId === req.id}
                      onClick={() => handleCounter(req.id)}
                      className="px-4 py-2 rounded-xl bg-[#0D0D10] text-white text-xs font-bold hover:bg-zinc-800"
                    >
                      COUNTER OFFER
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Screens 22 & 23: Driver My Trips & Strict Sequential Trip Management
export const PartnerTripsView: React.FC<{
  trips: Booking[];
  gpsSharing: boolean;
  onToggleGpsSharing: () => void;
  onRefresh: () => Promise<void>;
}> = ({ trips, gpsSharing, onToggleGpsSharing, onRefresh }) => {
  const [tab, setTab] = useState<'active' | 'upcoming' | 'completed' | 'cancelled'>('active');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const filtered = trips.filter((t) => {
    if (tab === 'upcoming') return t.booking_mode === 'schedule' && t.status === 'confirmed';
    if (tab === 'active') return ['confirmed', 'on_the_way', 'arrived', 'started'].includes(t.status);
    if (tab === 'completed') return t.status === 'completed';
    return t.status === 'cancelled';
  });

  const nextStepMap: Record<string, { next: string; label: string }> = {
    confirmed: { next: 'on_the_way', label: 'Start Heading to Pickup (On the Way)' },
    on_the_way: { next: 'arrived', label: 'Mark Arrived at Pickup' },
    arrived: { next: 'started', label: 'Start Trip' },
    started: { next: 'completed', label: 'Complete Trip' },
  };

  const handleTransition = async (id: string, nextStatus: string) => {
    setBusyId(id);
    setErr(null);
    try {
      await apiRequest(`/api/partner/trips/${id}/transition`, {
        method: 'POST',
        role: 'partner',
        body: { nextStatus },
      });
      await onRefresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleRecordCash = async (id: string) => {
    setBusyId(id);
    setErr(null);
    try {
      await apiRequest(`/api/partner/trips/${id}/record-cash-payment`, {
        method: 'POST',
        role: 'partner',
      });
      await onRefresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-2xl font-bold text-[#0D0D10]">My Trips</h2>
          <button
            type="button"
            onClick={onToggleGpsSharing}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
              gpsSharing
                ? 'bg-emerald-700 text-white border-emerald-700'
                : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            {gpsSharing ? 'Live GPS Sharing Active' : 'Share Live GPS'}
          </button>
        </div>

        <div className="inline-flex rounded-xl bg-zinc-100 p-1 gap-1">
          {(['active', 'upcoming', 'completed', 'cancelled'] as const).map((tb) => (
            <button
              key={tb}
              type="button"
              onClick={() => setTab(tb)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize ${
                tab === tb ? 'bg-[#0D0D10] text-white' : 'text-zinc-600'
              }`}
            >
              {tb}
            </button>
          ))}
        </div>
      </div>

      {err && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2 text-xs text-red-700">{err}</div>}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
          No {tab} trips found.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((trip) => {
            const action = nextStepMap[trip.status];
            return (
              <div key={trip.id} className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
                      <span className="font-bold text-[#0D0D10]">{trip.id}</span>
                      <span aria-hidden="true">·</span>
                      <span>Passenger: {trip.passenger_name}</span>
                      <span aria-hidden="true">·</span>
                      <span className="uppercase font-bold text-[#B8860B]">{trip.status.replaceAll('_', ' ')}</span>
                    </div>
                    <p className="text-sm font-semibold text-[#0D0D10] mt-1">
                      {trip.pickup_address} → {trip.dropoff_address}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {trip.pickup_date} {trip.pickup_time} · {trip.distance_km} km
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="font-mono text-lg font-bold text-[#0D0D10]">
                      Rs. {Number(trip.agreed_fare_pkr || trip.total_bill_pkr).toLocaleString()}
                    </div>
                    <div className="text-[11px] text-zinc-500 font-mono">
                      Commission: Rs. {Number(trip.commission_pkr).toLocaleString()} · {trip.payment_status}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-zinc-100">
                  {action && (
                    <button
                      type="button"
                      disabled={busyId === trip.id}
                      onClick={() => handleTransition(trip.id, action.next)}
                      className="px-4 py-2 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold hover:bg-[#EAB308]"
                    >
                      {action.label}
                    </button>
                  )}
                  {trip.status === 'completed' && trip.payment_status !== 'PAID' && (
                    <button
                      type="button"
                      disabled={busyId === trip.id}
                      onClick={() => handleRecordCash(trip.id)}
                      className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800"
                    >
                      Record Cash Payment Collected
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => downloadBookingPdf(trip, 'partner', trip.passenger_name)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0D0D10] text-white text-xs font-semibold"
                  >
                    <Download className="w-3.5 h-3.5 text-[#D4A017]" />
                    Trip PDF Invoice
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
