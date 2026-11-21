export type Language = 'en' | 'ur';

export type UserRole = 'passenger' | 'partner' | 'admin';

export type ServiceType = 'pick_and_drop' | 'ride_sharing' | 'fuel_sharing';

export type BookingStatus =
  | 'searching'
  | 'negotiating'
  | 'confirmed'
  | 'on_the_way'
  | 'arrived'
  | 'started'
  | 'completed'
  | 'cancelled';

export type VerificationStatus =
  | 'not_registered'
  | 'incomplete'
  | 'documents_pending'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'suspended';

export interface User {
  id: string;
  role: UserRole;
  full_name: string;
  phone: string;
  whatsapp: string;
  email: string;
  city: string;
  operating_area?: string;
  phone_verified: number;
  notify_push?: number;
  notify_sms?: number;
  status?: string;
  created_at: string;
}

export interface PartnerProfile {
  user_id: string;
  verification_status: VerificationStatus;
  cnic_number: string;
  cnic_expiry: string;
  licence_number: string;
  licence_expiry: string;
  vehicle_category_id: string;
  vehicle_name: string;
  vehicle_number: string;
  seating_capacity: number;
  fuel_type: string;
  operating_city: string;
  service_eligibility: ServiceType[];
  is_online: number;
  current_lat: number | null;
  current_lng: number | null;
  last_location_at: string | null;
  admin_notes: string;
  pending_vehicle_review?: any;
}

export interface PartnerDocument {
  id: string;
  partner_id: string;
  doc_type: 'profile_photo' | 'cnic_front' | 'cnic_back' | 'driving_licence' | 'vehicle_registration' | 'vehicle_photo';
  file_name: string;
  file_data_url: string;
  status: 'pending' | 'approved' | 'rejected';
  expiry_date: string;
  review_notes: string;
  uploaded_at: string;
}

export interface FleetCategory {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  image_url: string;
  seating_capacity: number;
  base_fare_pkr: number;
  per_km_min_pkr: number;
  per_km_max_pkr: number;
  waiting_charge_per_min: number;
  extra_stop_pkr: number;
  commission_pct: number;
  services_eligible: ServiceType[];
  is_active: number;
  sort_order?: number;
}

export interface PassengerAccount {
  id: string;
  full_name: string;
  phone: string;
  whatsapp: string;
  email: string;
  city: string;
  operating_area?: string;
  phone_verified: number;
  status: string;
  created_at: string;
  total_bookings: number;
  wallet_balance_pkr: number;
}

export interface ServiceZone {
  id: string;
  city: string;
  area_name: string;
  center_lat: number;
  center_lng: number;
  radius_km: number;
  demand_level: 'low' | 'medium' | 'high';
  rickshaw_enabled: number;
  rickshaw_rate_pkr: number;
  rickshaw_hours: string;
  is_active: number;
}

export interface MonthlyPackage {
  id: string;
  name: string;
  service_type: ServiceType;
  vehicle_category_id: string;
  duration_days: number;
  trips_included: number;
  discount_pct: number;
  base_monthly_pkr: number;
  description: string;
  is_active: number;
}

export interface PublicConfig {
  brand: string;
  tagline: string;
  supportWhatsapp: string;
  supportEmail: string;
  goNowMinOfferPct: number;
  goNowMaxOfferPct: number;
  scheduleDefaults: {
    pickupTime: string;
    dropTime: string;
    allowedDays: string[];
    ratePerKm: number;
  };
  fleet: FleetCategory[];
  zones: ServiceZone[];
  packages: MonthlyPackage[];
}

export interface MapPoint {
  label: string;
  lat: number;
  lng: number;
}

export interface RouteResult {
  distanceKm: number;
  durationMin: number;
  coordinates: [number, number][];
}

export interface DemandHotspot {
  id: string;
  city: string;
  areaName: string;
  lat: number;
  lng: number;
  radiusKm: number;
  demandLevel: 'low' | 'medium' | 'high';
  activeBookings: number;
  openRequests: number;
  recentBookings: number;
  surgeMultiplier: number;
  demandScore: number;
  rickshawEnabled: boolean;
}

export interface DemandPoint {
  lat: number;
  lng: number;
  weight: number;
  areaName: string;
  isLiveBooking: boolean;
}

export interface DemandMapData {
  hotspots: DemandHotspot[];
  points: DemandPoint[];
  totalOpenRequests: number;
  totalActiveBookings: number;
  updatedAt: string;
}

export interface BookingOffer {
  id: string;
  booking_id: string;
  partner_id: string;
  sender_role: 'partner' | 'passenger';
  amount_pkr: number;
  message: string;
  status: 'pending' | 'accepted' | 'rejected' | 'skipped';
  created_at: string;
  partner_name?: string;
  partner_vehicle_name?: string;
  partner_vehicle_number?: string;
}

export interface WalletTransaction {
  id: string;
  tx_ref: string;
  user_id: string;
  role: UserRole;
  booking_id: string | null;
  type: 'credit' | 'debit' | 'commission' | 'settlement' | 'withdrawal';
  amount_pkr: number;
  payment_method: 'wallet' | 'cash' | 'jazzcash' | 'easypaisa' | 'bank_transfer';
  status: 'confirmed' | 'pending' | 'failed';
  description: string;
  created_at: string;
}

export interface Booking {
  id: string;
  invoice_number: string;
  booking_mode: 'go_now' | 'schedule';
  service_type: ServiceType;
  passenger_id: string;
  partner_id: string | null;
  vehicle_category_id: string;
  vehicle_category_name?: string;
  vehicle_image_url?: string;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  distance_km: number;
  duration_min: number;
  seats_requested: number;
  pickup_date: string;
  pickup_time: string;
  expected_dropoff_date: string;
  expected_dropoff_time: string;
  actual_dropoff_time: string | null;
  return_journey: number;
  package_id: string | null;
  schedule_days?: string[];
  notes: string;
  proposed_fare_pkr: number;
  agreed_fare_pkr: number | null;
  total_bill_pkr: number;
  amount_paid_pkr: number;
  commission_pkr: number;
  payment_status: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
  status: BookingStatus;
  partner_name?: string;
  partner_vehicle_name?: string;
  partner_vehicle_number?: string;
  partner_lat?: number | null;
  partner_lng?: number | null;
  passenger_name?: string;
  passenger_display?: string;
  my_rating?: number | null;
  offers?: BookingOffer[];
  my_offers?: BookingOffer[];
  transactions?: WalletTransaction[];
  created_at: string;
}

export interface AppNotification {
  id: string;
  category: string;
  title: string;
  body: string;
  booking_id: string | null;
  is_read: number;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  role: 'passenger' | 'partner';
  booking_id: string | null;
  category: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved';
  admin_reply: string;
  created_at: string;
  full_name?: string;
  phone?: string;
}

export interface PublicTripTracking {
  id: string;
  invoice_number: string;
  booking_mode: 'go_now' | 'schedule';
  service_type: ServiceType;
  status: BookingStatus;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  distance_km: number;
  duration_min: number;
  pickup_date: string;
  pickup_time: string;
  confirmed_at?: string | null;
  on_the_way_at?: string | null;
  arrived_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  vehicle_category_name?: string;
  vehicle_image_url?: string;
  partner_name?: string;
  partner_vehicle_name?: string;
  partner_vehicle_number?: string;
  partner_lat?: number | null;
  partner_lng?: number | null;
  partner_location_at?: string | null;
  passenger_display?: string;
}

export interface SavedContact {
  id: string;
  name: string;
  phone: string;
  relationship?: string;
  createdAt: string;
}
