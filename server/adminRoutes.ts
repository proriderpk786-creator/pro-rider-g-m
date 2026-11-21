import crypto from 'node:crypto';
import type { Express, Response } from 'express';
import { db } from './db.ts';
import { requireRole, type AuthedRequest } from './auth.ts';
import { emitToUser } from './ws.ts';

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
               pp.*
        FROM users u
        JOIN partner_profiles pp ON pp.user_id = u.id
        WHERE u.role = 'partner'
        ORDER BY pp.updated_at DESC
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

  app.get('/api/admin/bookings', requireRole('admin'), (_req: AuthedRequest, res: Response) => {
    const bookings = db
      .prepare(`
        SELECT b.*,
               fc.name AS vehicle_category_name,
               p.full_name AS passenger_name, p.phone AS passenger_phone,
               d.full_name AS partner_name, d.phone AS partner_phone
        FROM bookings b
        JOIN fleet_categories fc ON fc.id = b.vehicle_category_id
        JOIN users p ON p.id = b.passenger_id
        LEFT JOIN users d ON d.id = b.partner_id
        ORDER BY b.created_at DESC
      `)
      .all();
    res.json({ bookings });
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
    db.prepare(`
      UPDATE bookings
      SET status = COALESCE(?, status),
          payment_status = COALESCE(?, payment_status),
          notes = COALESCE(?, notes),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      b.status ?? null,
      b.payment_status ?? null,
      b.notes ?? null,
      req.params.id
    );

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
    db.transaction(() => {
      for (const [k, v] of Object.entries(updates)) {
        upsert.run(k, typeof v === 'string' ? v : JSON.stringify(v));
      }
    })();
    logAdminAudit(req, 'UPDATE_PLATFORM_SETTINGS', 'success', `Updated ${Object.keys(updates).length} platform settings`);
    res.json({ updated: true });
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
