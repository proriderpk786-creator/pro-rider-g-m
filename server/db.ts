import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import path from 'node:path';

const DB_PATH = path.resolve(process.cwd(), 'prorider.db');
export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export const SUPER_ADMIN_EMAIL = 'prorider.pk786@gmail.com';
export const SUPER_ADMIN_ALLOWLIST = new Set<string>([SUPER_ADMIN_EMAIL]);

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!password || !stored || !stored.includes(':')) return false;
  const [salt, originalHash] = stored.split(':');
  if (!salt || !originalHash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHash, 'hex');
  if (candidate.length !== original.length) return false;
  return crypto.timingSafeEqual(candidate, original);
}

export function hashOtp(code: string, salt: string): string {
  return crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK(role IN ('passenger', 'partner', 'admin')),
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      whatsapp TEXT,
      email TEXT,
      password_hash TEXT NOT NULL,
      city TEXT DEFAULT 'Islamabad',
      operating_area TEXT DEFAULT '',
      phone_verified INTEGER NOT NULL DEFAULT 0,
      notify_push INTEGER NOT NULL DEFAULT 1,
      notify_sms INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'deletion_requested')),
      token_version INTEGER NOT NULL DEFAULT 1,
      admin_setup_completed INTEGER NOT NULL DEFAULT 0,
      recovery_phrase_hash TEXT DEFAULT '',
      recovery_key_hash TEXT DEFAULT '',
      failed_admin_attempts INTEGER NOT NULL DEFAULT 0,
      admin_locked_until INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(phone, role)
    );

    CREATE INDEX IF NOT EXISTS idx_users_email_role ON users(email, role);

    CREATE TABLE IF NOT EXISTS admin_security_challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL CHECK(purpose IN ('setup', 'recovery')),
      token_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_security_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT DEFAULT '',
      email TEXT DEFAULT '',
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      ip TEXT DEFAULT '',
      details TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS otp_challenges (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      role TEXT NOT NULL,
      salt TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      purpose TEXT NOT NULL DEFAULT 'verify_phone',
      expires_at INTEGER NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS partner_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      verification_status TEXT NOT NULL DEFAULT 'not_registered'
        CHECK(verification_status IN ('not_registered', 'incomplete', 'documents_pending', 'under_review', 'approved', 'rejected', 'suspended')),
      cnic_number TEXT DEFAULT '',
      cnic_expiry TEXT DEFAULT '',
      licence_number TEXT DEFAULT '',
      licence_expiry TEXT DEFAULT '',
      vehicle_category_id TEXT DEFAULT '',
      vehicle_name TEXT DEFAULT '',
      vehicle_number TEXT DEFAULT '',
      seating_capacity INTEGER DEFAULT 4,
      fuel_type TEXT DEFAULT 'Petrol',
      operating_city TEXT DEFAULT 'Islamabad',
      service_eligibility TEXT NOT NULL DEFAULT '["pick_and_drop"]',
      is_online INTEGER NOT NULL DEFAULT 0,
      current_lat REAL,
      current_lng REAL,
      last_location_at TEXT,
      admin_notes TEXT DEFAULT '',
      pending_vehicle_review TEXT DEFAULT '',
      handle TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      cover_photo_url TEXT DEFAULT '',
      cover_is_public INTEGER NOT NULL DEFAULT 1,
      avatar_url TEXT DEFAULT '',
      avatar_is_public INTEGER NOT NULL DEFAULT 1,
      profile_published INTEGER NOT NULL DEFAULT 0,
      profile_template TEXT DEFAULT 'clean_light',
      showcase_gallery TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS partner_documents (
      id TEXT PRIMARY KEY,
      partner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL CHECK(doc_type IN ('profile_photo', 'cnic_front', 'cnic_back', 'driving_licence', 'vehicle_registration', 'vehicle_photo')),
      file_name TEXT NOT NULL,
      file_data_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      expiry_date TEXT DEFAULT '',
      review_notes TEXT DEFAULT '',
      is_public INTEGER NOT NULL DEFAULT 0,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(partner_id, doc_type)
    );

    CREATE TABLE IF NOT EXISTS fleet_categories (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      tagline TEXT NOT NULL,
      image_url TEXT NOT NULL,
      seating_capacity INTEGER NOT NULL DEFAULT 4,
      base_fare_pkr REAL NOT NULL DEFAULT 200,
      per_km_min_pkr REAL NOT NULL DEFAULT 35,
      per_km_max_pkr REAL NOT NULL DEFAULT 45,
      waiting_charge_per_min REAL NOT NULL DEFAULT 5,
      extra_stop_pkr REAL NOT NULL DEFAULT 50,
      commission_pct REAL NOT NULL DEFAULT 15,
      services_eligible TEXT NOT NULL DEFAULT '["pick_and_drop","ride_sharing","fuel_sharing"]',
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS service_zones (
      id TEXT PRIMARY KEY,
      city TEXT NOT NULL,
      area_name TEXT NOT NULL,
      center_lat REAL NOT NULL,
      center_lng REAL NOT NULL,
      radius_km REAL NOT NULL DEFAULT 8,
      demand_level TEXT NOT NULL DEFAULT 'medium' CHECK(demand_level IN ('low', 'medium', 'high')),
      rickshaw_enabled INTEGER NOT NULL DEFAULT 0,
      rickshaw_rate_pkr REAL NOT NULL DEFAULT 20,
      rickshaw_hours TEXT NOT NULL DEFAULT '6 AM - 10 PM',
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS monthly_packages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      service_type TEXT NOT NULL,
      vehicle_category_id TEXT NOT NULL,
      duration_days INTEGER NOT NULL DEFAULT 22,
      trips_included INTEGER NOT NULL DEFAULT 44,
      discount_pct REAL NOT NULL DEFAULT 18,
      base_monthly_pkr REAL NOT NULL DEFAULT 24000,
      description TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      invoice_number TEXT UNIQUE NOT NULL,
      booking_mode TEXT NOT NULL CHECK(booking_mode IN ('go_now', 'schedule')),
      service_type TEXT NOT NULL CHECK(service_type IN ('pick_and_drop', 'ride_sharing', 'fuel_sharing')),
      passenger_id TEXT NOT NULL REFERENCES users(id),
      partner_id TEXT REFERENCES users(id),
      vehicle_category_id TEXT NOT NULL REFERENCES fleet_categories(id),
      pickup_address TEXT NOT NULL,
      pickup_lat REAL NOT NULL,
      pickup_lng REAL NOT NULL,
      dropoff_address TEXT NOT NULL,
      dropoff_lat REAL NOT NULL,
      dropoff_lng REAL NOT NULL,
      distance_km REAL NOT NULL,
      duration_min INTEGER NOT NULL,
      seats_requested INTEGER NOT NULL DEFAULT 1,
      pickup_date TEXT NOT NULL,
      pickup_time TEXT NOT NULL,
      expected_dropoff_date TEXT,
      expected_dropoff_time TEXT,
      actual_dropoff_time TEXT,
      return_journey INTEGER NOT NULL DEFAULT 0,
      package_id TEXT,
      schedule_days_json TEXT DEFAULT '[]',
      notes TEXT DEFAULT '',
      proposed_fare_pkr REAL NOT NULL,
      agreed_fare_pkr REAL,
      total_bill_pkr REAL NOT NULL,
      amount_paid_pkr REAL NOT NULL DEFAULT 0,
      commission_pkr REAL NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'UNPAID' CHECK(payment_status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID')),
      status TEXT NOT NULL DEFAULT 'searching'
        CHECK(status IN ('searching', 'negotiating', 'confirmed', 'on_the_way', 'arrived', 'started', 'completed', 'cancelled')),
      confirmed_at TEXT,
      on_the_way_at TEXT,
      arrived_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      cancelled_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS booking_offers (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      partner_id TEXT NOT NULL REFERENCES users(id),
      sender_role TEXT NOT NULL CHECK(sender_role IN ('partner', 'passenger')),
      amount_pkr REAL NOT NULL,
      message TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected', 'skipped')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS booking_skips (
      booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      partner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (booking_id, partner_id)
    );

    CREATE TABLE IF NOT EXISTS booking_ratings (
      id TEXT PRIMARY KEY,
      booking_id TEXT UNIQUE NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      passenger_id TEXT NOT NULL REFERENCES users(id),
      partner_id TEXT NOT NULL REFERENCES users(id),
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      comment TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id TEXT PRIMARY KEY,
      tx_ref TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL CHECK(role IN ('passenger', 'partner', 'admin')),
      booking_id TEXT REFERENCES bookings(id),
      type TEXT NOT NULL CHECK(type IN ('credit', 'debit', 'commission', 'settlement', 'withdrawal')),
      amount_pkr REAL NOT NULL,
      payment_method TEXT NOT NULL CHECK(payment_method IN ('wallet', 'cash', 'jazzcash', 'easypaisa', 'bank_transfer')),
      status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed', 'pending', 'failed')),
      description TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('passenger', 'partner', 'admin')),
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      booking_id TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('passenger', 'partner')),
      booking_id TEXT,
      category TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'resolved')),
      admin_reply TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Safe schema migrations for existing SQLite databases
  const userCols = db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>;
  const existingCols = new Set(userCols.map((c) => c.name));
  if (!existingCols.has('token_version')) {
    db.exec(`ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1`);
  }
  if (!existingCols.has('admin_setup_completed')) {
    db.exec(`ALTER TABLE users ADD COLUMN admin_setup_completed INTEGER NOT NULL DEFAULT 0`);
  }

  const profileCols = new Set(
    (db.prepare(`PRAGMA table_info(partner_profiles)`).all() as Array<{ name: string }>).map((c) => c.name)
  );
  const profileMigrations: Array<[string, string]> = [
    ['handle', `ALTER TABLE partner_profiles ADD COLUMN handle TEXT DEFAULT ''`],
    ['bio', `ALTER TABLE partner_profiles ADD COLUMN bio TEXT DEFAULT ''`],
    ['cover_photo_url', `ALTER TABLE partner_profiles ADD COLUMN cover_photo_url TEXT DEFAULT ''`],
    ['cover_is_public', `ALTER TABLE partner_profiles ADD COLUMN cover_is_public INTEGER NOT NULL DEFAULT 1`],
    ['avatar_url', `ALTER TABLE partner_profiles ADD COLUMN avatar_url TEXT DEFAULT ''`],
    ['avatar_is_public', `ALTER TABLE partner_profiles ADD COLUMN avatar_is_public INTEGER NOT NULL DEFAULT 1`],
    ['profile_published', `ALTER TABLE partner_profiles ADD COLUMN profile_published INTEGER NOT NULL DEFAULT 0`],
    ['profile_template', `ALTER TABLE partner_profiles ADD COLUMN profile_template TEXT DEFAULT 'clean_light'`],
    ['showcase_gallery', `ALTER TABLE partner_profiles ADD COLUMN showcase_gallery TEXT NOT NULL DEFAULT '[]'`],
  ];
  for (const [col, sql] of profileMigrations) {
    if (!profileCols.has(col)) db.exec(sql);
  }

  const docCols = new Set(
    (db.prepare(`PRAGMA table_info(partner_documents)`).all() as Array<{ name: string }>).map((c) => c.name)
  );
  if (!docCols.has('is_public')) {
    db.exec(`ALTER TABLE partner_documents ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0`);
  }
  if (!existingCols.has('recovery_phrase_hash')) {
    db.exec(`ALTER TABLE users ADD COLUMN recovery_phrase_hash TEXT DEFAULT ''`);
  }
  if (!existingCols.has('recovery_key_hash')) {
    db.exec(`ALTER TABLE users ADD COLUMN recovery_key_hash TEXT DEFAULT ''`);
  }
  if (!existingCols.has('failed_admin_attempts')) {
    db.exec(`ALTER TABLE users ADD COLUMN failed_admin_attempts INTEGER NOT NULL DEFAULT 0`);
  }
  if (!existingCols.has('admin_locked_until')) {
    db.exec(`ALTER TABLE users ADD COLUMN admin_locked_until INTEGER NOT NULL DEFAULT 0`);
  }

  seedInitialData();
}

