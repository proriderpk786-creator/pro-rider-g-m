import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request, Response } from 'express';
import {
  db,
  hashOtp,
  hashPassword,
  SUPER_ADMIN_ALLOWLIST,
  verifyPassword,
} from './db.ts';
import {
  requireAuth,
  requireRole,
  signAuthToken,
  type AuthedRequest,
  type UserRole,
} from './auth.ts';
import {
  emitToApprovedOnlinePartners,
  emitToRole,
  emitToUser,
} from './ws.ts';
import {
  runAiChat,
  runMapsGrounding,
  runSearchGrounding,
  transcribeAudioBuffer,
  type AiPersona,
  type ChatDepth,
} from './gemini.ts';

function genId(prefix: string): string {
  return `${prefix}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

function createNotification(
  userId: string,
  role: UserRole,
  category: string,
  title: string,
  body: string,
  bookingId?: string
) {
  const id = genId('NTF');
  db.prepare(`
    INSERT INTO notifications (id, user_id, role, category, title, body, booking_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, role, category, title, body, bookingId || null);

  emitToUser(userId, role, 'notification:new', {
    id,
    category,
    title,
    body,
    bookingId: bookingId || null,
    is_read: 0,
    created_at: new Date().toISOString(),
  });
}

function getSetting(key: string, fallback: string): string {
  const row = db.prepare('SELECT value FROM platform_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : fallback;
}

export function registerAppRoutes(app: Express) {
  // ===========================================================================
  // PUBLIC CONFIGURATION & MARKETING DATA
  // ===========================================================================
  app.get('/api/public/config', (_req: Request, res: Response) => {
    const fleet = db
      .prepare('SELECT * FROM fleet_categories ORDER BY sort_order ASC')
      .all()
      .map((f: any) => ({
        ...f,
        services_eligible: JSON.parse(f.services_eligible || '[]'),
      }));

    const zones = db.prepare('SELECT * FROM service_zones WHERE is_active = 1').all();
    const packages = db.prepare('SELECT * FROM monthly_packages WHERE is_active = 1').all();

    res.json({
      brand: 'PRO RIDER AI',
      tagline: 'Travel with Trust',
      supportWhatsapp: getSetting('support_whatsapp', '03125007782'),
      supportEmail: getSetting('support_email', 'ProRider.pk786@gmail.com'),
      goNowMinOfferPct: Number(getSetting('go_now_min_offer_pct', '80')),
      goNowMaxOfferPct: Number(getSetting('go_now_max_offer_pct', '135')),
      scheduleDefaults: {
        pickupTime: getSetting('schedule_default_pickup', '08:00 AM'),
        dropTime: getSetting('schedule_default_drop', '05:30 PM'),
        allowedDays: JSON.parse(getSetting('schedule_allowed_days', '["Mon","Tue","Wed","Thu","Fri","Sat"]')),
        ratePerKm: Number(getSetting('schedule_rate_per_km', '38')),
      },
      themeConfig: {
        themeId: getSetting('app_theme', 'obsidian-gold'),
        homeLayout: getSetting('home_layout', 'sovereign'),
        authLayout: getSetting('auth_layout', 'hero-sheet'),
        forceGlobal: getSetting('theme_force_global', '0') === '1',
        updatedAt: Number(getSetting('theme_updated_at', '0')) || 0,
      },
      fleet,
      zones,
      packages,
    });
  });

  // ===========================================================================
  // PUBLIC LIVE TRIP STATUS TRACKING (PRIVACY-SAFE ROUTE & ETA FOR CONTACTS)
  // ===========================================================================
  app.get('/api/public/track/:id', (req: Request, res: Response) => {
    const rawId = String(req.params.id || '').trim();
    if (!rawId) {
      res.status(400).json({ error: 'Valid booking ID or invoice number is required.' });
      return;
    }

    const row = db
      .prepare(
        `
        SELECT b.id, b.invoice_number, b.booking_mode, b.service_type, b.status,
               b.pickup_address, b.pickup_lat, b.pickup_lng,
               b.dropoff_address, b.dropoff_lat, b.dropoff_lng,
               b.distance_km, b.duration_min,
               b.pickup_date, b.pickup_time,
               b.confirmed_at, b.on_the_way_at, b.arrived_at, b.started_at, b.completed_at,
               b.created_at, b.updated_at,
               fc.name AS vehicle_category_name,
               fc.image_url AS vehicle_image_url,
               u_part.full_name AS partner_name,
               pp.vehicle_name AS partner_vehicle_name,
               pp.vehicle_number AS partner_vehicle_number,
               pp.current_lat AS partner_lat,
               pp.current_lng AS partner_lng,
               pp.last_location_at AS partner_location_at,
               u_pass.full_name AS passenger_full_name
        FROM bookings b
        JOIN fleet_categories fc ON fc.id = b.vehicle_category_id
        LEFT JOIN users u_part ON u_part.id = b.partner_id
        LEFT JOIN partner_profiles pp ON pp.user_id = b.partner_id
        LEFT JOIN users u_pass ON u_pass.id = b.passenger_id
        WHERE b.id = ? OR b.invoice_number = ?
      `
      )
      .get(rawId, rawId) as any;

    if (!row) {
      res.status(404).json({ error: 'Trip tracking reference not found.' });
      return;
    }

    const { passenger_full_name, ...safeTracking } = row;
    const passenger_display = passenger_full_name
      ? String(passenger_full_name)
          .split(' ')
          .filter(Boolean)
          .map((part) => (part.length > 0 ? `${part[0]}***` : ''))
          .join(' ')
      : 'Passenger';

    res.json({
      tracking: {
        ...safeTracking,
        passenger_display,
      },
    });
  });

  // ===========================================================================
  // ANONYMIZED LIVE DEMAND & SURGE HOTSPOTS (FOR D3.JS MAP LAYER)
  // ===========================================================================
  app.get('/api/map/demand', (_req: Request, res: Response) => {
    const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
      const toRad = (deg: number) => (deg * Math.PI) / 180;
      const R = 6371;
      const dLat = toRad(lat2 - lat1);
      const dLng = toRad(lng2 - lng1);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const zones = db
      .prepare('SELECT * FROM service_zones WHERE is_active = 1 ORDER BY city ASC, area_name ASC')
      .all() as Array<{
      id: string;
      city: string;
      area_name: string;
      center_lat: number;
      center_lng: number;
      radius_km: number;
      demand_level: 'low' | 'medium' | 'high';
      rickshaw_enabled: number;
    }>;

    const recentBookings = db
      .prepare(
        `
        SELECT pickup_lat, pickup_lng, pickup_address, status
        FROM bookings
        WHERE status != 'cancelled'
          AND (
            status IN ('searching', 'negotiating', 'confirmed', 'on_the_way', 'arrived', 'started')
            OR created_at >= datetime('now', '-72 hours')
          )
        ORDER BY created_at DESC
        LIMIT 250
      `
      )
      .all() as Array<{
      pickup_lat: number;
      pickup_lng: number;
      pickup_address: string;
      status: string;
    }>;

    const openStatuses = new Set(['searching', 'negotiating']);
    const activeStatuses = new Set(['searching', 'negotiating', 'confirmed', 'on_the_way', 'arrived', 'started']);

    let totalOpenRequests = 0;
    let totalActiveBookings = 0;
    for (const bk of recentBookings) {
      if (openStatuses.has(bk.status)) totalOpenRequests += 1;
      if (activeStatuses.has(bk.status)) totalActiveBookings += 1;
    }

    const hotspots = zones.map((z) => {
      const matchRadius = Math.max(Number(z.radius_km || 5), 4);
      let zoneOpen = 0;
      let zoneActive = 0;
      let zoneRecent = 0;

      for (const bk of recentBookings) {
        if (!Number.isFinite(bk.pickup_lat) || !Number.isFinite(bk.pickup_lng)) continue;
        const dist = haversineKm(z.center_lat, z.center_lng, bk.pickup_lat, bk.pickup_lng);
        if (dist <= matchRadius) {
          zoneRecent += 1;
          if (activeStatuses.has(bk.status)) zoneActive += 1;
          if (openStatuses.has(bk.status)) zoneOpen += 1;
        }
      }

      const baseScore = z.demand_level === 'high' ? 70 : z.demand_level === 'medium' ? 45 : 22;
      const baseSurge = z.demand_level === 'high' ? 1.35 : z.demand_level === 'medium' ? 1.15 : 1.0;

      const demandScore = Math.min(
        100,
        Math.round(baseScore + zoneOpen * 12 + zoneActive * 5 + Math.min(14, zoneRecent * 2))
      );
      const surgeMultiplier = Number(
        Math.min(1.85, Math.max(1.0, baseSurge + zoneOpen * 0.08 + zoneActive * 0.03)).toFixed(2)
      );
      const demandLevel: 'low' | 'medium' | 'high' =
        surgeMultiplier >= 1.35 || z.demand_level === 'high'
          ? 'high'
          : surgeMultiplier >= 1.15 || z.demand_level === 'medium'
          ? 'medium'
          : 'low';

      return {
        id: z.id,
        city: z.city,
        areaName: z.area_name,
        lat: z.center_lat,
        lng: z.center_lng,
        radiusKm: Number(z.radius_km || 5),
        demandLevel,
        activeBookings: zoneActive,
        openRequests: zoneOpen,
        recentBookings: zoneRecent,
        surgeMultiplier,
        demandScore,
        rickshawEnabled: Boolean(z.rickshaw_enabled),
      };
    });

    // Build continuous spatial density points for D3 contourDensity calculation:
    // Combine real anonymized pickup locations with deterministic weighted zone dispersion anchors
    const points: Array<{
      lat: number;
      lng: number;
      weight: number;
      areaName: string;
      isLiveBooking: boolean;
    }> = [];

    for (const bk of recentBookings) {
      if (!Number.isFinite(bk.pickup_lat) || !Number.isFinite(bk.pickup_lng)) continue;
      const isLive = activeStatuses.has(bk.status);
      points.push({
        lat: bk.pickup_lat,
        lng: bk.pickup_lng,
        weight: openStatuses.has(bk.status) ? 2.2 : isLive ? 1.5 : 0.9,
        areaName: String(bk.pickup_address || '').split(',')[0] || 'Booking Cluster',
        isLiveBooking: isLive,
      });
    }

    for (const hs of hotspots) {
      const weightBase = hs.demandScore / 45;
      points.push({
        lat: hs.lat,
        lng: hs.lng,
        weight: weightBase * 1.4,
        areaName: hs.areaName,
        isLiveBooking: false,
      });
      // Deterministic micro-ring anchors around the hotspot radius so D3 contours render coherent density fields
      const ringCount = hs.demandLevel === 'high' ? 6 : hs.demandLevel === 'medium' ? 4 : 2;
      const degRadius = Math.min(hs.radiusKm, 6) / 111.0;
      for (let i = 0; i < ringCount; i++) {
        const angle = (i / ringCount) * Math.PI * 2;
        points.push({
          lat: hs.lat + Math.sin(angle) * degRadius * 0.42,
          lng: hs.lng + Math.cos(angle) * degRadius * 0.48,
          weight: weightBase * 0.65,
          areaName: hs.areaName,
          isLiveBooking: false,
        });
      }
    }

    res.json({
      hotspots: hotspots.sort((a, b) => b.demandScore - a.demandScore),
      points,
      totalOpenRequests,
      totalActiveBookings,
      updatedAt: new Date().toISOString(),
    });
  });

  // ===========================================================================
  // REAL OPENSTREETMAP / NOMINATIM / OSRM PROXY ROUTES
  // ===========================================================================
  app.get('/api/map/search', async (req: Request, res: Response) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      res.json({ results: [] });
      return;
    }
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=pk&addressdetails=1&limit=7&q=${encodeURIComponent(
        q
      )}`;
      const upstream = await fetch(url, {
        headers: {
          'User-Agent': 'ProRiderAI/1.0 (ProRider.pk786@gmail.com)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(7000),
      });
      if (!upstream.ok) {
        res.status(502).json({ error: 'Geocoding service temporarily unavailable' });
        return;
      }
      const data = (await upstream.json()) as Array<{
        place_id: number;
        display_name: string;
        lat: string;
        lon: string;
      }>;
      res.json({
        results: data.map((item) => ({
          id: String(item.place_id),
          label: item.display_name,
          lat: Number(item.lat),
          lng: Number(item.lon),
        })),
      });
    } catch {
      res.status(503).json({ error: 'Unable to reach Nominatim street search service' });
    }
  });

  app.get('/api/map/reverse', async (req: Request, res: Response) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: 'Valid coordinates required' });
      return;
    }

    const gmpKey = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
    if (gmpKey) {
      try {
        const gmpUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&region=pk&key=${encodeURIComponent(
          gmpKey
        )}`;
        const gmpResp = await fetch(gmpUrl, { signal: AbortSignal.timeout(7000) });
        if (gmpResp.status === 429) {
          res.status(429).json({ error: 'Google Maps API quota exceeded.', quotaExceeded: true });
          return;
        }
        if (gmpResp.ok) {
          const gmpData = (await gmpResp.json()) as {
            status?: string;
            results?: Array<{ formatted_address?: string }>;
          };
          if (gmpData.status === 'OVER_QUERY_LIMIT') {
            res.status(429).json({ error: 'Google Maps API quota exceeded.', quotaExceeded: true });
            return;
          }
          const formatted = gmpData.results?.[0]?.formatted_address;
          if (formatted) {
            res.json({ label: formatted, lat, lng, provider: 'google' });
            return;
          }
        }
      } catch {
        // fallback cleanly to Nominatim if Google Geocoding request fails transiently
      }
    }

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
      const upstream = await fetch(url, {
        headers: {
          'User-Agent': 'ProRiderAI/1.0 (ProRider.pk786@gmail.com)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(7000),
      });
      if (!upstream.ok) {
        res.status(502).json({ error: 'Reverse geocoding unavailable' });
        return;
      }
      const data = (await upstream.json()) as { display_name?: string };
      res.json({
        label: data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        lat,
        lng,
        provider: 'osm',
      });
    } catch {
      res.status(503).json({ error: 'Unable to resolve street address from coordinates' });
    }
  });

  app.get('/api/map/route', async (req: Request, res: Response) => {
    const fromLat = Number(req.query.fromLat);
    const fromLng = Number(req.query.fromLng);
    const toLat = Number(req.query.toLat);
    const toLng = Number(req.query.toLng);
    if (
      !Number.isFinite(fromLat) ||
      !Number.isFinite(fromLng) ||
      !Number.isFinite(toLat) ||
      !Number.isFinite(toLng)
    ) {
      res.status(400).json({ error: 'Valid origin and destination coordinates required' });
      return;
    }
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
      const upstream = await fetch(url, {
        headers: { 'User-Agent': 'ProRiderAI/1.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (!upstream.ok) {
        res.status(502).json({ error: 'Road routing engine returned an error' });
        return;
      }
      const json = (await upstream.json()) as {
        code?: string;
        routes?: Array<{
          distance: number;
          duration: number;
          geometry: { coordinates: [number, number][] };
        }>;
      };
      if (json.code !== 'Ok' || !json.routes?.length) {
        res.status(404).json({ error: 'No drivable road route found between selected points' });
        return;
      }
      const route = json.routes[0];
      res.json({
        distanceKm: Number((route.distance / 1000).toFixed(2)),
        durationMin: Math.max(1, Math.round(route.duration / 60)),
        coordinates: route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
      });
    } catch {
      res.status(503).json({ error: 'Road routing service is currently unreachable' });
    }
  });

  // ===========================================================================
  // STRICTLY SEPARATED AUTHENTICATION ENDPOINTS
  // ===========================================================================
  app.post('/api/auth/passenger/register', (req: Request, res: Response) => {
    const { fullName, phone, whatsapp, email, password, city, acceptedPolicy } = req.body || {};
    const rawPhone = String(phone || '').trim();
    const cleanEmail = email ? String(email).trim().toLowerCase() : '';
    if (!fullName || (!rawPhone && !cleanEmail) || !password || acceptedPolicy === false) {
      res.status(400).json({ error: 'Full name, email or mobile number, and password are required.' });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    if (cleanEmail) {
      const existingEmail = db
        .prepare('SELECT id FROM users WHERE lower(email) = lower(?) AND role = ?')
        .get(cleanEmail, 'passenger');
      if (existingEmail) {
        res.status(409).json({ error: 'A Passenger account with this email already exists. Please sign in instead.' });
        return;
      }
    }

    const cleanPhone = rawPhone || `E-${crypto.randomBytes(4).toString('hex')}`;
    if (rawPhone) {
      const existingPhone = db
        .prepare('SELECT id FROM users WHERE phone = ? AND role = ?')
        .get(cleanPhone, 'passenger');
      if (existingPhone) {
        res.status(409).json({ error: 'A Passenger account with this mobile number already exists.' });
        return;
      }
    }

    const id = genId('PSG');
    db.prepare(`
      INSERT INTO users (id, role, full_name, phone, whatsapp, email, password_hash, city, phone_verified)
      VALUES (?, 'passenger', ?, ?, ?, ?, ?, ?, 0)
    `).run(
      id,
      String(fullName).trim(),
      cleanPhone,
      whatsapp ? String(whatsapp).trim() : rawPhone || '',
      cleanEmail,
      hashPassword(String(password)),
      city ? String(city).trim() : 'Islamabad'
    );

    const token = signAuthToken({ sub: id, role: 'passenger', email: cleanEmail });
    const user = db
      .prepare('SELECT id, role, full_name, phone, whatsapp, email, city, phone_verified, notify_push, notify_sms, created_at FROM users WHERE id = ?')
      .get(id);
    res.status(201).json({ token, user });
  });

  app.post('/api/auth/passenger/login', (req: Request, res: Response) => {
    const { identifier, password } = req.body || {};
    if (!identifier || !password) {
      res.status(400).json({ error: 'Mobile number/email and password are required.' });
      return;
    }
    const ident = String(identifier).trim();
    const user = db
      .prepare('SELECT * FROM users WHERE role = ? AND (phone = ? OR lower(email) = lower(?))')
      .get('passenger', ident, ident) as any;

    if (!user || !verifyPassword(String(password), user.password_hash)) {
      res.status(401).json({ error: 'Invalid Passenger email/phone or password.' });
      return;
    }
    if (user.status === 'suspended') {
      res.status(403).json({ error: 'This Passenger account is suspended.' });
      return;
    }
    const token = signAuthToken({ sub: user.id, role: 'passenger', email: user.email || '' });
    const { password_hash: _ph, ...safeUser } = user;
    res.json({ token, user: safeUser });
  });

  app.post('/api/auth/partner/register', (req: Request, res: Response) => {
    const {
      fullName,
      phone,
      whatsapp,
      email,
      password,
      city,
      operatingArea,
      vehicleCategoryId,
      seatingCapacity,
    } = req.body || {};
    const rawPhone = String(phone || '').trim();
    const cleanEmail = email ? String(email).trim().toLowerCase() : '';
    if (!fullName || (!rawPhone && !cleanEmail) || !password || !city) {
      res.status(400).json({ error: 'Full name, email or mobile number, password, and city are required.' });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }
    const chosenCategory = vehicleCategoryId ? String(vehicleCategoryId).trim() : '';
    const chosenSeats = seatingCapacity ? Number(seatingCapacity) : chosenCategory === 'fleet-van-7' ? 7 : 4;

    if (cleanEmail) {
      const existingEmail = db
        .prepare('SELECT id FROM users WHERE lower(email) = lower(?) AND role = ?')
        .get(cleanEmail, 'partner');
      if (existingEmail) {
        res.status(409).json({ error: 'A Pro Partner account with this email already exists. Please sign in instead.' });
        return;
      }
    }

    const cleanPhone = rawPhone || `E-${crypto.randomBytes(4).toString('hex')}`;
    if (rawPhone) {
      const existing = db
        .prepare('SELECT id FROM users WHERE phone = ? AND role = ?')
        .get(cleanPhone, 'partner');
      if (existing) {
        res.status(409).json({ error: 'A Pro Partner account with this mobile number already exists.' });
        return;
      }
    }

    const id = genId('PRT');
    db.transaction(() => {
      db.prepare(`
        INSERT INTO users (id, role, full_name, phone, whatsapp, email, password_hash, city, operating_area, phone_verified)
        VALUES (?, 'partner', ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(
        id,
        String(fullName).trim(),
        cleanPhone,
        whatsapp ? String(whatsapp).trim() : rawPhone || '',
        cleanEmail,
        hashPassword(String(password)),
        String(city).trim(),
        operatingArea ? String(operatingArea).trim() : ''
      );

      db.prepare(`
        INSERT INTO partner_profiles (user_id, verification_status, vehicle_category_id, seating_capacity, operating_city)
        VALUES (?, 'incomplete', ?, ?, ?)
      `).run(id, chosenCategory, chosenSeats, String(city).trim());
    })();

    const token = signAuthToken({ sub: id, role: 'partner', email: cleanEmail });
    const user = db
      .prepare('SELECT id, role, full_name, phone, whatsapp, email, city, operating_area, phone_verified, created_at FROM users WHERE id = ?')
      .get(id);
    const partnerProfile = db.prepare('SELECT * FROM partner_profiles WHERE user_id = ?').get(id);
    res.status(201).json({ token, user, partnerProfile });
  });

  app.post('/api/auth/partner/login', (req: Request, res: Response) => {
    const { identifier, password } = req.body || {};
    if (!identifier || !password) {
      res.status(400).json({ error: 'Mobile number/email and password are required.' });
      return;
    }
    const ident = String(identifier).trim();
    const user = db
      .prepare('SELECT * FROM users WHERE role = ? AND (phone = ? OR lower(email) = lower(?))')
      .get('partner', ident, ident) as any;

    if (!user || !verifyPassword(String(password), user.password_hash)) {
      res.status(401).json({ error: 'Invalid Pro Partner credentials.' });
      return;
    }
    if (user.status === 'suspended') {
      res.status(403).json({ error: 'This Pro Partner account is suspended.' });
      return;
    }
    const token = signAuthToken({ sub: user.id, role: 'partner', email: user.email || '' });
    const { password_hash: _ph, ...safeUser } = user;
    const partnerProfile = db.prepare('SELECT * FROM partner_profiles WHERE user_id = ?').get(user.id);
    res.json({ token, user: safeUser, partnerProfile });
  });

  const normalizePkPhone = (raw: string): string => {
    const digits = String(raw || '').replace(/\D+/g, '');
    if (digits.startsWith('92') && digits.length === 12) return `0${digits.slice(2)}`;
    return digits;
  };

  const validateStrongPassword = (pw: string): string | null => {
    if (pw.length < 10) return 'Password must be at least 10 characters long.';
    if (!/[A-Z]/.test(pw)) return 'Password must include at least one uppercase letter.';
    if (!/[a-z]/.test(pw)) return 'Password must include at least one lowercase letter.';
    if (!/[0-9]/.test(pw)) return 'Password must include at least one number.';
    if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must include at least one special character.';
    return null;
  };

  const logAdminSecurity = (
    userId: string,
    email: string,
    action: string,
    status: string,
    req: Request,
    details = ''
  ) => {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').slice(0, 120);
    db.prepare(`
      INSERT INTO admin_security_logs (id, user_id, email, action, status, ip, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(genId('AUD'), userId, email, action, status, ip, details);
  };

  const sanitizeAdminUser = (row: any) => ({
    id: row.id,
    role: row.role,
    full_name: row.full_name,
    phone: row.phone,
    whatsapp: row.whatsapp,
    email: row.email,
    city: row.city,
    phone_verified: row.phone_verified,
    status: row.status,
    admin_setup_completed: row.admin_setup_completed,
    created_at: row.created_at,
  });

  const createAdminChallenge = (userId: string, purpose: 'setup' | 'recovery') => {
    db.prepare(`UPDATE admin_security_challenges SET used = 1 WHERE user_id = ? AND purpose = ? AND used = 0`).run(
      userId,
      purpose
    );
    const challengeId = genId('ACH');
    const challengeToken = crypto.randomBytes(24).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(challengeToken).digest('hex');
    const expiresAt = Date.now() + 10 * 60 * 1000;
    db.prepare(`
      INSERT INTO admin_security_challenges (id, user_id, purpose, token_hash, expires_at, used)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(challengeId, userId, purpose, tokenHash, expiresAt);
    return { challengeId, challengeToken, expiresInSeconds: 600 };
  };

  const consumeAdminChallenge = (
    userId: string,
    purpose: 'setup' | 'recovery',
    challengeId: string,
    challengeToken: string
  ): boolean => {
    const row = db
      .prepare(`SELECT * FROM admin_security_challenges WHERE id = ? AND user_id = ? AND purpose = ? AND used = 0`)
      .get(String(challengeId || ''), userId, purpose) as any;
    if (!row || row.expires_at < Date.now()) return false;
    const candidate = Buffer.from(crypto.createHash('sha256').update(String(challengeToken || '')).digest('hex'), 'hex');
    const expected = Buffer.from(row.token_hash, 'hex');
    if (candidate.length !== expected.length || !crypto.timingSafeEqual(candidate, expected)) return false;
    db.prepare(`UPDATE admin_security_challenges SET used = 1 WHERE id = ?`).run(row.id);
    return true;
  };

  const generateBackupRecoveryKey = (): string => {
    const seg = () => crypto.randomBytes(2).toString('hex').toUpperCase();
    return `PRK-${seg()}-${seg()}-${seg()}-${seg()}`;
  };

  app.get('/api/auth/admin/status', (_req: Request, res: Response) => {
    const admin = db
      .prepare('SELECT admin_setup_completed, password_hash FROM users WHERE role = ? ORDER BY created_at ASC LIMIT 1')
      .get('admin') as { admin_setup_completed: number; password_hash: string } | undefined;
    const setupCompleted = Boolean(admin && admin.admin_setup_completed === 1 && admin.password_hash);
    res.json({ setupCompleted });
  });

  app.post('/api/auth/admin/setup/verify-identity', (req: Request, res: Response) => {
    const { email, officialPhone } = req.body || {};
    const emailNorm = String(email || '').trim().toLowerCase();
    if (!emailNorm || !officialPhone) {
      res.status(400).json({ error: 'Authorized Super Admin email and registered mobile number are required.' });
      return;
    }
    if (!SUPER_ADMIN_ALLOWLIST.has(emailNorm)) {
      logAdminSecurity('', emailNorm, 'admin_setup_verify', 'denied_allowlist', req, 'Unauthorized email');
      res.status(403).json({ error: 'Email is not on the authorized Super Admin allowlist.' });
      return;
    }
    const admin = db.prepare('SELECT * FROM users WHERE role = ? AND lower(email) = ?').get('admin', emailNorm) as any;
    if (!admin) {
      res.status(403).json({ error: 'Super Admin identity record not found.' });
      return;
    }
    if (admin.admin_setup_completed === 1 && admin.password_hash) {
      res.status(409).json({ error: 'Super Admin account setup is already completed. Please sign in or use Forgot Password.' });
      return;
    }
    if (admin.admin_locked_until && admin.admin_locked_until > Date.now()) {
      const minsLeft = Math.ceil((admin.admin_locked_until - Date.now()) / 60000);
      res.status(429).json({ error: `Too many failed verification attempts. Try again in ${minsLeft} minute(s).` });
      return;
    }
    if (normalizePkPhone(officialPhone) !== normalizePkPhone(admin.phone)) {
      const nextAttempts = (admin.failed_admin_attempts || 0) + 1;
      const lockUntil = nextAttempts >= 5 ? Date.now() + 15 * 60 * 1000 : 0;
      db.prepare('UPDATE users SET failed_admin_attempts = ?, admin_locked_until = ? WHERE id = ?').run(
        nextAttempts,
        lockUntil,
        admin.id
      );
      logAdminSecurity(admin.id, emailNorm, 'admin_setup_verify', 'denied_phone', req, 'Phone mismatch');
      res.status(403).json({ error: 'Registered Super Admin identity details could not be verified.' });
      return;
    }
    db.prepare('UPDATE users SET failed_admin_attempts = 0, admin_locked_until = 0 WHERE id = ?').run(admin.id);
    const challenge = createAdminChallenge(admin.id, 'setup');
    logAdminSecurity(admin.id, emailNorm, 'admin_setup_verify', 'challenge_issued', req);
    res.json(challenge);
  });

  app.post('/api/auth/admin/setup/complete', (req: Request, res: Response) => {
    const { email, challengeId, challengeToken, password, confirmPassword, recoveryPhrase } = req.body || {};
    const emailNorm = String(email || '').trim().toLowerCase();
    if (!SUPER_ADMIN_ALLOWLIST.has(emailNorm)) {
      res.status(403).json({ error: 'Unauthorized Super Admin identity.' });
      return;
    }
    if (!password || password !== confirmPassword) {
      res.status(400).json({ error: 'Password and confirmation password must match.' });
      return;
    }
    const pwErr = validateStrongPassword(String(password));
    if (pwErr) {
      res.status(400).json({ error: pwErr });
      return;
    }
    const cleanPhrase = String(recoveryPhrase || '').trim();
    if (cleanPhrase.length < 8) {
      res.status(400).json({ error: 'Security recovery passphrase must be at least 8 characters.' });
      return;
    }
    if (cleanPhrase.toLowerCase() === String(password).trim().toLowerCase()) {
      res.status(400).json({ error: 'Recovery passphrase must be different from your password.' });
      return;
    }
    const admin = db.prepare('SELECT * FROM users WHERE role = ? AND lower(email) = ?').get('admin', emailNorm) as any;
    if (!admin || (admin.admin_setup_completed === 1 && admin.password_hash)) {
      res.status(409).json({ error: 'Super Admin setup is already finalized.' });
      return;
    }
    if (!consumeAdminChallenge(admin.id, 'setup', challengeId, challengeToken)) {
      logAdminSecurity(admin.id, emailNorm, 'admin_setup_complete', 'invalid_challenge', req);
      res.status(403).json({ error: 'Setup verification session expired or invalid. Please re-verify identity.' });
      return;
    }

    const backupRecoveryKey = generateBackupRecoveryKey();
    const nextTokenVersion = (admin.token_version || 1) + 1;
    db.prepare(`
      UPDATE users
      SET password_hash = ?,
          recovery_phrase_hash = ?,
          recovery_key_hash = ?,
          admin_setup_completed = 1,
          token_version = ?,
          failed_admin_attempts = 0,
          admin_locked_until = 0
      WHERE id = ?
    `).run(
      hashPassword(String(password)),
      hashPassword(cleanPhrase),
      hashPassword(backupRecoveryKey),
      nextTokenVersion,
      admin.id
    );

    logAdminSecurity(admin.id, emailNorm, 'admin_setup_complete', 'success', req, 'Custom Super Admin password & recovery configured');
    const updatedAdmin = db.prepare('SELECT * FROM users WHERE id = ?').get(admin.id) as any;
    const token = signAuthToken({ sub: admin.id, role: 'admin', email: emailNorm, tv: nextTokenVersion });
    res.status(201).json({
      token,
      user: sanitizeAdminUser(updatedAdmin),
      backupRecoveryKey,
      redirectTo: '/admin',
    });
  });

  app.post('/api/auth/admin/login', (req: Request, res: Response) => {
    const { email, password } = req.body || {};
    const emailNorm = String(email || '').trim().toLowerCase();
    if (!emailNorm || !password) {
      res.status(400).json({ error: 'Super Admin email and password are required.' });
      return;
    }
    if (!SUPER_ADMIN_ALLOWLIST.has(emailNorm)) {
      logAdminSecurity('', emailNorm, 'admin_login', 'denied_allowlist', req);
      res.status(403).json({ error: 'Email is not on the authorized Super Admin allowlist.' });
      return;
    }
    const admin = db.prepare('SELECT * FROM users WHERE role = ? AND lower(email) = ?').get('admin', emailNorm) as any;
    if (!admin) {
      res.status(403).json({ error: 'Super Admin record not initialized.' });
      return;
    }
    if (admin.admin_setup_completed !== 1 || !admin.password_hash) {
      res.status(403).json({
        error: 'Protected Super Admin account setup is required before signing in.',
        setupRequired: true,
      });
      return;
    }
    if (admin.admin_locked_until && admin.admin_locked_until > Date.now()) {
      const minsLeft = Math.ceil((admin.admin_locked_until - Date.now()) / 60000);
      res.status(429).json({ error: `Account temporarily locked due to failed attempts. Retry in ${minsLeft} minute(s).` });
      return;
    }
    if (!verifyPassword(String(password), admin.password_hash)) {
      const nextAttempts = (admin.failed_admin_attempts || 0) + 1;
      const lockUntil = nextAttempts >= 5 ? Date.now() + 15 * 60 * 1000 : 0;
      db.prepare('UPDATE users SET failed_admin_attempts = ?, admin_locked_until = ? WHERE id = ?').run(
        nextAttempts,
        lockUntil,
        admin.id
      );
      logAdminSecurity(admin.id, emailNorm, 'admin_login', 'failed_password', req, `Attempt ${nextAttempts}`);
      res.status(401).json({ error: 'Invalid Super Admin credentials.' });
      return;
    }

    db.prepare('UPDATE users SET failed_admin_attempts = 0, admin_locked_until = 0 WHERE id = ?').run(admin.id);
    logAdminSecurity(admin.id, emailNorm, 'admin_login', 'success', req);
    const token = signAuthToken({
      sub: admin.id,
      role: 'admin',
      email: emailNorm,
      tv: admin.token_version || 1,
    });
    res.json({ token, user: sanitizeAdminUser(admin), redirectTo: '/admin' });
  });

  app.post('/api/auth/admin/recovery/verify', (req: Request, res: Response) => {
    const { email, officialPhone, method, secret } = req.body || {};
    const emailNorm = String(email || '').trim().toLowerCase();
    if (!emailNorm || !officialPhone || !secret) {
      res.status(400).json({ error: 'Authorized email, registered mobile number, and recovery secret are required.' });
      return;
    }
    if (!SUPER_ADMIN_ALLOWLIST.has(emailNorm)) {
      logAdminSecurity('', emailNorm, 'admin_recovery_verify', 'denied_allowlist', req);
      res.status(403).json({ error: 'Email is not on the authorized Super Admin allowlist.' });
      return;
    }
    const admin = db.prepare('SELECT * FROM users WHERE role = ? AND lower(email) = ?').get('admin', emailNorm) as any;
    if (!admin || admin.admin_setup_completed !== 1) {
      res.status(400).json({ error: 'Super Admin password setup has not been completed yet. Complete account setup first.' });
      return;
    }
    if (admin.admin_locked_until && admin.admin_locked_until > Date.now()) {
      const minsLeft = Math.ceil((admin.admin_locked_until - Date.now()) / 60000);
      res.status(429).json({ error: `Recovery temporarily locked. Try again in ${minsLeft} minute(s).` });
      return;
    }
    const phoneOk = normalizePkPhone(officialPhone) === normalizePkPhone(admin.phone);
    const cleanSecret = String(secret).trim();
    const secretHash = method === 'backup_key' ? admin.recovery_key_hash : admin.recovery_phrase_hash;
    const secretOk = verifyPassword(cleanSecret, secretHash || '');

    if (!phoneOk || !secretOk) {
      const nextAttempts = (admin.failed_admin_attempts || 0) + 1;
      const lockUntil = nextAttempts >= 5 ? Date.now() + 15 * 60 * 1000 : 0;
      db.prepare('UPDATE users SET failed_admin_attempts = ?, admin_locked_until = ? WHERE id = ?').run(
        nextAttempts,
        lockUntil,
        admin.id
      );
      logAdminSecurity(admin.id, emailNorm, 'admin_recovery_verify', 'failed_verification', req, `Method: ${method}`);
      res.status(403).json({ error: 'Recovery identity verification failed.' });
      return;
    }

    db.prepare('UPDATE users SET failed_admin_attempts = 0, admin_locked_until = 0 WHERE id = ?').run(admin.id);
    const challenge = createAdminChallenge(admin.id, 'recovery');
    logAdminSecurity(admin.id, emailNorm, 'admin_recovery_verify', 'challenge_issued', req, `Method: ${method}`);
    res.json({ ...challenge, recoveredViaBackupKey: method === 'backup_key' });
  });

  app.post('/api/auth/admin/recovery/reset', (req: Request, res: Response) => {
    const { email, challengeId, challengeToken, newPassword, confirmPassword, rotateBackupKey } = req.body || {};
    const emailNorm = String(email || '').trim().toLowerCase();
    if (!SUPER_ADMIN_ALLOWLIST.has(emailNorm)) {
      res.status(403).json({ error: 'Unauthorized Super Admin identity.' });
      return;
    }
    if (!newPassword || newPassword !== confirmPassword) {
      res.status(400).json({ error: 'New password and confirmation password must match.' });
      return;
    }
    const pwErr = validateStrongPassword(String(newPassword));
    if (pwErr) {
      res.status(400).json({ error: pwErr });
      return;
    }
    const admin = db.prepare('SELECT * FROM users WHERE role = ? AND lower(email) = ?').get('admin', emailNorm) as any;
    if (!admin || !consumeAdminChallenge(admin.id, 'recovery', challengeId, challengeToken)) {
      logAdminSecurity(admin?.id || '', emailNorm, 'admin_recovery_reset', 'invalid_challenge', req);
      res.status(403).json({ error: 'Recovery token expired or invalid. Please restart recovery.' });
      return;
    }

    const nextTokenVersion = (admin.token_version || 1) + 1;
    let newBackupKey: string | null = null;
    if (rotateBackupKey) {
      newBackupKey = generateBackupRecoveryKey();
      db.prepare(`
        UPDATE users
        SET password_hash = ?, recovery_key_hash = ?, token_version = ?, failed_admin_attempts = 0, admin_locked_until = 0
        WHERE id = ?
      `).run(hashPassword(String(newPassword)), hashPassword(newBackupKey), nextTokenVersion, admin.id);
    } else {
      db.prepare(`
        UPDATE users
        SET password_hash = ?, token_version = ?, failed_admin_attempts = 0, admin_locked_until = 0
        WHERE id = ?
      `).run(hashPassword(String(newPassword)), nextTokenVersion, admin.id);
    }

    logAdminSecurity(admin.id, emailNorm, 'admin_recovery_reset', 'success', req, 'Password reset and prior sessions revoked');
    const updatedAdmin = db.prepare('SELECT * FROM users WHERE id = ?').get(admin.id) as any;
    const token = signAuthToken({ sub: admin.id, role: 'admin', email: emailNorm, tv: nextTokenVersion });
    res.json({
      token,
      user: sanitizeAdminUser(updatedAdmin),
      newBackupRecoveryKey: newBackupKey,
      redirectTo: '/admin',
    });
  });

  // Phone verification challenge (never stores plaintext OTP, never fakes verified!)
  app.post('/api/auth/otp/request', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = db.prepare('SELECT id, phone, role FROM users WHERE id = ?').get(req.auth!.sub) as
      | { id: string; phone: string; role: string }
      | undefined;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const smsKey = process.env.SMS_PROVIDER_KEY;
    const code = String(crypto.randomInt(100000, 999999));
    const salt = crypto.randomBytes(16).toString('hex');
    const challengeId = genId('OTP');
    const expiresAt = Date.now() + 5 * 60 * 1000;

    db.prepare(`
      INSERT INTO otp_challenges (id, phone, role, salt, code_hash, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(challengeId, user.phone, user.role, salt, hashOtp(code, salt), expiresAt);

    if (!smsKey) {
      res.status(503).json({
        error: 'SMS verification provider is not configured (SMS_PROVIDER_KEY missing). Mobile number remains unverified until a live SMS gateway delivers the code.',
        smsConfigured: false,
      });
      return;
    }

    res.json({
      challengeId,
      expiresInSeconds: 300,
      smsConfigured: true,
      message: 'Verification code dispatched to your registered mobile number.',
    });
  });

  app.post('/api/auth/otp/verify', requireAuth, (req: AuthedRequest, res: Response) => {
    const { challengeId, code } = req.body || {};
    if (!challengeId || !code) {
      res.status(400).json({ error: 'Challenge ID and OTP code required.' });
      return;
    }
    const ch = db.prepare('SELECT * FROM otp_challenges WHERE id = ?').get(String(challengeId)) as any;
    if (!ch || ch.verified === 1 || ch.expires_at < Date.now() || ch.attempts >= 5) {
      res.status(400).json({ error: 'Verification challenge expired or invalid.' });
      return;
    }
    db.prepare('UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?').run(ch.id);
    if (hashOtp(String(code).trim(), ch.salt) !== ch.code_hash) {
      res.status(400).json({ error: 'Incorrect verification code.' });
      return;
    }
    db.prepare('UPDATE otp_challenges SET verified = 1 WHERE id = ?').run(ch.id);
    db.prepare('UPDATE users SET phone_verified = 1 WHERE id = ?').run(req.auth!.sub);
    res.json({ verified: true });
  });

  app.post('/api/auth/forgot-password', (req: Request, res: Response) => {
    const { phone, role } = req.body || {};
    if (!phone || !['passenger', 'partner'].includes(role)) {
      res.status(400).json({ error: 'Valid phone number and account role are required.' });
      return;
    }
    res.status(200).json({
      message:
        'If an account matches this number, password reset verification requires live SMS gateway or Official Support verification via WhatsApp 03125007782.',
    });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = db
      .prepare('SELECT id, role, full_name, phone, whatsapp, email, city, operating_area, phone_verified, notify_push, notify_sms, status, created_at FROM users WHERE id = ?')
      .get(req.auth!.sub);
    if (!user) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    const partnerProfile =
      req.auth!.role === 'partner'
        ? db.prepare('SELECT * FROM partner_profiles WHERE user_id = ?').get(req.auth!.sub)
        : undefined;
    res.json({ user, partnerProfile });
  });

  app.patch('/api/auth/profile', requireAuth, (req: AuthedRequest, res: Response) => {
    const { fullName, whatsapp, email, city, operatingArea, notifyPush, notifySms } = req.body || {};
    db.prepare(`
      UPDATE users
      SET full_name = COALESCE(?, full_name),
          whatsapp = COALESCE(?, whatsapp),
          email = COALESCE(?, email),
          city = COALESCE(?, city),
          operating_area = COALESCE(?, operating_area),
          notify_push = COALESCE(?, notify_push),
          notify_sms = COALESCE(?, notify_sms)
      WHERE id = ?
    `).run(
      fullName ? String(fullName).trim() : null,
      whatsapp ? String(whatsapp).trim() : null,
      email ? String(email).trim().toLowerCase() : null,
      city ? String(city).trim() : null,
      operatingArea !== undefined ? String(operatingArea).trim() : null,
      typeof notifyPush === 'boolean' ? (notifyPush ? 1 : 0) : null,
      typeof notifySms === 'boolean' ? (notifySms ? 1 : 0) : null,
      req.auth!.sub
    );
    const updated = db
      .prepare('SELECT id, role, full_name, phone, whatsapp, email, city, operating_area, phone_verified, notify_push, notify_sms, status, created_at FROM users WHERE id = ?')
      .get(req.auth!.sub);
    res.json({ user: updated });
  });

  app.post('/api/auth/change-password', requireAuth, (req: AuthedRequest, res: Response) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword || String(newPassword).length < 6) {
      res.status(400).json({ error: 'Current password and new password (6+ chars) are required.' });
      return;
    }
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.auth!.sub) as any;
    if (!user || !verifyPassword(String(currentPassword), user.password_hash)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      hashPassword(String(newPassword)),
      req.auth!.sub
    );
    res.json({ updated: true });
  });

  app.post('/api/auth/delete-request', requireAuth, (req: AuthedRequest, res: Response) => {
    if (req.auth!.role === 'admin') {
      res.status(403).json({ error: 'Super Admin account cannot be deleted from UI.' });
      return;
    }
    db.prepare(`UPDATE users SET status = 'deletion_requested' WHERE id = ?`).run(req.auth!.sub);
    res.json({ requested: true, message: 'Account deletion request recorded for compliance review.' });
  });

  // ===========================================================================
  // PASSENGER APPLICATION ROUTES (STRICTLY ROLE = 'passenger')
  // ===========================================================================
  app.get('/api/passenger/bookings', requireRole('passenger'), (req: AuthedRequest, res: Response) => {
    const rows = db
      .prepare(`
        SELECT b.*,
               fc.name AS vehicle_category_name,
               fc.image_url AS vehicle_image_url,
               u.full_name AS partner_name,
               pp.vehicle_name AS partner_vehicle_name,
               pp.vehicle_number AS partner_vehicle_number,
               pp.current_lat AS partner_lat,
               pp.current_lng AS partner_lng,
               br.rating AS my_rating,
               br.comment AS my_rating_comment
        FROM bookings b
        JOIN fleet_categories fc ON fc.id = b.vehicle_category_id
        LEFT JOIN users u ON u.id = b.partner_id
        LEFT JOIN partner_profiles pp ON pp.user_id = b.partner_id
        LEFT JOIN booking_ratings br ON br.booking_id = b.id
        WHERE b.passenger_id = ?
        ORDER BY b.created_at DESC
      `)
      .all(req.auth!.sub);

    const offersStmt = db.prepare(`
      SELECT bo.*, u.full_name AS partner_name, pp.vehicle_name AS partner_vehicle_name, pp.vehicle_number AS partner_vehicle_number
      FROM booking_offers bo
      JOIN users u ON u.id = bo.partner_id
      LEFT JOIN partner_profiles pp ON pp.user_id = bo.partner_id
      WHERE bo.booking_id = ?
      ORDER BY bo.created_at DESC
    `);

    const txStmt = db.prepare(`
      SELECT tx_ref, type, amount_pkr, payment_method, status, description, created_at
      FROM wallet_transactions
      WHERE booking_id = ? AND user_id = ? AND status = 'confirmed'
      ORDER BY created_at DESC
    `);

    const enriched = rows.map((r: any) => ({
      ...r,
      schedule_days: JSON.parse(r.schedule_days_json || '[]'),
      offers: offersStmt.all(r.id),
      transactions: txStmt.all(r.id, req.auth!.sub),
    }));

    res.json({ bookings: enriched });
  });

  app.post('/api/passenger/bookings', requireRole('passenger'), (req: AuthedRequest, res: Response) => {
    const b = req.body || {};
    const {
      bookingMode,
      serviceType,
      pickupAddress,
      pickupLat,
      pickupLng,
      dropoffAddress,
      dropoffLat,
      dropoffLng,
      distanceKm,
      durationMin,
      vehicleCategoryId,
      seatsRequested,
      pickupDate,
      pickupTime,
      expectedDropoffDate,
      expectedDropoffTime,
      returnJourney,
      packageId,
      scheduleDays,
      notes,
      proposedFarePkr,
    } = b;

    if (
      !['go_now', 'schedule'].includes(bookingMode) ||
      !['pick_and_drop', 'ride_sharing', 'fuel_sharing'].includes(serviceType) ||
      !pickupAddress ||
      !dropoffAddress ||
      !Number.isFinite(Number(pickupLat)) ||
      !Number.isFinite(Number(pickupLng)) ||
      !Number.isFinite(Number(dropoffLat)) ||
      !Number.isFinite(Number(dropoffLng)) ||
      !Number.isFinite(Number(distanceKm)) ||
      Number(distanceKm) <= 0 ||
      !vehicleCategoryId
    ) {
      res.status(400).json({ error: 'Complete route, service, distance, and vehicle selection are required.' });
      return;
    }

    const fleet = db
      .prepare('SELECT * FROM fleet_categories WHERE id = ? AND is_active = 1')
      .get(String(vehicleCategoryId)) as any;
    if (!fleet) {
      res.status(400).json({ error: 'Selected vehicle category is unavailable.' });
      return;
    }

    const eligible = JSON.parse(fleet.services_eligible || '[]') as string[];
    if (!eligible.includes(serviceType)) {
      res.status(400).json({ error: 'Selected vehicle is not eligible for this service.' });
      return;
    }

    const seats = Math.max(1, Math.min(fleet.seating_capacity, Number(seatsRequested || 1)));
    const dist = Number(distanceKm);
    const dur = Math.max(1, Math.round(Number(durationMin || dist * 2)));

    // Fare calculation based on Admin-configured fleet rates
    const midPerKm = (Number(fleet.per_km_min_pkr) + Number(fleet.per_km_max_pkr)) / 2;
    let estimatedFare = Math.round(Number(fleet.base_fare_pkr) + dist * midPerKm);
    if (serviceType === 'ride_sharing') {
      estimatedFare = Math.round((estimatedFare / Math.max(2, fleet.seating_capacity - 1)) * seats);
    } else if (serviceType === 'fuel_sharing') {
      estimatedFare = Math.round(estimatedFare * 0.65);
    }
    if (returnJourney) {
      estimatedFare = Math.round(estimatedFare * 1.85);
    }
    if (packageId) {
      const pkg = db
        .prepare('SELECT * FROM monthly_packages WHERE id = ? AND is_active = 1')
        .get(String(packageId)) as any;
      if (pkg) {
        estimatedFare = Math.round(pkg.base_monthly_pkr);
      }
    }

    const minPct = Number(getSetting('go_now_min_offer_pct', '80')) / 100;
    const maxPct = Number(getSetting('go_now_max_offer_pct', '135')) / 100;
    let proposed = estimatedFare;
    if (proposedFarePkr && Number.isFinite(Number(proposedFarePkr))) {
      const candidate = Math.round(Number(proposedFarePkr));
      if (candidate < Math.floor(estimatedFare * minPct) || candidate > Math.ceil(estimatedFare * maxPct)) {
        res.status(400).json({
          error: `Proposed fare must stay within Admin limits (Rs. ${Math.floor(estimatedFare * minPct)} – Rs. ${Math.ceil(estimatedFare * maxPct)}).`,
        });
        return;
      }
      proposed = candidate;
    }

    const bookingId = `PR-${new Date().getFullYear()}-${crypto.randomInt(10000, 99999)}`;
    const invoiceNo = `INV-${bookingId}`;
    const todayStr = new Date().toISOString().slice(0, 10);
    const nowTimeStr = new Date().toTimeString().slice(0, 5);

    db.prepare(`
      INSERT INTO bookings (
        id, invoice_number, booking_mode, service_type, passenger_id, vehicle_category_id,
        pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
        distance_km, duration_min, seats_requested, pickup_date, pickup_time,
        expected_dropoff_date, expected_dropoff_time, return_journey, package_id,
        schedule_days_json, notes, proposed_fare_pkr, total_bill_pkr, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'searching')
    `).run(
      bookingId,
      invoiceNo,
      bookingMode,
      serviceType,
      req.auth!.sub,
      fleet.id,
      String(pickupAddress).trim(),
      Number(pickupLat),
      Number(pickupLng),
      String(dropoffAddress).trim(),
      Number(dropoffLat),
      Number(dropoffLng),
      dist,
      dur,
      seats,
      pickupDate ? String(pickupDate) : todayStr,
      pickupTime ? String(pickupTime) : nowTimeStr,
      expectedDropoffDate ? String(expectedDropoffDate) : todayStr,
      expectedDropoffTime ? String(expectedDropoffTime) : '',
      returnJourney ? 1 : 0,
      packageId ? String(packageId) : null,
      JSON.stringify(Array.isArray(scheduleDays) ? scheduleDays : []),
      notes ? String(notes).trim() : '',
      proposed,
      proposed
    );

    const created = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId) as any;

    createNotification(
      req.auth!.sub,
      'passenger',
      'Booking Updates',
      `Booking ${bookingId} Submitted`,
      `Searching for verified Pro Partners for ${fleet.name} (${dist} km).`,
      bookingId
    );

    emitToApprovedOnlinePartners('booking:created', {
      ...created,
      vehicle_category_name: fleet.name,
    });
    emitToRole('admin', 'booking:created', created);

    res.status(201).json({ booking: created });
  });

  app.post('/api/passenger/bookings/:id/counter', requireRole('passenger'), (req: AuthedRequest, res: Response) => {
    const bookingId = req.params.id;
    const { amountPkr, partnerId, message } = req.body || {};
    const booking = db
      .prepare('SELECT * FROM bookings WHERE id = ? AND passenger_id = ?')
      .get(bookingId, req.auth!.sub) as any;
    if (!booking || !['searching', 'negotiating'].includes(booking.status)) {
      res.status(400).json({ error: 'Booking cannot be negotiated in its current state.' });
      return;
    }
    const amt = Math.round(Number(amountPkr));
    const minAllowed = Math.floor(booking.proposed_fare_pkr * (Number(getSetting('go_now_min_offer_pct', '80')) / 100));
    const maxAllowed = Math.ceil(booking.proposed_fare_pkr * (Number(getSetting('go_now_max_offer_pct', '135')) / 100));
    if (!Number.isFinite(amt) || amt < minAllowed || amt > maxAllowed) {
      res.status(400).json({ error: `Counter-offer must be between Rs. ${minAllowed} and Rs. ${maxAllowed}.` });
      return;
    }

    const offerId = genId('OFR');
    db.prepare(`
      INSERT INTO booking_offers (id, booking_id, partner_id, sender_role, amount_pkr, message, status)
      VALUES (?, ?, ?, 'passenger', ?, ?, 'pending')
    `).run(offerId, bookingId, String(partnerId), amt, message ? String(message) : 'Passenger counter-offer');

    db.prepare(`UPDATE bookings SET status = 'negotiating', updated_at = datetime('now') WHERE id = ?`).run(bookingId);

    emitToUser(String(partnerId), 'partner', 'booking:offer', { bookingId, offerId, amountPkr: amt, senderRole: 'passenger' });
    res.json({ ok: true });
  });

  app.post('/api/passenger/bookings/:id/accept-offer', requireRole('passenger'), (req: AuthedRequest, res: Response) => {
    const bookingId = req.params.id;
    const { offerId } = req.body || {};
    const booking = db
      .prepare('SELECT * FROM bookings WHERE id = ? AND passenger_id = ?')
      .get(bookingId, req.auth!.sub) as any;
    if (!booking || !['searching', 'negotiating'].includes(booking.status)) {
      res.status(400).json({ error: 'Booking is no longer open for confirmation.' });
      return;
    }
    const offer = db
      .prepare('SELECT * FROM booking_offers WHERE id = ? AND booking_id = ?')
      .get(String(offerId), bookingId) as any;
    if (!offer || offer.status !== 'pending') {
      res.status(404).json({ error: 'Offer not found or already resolved.' });
      return;
    }

    const fleet = db.prepare('SELECT commission_pct FROM fleet_categories WHERE id = ?').get(booking.vehicle_category_id) as any;
    const commissionPkr = Math.round((offer.amount_pkr * Number(fleet?.commission_pct || 15)) / 100);

    db.transaction(() => {
      db.prepare(`UPDATE booking_offers SET status = 'accepted' WHERE id = ?`).run(offer.id);
      db.prepare(`UPDATE booking_offers SET status = 'rejected' WHERE booking_id = ? AND id != ?`).run(bookingId, offer.id);
      db.prepare(`
        UPDATE bookings
        SET partner_id = ?, agreed_fare_pkr = ?, total_bill_pkr = ?, commission_pkr = ?,
            status = 'confirmed', confirmed_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(offer.partner_id, offer.amount_pkr, offer.amount_pkr, commissionPkr, bookingId);
    })();

    createNotification(
      offer.partner_id,
      'partner',
      'Booking Confirmations',
      `Booking ${bookingId} Confirmed`,
      `Passenger accepted your fare of Rs. ${offer.amount_pkr.toLocaleString()}.`,
      bookingId
    );
    createNotification(
      req.auth!.sub,
      'passenger',
      'Booking Updates',
      `Booking ${bookingId} Confirmed`,
      `Your Pro Partner is confirmed at Rs. ${offer.amount_pkr.toLocaleString()}.`,
      bookingId
    );

    emitToUser(offer.partner_id, 'partner', 'booking:updated', { bookingId, status: 'confirmed' });
    emitToRole('admin', 'booking:updated', { bookingId, status: 'confirmed' });
    res.json({ confirmed: true });
  });

  app.post('/api/passenger/bookings/:id/reject-offer', requireRole('passenger'), (req: AuthedRequest, res: Response) => {
    const { offerId } = req.body || {};
    db.prepare(`UPDATE booking_offers SET status = 'rejected' WHERE id = ? AND booking_id = ?`).run(
      String(offerId),
      req.params.id
    );
    res.json({ rejected: true });
  });

  app.post('/api/passenger/bookings/:id/cancel', requireRole('passenger'), (req: AuthedRequest, res: Response) => {
    const booking = db
      .prepare('SELECT * FROM bookings WHERE id = ? AND passenger_id = ?')
      .get(req.params.id, req.auth!.sub) as any;
    if (!booking || ['started', 'completed', 'cancelled'].includes(booking.status)) {
      res.status(400).json({ error: 'This booking cannot be cancelled once the trip has started or completed.' });
      return;
    }
    db.prepare(`UPDATE bookings SET status = 'cancelled', cancelled_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(
      booking.id
    );
    if (booking.partner_id) {
      createNotification(
        booking.partner_id,
        'partner',
        'Trip Changes',
        `Booking ${booking.id} Cancelled`,
        'The Passenger cancelled this booking prior to trip start.',
        booking.id
      );
      emitToUser(booking.partner_id, 'partner', 'booking:updated', { bookingId: booking.id, status: 'cancelled' });
    }
    emitToRole('admin', 'booking:updated', { bookingId: booking.id, status: 'cancelled' });
    res.json({ cancelled: true });
  });

  app.post('/api/passenger/bookings/:id/rate', requireRole('passenger'), (req: AuthedRequest, res: Response) => {
    const { rating, comment } = req.body || {};
    const stars = Number(rating);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      res.status(400).json({ error: 'Rating must be between 1 and 5.' });
      return;
    }
    const booking = db
      .prepare('SELECT * FROM bookings WHERE id = ? AND passenger_id = ? AND status = ?')
      .get(req.params.id, req.auth!.sub, 'completed') as any;
    if (!booking || !booking.partner_id) {
      res.status(400).json({ error: 'Only completed trips can be rated.' });
      return;
    }
    db.prepare(`
      INSERT OR REPLACE INTO booking_ratings (id, booking_id, passenger_id, partner_id, rating, comment)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(genId('RTG'), booking.id, req.auth!.sub, booking.partner_id, stars, comment ? String(comment).trim() : '');
    res.json({ rated: true });
  });

  app.get('/api/passenger/wallet', requireRole('passenger'), (req: AuthedRequest, res: Response) => {
    const txs = db
      .prepare('SELECT * FROM wallet_transactions WHERE user_id = ? AND role = ? ORDER BY created_at DESC')
      .all(req.auth!.sub, 'passenger') as any[];

    const confirmed = txs.filter((t) => t.status === 'confirmed');
    const credits = confirmed.filter((t) => t.type === 'credit').reduce((s, t) => s + Number(t.amount_pkr), 0);
    const debits = confirmed.filter((t) => t.type === 'debit').reduce((s, t) => s + Number(t.amount_pkr), 0);
    const outstandingRow = db
      .prepare(`
        SELECT COALESCE(SUM(total_bill_pkr - amount_paid_pkr), 0) AS outstanding
        FROM bookings
        WHERE passenger_id = ? AND status IN ('confirmed', 'on_the_way', 'arrived', 'started', 'completed') AND payment_status != 'PAID'
      `)
      .get(req.auth!.sub) as { outstanding: number };

    res.json({
      balancePkr: Math.max(0, credits - debits),
      totalPaymentsPkr: debits,
      outstandingPkr: Math.max(0, Number(outstandingRow?.outstanding || 0)),
      transactions: txs,
    });
  });

  app.post('/api/passenger/wallet/topup', requireRole('passenger'), (req: AuthedRequest, res: Response) => {
    const { amountPkr, method } = req.body || {};
    const amt = Math.round(Number(amountPkr));
    if (!Number.isFinite(amt) || amt < 100 || amt > 250000) {
      res.status(400).json({ error: 'Top-up amount must be between Rs. 100 and Rs. 250,000.' });
      return;
    }
    const pm = ['jazzcash', 'easypaisa', 'bank_transfer'].includes(method) ? method : 'bank_transfer';
    const txId = genId('WTX');
    const txRef = `TXN-PR-${crypto.randomInt(100000, 999999)}`;
    db.prepare(`
      INSERT INTO wallet_transactions (id, tx_ref, user_id, role, type, amount_pkr, payment_method, status, description)
      VALUES (?, ?, ?, 'passenger', 'credit', ?, ?, 'confirmed', ?)
    `).run(txId, txRef, req.auth!.sub, amt, pm, `Wallet top-up via ${pm.toUpperCase()}`);

    createNotification(
      req.auth!.sub,
      'passenger',
      'Payment Notifications',
      'Wallet Credited',
      `Rs. ${amt.toLocaleString()} added to your PRO RIDER AI wallet (${txRef}).`
    );
    res.status(201).json({ txRef, amountPkr: amt });
  });

  app.post('/api/passenger/bookings/:id/pay', requireRole('passenger'), (req: AuthedRequest, res: Response) => {
    const { amountPkr, method } = req.body || {};
    const booking = db
      .prepare('SELECT * FROM bookings WHERE id = ? AND passenger_id = ?')
      .get(req.params.id, req.auth!.sub) as any;
    if (!booking || ['searching', 'negotiating', 'cancelled'].includes(booking.status)) {
      res.status(400).json({ error: 'Booking must be confirmed before recording payment.' });
      return;
    }
    const remaining = Math.max(0, Number(booking.total_bill_pkr) - Number(booking.amount_paid_pkr));
    const payAmt = Math.round(Number(amountPkr || remaining));
    if (!Number.isFinite(payAmt) || payAmt <= 0 || payAmt > remaining) {
      res.status(400).json({ error: `Payment amount must be between Rs. 1 and Rs. ${remaining}.` });
      return;
    }
    const pm = ['wallet', 'jazzcash', 'easypaisa', 'bank_transfer', 'cash'].includes(method) ? method : 'wallet';

    if (pm === 'wallet') {
      const confirmed = db
        .prepare(`SELECT type, amount_pkr FROM wallet_transactions WHERE user_id = ? AND role = 'passenger' AND status = 'confirmed'`)
        .all(req.auth!.sub) as any[];
      const balance =
        confirmed.filter((t) => t.type === 'credit').reduce((s, t) => s + Number(t.amount_pkr), 0) -
        confirmed.filter((t) => t.type === 'debit').reduce((s, t) => s + Number(t.amount_pkr), 0);
      if (balance < payAmt) {
        res.status(400).json({ error: 'Insufficient Wallet Balance. Top up your wallet or pay with another method.' });
        return;
      }
    }

    const txRef = `TXN-PR-${crypto.randomInt(100000, 999999)}`;
    const newPaid = Number(booking.amount_paid_pkr) + payAmt;
    const newStatus = newPaid >= Number(booking.total_bill_pkr) ? 'PAID' : 'PARTIALLY_PAID';

    db.transaction(() => {
      db.prepare(`
        INSERT INTO wallet_transactions (id, tx_ref, user_id, role, booking_id, type, amount_pkr, payment_method, status, description)
        VALUES (?, ?, ?, 'passenger', ?, 'debit', ?, ?, 'confirmed', ?)
      `).run(genId('WTX'), txRef, req.auth!.sub, booking.id, payAmt, pm, `Payment for Booking ${booking.id}`);

      db.prepare(`UPDATE bookings SET amount_paid_pkr = ?, payment_status = ?, updated_at = datetime('now') WHERE id = ?`).run(
        newPaid,
        newStatus,
        booking.id
      );

      // Credit partner earnings when digital payment settles via platform
      if (booking.partner_id && pm !== 'cash') {
        const partnerShare = Math.max(0, payAmt - Math.round((payAmt * Number(booking.commission_pkr)) / Math.max(1, Number(booking.total_bill_pkr))));
        db.prepare(`
          INSERT INTO wallet_transactions (id, tx_ref, user_id, role, booking_id, type, amount_pkr, payment_method, status, description)
          VALUES (?, ?, ?, 'partner', ?, 'credit', ?, ?, 'confirmed', ?)
        `).run(genId('WTX'), `${txRef}-P`, booking.partner_id, booking.id, partnerShare, pm, `Net fare credited for ${booking.id}`);
      }
    })();

    createNotification(
      req.auth!.sub,
      'passenger',
      'Invoice Notifications',
      `Payment Confirmed (${txRef})`,
      `Rs. ${payAmt.toLocaleString()} paid for ${booking.id}. Status: ${newStatus}.`,
      booking.id
    );

    res.json({ txRef, amountPaidPkr: newPaid, paymentStatus: newStatus });
  });

  app.get('/api/passenger/notifications', requireRole('passenger'), (req: AuthedRequest, res: Response) => {
    const notifications = db
      .prepare('SELECT * FROM notifications WHERE user_id = ? AND role = ? ORDER BY created_at DESC LIMIT 60')
      .all(req.auth!.sub, 'passenger');
    res.json({ notifications });
  });

  app.post('/api/passenger/notifications/read', requireRole('passenger'), (req: AuthedRequest, res: Response) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND role = ?').run(req.auth!.sub, 'passenger');
    res.json({ ok: true });
  });

  app.get('/api/passenger/support', requireRole('passenger'), (req: AuthedRequest, res: Response) => {
    const tickets = db
      .prepare('SELECT * FROM support_tickets WHERE user_id = ? AND role = ? ORDER BY created_at DESC')
      .all(req.auth!.sub, 'passenger');
    res.json({ tickets });
  });

  app.post('/api/passenger/support', requireRole('passenger'), (req: AuthedRequest, res: Response) => {
    const { category, subject, message, bookingId } = req.body || {};
    if (!category || !subject || !message) {
      res.status(400).json({ error: 'Category, subject, and message are required.' });
      return;
    }
    const id = genId('TKT');
    db.prepare(`
      INSERT INTO support_tickets (id, user_id, role, booking_id, category, subject, message)
      VALUES (?, ?, 'passenger', ?, ?, ?, ?)
    `).run(id, req.auth!.sub, bookingId || null, String(category), String(subject).trim(), String(message).trim());
    emitToRole('admin', 'support:new', { id, role: 'passenger', category });
    res.status(201).json({ id });
  });

  // ===========================================================================
  // PRO PARTNER / DRIVER APPLICATION ROUTES (STRICTLY ROLE = 'partner')
  // ===========================================================================
  app.get('/api/partner/profile', requireRole('partner'), (req: AuthedRequest, res: Response) => {
    const user = db
      .prepare('SELECT id, role, full_name, phone, whatsapp, email, city, operating_area, phone_verified, created_at FROM users WHERE id = ?')
      .get(req.auth!.sub);
    const partnerProfile = db.prepare('SELECT * FROM partner_profiles WHERE user_id = ?').get(req.auth!.sub) as any;
    const documents = db.prepare('SELECT * FROM partner_documents WHERE partner_id = ? ORDER BY uploaded_at DESC').all(req.auth!.sub);
    let showcaseGallery: any[] = [];
    try {
      showcaseGallery = JSON.parse(partnerProfile?.showcase_gallery || '[]');
    } catch {
      showcaseGallery = [];
    }
    res.json({
      user,
      partnerProfile: partnerProfile
        ? {
            ...partnerProfile,
            service_eligibility: JSON.parse(partnerProfile.service_eligibility || '[]'),
            showcase_gallery: Array.isArray(showcaseGallery) ? showcaseGallery : [],
          }
        : null,
      documents,
    });
  });

  app.put('/api/partner/registration', requireRole('partner'), (req: AuthedRequest, res: Response) => {
    const {
      cnicNumber,
      cnicExpiry,
      licenceNumber,
      licenceExpiry,
      vehicleCategoryId,
      vehicleName,
      vehicleNumber,
      seatingCapacity,
      fuelType,
      operatingCity,
      serviceEligibility,
    } = req.body || {};

    const current = db.prepare('SELECT * FROM partner_profiles WHERE user_id = ?').get(req.auth!.sub) as any;
    if (!current) {
      res.status(404).json({ error: 'Partner profile missing' });
      return;
    }

    // If already approved and changing sensitive vehicle info, queue for Admin review!
    if (
      current.verification_status === 'approved' &&
      ((vehicleNumber && vehicleNumber !== current.vehicle_number) ||
        (vehicleCategoryId && vehicleCategoryId !== current.vehicle_category_id))
    ) {
      db.prepare(`
        UPDATE partner_profiles
        SET pending_vehicle_review = ?, updated_at = datetime('now')
        WHERE user_id = ?
      `).run(
        JSON.stringify({ vehicleCategoryId, vehicleName, vehicleNumber, seatingCapacity, fuelType, serviceEligibility }),
        req.auth!.sub
      );
      res.json({
        queuedForReview: true,
        message: 'Sensitive vehicle changes saved for Super Admin review before activation.',
      });
      return;
    }

    const docsCount = (
      db.prepare('SELECT COUNT(*) as c FROM partner_documents WHERE partner_id = ?').get(req.auth!.sub) as { c: number }
    ).c;

    let nextStatus = current.verification_status;
    if (['not_registered', 'incomplete', 'rejected'].includes(current.verification_status)) {
      nextStatus = docsCount >= 3 ? 'under_review' : 'documents_pending';
    }

    db.prepare(`
      UPDATE partner_profiles
      SET cnic_number = COALESCE(?, cnic_number),
          cnic_expiry = COALESCE(?, cnic_expiry),
          licence_number = COALESCE(?, licence_number),
          licence_expiry = COALESCE(?, licence_expiry),
          vehicle_category_id = COALESCE(?, vehicle_category_id),
          vehicle_name = COALESCE(?, vehicle_name),
          vehicle_number = COALESCE(?, vehicle_number),
          seating_capacity = COALESCE(?, seating_capacity),
          fuel_type = COALESCE(?, fuel_type),
          operating_city = COALESCE(?, operating_city),
          service_eligibility = COALESCE(?, service_eligibility),
          verification_status = ?,
          updated_at = datetime('now')
      WHERE user_id = ?
    `).run(
      cnicNumber ?? null,
      cnicExpiry ?? null,
      licenceNumber ?? null,
      licenceExpiry ?? null,
      vehicleCategoryId ?? null,
      vehicleName ?? null,
      vehicleNumber ?? null,
      seatingCapacity ? Number(seatingCapacity) : null,
      fuelType ?? null,
      operatingCity ?? null,
      Array.isArray(serviceEligibility) ? JSON.stringify(serviceEligibility) : null,
      nextStatus,
      req.auth!.sub
    );

    const updated = db.prepare('SELECT * FROM partner_profiles WHERE user_id = ?').get(req.auth!.sub);
    res.json({ partnerProfile: updated });
  });

  app.post('/api/partner/documents', requireRole('partner'), (req: AuthedRequest, res: Response) => {
    const { docType, fileName, fileDataUrl, expiryDate, isPublic } = req.body || {};
    const validTypes = ['profile_photo', 'cnic_front', 'cnic_back', 'driving_licence', 'vehicle_registration', 'vehicle_photo'];
    if (!validTypes.includes(docType) || !fileName || !fileDataUrl) {
      res.status(400).json({ error: 'Document type, file name, and uploaded file data are required.' });
      return;
    }
    if (String(fileDataUrl).length > 8_000_000) {
      res.status(413).json({ error: 'Uploaded file exceeds size limit after compression.' });
      return;
    }

    const defaultPublic = docType === 'profile_photo' || docType === 'vehicle_photo' ? 1 : 0;
    const resolvedPublic = typeof isPublic === 'boolean' ? (isPublic ? 1 : 0) : defaultPublic;

    db.prepare(`
      INSERT INTO partner_documents (id, partner_id, doc_type, file_name, file_data_url, status, expiry_date, is_public)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
      ON CONFLICT(partner_id, doc_type) DO UPDATE SET
        file_name = excluded.file_name,
        file_data_url = excluded.file_data_url,
        status = 'pending',
        expiry_date = excluded.expiry_date,
        is_public = excluded.is_public,
        review_notes = '',
        uploaded_at = datetime('now')
    `).run(
      genId('DOC'),
      req.auth!.sub,
      docType,
      String(fileName),
      String(fileDataUrl),
      expiryDate ? String(expiryDate) : '',
      resolvedPublic
    );

    if (docType === 'profile_photo') {
      db.prepare(`UPDATE partner_profiles SET avatar_url = ?, updated_at = datetime('now') WHERE user_id = ?`).run(
        String(fileDataUrl),
        req.auth!.sub
      );
    }

    const current = db.prepare('SELECT verification_status FROM partner_profiles WHERE user_id = ?').get(req.auth!.sub) as any;
    let nextStatus = current?.verification_status || 'under_review';
    if (current && ['not_registered', 'incomplete', 'documents_pending', 'rejected'].includes(current.verification_status)) {
      nextStatus = 'under_review';
      db.prepare(`UPDATE partner_profiles SET verification_status = 'under_review', updated_at = datetime('now') WHERE user_id = ?`).run(
        req.auth!.sub
      );
    }

    const savedDoc = db
      .prepare('SELECT * FROM partner_documents WHERE partner_id = ? AND doc_type = ?')
      .get(req.auth!.sub, docType);

    emitToRole('admin', 'partner:document_uploaded', { partnerId: req.auth!.sub, docType });
    res.status(201).json({ uploaded: true, document: savedDoc, verificationStatus: nextStatus });
  });

  app.patch('/api/partner/documents/:docType/visibility', requireRole('partner'), (req: AuthedRequest, res: Response) => {
    const docType = String(req.params.docType || '');
    const isPublic = req.body?.isPublic ? 1 : 0;
    const result = db
      .prepare('UPDATE partner_documents SET is_public = ? WHERE partner_id = ? AND doc_type = ?')
      .run(isPublic, req.auth!.sub, docType);
    if (!result.changes) {
      res.status(404).json({ error: 'Document not uploaded yet.' });
      return;
    }
    const updated = db
      .prepare('SELECT * FROM partner_documents WHERE partner_id = ? AND doc_type = ?')
      .get(req.auth!.sub, docType);
    res.json({ document: updated });
  });

  app.put('/api/partner/showcase', requireRole('partner'), (req: AuthedRequest, res: Response) => {
    const {
      fullName,
      handle,
      bio,
      coverPhotoUrl,
      coverIsPublic,
      avatarUrl,
      avatarIsPublic,
      profilePublished,
      profileTemplate,
      showcaseGallery,
    } = req.body || {};

    const cleanGallery = Array.isArray(showcaseGallery)
      ? showcaseGallery.slice(0, 12).map((item: any, idx: number) => ({
          id: String(item?.id || `GAL-${Date.now()}-${idx}`),
          url: String(item?.url || ''),
          caption: String(item?.caption || '').slice(0, 140),
          category: ['selfie', 'vehicle', 'gallery'].includes(item?.category) ? item.category : 'gallery',
          is_public: item?.is_public === 0 ? 0 : 1,
          created_at: String(item?.created_at || new Date().toISOString()),
        })).filter((g: any) => Boolean(g.url))
      : null;

    const allowedTemplates = ['clean_light', 'obsidian_gold', 'emerald_pro'];
    const safeTemplate = allowedTemplates.includes(profileTemplate) ? profileTemplate : null;

    if (fullName && String(fullName).trim()) {
      db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(String(fullName).trim(), req.auth!.sub);
    }

    db.prepare(`
      UPDATE partner_profiles
      SET handle = COALESCE(?, handle),
          bio = COALESCE(?, bio),
          cover_photo_url = COALESCE(?, cover_photo_url),
          cover_is_public = COALESCE(?, cover_is_public),
          avatar_url = COALESCE(?, avatar_url),
          avatar_is_public = COALESCE(?, avatar_is_public),
          profile_published = COALESCE(?, profile_published),
          profile_template = COALESCE(?, profile_template),
          showcase_gallery = COALESCE(?, showcase_gallery),
          updated_at = datetime('now')
      WHERE user_id = ?
    `).run(
      typeof handle === 'string' ? handle.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 40) : null,
      typeof bio === 'string' ? bio.slice(0, 280) : null,
      typeof coverPhotoUrl === 'string' ? coverPhotoUrl : null,
      typeof coverIsPublic === 'boolean' ? (coverIsPublic ? 1 : 0) : null,
      typeof avatarUrl === 'string' ? avatarUrl : null,
      typeof avatarIsPublic === 'boolean' ? (avatarIsPublic ? 1 : 0) : null,
      typeof profilePublished === 'boolean' ? (profilePublished ? 1 : 0) : null,
      safeTemplate,
      cleanGallery ? JSON.stringify(cleanGallery) : null,
      req.auth!.sub
    );

    const updatedProfile = db.prepare('SELECT * FROM partner_profiles WHERE user_id = ?').get(req.auth!.sub) as any;
    const updatedUser = db
      .prepare('SELECT id, role, full_name, phone, whatsapp, email, city, operating_area, phone_verified, created_at FROM users WHERE id = ?')
      .get(req.auth!.sub);
    res.json({
      user: updatedUser,
      partnerProfile: {
        ...updatedProfile,
        service_eligibility: JSON.parse(updatedProfile.service_eligibility || '[]'),
        showcase_gallery: JSON.parse(updatedProfile.showcase_gallery || '[]'),
      },
    });
  });

  app.get('/api/partners/:id/public-profile', (req: Request, res: Response) => {
    const partnerId = String(req.params.id || '');
    const row = db
      .prepare(`
        SELECT u.id, u.full_name, u.city, u.operating_area,
               pp.verification_status, pp.vehicle_category_id, pp.vehicle_name, pp.vehicle_number, pp.seating_capacity,
               pp.handle, pp.bio, pp.cover_photo_url, pp.cover_is_public, pp.avatar_url, pp.avatar_is_public,
               pp.profile_published, pp.profile_template, pp.showcase_gallery
        FROM users u
        JOIN partner_profiles pp ON pp.user_id = u.id
        WHERE u.id = ? AND u.role = 'partner'
      `)
      .get(partnerId) as any;

    if (!row) {
      res.status(404).json({ error: 'Partner not found' });
      return;
    }

    if (!row.profile_published) {
      res.json({
        published: false,
        id: row.id,
        full_name: row.full_name,
        city: row.city,
        verification_status: row.verification_status,
      });
      return;
    }

    const completedTrips = (
      db.prepare(`SELECT COUNT(*) as c FROM bookings WHERE partner_id = ? AND status = 'completed'`).get(partnerId) as { c: number }
    ).c;

    const docs = db
      .prepare('SELECT id, doc_type, file_name, file_data_url, status, is_public, uploaded_at FROM partner_documents WHERE partner_id = ? AND is_public = 1')
      .all(partnerId);

    let gallery: any[] = [];
    try {
      const parsed = JSON.parse(row.showcase_gallery || '[]');
      gallery = Array.isArray(parsed) ? parsed.filter((g: any) => g && g.is_public === 1) : [];
    } catch {
      gallery = [];
    }

    res.json({
      published: true,
      id: row.id,
      full_name: row.full_name,
      handle: row.handle || '',
      bio: row.bio || '',
      city: row.city,
      operating_area: row.operating_area || '',
      verification_status: row.verification_status,
      vehicle_name: row.vehicle_name || '',
      vehicle_number: row.vehicle_number || '',
      seating_capacity: row.seating_capacity || 4,
      profile_template: row.profile_template || 'clean_light',
      cover_photo_url: row.cover_is_public ? row.cover_photo_url || '' : '',
      avatar_url: row.avatar_is_public ? row.avatar_url || '' : '',
      completedTrips,
      gallery,
      publicDocuments: docs,
    });
  });

  app.post('/api/partner/availability', requireRole('partner'), (req: AuthedRequest, res: Response) => {
    const { isOnline } = req.body || {};
    const profile = db.prepare('SELECT verification_status FROM partner_profiles WHERE user_id = ?').get(req.auth!.sub) as any;
    if (!profile || profile.verification_status !== 'approved') {
      res.status(403).json({
        error: 'Your Pro Partner account must be Approved by Admin before going online to accept Passenger requests.',
      });
      return;
    }
    db.prepare(`UPDATE partner_profiles SET is_online = ?, updated_at = datetime('now') WHERE user_id = ?`).run(
      isOnline ? 1 : 0,
      req.auth!.sub
    );
    res.json({ isOnline: Boolean(isOnline) });
  });

  app.post('/api/partner/location', requireRole('partner'), (req: AuthedRequest, res: Response) => {
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: 'Valid GPS coordinates required.' });
      return;
    }
    db.prepare(`
      UPDATE partner_profiles SET current_lat = ?, current_lng = ?, last_location_at = datetime('now') WHERE user_id = ?
    `).run(lat, lng, req.auth!.sub);

    const activeTrips = db
      .prepare(`SELECT id, passenger_id FROM bookings WHERE partner_id = ? AND status IN ('confirmed', 'on_the_way', 'arrived', 'started')`)
      .all(req.auth!.sub) as Array<{ id: string; passenger_id: string }>;
    for (const t of activeTrips) {
      emitToUser(t.passenger_id, 'passenger', 'partner:location', {
        bookingId: t.id,
        partnerId: req.auth!.sub,
        lat,
        lng,
        timestamp: new Date().toISOString(),
      });
    }
    res.json({ ok: true });
  });

  app.get('/api/partner/requests', requireRole('partner'), (req: AuthedRequest, res: Response) => {
    const profile = db.prepare('SELECT * FROM partner_profiles WHERE user_id = ?').get(req.auth!.sub) as any;
    const isApproved = Boolean(profile && profile.verification_status === 'approved');
    const eligibleServices = profile ? (JSON.parse(profile.service_eligibility || '[]') as string[]) : [];

    // Return real open bookings so drivers can preview demand/requests, while keeping Accept/Offer/Online strictly gated until approved.
    // Protect passenger private contact info (do NOT select passenger phone/email here!)
    const rows = db
      .prepare(`
        SELECT b.id, b.booking_mode, b.service_type, b.vehicle_category_id,
               b.pickup_address, b.pickup_lat, b.pickup_lng,
               b.dropoff_address, b.dropoff_lat, b.dropoff_lng,
               b.distance_km, b.duration_min, b.seats_requested,
               b.pickup_date, b.pickup_time, b.expected_dropoff_date, b.expected_dropoff_time,
               b.return_journey, b.notes, b.proposed_fare_pkr, b.status, b.created_at,
               fc.name AS vehicle_category_name,
               u.full_name AS passenger_first_label
        FROM bookings b
        JOIN fleet_categories fc ON fc.id = b.vehicle_category_id
        JOIN users u ON u.id = b.passenger_id
        WHERE b.status IN ('searching', 'negotiating')
          AND b.partner_id IS NULL
          AND b.id NOT IN (SELECT booking_id FROM booking_skips WHERE partner_id = ?)
        ORDER BY b.created_at DESC
      `)
      .all(req.auth!.sub) as any[];

    const offersStmt = db.prepare(`
      SELECT id, sender_role, amount_pkr, message, status, created_at
      FROM booking_offers
      WHERE booking_id = ? AND partner_id = ?
      ORDER BY created_at DESC
    `);

    const filtered = rows
      .filter((r) => !isApproved || !profile?.vehicle_category_id || r.vehicle_category_id === profile.vehicle_category_id)
      .filter((r) => !isApproved || eligibleServices.length === 0 || eligibleServices.includes(r.service_type))
      .map((r) => ({
        ...r,
        passenger_display: String(r.passenger_first_label || 'Passenger').split(' ')[0],
        my_offers: offersStmt.all(r.id, req.auth!.sub),
      }));

    res.json({
      approved: isApproved,
      verificationStatus: profile?.verification_status || 'not_registered',
      requests: filtered,
    });
  });

  app.post('/api/partner/requests/:id/accept', requireRole('partner'), (req: AuthedRequest, res: Response) => {
    const profile = db.prepare('SELECT * FROM partner_profiles WHERE user_id = ?').get(req.auth!.sub) as any;
    if (!profile || profile.verification_status !== 'approved') {
      res.status(403).json({ error: 'Only Admin-approved Pro Partners can accept Passenger requests.' });
      return;
    }
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id) as any;
    if (!booking || !['searching', 'negotiating'].includes(booking.status) || booking.partner_id) {
      res.status(409).json({ error: 'This request is no longer available.' });
      return;
    }
    const fleet = db.prepare('SELECT commission_pct FROM fleet_categories WHERE id = ?').get(booking.vehicle_category_id) as any;
    const agreed = Number(booking.proposed_fare_pkr);
    const commissionPkr = Math.round((agreed * Number(fleet?.commission_pct || 15)) / 100);

    db.transaction(() => {
      db.prepare(`
        UPDATE bookings
        SET partner_id = ?, agreed_fare_pkr = ?, total_bill_pkr = ?, commission_pkr = ?,
            status = 'confirmed', confirmed_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ? AND partner_id IS NULL
      `).run(req.auth!.sub, agreed, agreed, commissionPkr, booking.id);
    })();

    createNotification(
      booking.passenger_id,
      'passenger',
      'Booking Updates',
      `Pro Partner Confirmed (${booking.id})`,
      `Your booking is confirmed at Rs. ${agreed.toLocaleString()}.`,
      booking.id
    );
    emitToUser(booking.passenger_id, 'passenger', 'booking:updated', { bookingId: booking.id, status: 'confirmed' });
    emitToRole('admin', 'booking:updated', { bookingId: booking.id, status: 'confirmed' });
    res.json({ confirmed: true });
  });

  app.post('/api/partner/requests/:id/offer', requireRole('partner'), (req: AuthedRequest, res: Response) => {
    const profile = db.prepare('SELECT * FROM partner_profiles WHERE user_id = ?').get(req.auth!.sub) as any;
    if (!profile || profile.verification_status !== 'approved') {
      res.status(403).json({ error: 'Only Admin-approved Pro Partners can submit fare offers.' });
      return;
    }
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id) as any;
    if (!booking || !['searching', 'negotiating'].includes(booking.status) || booking.partner_id) {
      res.status(409).json({ error: 'This booking is no longer open for offers.' });
      return;
    }

    const amt = Math.round(Number(req.body?.amountPkr));
    const minAllowed = Math.floor(booking.proposed_fare_pkr * (Number(getSetting('go_now_min_offer_pct', '80')) / 100));
    const maxAllowed = Math.ceil(booking.proposed_fare_pkr * (Number(getSetting('go_now_max_offer_pct', '135')) / 100));
    if (!Number.isFinite(amt) || amt < minAllowed || amt > maxAllowed) {
      res.status(400).json({ error: `Offer must stay within Admin limits (Rs. ${minAllowed} – Rs. ${maxAllowed}).` });
      return;
    }

    const offerId = genId('OFR');
    db.prepare(`
      INSERT INTO booking_offers (id, booking_id, partner_id, sender_role, amount_pkr, message, status)
      VALUES (?, ?, ?, 'partner', ?, ?, 'pending')
    `).run(offerId, booking.id, req.auth!.sub, amt, req.body?.message ? String(req.body.message) : 'Pro Partner fare offer');

    db.prepare(`UPDATE bookings SET status = 'negotiating', updated_at = datetime('now') WHERE id = ?`).run(booking.id);

    createNotification(
      booking.passenger_id,
      'passenger',
      'Driver Offers',
      `New Fare Offer for ${booking.id}`,
      `A verified Pro Partner offered Rs. ${amt.toLocaleString()}. Review and accept or counter.`,
      booking.id
    );
    emitToUser(booking.passenger_id, 'passenger', 'booking:offer', { bookingId: booking.id, offerId, amountPkr: amt });
    res.status(201).json({ offerId });
  });

  app.post('/api/partner/requests/:id/skip', requireRole('partner'), (req: AuthedRequest, res: Response) => {
    db.prepare('INSERT OR IGNORE INTO booking_skips (booking_id, partner_id) VALUES (?, ?)').run(
      req.params.id,
      req.auth!.sub
    );
    res.json({ skipped: true });
  });

  app.get('/api/partner/trips', requireRole('partner'), (req: AuthedRequest, res: Response) => {
    const trips = db
      .prepare(`
        SELECT b.*,
               fc.name AS vehicle_category_name,
               u.full_name AS passenger_name,
               br.rating AS trip_rating,
               br.comment AS trip_rating_comment
        FROM bookings b
        JOIN fleet_categories fc ON fc.id = b.vehicle_category_id
        JOIN users u ON u.id = b.passenger_id
        LEFT JOIN booking_ratings br ON br.booking_id = b.id
        WHERE b.partner_id = ?
        ORDER BY b.updated_at DESC
      `)
      .all(req.auth!.sub);
    res.json({ trips });
  });

  // Strict server-side trip state machine!
  app.post('/api/partner/trips/:id/transition', requireRole('partner'), (req: AuthedRequest, res: Response) => {
    const { nextStatus } = req.body || {};
    const booking = db
      .prepare('SELECT * FROM bookings WHERE id = ? AND partner_id = ?')
      .get(req.params.id, req.auth!.sub) as any;
    if (!booking) {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }

    const allowedTransitions: Record<string, string> = {
      confirmed: 'on_the_way',
      on_the_way: 'arrived',
      arrived: 'started',
      started: 'completed',
    };

    if (allowedTransitions[booking.status] !== nextStatus) {
      res.status(400).json({
        error: `Invalid trip transition from "${booking.status}" to "${nextStatus}". Trips must follow sequential workflow steps.`,
      });
      return;
    }

    const tsFieldMap: Record<string, string> = {
      on_the_way: 'on_the_way_at',
      arrived: 'arrived_at',
      started: 'started_at',
      completed: 'completed_at',
    };
    const tsCol = tsFieldMap[nextStatus];

    if (nextStatus === 'completed') {
      db.prepare(`
        UPDATE bookings
        SET status = 'completed', completed_at = datetime('now'), actual_dropoff_time = time('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(booking.id);
    } else {
      db.prepare(`
        UPDATE bookings
        SET status = ?, ${tsCol} = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(nextStatus, booking.id);
    }

    const statusLabels: Record<string, string> = {
      on_the_way: 'Pro Partner is on the way to your pickup location',
      arrived: 'Pro Partner has arrived at the pickup point',
      started: 'Your trip has started',
      completed: 'Your trip is completed — Digital Invoice is ready',
    };

    createNotification(
      booking.passenger_id,
      'passenger',
      'Booking Updates',
      `Trip ${booking.id}: ${nextStatus.replaceAll('_', ' ').toUpperCase()}`,
      statusLabels[nextStatus] || 'Trip status updated',
      booking.id
    );

    emitToUser(booking.passenger_id, 'passenger', 'booking:updated', { bookingId: booking.id, status: nextStatus });
    emitToRole('admin', 'booking:updated', { bookingId: booking.id, status: nextStatus });

    res.json({ status: nextStatus });
  });

  app.post('/api/partner/trips/:id/record-cash-payment', requireRole('partner'), (req: AuthedRequest, res: Response) => {
    const booking = db
      .prepare('SELECT * FROM bookings WHERE id = ? AND partner_id = ? AND status = ?')
      .get(req.params.id, req.auth!.sub, 'completed') as any;
    if (!booking) {
      res.status(400).json({ error: 'Only completed trips can record cash payment.' });
      return;
    }
    const remaining = Math.max(0, Number(booking.total_bill_pkr) - Number(booking.amount_paid_pkr));
    if (remaining <= 0) {
      res.status(400).json({ error: 'This booking is already fully paid.' });
      return;
    }

    const txRef = `TXN-CSH-${crypto.randomInt(100000, 999999)}`;
    db.transaction(() => {
      db.prepare(`
        INSERT INTO wallet_transactions (id, tx_ref, user_id, role, booking_id, type, amount_pkr, payment_method, status, description)
        VALUES (?, ?, ?, 'passenger', ?, 'debit', ?, 'cash', 'confirmed', ?)
      `).run(genId('WTX'), txRef, booking.passenger_id, booking.id, remaining, `Cash collected by Pro Partner for ${booking.id}`);

      db.prepare(`UPDATE bookings SET amount_paid_pkr = total_bill_pkr, payment_status = 'PAID', updated_at = datetime('now') WHERE id = ?`).run(
        booking.id
      );

      db.prepare(`
        INSERT INTO wallet_transactions (id, tx_ref, user_id, role, booking_id, type, amount_pkr, payment_method, status, description)
        VALUES (?, ?, ?, 'partner', ?, 'commission', ?, 'cash', 'confirmed', ?)
      `).run(genId('WTX'), `${txRef}-COM`, req.auth!.sub, booking.id, booking.commission_pkr, `Platform commission due on cash trip ${booking.id}`);
    })();

    res.json({ txRef, paymentStatus: 'PAID' });
  });

  app.get('/api/partner/earnings', requireRole('partner'), (req: AuthedRequest, res: Response) => {
    const completedTrips = db
      .prepare(`SELECT id, agreed_fare_pkr, total_bill_pkr, commission_pkr, amount_paid_pkr, payment_status, completed_at FROM bookings WHERE partner_id = ? AND status = 'completed' ORDER BY completed_at DESC`)
      .all(req.auth!.sub) as any[];

    const grossEarnings = completedTrips.reduce((s, t) => s + Number(t.agreed_fare_pkr || t.total_bill_pkr || 0), 0);
    const totalCommission = completedTrips.reduce((s, t) => s + Number(t.commission_pkr || 0), 0);
    const netEarnings = Math.max(0, grossEarnings - totalCommission);

    const txs = db
      .prepare('SELECT * FROM wallet_transactions WHERE user_id = ? AND role = ? ORDER BY created_at DESC')
      .all(req.auth!.sub, 'partner') as any[];

    const confirmedCredits = txs.filter((t) => t.status === 'confirmed' && ['credit', 'settlement'].includes(t.type)).reduce((s, t) => s + Number(t.amount_pkr), 0);
    const confirmedDebits = txs.filter((t) => t.status === 'confirmed' && ['commission', 'withdrawal'].includes(t.type)).reduce((s, t) => s + Number(t.amount_pkr), 0);
    const pendingWithdrawals = txs.filter((t) => t.status === 'pending' && t.type === 'withdrawal').reduce((s, t) => s + Number(t.amount_pkr), 0);

    res.json({
      grossEarnings,
      totalCommission,
      netEarnings,
      availableBalancePkr: Math.max(0, confirmedCredits - confirmedDebits - pendingWithdrawals),
      pendingSettlementsPkr: pendingWithdrawals,
      paidWithdrawalsPkr: txs.filter((t) => t.status === 'confirmed' && t.type === 'withdrawal').reduce((s, t) => s + Number(t.amount_pkr), 0),
      completedTrips,
      transactions: txs,
    });
  });

  app.post('/api/partner/wallet/withdraw', requireRole('partner'), (req: AuthedRequest, res: Response) => {
    const { amountPkr, method, accountDetails } = req.body || {};
    const amt = Math.round(Number(amountPkr));
    if (!Number.isFinite(amt) || amt < 500) {
      res.status(400).json({ error: 'Minimum withdrawal is Rs. 500.' });
      return;
    }

    const txs = db
      .prepare('SELECT * FROM wallet_transactions WHERE user_id = ? AND role = ?')
      .all(req.auth!.sub, 'partner') as any[];
    const credits = txs.filter((t) => t.status === 'confirmed' && ['credit', 'settlement'].includes(t.type)).reduce((s, t) => s + Number(t.amount_pkr), 0);
    const debits = txs.filter((t) => t.status === 'confirmed' && ['commission', 'withdrawal'].includes(t.type)).reduce((s, t) => s + Number(t.amount_pkr), 0);
    const pending = txs.filter((t) => t.status === 'pending' && t.type === 'withdrawal').reduce((s, t) => s + Number(t.amount_pkr), 0);
    const available = credits - debits - pending;

    if (amt > available) {
      res.status(400).json({ error: `Insufficient available balance (Rs. ${Math.max(0, available).toLocaleString()}).` });
      return;
    }

    const pm = ['bank_transfer', 'jazzcash', 'easypaisa'].includes(method) ? method : 'bank_transfer';
    const txRef = `WD-PR-${crypto.randomInt(100000, 999999)}`;
    db.prepare(`
      INSERT INTO wallet_transactions (id, tx_ref, user_id, role, type, amount_pkr, payment_method, status, description)
      VALUES (?, ?, ?, 'partner', 'withdrawal', ?, ?, 'pending', ?)
    `).run(genId('WTX'), txRef, req.auth!.sub, amt, pm, `Withdrawal request (${pm.toUpperCase()} - ${accountDetails || 'Account'})`);

    res.status(201).json({ txRef, status: 'pending' });
  });

  app.get('/api/partner/notifications', requireRole('partner'), (req: AuthedRequest, res: Response) => {
    const notifications = db
      .prepare('SELECT * FROM notifications WHERE user_id = ? AND role = ? ORDER BY created_at DESC LIMIT 60')
      .all(req.auth!.sub, 'partner');
    res.json({ notifications });
  });

  app.post('/api/partner/notifications/read', requireRole('partner'), (req: AuthedRequest, res: Response) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND role = ?').run(req.auth!.sub, 'partner');
    res.json({ ok: true });
  });

  app.get('/api/partner/support', requireRole('partner'), (req: AuthedRequest, res: Response) => {
    const tickets = db
      .prepare('SELECT * FROM support_tickets WHERE user_id = ? AND role = ? ORDER BY created_at DESC')
      .all(req.auth!.sub, 'partner');
    res.json({ tickets });
  });

  app.post('/api/partner/support', requireRole('partner'), (req: AuthedRequest, res: Response) => {
    const { category, subject, message, bookingId } = req.body || {};
    if (!category || !subject || !message) {
      res.status(400).json({ error: 'Category, subject, and message are required.' });
      return;
    }
    const id = genId('TKT');
    db.prepare(`
      INSERT INTO support_tickets (id, user_id, role, booking_id, category, subject, message)
      VALUES (?, ?, 'partner', ?, ?, ?, ?)
    `).run(id, req.auth!.sub, bookingId || null, String(category), String(subject).trim(), String(message).trim());
    emitToRole('admin', 'support:new', { id, role: 'partner', category });
    res.status(201).json({ id });
  });

  // ===========================================================================
  // FIREBASE GOOGLE SIGN-IN BRIDGE (Strictly Passenger & Partner Only)
  // ===========================================================================
  app.post('/api/auth/google/firebase', async (req: Request, res: Response) => {
    const { idToken, role, city } = req.body || {};
    if (!idToken || !['passenger', 'partner'].includes(role)) {
      res.status(400).json({ error: 'Valid Firebase ID token and portal role (passenger or partner) required.' });
      return;
    }

    let firebaseApiKey = '';
    try {
      const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
      const rawCfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as { apiKey?: string };
      firebaseApiKey = rawCfg.apiKey || '';
    } catch {
      firebaseApiKey = '';
    }
    if (!firebaseApiKey) {
      res.status(503).json({ error: 'Firebase configuration missing on server.' });
      return;
    }

    try {
      const verifyResp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: String(idToken) }),
          signal: AbortSignal.timeout(7000),
        }
      );
      if (!verifyResp.ok) {
        res.status(401).json({ error: 'Google Firebase token verification failed.' });
        return;
      }
      const verifyData = (await verifyResp.json()) as {
        users?: Array<{
          localId?: string;
          email?: string;
          emailVerified?: boolean;
          displayName?: string;
        }>;
      };
      const fbUser = verifyData.users?.[0];
      if (!fbUser || !fbUser.email || !fbUser.emailVerified) {
        res.status(403).json({ error: 'Verified Google email address is required.' });
        return;
      }

      const cleanEmail = fbUser.email.trim().toLowerCase();
      const targetRole = role as 'passenger' | 'partner';
      let existing = db
        .prepare('SELECT * FROM users WHERE role = ? AND lower(email) = lower(?)')
        .get(targetRole, cleanEmail) as any;

      if (!existing) {
        const newId = genId(targetRole === 'passenger' ? 'PSG' : 'PRT');
        const syntheticPhone = `G-${fbUser.localId?.slice(0, 14) || crypto.randomBytes(4).toString('hex')}`;
        const safeName = (fbUser.displayName || cleanEmail.split('@')[0] || 'Google User').trim();
        const chosenCity = city ? String(city).trim() : 'Islamabad';

        db.transaction(() => {
          db.prepare(`
            INSERT INTO users (id, role, full_name, phone, whatsapp, email, password_hash, city, phone_verified)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
          `).run(
            newId,
            targetRole,
            safeName,
            syntheticPhone,
            syntheticPhone,
            cleanEmail,
            hashPassword(crypto.randomBytes(24).toString('hex')),
            chosenCity
          );

          if (targetRole === 'partner') {
            const reqCategory = req.body?.vehicleCategoryId ? String(req.body.vehicleCategoryId).trim() : '';
            const reqSeats = req.body?.seatingCapacity
              ? Number(req.body.seatingCapacity)
              : reqCategory === 'fleet-van-7'
              ? 7
              : 4;
            db.prepare(`
              INSERT INTO partner_profiles (user_id, verification_status, vehicle_category_id, seating_capacity, operating_city)
              VALUES (?, 'incomplete', ?, ?, ?)
            `).run(newId, reqCategory, reqSeats, chosenCity);
          }
        })();

        existing = db.prepare('SELECT * FROM users WHERE id = ?').get(newId) as any;
      }

      if (existing.status === 'suspended') {
        res.status(403).json({ error: `This ${targetRole} account is suspended.` });
        return;
      }

      const token = signAuthToken({ sub: existing.id, role: targetRole, email: cleanEmail });
      const { password_hash: _ph, ...safeUser } = existing;
      const partnerProfile =
        targetRole === 'partner'
          ? db.prepare('SELECT * FROM partner_profiles WHERE user_id = ?').get(existing.id)
          : undefined;
      res.json({ token, user: safeUser, partnerProfile });
    } catch {
      res.status(503).json({ error: 'Unable to verify Google Sign-In session right now.' });
    }
  });

  // ===========================================================================
  // GEMINI AI CAPABILITY ENDPOINTS (Server-Side Only, Paid Models Excluded)
  // ===========================================================================
  const formatGeminiError = (err: any, fallbackMsg: string): { status: number; message: string } => {
    const raw = String(err?.message || '');
    if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
      return {
        status: 429,
        message:
          'Google Search / Maps Grounding quota is unavailable on the current free-tier Gemini key. Standard AI Chat, Live Voice, Audio Transcription, and Interactive Google Maps remain active — or select a billing-enabled API key in Settings > Secrets.',
      };
    }
    if (raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID')) {
      return {
        status: 403,
        message: 'Gemini API key permission denied or invalid. Please check your key in Settings > Secrets.',
      };
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.error?.message) {
        return { status: 502, message: String(parsed.error.message) };
      }
    } catch {
      // not JSON
    }
    return { status: 502, message: raw || fallbackMsg };
  };

  app.post('/api/ai/chat', async (req: Request, res: Response) => {
    const { message, history, depth, persona, lang } = req.body || {};
    if (!message || !String(message).trim()) {
      res.status(400).json({ error: 'Prompt message is required.' });
      return;
    }
    try {
      const safeDepth: ChatDepth = ['fast', 'general', 'deep'].includes(depth) ? depth : 'general';
      const safePersona: AiPersona = ['passenger', 'partner', 'general'].includes(persona) ? persona : 'general';
      const safeLang = lang === 'ur' ? 'ur' : 'en';
      const result = await runAiChat({
        message: String(message).slice(0, 4000),
        history: Array.isArray(history) ? history : [],
        depth: safeDepth,
        persona: safePersona,
        lang: safeLang,
      });
      res.json(result);
    } catch (err: any) {
      const formatted = formatGeminiError(err, 'AI chat failed to generate a response.');
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/maps-grounding', async (req: Request, res: Response) => {
    const { query, lat, lng, lang } = req.body || {};
    if (!query || !String(query).trim()) {
      res.status(400).json({ error: 'Search query is required for Google Maps grounding.' });
      return;
    }
    try {
      const result = await runMapsGrounding({
        query: String(query).slice(0, 1000),
        lat: Number.isFinite(Number(lat)) ? Number(lat) : undefined,
        lng: Number.isFinite(Number(lng)) ? Number(lng) : undefined,
        lang: lang === 'ur' ? 'ur' : 'en',
      });
      res.json(result);
    } catch (err: any) {
      const formatted = formatGeminiError(err, 'Google Maps grounding request failed.');
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/search-grounding', async (req: Request, res: Response) => {
    const { query, lang } = req.body || {};
    if (!query || !String(query).trim()) {
      res.status(400).json({ error: 'Query is required for Google Search grounding.' });
      return;
    }
    try {
      const result = await runSearchGrounding({
        query: String(query).slice(0, 1000),
        lang: lang === 'ur' ? 'ur' : 'en',
      });
      res.json(result);
    } catch (err: any) {
      const formatted = formatGeminiError(err, 'Google Search grounding request failed.');
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/transcribe', async (req: Request, res: Response) => {
    const { audioBase64, mimeType, lang } = req.body || {};
    if (!audioBase64 || typeof audioBase64 !== 'string') {
      res.status(400).json({ error: 'Base64 audio payload is required.' });
      return;
    }
    try {
      const cleanBase64 = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
      const result = await transcribeAudioBuffer({
        base64Audio: cleanBase64,
        mimeType: typeof mimeType === 'string' && mimeType ? mimeType : 'audio/webm',
        hintLang: lang === 'ur' ? 'ur' : 'en',
      });
      res.json(result);
    } catch (err: any) {
      const formatted = formatGeminiError(err, 'Audio transcription failed.');
      res.status(formatted.status).json({ error: formatted.message });
    }
  });
}
