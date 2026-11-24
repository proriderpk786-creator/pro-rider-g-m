import crypto from 'node:crypto';
import type { Express, Response } from 'express';
import { db } from './db.ts';
import { requireRole, type AuthedRequest } from './auth.ts';
import { emitToAll, emitToUser } from './ws.ts';

function genId(prefix: string): string {
  return `${prefix}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

export function registerAdminRoutes(app: Express) {
  app.get('/api/admin/overview', requireRole('admin'), (_req: AuthedRequest, res: Response) => {
    const totalPassengers = (db.prepare(`SELECT COUNT(*) as c FROM users WHERE role = 'passenger'`).get() as any).c;
    const totalPartners = (db.prepare(`SELECT COUNT(*) as c FROM users WHERE role = 'partner'`).get() as any).c;
    const pendingPartners = (
      db.prepare(`SELECT COUNT(*) as c FROM partner_profiles WHERE verification_status IN ('documents_pending', 'under_review')`).get() as any
    ).c;
    const activeBookings = (
      db.prepare(`SELECT COUNT(*) as c FROM bookings WHERE status IN ('searching', 'negotiating', 'confirmed', 'on_the_way', 'arrived', 'started')`).get() as any
    ).c;
    const completedBookings = (db.prepare(`SELECT COUNT(*) as c FROM bookings WHERE status = 'completed'`).get() as any).c;
    const pendingMonthlyAppsCount = (
      db.prepare(`
        SELECT COUNT(*) as c
        FROM booking_applications ba
        JOIN bookings b ON b.id = ba.booking_id
        WHERE ba.status = 'pending' AND b.partner_id IS NULL AND b.status IN ('searching', 'negotiating')
      `).get() as any
    ).c;
    const revenueRow = db
      .prepare(`SELECT COALESCE(SUM(total_bill_pkr), 0) AS gmv, COALESCE(SUM(commission_pkr), 0) AS commission FROM bookings WHERE status = 'completed'`)
      .get() as { gmv: number; commission: number };

    const onlinePartners = db
      .prepare(`
        SELECT u.id, u.full_name, u.city, pp.vehicle_name, pp.vehicle_number, pp.current_lat, pp.current_lng, pp.last_location_at
        FROM partner_profiles pp
        JOIN users u ON u.id = pp.user_id
        WHERE pp.verification_status = 'approved' AND pp.is_online = 1
      `)
      .all();

    const mapBookings = db
      .prepare(`
        SELECT id, service_type, status, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng, total_bill_pkr
        FROM bookings
        WHERE status NOT IN ('cancelled')
        ORDER BY created_at DESC LIMIT 40
      `)
      .all();

    res.json({
      kpis: {
        totalPassengers,
        totalPartners,
        pendingPartners,
        activeBookings,
        completedBookings,
        pendingMonthlyAppsCount,
        gmvPkr: revenueRow.gmv,
        commissionPkr: revenueRow.commission,
      },
      onlinePartners,
      mapBookings,
    });
  });

  app.get('/api/admin/partners', requireRole('admin'), (_req: AuthedRequest, res: Response) => {
    const partners = db
      .prepare(`
        SELECT u.id, u.full_name, u.phone, u.whatsapp, u.email, u.city, u.operating_area, u.phone_verified, u.status AS user_status, u.created_at,
               pp.*,
               MAX(0, (
                 (SELECT COALESCE(SUM(amount_pkr), 0) FROM wallet_transactions WHERE user_id = u.id AND role = 'partner' AND status = 'confirmed' AND type IN ('credit', 'settlement')) -
                 (SELECT COALESCE(SUM(amount_pkr), 0) FROM wallet_transactions WHERE user_id = u.id AND role = 'partner' AND status = 'confirmed' AND type IN ('commission', 'withdrawal')) -
                 (SELECT COALESCE(SUM(amount_pkr), 0) FROM wallet_transactions WHERE user_id = u.id AND role = 'partner' AND status = 'pending' AND type = 'withdrawal')
               )) AS wallet_balance_pkr
        FROM users u
        LEFT JOIN partner_profiles pp ON pp.user_id = u.id
        WHERE u.role = 'partner'
        ORDER BY COALESCE(pp.updated_at, u.created_at) DESC
      `)
      .all() as any[];

    const docsStmt = db.prepare('SELECT * FROM partner_documents WHERE partner_id = ?');
    const result = partners.map((p) => ({
      ...p,
      service_eligibility: JSON.parse(p.service_eligibility || '[]'),
      pending_vehicle_review: p.pending_vehicle_review ? JSON.parse(p.pending_vehicle_review) : null,
      documents: docsStmt.all(p.id),
    }));

    res.json({ partners: result });
  });

  app.post('/api/admin/partners/:id/review', requireRole('admin'), (req: AuthedRequest, res: Response) => {
    const partnerId = req.params.id;
    const { verificationStatus, adminNotes, approvePendingVehicle, documentReviews } = req.body || {};
    const allowed = ['not_registered', 'incomplete', 'documents_pending', 'under_review', 'approved', 'rejected', 'suspended'];
    if (!allowed.includes(verificationStatus)) {
      res.status(400).json({ error: 'Invalid verification status' });
      return;
    }

    const current = db.prepare('SELECT * FROM partner_profiles WHERE user_id = ?').get(partnerId) as any;
    if (!current) {
      res.status(404).json({ error: 'Pro Partner not found' });
      return;
    }

    db.transaction(() => {
      if (approvePendingVehicle && current.pending_vehicle_review) {
        const pv = JSON.parse(current.pending_vehicle_review);
        db.prepare(`
          UPDATE partner_profiles
          SET vehicle_category_id = COALESCE(?, vehicle_category_id),
              vehicle_name = COALESCE(?, vehicle_name),
              vehicle_number = COALESCE(?, vehicle_number),
              seating_capacity = COALESCE(?, seating_capacity),
              fuel_type = COALESCE(?, fuel_type),
              service_eligibility = COALESCE(?, service_eligibility),
              pending_vehicle_review = ''
          WHERE user_id = ?
        `).run(
          pv.vehicleCategoryId ?? null,
          pv.vehicleName ?? null,
          pv.vehicleNumber ?? null,
          pv.seatingCapacity ? Number(pv.seatingCapacity) : null,
          pv.fuelType ?? null,
          Array.isArray(pv.serviceEligibility) ? JSON.stringify(pv.serviceEligibility) : null,
          partnerId
        );
      }

      db.prepare(`
        UPDATE partner_profiles
        SET verification_status = ?,
            admin_notes = COALESCE(?, admin_notes),
            is_online = CASE WHEN ? != 'approved' THEN 0 ELSE is_online END,
            updated_at = datetime('now')
        WHERE user_id = ?
      `).run(verificationStatus, adminNotes ?? null, verificationStatus, partnerId);

      if (Array.isArray(documentReviews)) {
        for (const dr of documentReviews) {
          if (dr.docId && ['pending', 'approved', 'rejected'].includes(dr.status)) {
            db.prepare('UPDATE partner_documents SET status = ?, review_notes = ? WHERE id = ? AND partner_id = ?').run(
              dr.status,
              dr.notes || '',
              dr.docId,
              partnerId
            );
          }
        }
      }
    })();

    db.prepare(`
      INSERT INTO notifications (id, user_id, role, category, title, body)
      VALUES (?, ?, 'partner', 'Document Review', ?, ?)
    `).run(
      genId('NTF'),
      partnerId,
      `Account Status: ${verificationStatus.replaceAll('_', ' ').toUpperCase()}`,
      adminNotes || `Admin updated your Pro Partner verification status to ${verificationStatus}.`
    );

    emitToUser(partnerId, 'partner', 'partner:verification_updated', { verificationStatus, adminNotes });
    res.json({ updated: true });
  });

  app.post('/api/admin/partners/:id/wallet', requireRole('admin'), (req: AuthedRequest, res: Response) => {
    const partnerId = req.params.id;
    const { amountPkr, type, note } = req.body || {};
    const amt = Math.round(Number(amountPkr));
    const txType = type === 'debit' ? 'commission' : 'credit';
    if (!Number.isFinite(amt) || amt <= 0 || amt > 500000) {
      res.status(400).json({ error: 'Amount must be between Rs. 1 and Rs. 500,000.' });
      return;
    }
    const partner = db.prepare(`SELECT id, full_name FROM users WHERE id = ? AND role = 'partner'`).get(partnerId) as any;
    if (!partner) {
      res.status(404).json({ error: 'Pro Partner not found.' });
      return;
    }

    const txRef = `ADM-WAL-${crypto.randomInt(100000, 999999)}`;
    db.prepare(`
      INSERT INTO wallet_transactions (id, tx_ref, user_id, role, type, amount_pkr, payment_method, status, description)
      VALUES (?, ?, ?, 'partner', ?, ?, 'admin_adjustment', 'confirmed', ?)
    `).run(
      genId('WTX'),
      txRef,
      partnerId,
      txType,
      amt,
      note ? String(note).trim() : `Admin wallet ${txType === 'credit' ? 'top-up credit' : 'debit'} (${txRef})`
    );

    db.prepare(`
      INSERT INTO notifications (id, user_id, role, category, title, body)
      VALUES (?, ?, 'partner', 'Payment Updates', ?, ?)
    `).run(
      genId('NTF'),
      partnerId,
      txType === 'credit' ? `Wallet Credited Rs. ${amt.toLocaleString()}` : `Wallet Debited Rs. ${amt.toLocaleString()}`,
      note ? String(note).trim() : `Admin adjusted your wallet (${txRef}).`
    );

    emitToUser(partnerId, 'partner', 'notification:new', { title: 'Wallet Updated' });
    logAdminAudit(req, 'ADMIN_PARTNER_WALLET', 'success', `${txType.toUpperCase()} Rs. ${amt} for partner ${partnerId} (${txRef})`);
    res.json({ ok: true, txRef });
  });

  app.get('/api/admin/bookings', requireRole('admin'), (_req: AuthedRequest, res: Response) => {
    const bookings = db
      .prepare(`
        SELECT b.*,
               fc.name AS vehicle_category_name,
               p.full_name AS passenger_name, p.phone AS passenger_phone,
               d.full_name AS partner_name, d.phone AS partner_phone
        FROM bookings b
        LEFT JOIN fleet_categories fc ON fc.id = b.vehicle_category_id
        LEFT JOIN users p ON p.id = b.passenger_id
        LEFT JOIN users d ON d.id = b.partner_id
        ORDER BY b.created_at DESC
      `)
      .all() as any[];

    const appsStmt = db.prepare(`
      SELECT ba.*,
             u.full_name AS partner_name,
             u.phone AS partner_phone,
             u.whatsapp AS partner_whatsapp,
             u.email AS partner_email,
             u.city AS partner_city,
             pp.vehicle_name AS partner_vehicle_name,
             pp.vehicle_number AS partner_vehicle_number,
             pp.seating_capacity AS partner_seating_capacity,
             pp.verification_status AS partner_verification_status,
             pp.operating_city AS partner_operating_city,
             (SELECT COUNT(*) FROM bookings cb WHERE cb.partner_id = ba.partner_id AND cb.status = 'completed') AS completed_trips,
             (SELECT ROUND(AVG(br.rating), 1) FROM booking_ratings br WHERE br.partner_id = ba.partner_id) AS avg_rating,
             MAX(0, (
               (SELECT COALESCE(SUM(amount_pkr), 0) FROM wallet_transactions WHERE user_id = ba.partner_id AND role = 'partner' AND status = 'confirmed' AND type IN ('credit', 'settlement')) -
               (SELECT COALESCE(SUM(amount_pkr), 0) FROM wallet_transactions WHERE user_id = ba.partner_id AND role = 'partner' AND status = 'confirmed' AND type IN ('commission', 'withdrawal')) -
               (SELECT COALESCE(SUM(amount_pkr), 0) FROM wallet_transactions WHERE user_id = ba.partner_id AND role = 'partner' AND status = 'pending' AND type = 'withdrawal')
             )) AS wallet_balance_pkr
      FROM booking_applications ba
      JOIN users u ON u.id = ba.partner_id
      LEFT JOIN partner_profiles pp ON pp.user_id = ba.partner_id
      WHERE ba.booking_id = ?
      ORDER BY CASE WHEN ba.status = 'approved' THEN 0 WHEN ba.status = 'pending' THEN 1 ELSE 2 END, ba.created_at ASC
    `);

    const enriched = bookings.map((b) => {
      const applications = appsStmt.all(b.id) as any[];
      return {
        ...b,
        applications,
        total_applicants_count: applications.filter((a) => a.status === 'pending').length,
      };
    });

    res.json({ bookings: enriched });
  });

  app.post('/api/admin/bookings/:id/approve-partner', requireRole('admin'), (req: AuthedRequest, res: Response) => {
    const bookingId = req.params.id;
    const { applicationId, partnerId, agreedFarePkr } = req.body || {};

    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId) as any;
    if (!booking) {
      res.status(404).json({ error: 'Booking not found.' });
      return;
    }
    if (['completed', 'cancelled'].includes(booking.status)) {
      res.status(400).json({ error: 'Cannot assign a partner to a completed or cancelled booking.' });
      return;
    }

    let targetPartnerId = partnerId ? String(partnerId) : '';
    let targetApp: any = null;
    if (applicationId) {
      targetApp = db
        .prepare('SELECT * FROM booking_applications WHERE id = ? AND booking_id = ?')
        .get(String(applicationId), bookingId);
      if (!targetApp) {
        res.status(404).json({ error: 'Driver application not found for this booking.' });
        return;
      }
      targetPartnerId = targetApp.partner_id;
    }

    if (!targetPartnerId) {
      res.status(400).json({ error: 'partnerId or applicationId is required.' });
      return;
    }

    const partnerUser = db
      .prepare(`SELECT u.id, u.full_name, u.phone, pp.verification_status, pp.vehicle_name, pp.vehicle_number FROM users u LEFT JOIN partner_profiles pp ON pp.user_id = u.id WHERE u.id = ? AND u.role = 'partner'`)
      .get(targetPartnerId) as any;
    if (!partnerUser) {
      res.status(404).json({ error: 'Target Pro Partner not found.' });
      return;
    }

    const fleet = db.prepare('SELECT commission_pct FROM fleet_categories WHERE id = ?').get(booking.vehicle_category_id) as any;
    const useGlobal = db.prepare(`SELECT value FROM platform_settings WHERE key = 'use_global_instant_commission'`).get() as any;
    const globalPctRow = db.prepare(`SELECT value FROM platform_settings WHERE key = 'instant_commission_pct'`).get() as any;
    const commPct =
      useGlobal?.value === '1' && Number.isFinite(Number(globalPctRow?.value))
        ? Number(globalPctRow.value)
        : Number(booking.commission_pct || fleet?.commission_pct || 15);

    const agreed = Number.isFinite(Number(agreedFarePkr)) && Number(agreedFarePkr) > 0
      ? Math.round(Number(agreedFarePkr))
      : Number(targetApp?.proposed_fare_pkr || booking.agreed_fare_pkr || booking.proposed_fare_pkr);
    const commissionPkr = Math.round((agreed * commPct) / 100);

    const rejectedApps = db
      .prepare(`SELECT id, partner_id FROM booking_applications WHERE booking_id = ? AND partner_id != ? AND status = 'pending'`)
      .all(bookingId, targetPartnerId) as Array<{ id: string; partner_id: string }>;

    db.transaction(() => {
      db.prepare(`
        UPDATE bookings
        SET partner_id = ?, agreed_fare_pkr = ?, total_bill_pkr = ?, commission_pct = ?, commission_pkr = ?,
            status = 'confirmed', confirmed_at = COALESCE(confirmed_at, datetime('now')), updated_at = datetime('now')
        WHERE id = ?
      `).run(targetPartnerId, agreed, agreed, commPct, commissionPkr, bookingId);

      db.prepare(`
        UPDATE booking_applications
        SET status = 'approved', reviewed_at = datetime('now'), updated_at = datetime('now')
        WHERE booking_id = ? AND partner_id = ?
      `).run(bookingId, targetPartnerId);

      db.prepare(`
        UPDATE booking_applications
        SET status = 'rejected', reviewed_at = datetime('now'), updated_at = datetime('now')
        WHERE booking_id = ? AND partner_id != ? AND status = 'pending'
      `).run(bookingId, targetPartnerId);

      db.prepare(`UPDATE booking_offers SET status = 'rejected' WHERE booking_id = ? AND status = 'pending'`).run(bookingId);
    })();

    db.prepare(`
      INSERT INTO notifications (id, user_id, role, category, title, body, booking_id)
      VALUES (?, ?, 'passenger', 'Booking Updates', ?, ?, ?)
    `).run(
      genId('NTF'),
      booking.passenger_id,
      `Monthly Driver Assigned (${bookingId})`,
      `Admin approved ${partnerUser.full_name} (${partnerUser.vehicle_name || 'Verified Vehicle'} • ${partnerUser.phone}) for your booking at Rs. ${agreed.toLocaleString()}.`,
      bookingId
    );

    db.prepare(`
      INSERT INTO notifications (id, user_id, role, category, title, body, booking_id)
      VALUES (?, ?, 'partner', 'Booking Confirmations', ?, ?, ?)
    `).run(
      genId('NTF'),
      targetPartnerId,
      `Booking ${bookingId} Approved by Admin!`,
      `Admin approved your application for Monthly ${booking.service_type.replaceAll('_', ' ')} at Rs. ${agreed.toLocaleString()}. Check My Trips to start.`,
      bookingId
    );

    for (const rej of rejectedApps) {
      db.prepare(`
        INSERT INTO notifications (id, user_id, role, category, title, body, booking_id)
        VALUES (?, ?, 'partner', 'Booking Updates', ?, ?, ?)
      `).run(
        genId('NTF'),
        rej.partner_id,
        `Booking ${bookingId} Assigned`,
        `Admin assigned booking ${bookingId} to another Pro Partner. Browse other open monthly requests!`,
        bookingId
      );
      emitToUser(rej.partner_id, 'partner', 'booking:updated', { bookingId, status: 'confirmed' });
    }

    emitToUser(booking.passenger_id, 'passenger', 'booking:updated', { bookingId, status: 'confirmed' });
    emitToUser(targetPartnerId, 'partner', 'booking:updated', { bookingId, status: 'confirmed' });
    emitToAll('booking:updated', { bookingId, status: 'confirmed' });

    logAdminAudit(req, 'APPROVE_MONTHLY_PARTNER', 'success', `Assigned partner ${partnerUser.full_name} (${targetPartnerId}) to booking ${bookingId}`);
    res.json({ approved: true, partnerId: targetPartnerId });
  });

  app.post('/api/admin/bookings/:id/applications/:appId/reject', requireRole('admin'), (req: AuthedRequest, res: Response) => {
    const bookingId = req.params.id;
    const appId = req.params.appId;
    const appRow = db
      .prepare('SELECT * FROM booking_applications WHERE id = ? AND booking_id = ?')
      .get(appId, bookingId) as any;
    if (!appRow) {
      res.status(404).json({ error: 'Application not found.' });
      return;
    }

    db.prepare(`
      UPDATE booking_applications SET status = 'rejected', reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
    `).run(appId);

    db.prepare(`
      INSERT INTO notifications (id, user_id, role, category, title, body, booking_id)
      VALUES (?, ?, 'partner', 'Booking Updates', ?, ?, ?)
    `).run(
      genId('NTF'),
      appRow.partner_id,
      `Application Declined (${bookingId})`,
      `Your application for booking ${bookingId} was not selected by Admin.`,
      bookingId
    );

    emitToUser(appRow.partner_id, 'partner', 'booking:updated', { bookingId });
    logAdminAudit(req, 'REJECT_BOOKING_APPLICATION', 'success', `Rejected application ${appId} on booking ${bookingId}`);
    res.json({ rejected: true });
  });

function logAdminAudit(
  req: AuthedRequest,
  action: string,
  status: string,
  details = ''
) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').slice(0, 120);
  const userId = req.auth?.sub || '';
  const email = req.auth?.email || '';
  try {
    db.prepare(`
      INSERT INTO admin_security_logs (id, user_id, email, action, status, ip, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(genId('AUD'), userId, email, action, status, ip, details);
  } catch {
    // ignore
  }
}

  app.get('/api/admin/fleet', requireRole('admin'), (_req: AuthedRequest, res: Response) => {
    const fleet = db
      .prepare('SELECT * FROM fleet_categories ORDER BY sort_order ASC, name ASC')
      .all()
      .map((f: any) => ({ ...f, services_eligible: JSON.parse(f.services_eligible || '[]') }));
    res.json({ fleet });
  });

  app.post('/api/admin/fleet', requireRole('admin'), (req: AuthedRequest, res: Response) => {
    const f = req.body || {};
    if (!f.name) {
      res.status(400).json({ error: 'Vehicle category name is required.' });
      return;
    }
    const id = f.id ? String(f.id).trim().toLowerCase() : genId('FLT').toLowerCase();
    const slug = String(f.slug || f.name).toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + crypto.randomInt(10, 99);
    db.prepare(`
      INSERT INTO fleet_categories (
        id, slug, name, tagline, image_url, seating_capacity, base_fare_pkr,
        per_km_min_pkr, per_km_max_pkr, waiting_charge_per_min, extra_stop_pkr,
        commission_pct, services_eligible, is_active, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      slug,
      String(f.name).trim(),
      String(f.tagline || 'Custom Fleet Class').trim(),
      String(f.image_url || ''),
      Number(f.seating_capacity || 4),
      Number(f.base_fare_pkr || 200),
      Number(f.per_km_min_pkr || 35),
      Number(f.per_km_max_pkr || 45),
      Number(f.waiting_charge_per_min || 5),
      Number(f.extra_stop_pkr || 50),
      Number(f.commission_pct || 15),
      JSON.stringify(Array.isArray(f.services_eligible) ? f.services_eligible : ['pick_and_drop']),
      f.is_active === false ? 0 : 1,
      Number(f.sort_order || 10)
    );

    logAdminAudit(req, 'CREATE_VEHICLE_CATEGORY', 'success', `Created vehicle category ${f.name} (${id})`);
    res.status(201).json({ id, created: true });
  });

  app.patch('/api/admin/fleet/:id', requireRole('admin'), (req: AuthedRequest, res: Response) => {
    const f = req.body || {};
    db.prepare(`
      UPDATE fleet_categories
      SET name = COALESCE(?, name),
          tagline = COALESCE(?, tagline),
          image_url = COALESCE(?, image_url),
          seating_capacity = COALESCE(?, seating_capacity),
          base_fare_pkr = COALESCE(?, base_fare_pkr),
          per_km_min_pkr = COALESCE(?, per_km_min_pkr),
          per_km_max_pkr = COALESCE(?, per_km_max_pkr),
          waiting_charge_per_min = COALESCE(?, waiting_charge_per_min),
          extra_stop_pkr = COALESCE(?, extra_stop_pkr),
          commission_pct = COALESCE(?, commission_pct),
          services_eligible = COALESCE(?, services_eligible),
          is_active = COALESCE(?, is_active),
          sort_order = COALESCE(?, sort_order)
      WHERE id = ?
    `).run(
      f.name !== undefined ? String(f.name).trim() : null,
      f.tagline !== undefined ? String(f.tagline).trim() : null,
      f.image_url !== undefined ? String(f.image_url) : null,
      f.seating_capacity !== undefined ? Number(f.seating_capacity) : null,
      f.base_fare_pkr !== undefined ? Number(f.base_fare_pkr) : null,
      f.per_km_min_pkr !== undefined ? Number(f.per_km_min_pkr) : null,
      f.per_km_max_pkr !== undefined ? Number(f.per_km_max_pkr) : null,
      f.waiting_charge_per_min !== undefined ? Number(f.waiting_charge_per_min) : null,
      f.extra_stop_pkr !== undefined ? Number(f.extra_stop_pkr) : null,
      f.commission_pct !== undefined ? Number(f.commission_pct) : null,
      Array.isArray(f.services_eligible) ? JSON.stringify(f.services_eligible) : null,
      typeof f.is_active === 'boolean' ? (f.is_active ? 1 : 0) : f.is_active !== undefined ? Number(f.is_active) : null,
      f.sort_order !== undefined ? Number(f.sort_order) : null,
      req.params.id
    );

    logAdminAudit(req, 'UPDATE_VEHICLE_CATEGORY', 'success', `Updated vehicle category ${req.params.id}`);
    res.json({ updated: true });
  });

  app.delete('/api/admin/fleet/:id', requireRole('admin'), (req: AuthedRequest, res: Response) => {
    const id = req.params.id;
    const activeCount = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM bookings WHERE vehicle_category_id = ? AND status IN ('searching', 'negotiating', 'confirmed', 'on_the_way', 'arrived', 'started')`
        )
        .get(id) as any
    )?.c || 0;

    if (activeCount > 0) {
      res.status(409).json({
        error: `Cannot delete vehicle category while ${activeCount} active booking(s) are in progress. Please disable the category instead.`,
      });
      return;
    }

    db.prepare('DELETE FROM fleet_categories WHERE id = ?').run(id);
    logAdminAudit(req, 'DELETE_VEHICLE_CATEGORY', 'success', `Deleted vehicle category ${id}`);
    res.json({ deleted: true });
  });

  app.get('/api/admin/zones', requireRole('admin'), (_req: AuthedRequest, res: Response) => {
    const zones = db.prepare('SELECT * FROM service_zones ORDER BY city ASC, area_name ASC').all();
    res.json({ zones });
  });

  app.post('/api/admin/zones', requireRole('admin'), (req: AuthedRequest, res: Response) => {
    const z = req.body || {};
    if (!z.city || !z.area_name || !Number.isFinite(Number(z.center_lat)) || !Number.isFinite(Number(z.center_lng))) {
      res.status(400).json({ error: 'City, area name, and valid coordinates are required.' });
      return;
    }
    const id = z.id ? String(z.id).trim().toLowerCase() : `zone-${genId('ZN').toLowerCase()}`;
    db.prepare(`
      INSERT INTO service_zones (
        id, city, area_name, center_lat, center_lng, radius_km, demand_level,
        rickshaw_enabled, rickshaw_rate_pkr, rickshaw_hours, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      String(z.city).trim(),
      String(z.area_name).trim(),
      Number(z.center_lat),
      Number(z.center_lng),
      Number(z.radius_km || 10),
      ['low', 'medium', 'high'].includes(z.demand_level) ? z.demand_level : 'medium',
      z.rickshaw_enabled ? 1 : 0,
      Number(z.rickshaw_rate_pkr || 20),
      String(z.rickshaw_hours || '6 AM - 10 PM'),
      z.is_active === false ? 0 : 1
    );

    logAdminAudit(req, 'CREATE_SERVICE_ZONE', 'success', `Created service zone ${z.area_name}, ${z.city} (${id})`);
    res.status(201).json({ id, created: true });
  });

  app.patch('/api/admin/zones/:id', requireRole('admin'), (req: AuthedRequest, res: Response) => {
    const z = req.body || {};
    db.prepare(`
      UPDATE service_zones
      SET city = COALESCE(?, city),
          area_name = COALESCE(?, area_name),
          center_lat = COALESCE(?, center_lat),
          center_lng = COALESCE(?, center_lng),
          radius_km = COALESCE(?, radius_km),
          demand_level = COALESCE(?, demand_level),
          rickshaw_enabled = COALESCE(?, rickshaw_enabled),
          rickshaw_rate_pkr = COALESCE(?, rickshaw_rate_pkr),
          rickshaw_hours = COALESCE(?, rickshaw_hours),
          is_active = COALESCE(?, is_active)
      WHERE id = ?
    `).run(
      z.city !== undefined ? String(z.city).trim() : null,
      z.area_name !== undefined ? String(z.area_name).trim() : null,
      z.center_lat !== undefined ? Number(z.center_lat) : null,
      z.center_lng !== undefined ? Number(z.center_lng) : null,
      z.radius_km !== undefined ? Number(z.radius_km) : null,
      z.demand_level ?? null,
      typeof z.rickshaw_enabled === 'boolean' ? (z.rickshaw_enabled ? 1 : 0) : z.rickshaw_enabled !== undefined ? Number(z.rickshaw_enabled) : null,
      z.rickshaw_rate_pkr !== undefined ? Number(z.rickshaw_rate_pkr) : null,
      z.rickshaw_hours ?? null,
      typeof z.is_active === 'boolean' ? (z.is_active ? 1 : 0) : z.is_active !== undefined ? Number(z.is_active) : null,
      req.params.id
    );

    logAdminAudit(req, 'UPDATE_SERVICE_ZONE', 'success', `Updated service zone ${req.params.id}`);
    res.json({ updated: true });
  });

  app.delete('/api/admin/zones/:id', requireRole('admin'), (req: AuthedRequest, res: Response) => {
    db.prepare('DELETE FROM service_zones WHERE id = ?').run(req.params.id);
    logAdminAudit(req, 'DELETE_SERVICE_ZONE', 'success', `Deleted service zone ${req.params.id}`);
    res.json({ deleted: true });
  });

  app.get('/api/admin/packages', requireRole('admin'), (_req: AuthedRequest, res: Response) => {
    const packages = db.prepare('SELECT * FROM monthly_packages ORDER BY base_monthly_pkr ASC').all();
    res.json({ packages });
  });

  app.post('/api/admin/packages', requireRole('admin'), (req: AuthedRequest, res: Response) => {
    const p = req.body || {};
    if (!p.name || !p.vehicle_category_id) {
      res.status(400).json({ error: 'Package name and vehicle category required.' });
      return;
    }
    const id = genId('PKG').toLowerCase();
    db.prepare(`
      INSERT INTO monthly_packages (id, name, service_type, vehicle_category_id, duration_days, trips_included, discount_pct, base_monthly_pkr, description, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      id,
      String(p.name).trim(),
      String(p.service_type || 'pick_and_drop'),
      String(p.vehicle_category_id),
      Number(p.duration_days || 22),
      Number(p.trips_included || 44),
      Number(p.discount_pct || 15),
      Number(p.base_monthly_pkr || 22000),
      String(p.description || '').trim()
    );

    logAdminAudit(req, 'CREATE_PACKAGE', 'success', `Created monthly package ${p.name} (${id})`);
    res.status(201).json({ id, created: true });
  });

  app.patch('/api/admin/packages/:id', requireRole('admin'), (req: AuthedRequest, res: Response) => {
    const p = req.body || {};
    db.prepare(`
      UPDATE monthly_packages
      SET name = COALESCE(?, name),
          service_type = COALESCE(?, service_type),
          vehicle_category_id = COALESCE(?, vehicle_category_id),
          duration_days = COALESCE(?, duration_days),
          trips_included = COALESCE(?, trips_included),
          base_monthly_pkr = COALESCE(?, base_monthly_pkr),
          discount_pct = COALESCE(?, discount_pct),
          description = COALESCE(?, description),
          is_active = COALESCE(?, is_active)
      WHERE id = ?
    `).run(
      p.name !== undefined ? String(p.name).trim() : null,
      p.service_type ?? null,
      p.vehicle_category_id ?? null,
      p.duration_days !== undefined ? Number(p.duration_days) : null,
      p.trips_included !== undefined ? Number(p.trips_included) : null,
      p.base_monthly_pkr !== undefined ? Number(p.base_monthly_pkr) : null,
      p.discount_pct !== undefined ? Number(p.discount_pct) : null,
      p.description !== undefined ? String(p.description).trim() : null,
      typeof p.is_active === 'boolean' ? (p.is_active ? 1 : 0) : p.is_active !== undefined ? Number(p.is_active) : null,
      req.params.id
    );

    logAdminAudit(req, 'UPDATE_PACKAGE', 'success', `Updated monthly package ${req.params.id}`);
    res.json({ updated: true });
  });

  app.delete('/api/admin/packages/:id', requireRole('admin'), (req: AuthedRequest, res: Response) => {
    db.prepare('DELETE FROM monthly_packages WHERE id = ?').run(req.params.id);
    logAdminAudit(req, 'DELETE_PACKAGE', 'success', `Deleted package ${req.params.id}`);
    res.json({ deleted: true });
  });

  app.get('/api/admin/passengers', requireRole('admin'), (_req: AuthedRequest, res: Response) => {
    const passengers = db
      .prepare(`
        SELECT u.id, u.full_name, u.phone, u.whatsapp, u.email, u.city, u.operating_area,
               u.phone_verified, COALESCE(u.status, 'active') AS status, u.created_at,
               (SELECT COUNT(*) FROM bookings WHERE passenger_id = u.id) AS total_bookings,
               (
                 (SELECT COALESCE(SUM(amount_pkr), 0) FROM wallet_transactions WHERE user_id = u.id AND type = 'credit' AND status = 'confirmed') -
                 (SELECT COALESCE(SUM(amount_pkr), 0) FROM wallet_transactions WHERE user_id = u.id AND type = 'debit' AND status = 'confirmed')
               ) AS wallet_balance_pkr
        FROM users u
        WHERE u.role = 'passenger'
        ORDER BY u.created_at DESC
      `)
      .all();
    res.json({ passengers });
  });

  app.patch('/api/admin/passengers/:id', requireRole('admin'), (req: AuthedRequest, res: Response) => {
    const p = req.body || {};
    db.prepare(`
      UPDATE users
      SET full_name = COALESCE(?, full_name),
          phone = COALESCE(?, phone),
          whatsapp = COALESCE(?, whatsapp),
          email = COALESCE(?, email),
          city = COALESCE(?, city),
          phone_verified = COALESCE(?, phone_verified),
          status = COALESCE(?, status)
      WHERE id = ? AND role = 'passenger'
    `).run(
      p.full_name ?? null,
      p.phone ?? null,
      p.whatsapp ?? null,
      p.email ?? null,
      p.city ?? null,
      p.phone_verified !== undefined ? (p.phone_verified ? 1 : 0) : null,
      p.status ?? null,
      req.params.id
    );

    logAdminAudit(req, 'UPDATE_PASSENGER', 'success', `Updated passenger account ${req.params.id}`);
    res.json({ updated: true });
  });

  app.patch('/api/admin/bookings/:id', requireRole('admin'), (req: AuthedRequest, res: Response) => {
    const b = req.body || {};
    const existing = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id) as any;
    if (!existing) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }

    db.prepare(`
      UPDATE bookings
      SET status = COALESCE(?, status),
          payment_status = COALESCE(?, payment_status),
          notes = COALESCE(?, notes),
          confirmed_at = CASE WHEN ? = 'confirmed' AND confirmed_at IS NULL THEN datetime('now') ELSE confirmed_at END,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      b.status ?? null,
      b.payment_status ?? null,
      b.notes ?? null,
      b.status ?? null,
      req.params.id
    );

    const nextStatus = b.status || existing.status;
    if (b.status && b.status !== existing.status) {
      if (nextStatus === 'confirmed') {
        db.prepare(`
          INSERT INTO notifications (id, user_id, role, category, title, body, booking_id)
          VALUES (?, ?, 'passenger', 'Booking Updates', ?, ?, ?)
        `).run(
          genId('NTF'),
          existing.passenger_id,
          `Booking ${existing.id} Confirmed`,
          'Your booking has been confirmed and moved to Active rides.',
          existing.id
        );
      }
      emitToUser(existing.passenger_id, 'passenger', 'booking:updated', {
        bookingId: existing.id,
        status: nextStatus,
      });
      if (existing.partner_id) {
        emitToUser(existing.partner_id, 'partner', 'booking:updated', {
          bookingId: existing.id,
          status: nextStatus,
        });
      }
    }

    logAdminAudit(req, 'UPDATE_BOOKING', 'success', `Updated booking ${req.params.id} (Status: ${b.status || 'unchanged'})`);
    res.json({ updated: true });
  });

  app.get('/api/admin/settings', requireRole('admin'), (_req: AuthedRequest, res: Response) => {
    const rows = db.prepare('SELECT * FROM platform_settings').all() as Array<{ key: string; value: string }>;
    const settings: Record<string, string> = {};
    for (const r of rows) settings[r.key] = r.value;
    res.json({ settings });
  });

  app.put('/api/admin/settings', requireRole('admin'), (req: AuthedRequest, res: Response) => {
    const updates = req.body || {};
    const upsert = db.prepare('INSERT OR REPLACE INTO platform_settings (key, value) VALUES (?, ?)');
    const themeKeys = new Set(['app_theme', 'home_layout', 'auth_layout', 'theme_force_global']);
    const touchesTheme = Object.keys(updates).some((k) => themeKeys.has(k));
    db.transaction(() => {
      for (const [k, v] of Object.entries(updates)) {
        upsert.run(k, typeof v === 'string' ? v : JSON.stringify(v));
      }
      if (touchesTheme) {
        upsert.run('theme_updated_at', String(Date.now()));
      }
    })();
    logAdminAudit(req, 'UPDATE_PLATFORM_SETTINGS', 'success', `Updated ${Object.keys(updates).length} platform settings`);
    emitToAll('config:updated', { updatedAt: Date.now() });
    res.json({ updated: true });
  });

  app.put('/api/admin/theme', requireRole('admin'), (req: AuthedRequest, res: Response) => {
    const { themeId, homeLayout, authLayout, forceGlobal } = req.body || {};
    const validThemes = new Set(['classic-ivory', 'obsidian-gold', 'royal-navy', 'pearl-marble', 'sovereign-noir']);
    const validHomeLayouts = new Set(['classic', 'sovereign', 'editorial', 'executive']);
    const validAuthLayouts = new Set(['hero-sheet', 'classic-card', 'split-showcase']);

    const nextTheme = validThemes.has(themeId) ? String(themeId) : 'classic-ivory';
    const nextHome = validHomeLayouts.has(homeLayout) ? String(homeLayout) : 'classic';
    const nextAuth = validAuthLayouts.has(authLayout) ? String(authLayout) : 'hero-sheet';
    const nextForce = forceGlobal ? '1' : '0';
    const updatedAt = Date.now();

    const upsert = db.prepare('INSERT OR REPLACE INTO platform_settings (key, value) VALUES (?, ?)');
    db.transaction(() => {
      upsert.run('app_theme', nextTheme);
      upsert.run('home_layout', nextHome);
      upsert.run('auth_layout', nextAuth);
      upsert.run('theme_force_global', nextForce);
      upsert.run('theme_updated_at', String(updatedAt));
    })();

    const themeConfig = {
      themeId: nextTheme,
      homeLayout: nextHome,
      authLayout: nextAuth,
      forceGlobal: nextForce === '1',
      updatedAt,
    };

    logAdminAudit(req, 'UPDATE_APP_THEME', 'success', `Theme=${nextTheme}, Home=${nextHome}, Auth=${nextAuth}, Force=${nextForce}`);
    emitToAll('config:updated', { themeConfig, updatedAt });
    res.json({ updated: true, themeConfig });
  });

  app.get('/api/admin/finance', requireRole('admin'), (_req: AuthedRequest, res: Response) => {
    const transactions = db
      .prepare(`
        SELECT wt.*, u.full_name, u.phone
        FROM wallet_transactions wt
        JOIN users u ON u.id = wt.user_id
        ORDER BY wt.created_at DESC LIMIT 100
      `)
      .all();
    res.json({ transactions });
  });

  app.post('/api/admin/settlements/:id/pay', requireRole('admin'), (req: AuthedRequest, res: Response) => {
    const tx = db.prepare(`SELECT * FROM wallet_transactions WHERE id = ? AND type = 'withdrawal' AND status = 'pending'`).get(
      req.params.id
    ) as any;
    if (!tx) {
      res.status(404).json({ error: 'Pending withdrawal not found.' });
      return;
    }
    db.prepare(`UPDATE wallet_transactions SET status = 'confirmed' WHERE id = ?`).run(tx.id);
    db.prepare(`
      INSERT INTO notifications (id, user_id, role, category, title, body)
      VALUES (?, ?, 'partner', 'Payment Updates', 'Withdrawal Paid', ?)
    `).run(genId('NTF'), tx.user_id, `Your withdrawal of Rs. ${Number(tx.amount_pkr).toLocaleString()} (${tx.tx_ref}) has been settled.`);
    emitToUser(tx.user_id, 'partner', 'notification:new', { title: 'Withdrawal Paid' });
    res.json({ settled: true });
  });

  app.get('/api/admin/tickets', requireRole('admin'), (_req: AuthedRequest, res: Response) => {
    const tickets = db
      .prepare(`
        SELECT st.*, u.full_name, u.phone
        FROM support_tickets st
        JOIN users u ON u.id = st.user_id
        ORDER BY st.created_at DESC
      `)
      .all();
    res.json({ tickets });
  });

  app.post('/api/admin/tickets/:id/reply', requireRole('admin'), (req: AuthedRequest, res: Response) => {
    const { reply, status } = req.body || {};
    const tkt = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(req.params.id) as any;
    if (!tkt) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    const nextStatus = ['open', 'in_progress', 'resolved'].includes(status) ? status : 'resolved';
    db.prepare(`UPDATE support_tickets SET admin_reply = ?, status = ?, updated_at = datetime('now') WHERE id = ?`).run(
      String(reply || ''),
      nextStatus,
      tkt.id
    );
    db.prepare(`
      INSERT INTO notifications (id, user_id, role, category, title, body, booking_id)
      VALUES (?, ?, ?, 'Support Replies', ?, ?, ?)
    `).run(genId('NTF'), tkt.user_id, tkt.role, `Support Reply: ${tkt.subject}`, String(reply || 'Updated'), tkt.booking_id);
    emitToUser(tkt.user_id, tkt.role, 'notification:new', { title: `Support Reply: ${tkt.subject}` });
    res.json({ updated: true });
  });

  app.get('/api/admin/security-logs', requireRole('admin'), (_req: AuthedRequest, res: Response) => {
    const logs = db
      .prepare('SELECT id, user_id, email, action, status, ip, details, created_at FROM admin_security_logs ORDER BY created_at DESC LIMIT 60')
      .all();
    res.json({ logs });
  });
}