function seedInitialData() {
  // 1. Seed Super Admin identity without any hardcoded/default password.
  // Super Admin must complete the Protected Account Setup flow at /admin to set their own password.
  const adminRow = db
    .prepare('SELECT id, admin_setup_completed FROM users WHERE email = ? AND role = ?')
    .get(SUPER_ADMIN_EMAIL, 'admin') as { id: string; admin_setup_completed: number } | undefined;

  if (!adminRow) {
    db.prepare(`
      INSERT INTO users (id, role, full_name, phone, whatsapp, email, password_hash, city, phone_verified, status, admin_setup_completed)
      VALUES (?, 'admin', ?, ?, ?, ?, '', 'Islamabad', 1, 'active', 0)
    `).run(
      'admin-super-01',
      'PRO RIDER AI Super Admin',
      '03125007782',
      '03125007782',
      SUPER_ADMIN_EMAIL
    );
  } else if (adminRow.admin_setup_completed !== 1) {
    // Ensure no legacy bootstrap password remains active before protected setup is completed
    db.prepare(`UPDATE users SET password_hash = '', admin_setup_completed = 0 WHERE id = ?`).run(adminRow.id);
  }

  // 2. Seed / Upsert Complete Fleet Categories conforming to user rules and screenshots
  const upsertFleet = db.prepare(`
    INSERT INTO fleet_categories (
      id, slug, name, tagline, image_url, seating_capacity, base_fare_pkr,
      per_km_min_pkr, per_km_max_pkr, waiting_charge_per_min, extra_stop_pkr,
      commission_pct, services_eligible, is_active, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      tagline = excluded.tagline,
      image_url = CASE WHEN fleet_categories.image_url = '' OR fleet_categories.image_url IS NULL OR fleet_categories.image_url LIKE 'https://images.unsplash.com/photo-1541899481282%' OR fleet_categories.image_url LIKE 'https://images.unsplash.com/photo-1559297434%' OR fleet_categories.image_url LIKE 'https://images.unsplash.com/photo-1568605117036%' OR fleet_categories.image_url LIKE 'https://images.unsplash.com/photo-1582639590011%' OR fleet_categories.image_url LIKE 'https://images.unsplash.com/photo-1544620347%' THEN excluded.image_url ELSE fleet_categories.image_url END,
      seating_capacity = excluded.seating_capacity,
      base_fare_pkr = excluded.base_fare_pkr,
      per_km_min_pkr = excluded.per_km_min_pkr,
      per_km_max_pkr = excluded.per_km_max_pkr,
      services_eligible = excluded.services_eligible,
      sort_order = excluded.sort_order,
      is_active = excluded.is_active
  `);

  const initialFleet = [
    {
      id: 'fleet-economy',
      slug: 'economy',
      name: 'Economy · اکانومی',
      tagline: '3 seats · 1 bags · Hatchback (Alto / Mira / WagonR)',
      image_url: '/src/assets/images/fleet_economy_1794584047757.jpg',
      seating_capacity: 3,
      base_fare_pkr: 150,
      per_km_min_pkr: 35,
      per_km_max_pkr: 45,
      waiting_charge_per_min: 5,
      extra_stop_pkr: 50,
      commission_pct: 12,
      services: ['pick_and_drop', 'ride_sharing', 'fuel_sharing'],
      sort_order: 1,
    },
    {
      id: 'fleet-comfort',
      slug: 'comfort',
      name: 'Comfort · کمفرٹ',
      tagline: '4 seats · 2 bags · Hatchback (+Rs 5/km over base)',
      image_url: '/src/assets/images/fleet_comfort_1794584048991.jpg',
      seating_capacity: 4,
      base_fare_pkr: 200,
      per_km_min_pkr: 40,
      per_km_max_pkr: 50,
      waiting_charge_per_min: 6,
      extra_stop_pkr: 60,
      commission_pct: 14,
      services: ['pick_and_drop', 'ride_sharing', 'fuel_sharing'],
      sort_order: 2,
    },
    {
      id: 'fleet-comfort-plus',
      slug: 'comfort-plus',
      name: 'Comfort Plus · کمفرٹ پلس',
      tagline: '4 seats · 2 bags · Sedan (Yaris / City / Swift)',
      image_url: 'https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&w=600&q=80',
      seating_capacity: 4,
      base_fare_pkr: 240,
      per_km_min_pkr: 45,
      per_km_max_pkr: 55,
      waiting_charge_per_min: 7,
      extra_stop_pkr: 70,
      commission_pct: 14,
      services: ['pick_and_drop', 'ride_sharing', 'fuel_sharing'],
      sort_order: 3,
    },
    {
      id: 'fleet-sedan',
      slug: 'sedan',
      name: 'Sedan · سیڈان',
      tagline: '4 seats · 3 bags · Sedan (+Rs 20/km over base, Corolla / Civic)',
      image_url: '/src/assets/images/fleet_sedan_1794584048087.jpg',
      seating_capacity: 4,
      base_fare_pkr: 250,
      per_km_min_pkr: 55,
      per_km_max_pkr: 65,
      waiting_charge_per_min: 8,
      extra_stop_pkr: 75,
      commission_pct: 15,
      services: ['pick_and_drop', 'ride_sharing', 'fuel_sharing'],
      sort_order: 4,
    },
    {
      id: 'fleet-suv',
      slug: 'suv',
      name: 'SUV · ایس یو وی',
      tagline: '6 seats · 4 bags · SUV (Sportage / Tucson / BR-V)',
      image_url: 'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=600&q=80',
      seating_capacity: 6,
      base_fare_pkr: 350,
      per_km_min_pkr: 60,
      per_km_max_pkr: 75,
      waiting_charge_per_min: 10,
      extra_stop_pkr: 100,
      commission_pct: 16,
      services: ['pick_and_drop', 'ride_sharing', 'fuel_sharing'],
      sort_order: 5,
    },
    {
      id: 'fleet-premium',
      slug: 'premium',
      name: 'Premium · پریمیم',
      tagline: '4 seats · 3 bags · Executive Sedan (Chauffeur Class)',
      image_url: '/src/assets/images/fleet_premium_1794584050155.jpg',
      seating_capacity: 4,
      base_fare_pkr: 450,
      per_km_min_pkr: 75,
      per_km_max_pkr: 95,
      waiting_charge_per_min: 12,
      extra_stop_pkr: 120,
      commission_pct: 18,
      services: ['pick_and_drop', 'fuel_sharing'],
      sort_order: 6,
    },
    {
      id: 'fleet-luxury',
      slug: 'luxury',
      name: 'Luxury · لگژری',
      tagline: '4 seats · 4 bags · Luxury Sedan / SUV (+10% VIP Tier)',
      image_url: 'https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=600&q=80',
      seating_capacity: 4,
      base_fare_pkr: 600,
      per_km_min_pkr: 100,
      per_km_max_pkr: 130,
      waiting_charge_per_min: 15,
      extra_stop_pkr: 150,
      commission_pct: 20,
      services: ['pick_and_drop', 'fuel_sharing'],
      sort_order: 7,
    },
    {
      id: 'fleet-van-7',
      slug: 'van-7',
      name: 'Van · 7-seater · وین',
      tagline: '7 seats · 3 bags · Van (7-seater Every / APV)',
      image_url:
        '/assets/aistudio/Meta_AI_925784482_29015387781466701_8792853047057852836_n_20261122_055133.webp_fabebbf9.jpg',
      seating_capacity: 7,
      base_fare_pkr: 300,
      per_km_min_pkr: 20,
      per_km_max_pkr: 30,
      waiting_charge_per_min: 7,
      extra_stop_pkr: 60,
      commission_pct: 15,
      services: ['pick_and_drop', 'ride_sharing'],
      sort_order: 8,
    },
    {
      id: 'fleet-van-12',
      slug: 'van-12',
      name: 'Van · 12-seater · وین',
      tagline: '12 seats · 6 bags · Van (12-seater HiAce)',
      image_url: '/assets/aistudio/IMG_20261122_060330_306_a2637dae.jpg',
      seating_capacity: 12,
      base_fare_pkr: 400,
      per_km_min_pkr: 18,
      per_km_max_pkr: 28,
      waiting_charge_per_min: 8,
      extra_stop_pkr: 80,
      commission_pct: 15,
      services: ['pick_and_drop', 'ride_sharing'],
      sort_order: 9,
    },
    {
      id: 'fleet-van-15',
      slug: 'van-15',
      name: 'Van · 15-seater · وین',
      tagline: '15 seats · 8 bags · Van (15-seater Grand Cabin)',
      image_url: '/assets/aistudio/IMG_20261122_060330_306_a2637dae.jpg',
      seating_capacity: 15,
      base_fare_pkr: 500,
      per_km_min_pkr: 15,
      per_km_max_pkr: 25,
      waiting_charge_per_min: 10,
      extra_stop_pkr: 100,
      commission_pct: 15,
      services: ['pick_and_drop', 'ride_sharing'],
      sort_order: 10,
    },
    {
      id: 'fleet-coaster',
      slug: 'coaster',
      name: 'Coaster / Group Transport · کوسٹر',
      tagline: '28 seats · 15 bags · Coaster (28-seater corporate & university)',
      image_url: '/assets/aistudio/IMG_20261122_060311_220_97064aac.jpg',
      seating_capacity: 28,
      base_fare_pkr: 800,
      per_km_min_pkr: 12,
      per_km_max_pkr: 25,
      waiting_charge_per_min: 12,
      extra_stop_pkr: 150,
      commission_pct: 15,
      services: ['pick_and_drop', 'ride_sharing'],
      sort_order: 11,
    },
    {
      id: 'fleet-bike',
      slug: 'bike',
      name: 'Motorcycle / Bike · موٹر سائیکل',
      tagline: '1 seats · 0 bags · Motorcycle (Express single rider)',
      image_url: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=600&q=80',
      seating_capacity: 1,
      base_fare_pkr: 60,
      per_km_min_pkr: 10,
      per_km_max_pkr: 18,
      waiting_charge_per_min: 3,
      extra_stop_pkr: 25,
      commission_pct: 10,
      services: ['pick_and_drop', 'ride_sharing'],
      sort_order: 12,
    },
    {
      id: 'fleet-rickshaw',
      slug: 'rickshaw',
      name: 'City Rickshaw · رکشہ',
      tagline: '3 seats · 1 bags · Auto Rickshaw (Short-hop city travel)',
      image_url:
        '/assets/aistudio/Meta_AI_916953855_971704292372115_7808137350925664173_n_20261122_055146.webp_4961032e.jpg',
      seating_capacity: 3,
      base_fare_pkr: 80,
      per_km_min_pkr: 15,
      per_km_max_pkr: 22,
      waiting_charge_per_min: 3,
      extra_stop_pkr: 30,
      commission_pct: 12,
      services: ['pick_and_drop'],
      sort_order: 13,
    },
  ];

  for (const item of initialFleet) {
    upsertFleet.run(
      item.id,
      item.slug,
      item.name,
      item.tagline,
      item.image_url,
      item.seating_capacity,
      item.base_fare_pkr,
      item.per_km_min_pkr,
      item.per_km_max_pkr,
      item.waiting_charge_per_min,
      item.extra_stop_pkr,
      item.commission_pct,
      JSON.stringify(item.services),
      1,
      item.sort_order
    );
  }

  // 3. Seed Service Zones
  const zoneCount = (db.prepare('SELECT COUNT(*) as c FROM service_zones').get() as { c: number }).c;
  if (zoneCount === 0) {
    const insertZone = db.prepare(`
      INSERT INTO service_zones (id, city, area_name, center_lat, center_lng, radius_km, demand_level, rickshaw_enabled, rickshaw_rate_pkr, rickshaw_hours, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    insertZone.run('zone-isb-f10', 'Islamabad', 'F-10 / G-10 / F-11 Sectors', 33.6968, 73.0125, 10, 'high', 1, 20, '6 AM - 10 PM');
    insertZone.run('zone-isb-blue', 'Islamabad', 'Blue Area / Centaurus / F-6', 33.7077, 73.0501, 12, 'high', 1, 22, '6 AM - 11 PM');
    insertZone.run('zone-rwp-saddar', 'Rawalpindi', 'Saddar / Bahria Town / Chaklala', 33.5973, 73.0479, 14, 'medium', 1, 20, '6 AM - 10 PM');
    insertZone.run('zone-lhr-gulberg', 'Lahore', 'Mall Road / Liberty / Gulberg', 31.5102, 74.3441, 15, 'high', 1, 22, '6 AM - 11 PM');
    insertZone.run('zone-khi-clifton', 'Karachi', 'Clifton / DHA / Shahrah-e-Faisal', 24.8138, 67.0299, 18, 'medium', 0, 25, '7 AM - 10 PM');
  }

  // 4. Seed Monthly Packages
  const pkgCount = (db.prepare('SELECT COUNT(*) as c FROM monthly_packages').get() as { c: number }).c;
  if (pkgCount === 0) {
    const insertPkg = db.prepare(`
      INSERT INTO monthly_packages (id, name, service_type, vehicle_category_id, duration_days, trips_included, discount_pct, base_monthly_pkr, description, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    insertPkg.run(
      'pkg-office-commute',
      'Office Executive Monthly (22 Days)',
      'pick_and_drop',
      'fleet-sedan',
      22,
      44,
      18,
      26500,
      'Dedicated morning pickup & evening drop-off Mon–Fri with fixed Pro Partner and guaranteed punctuality.',
    );
    insertPkg.run(
      'pkg-university-share',
      'University & College Ride Share (22 Days)',
      'ride_sharing',
      'fleet-economy',
      22,
      44,
      25,
      12800,
      'Verified seat-sharing commuter plan for students & faculty along sector corridors.',
    );
    insertPkg.run(
      'pkg-fuel-pool',
      'Car-Owner Fuel Sharing Pool (30 Days)',
      'fuel_sharing',
      'fleet-comfort',
      30,
      40,
      20,
      15400,
      'Transparent fuel-cost split along daily Islamabad–Rawalpindi and Lahore expressways.',
    );
  }

  // 5. Seed / Upsert Platform Settings
  const insertSetting = db.prepare('INSERT OR IGNORE INTO platform_settings (key, value) VALUES (?, ?)');
  insertSetting.run('go_now_min_offer_pct', '80');
  insertSetting.run('go_now_max_offer_pct', '135');
  insertSetting.run('schedule_default_pickup', '09:15 AM');
  insertSetting.run('schedule_default_drop', '06:00 PM');
  insertSetting.run('schedule_allowed_days', JSON.stringify(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']));
  insertSetting.run('schedule_rate_per_km', '38');
  insertSetting.run('support_whatsapp', '03125007782');
  insertSetting.run('support_email', 'ProRider.pk786@gmail.com');

  // Exact user-specified cross-calculation tariff rules
  insertSetting.run('rate_economy_pick_drop_min', '35');
  insertSetting.run('rate_economy_pick_drop_max', '45');
  insertSetting.run('rate_economy_ride_share_min', '30');
  insertSetting.run('rate_economy_ride_share_max', '40');
  insertSetting.run('rate_economy_fuel_share_min', '20');
  insertSetting.run('rate_economy_fuel_share_max', '30');
  insertSetting.run('rate_comfort_addon_per_km', '5');
  insertSetting.run('rate_sedan_addon_per_km', '20');
  insertSetting.run('rate_luxury_multiplier_pct', '10');
  insertSetting.run('rate_van_7_min', '20');
  insertSetting.run('rate_van_7_max', '30');
  insertSetting.run('rate_van_15_min', '15');
  insertSetting.run('rate_van_15_max', '25');
  insertSetting.run('rate_coaster_min', '12');
  insertSetting.run('rate_coaster_max', '25');

  // 6. Seed Demo Pro Partner & Sample Active Trip (If No Bookings Exist)
  const bookingsCount = (db.prepare('SELECT COUNT(*) as c FROM bookings').get() as { c: number }).c;
  if (bookingsCount === 0) {
    const demoPartnerId = 'PRT-DEMO-01';
    db.prepare(`
      INSERT OR IGNORE INTO users (id, role, full_name, phone, whatsapp, email, password_hash, city, operating_area, phone_verified)
      VALUES (?, 'partner', 'Tariq Mehmood', '03001234567', '03001234567', 'tariq.prorider@gmail.com', ?, 'Islamabad', 'F-10 / Blue Area', 1)
    `).run(demoPartnerId, hashPassword('Tariq@78600'));

    db.prepare(`
      INSERT OR REPLACE INTO partner_profiles (
        user_id, verification_status, cnic_number, cnic_expiry, licence_number, licence_expiry,
        vehicle_category_id, vehicle_name, vehicle_number, seating_capacity, fuel_type, operating_city,
        service_eligibility, is_online, current_lat, current_lng, last_location_at, admin_notes
      ) VALUES (
        ?, 'approved', '61101-1234567-1', '2030-12-31', 'ISB-DL-9821', '2028-06-30',
        'fleet-sedan', 'White Toyota Corolla Altis', 'ICT-LE-482', 4, 'petrol', 'Islamabad',
        ?, 1, 33.7025, 73.0310, datetime('now'), 'Verified Executive Partner'
      )
    `).run(demoPartnerId, JSON.stringify(['pick_and_drop', 'ride_sharing', 'fuel_sharing']));

    const passengerRow = db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('passenger') as
      | { id: string }
      | undefined;
    const passengerId = passengerRow ? passengerRow.id : 'PSG-SAMPLE-01';

    if (!passengerRow) {
      db.prepare(`
        INSERT OR IGNORE INTO users (id, role, full_name, phone, whatsapp, email, password_hash, city, phone_verified)
        VALUES (?, 'passenger', 'Hamza Khan', '03120000000', '03120000000', 'hamza@prorider.pk', ?, 'Islamabad', 1)
      `).run(passengerId, hashPassword('Passenger@123'));
    }

    const sampleBookingId = 'BK-8942-ISB';
    db.prepare(`
      INSERT OR REPLACE INTO bookings (
        id, invoice_number, booking_mode, service_type, passenger_id, partner_id, vehicle_category_id,
        pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
        distance_km, duration_min, seats_requested, pickup_date, pickup_time,
        notes, proposed_fare_pkr, agreed_fare_pkr, total_bill_pkr, payment_status, status,
        confirmed_at, on_the_way_at, created_at, updated_at
      ) VALUES (
        ?, 'INV-PR-8942', 'go_now', 'pick_and_drop', ?, ?, 'fleet-sedan',
        'F-10 Markaz, Islamabad', 33.6968, 73.0125, 'Blue Area, Jinnah Avenue, Islamabad', 33.7077, 73.0501,
        6.8, 16, 1, date('now'), time('now'),
        'Near Centaurus entrance. Trip status sharing active.', 650, 650, 650, 'UNPAID', 'on_the_way',
        datetime('now', '-5 minutes'), datetime('now', '-2 minutes'), datetime('now', '-6 minutes'), datetime('now')
      )
    `).run(sampleBookingId, passengerId, demoPartnerId);
  }
}
