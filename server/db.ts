import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';
import type { Complaint, CivicUser } from '../src/types/civic';

const DB_PATH = path.resolve(process.cwd(), 'civic.db');
const TOKEN_SECRET = process.env.CIVIC_SESSION_SECRET || crypto.createHash('sha256').update(process.cwd() + '_civic_2026').digest('hex');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function signToken(payload: { userId: number; role: string; email: string }): string {
  const data = Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyToken(token: string): { userId: number; role: string; email: string } | null {
  try {
    const [data, sig] = token.split('.');
    if (!data || !sig) return null;
    const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('citizen', 'official')),
      department TEXT,
      language TEXT NOT NULL DEFAULT 'en',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tracking_id TEXT NOT NULL UNIQUE,
      citizen_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      citizen_name TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'en',
      category TEXT NOT NULL,
      department TEXT NOT NULL,
      priority TEXT NOT NULL CHECK(priority IN ('Critical', 'High', 'Medium', 'Low')),
      urgency_score INTEGER NOT NULL DEFAULT 50,
      status TEXT NOT NULL CHECK(status IN ('Submitted', 'Accepted', 'In Progress', 'Resolved', 'Escalated')),
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      address TEXT NOT NULL,
      ward TEXT NOT NULL,
      before_image TEXT,
      after_image TEXT,
      video_data TEXT,
      audio_transcript TEXT,
      ai_summary TEXT,
      ai_image_analysis TEXT,
      ai_duplicate_of TEXT,
      ai_confidence REAL,
      assigned_official_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      assigned_official_name TEXT,
      official_notes TEXT,
      deadline_at TEXT,
      is_overdue INTEGER NOT NULL DEFAULT 0,
      escalated_at TEXT,
      escalation_reason TEXT,
      resolved_at TEXT,
      citizen_rating INTEGER,
      citizen_feedback TEXT,
      community_verifications INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS complaint_timeline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS complaint_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      verifier_name TEXT NOT NULL,
      verified_status TEXT NOT NULL CHECK(verified_status IN ('confirmed_issue', 'confirmed_resolved')),
      comment TEXT,
      created_at TEXT NOT NULL
    );
  `);

  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (userCount === 0) {
    seedInitialData();
  }
}

export function runOverdueAndEscalationCheck(): number {
  const nowIso = new Date().toISOString();
  const overdueRows = db
    .prepare(
      `SELECT id, tracking_id, status, deadline_at, is_overdue
       FROM complaints
       WHERE status != 'Resolved'
         AND deadline_at IS NOT NULL
         AND datetime(deadline_at) < datetime(?)`
    )
    .all(nowIso) as Array<{
      id: number;
      tracking_id: string;
      status: string;
      deadline_at: string;
      is_overdue: number;
    }>;

  let escalatedCount = 0;
  const updateOverdueOnly = db.prepare(
    `UPDATE complaints SET is_overdue = 1, updated_at = ? WHERE id = ?`
  );
  const escalateStmt = db.prepare(
    `UPDATE complaints
     SET is_overdue = 1,
         status = 'Escalated',
         escalated_at = COALESCE(escalated_at, ?),
         escalation_reason = COALESCE(escalation_reason, 'Automatic escalation: SLA resolution deadline exceeded'),
         updated_at = ?
     WHERE id = ?`
  );
  const insertTimeline = db.prepare(
    `INSERT INTO complaint_timeline (complaint_id, actor_name, actor_role, action, note, created_at)
     VALUES (?, 'CIVIC SLA Engine', 'system', ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    for (const row of overdueRows) {
      if (row.status !== 'Escalated') {
        escalateStmt.run(nowIso, nowIso, row.id);
        insertTimeline.run(
          row.id,
          'Auto-Escalated (Overdue)',
          `Complaint ${row.tracking_id} exceeded SLA deadline (${new Date(row.deadline_at).toLocaleDateString()}) and was escalated to Commissioner oversight.`,
          nowIso
        );
        escalatedCount++;
      } else if (!row.is_overdue) {
        updateOverdueOnly.run(nowIso, row.id);
      }
    }
  });

  tx();
  return escalatedCount;
}

export function getPublicUser(row: Record<string, unknown> | undefined): CivicUser | null {
  if (!row) return null;
  return {
    id: row.id as number,
    name: row.name as string,
    email: row.email as string,
    role: row.role as 'citizen' | 'official',
    department: (row.department as string | null) ?? null,
    language: (row.language as 'en' | 'kn') ?? 'en',
    created_at: row.created_at as string,
  };
}

export function generateTrackingId(): string {
  const row = db.prepare('SELECT MAX(id) as maxId FROM complaints').get() as { maxId: number | null };
  const nextNum = 1001 + (row.maxId ?? 0);
  return `CIV-2026-${nextNum}`;
}

function daysAgo(days: number, hoursOffset = 0): string {
  return new Date(Date.now() - days * 86400000 + hoursOffset * 3600000).toISOString();
}

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3600000).toISOString();
}

function seedInitialData(): void {
  const now = new Date().toISOString();

  const insertUser = db.prepare(
    `INSERT INTO users (name, email, password_hash, role, department, language, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const citizenRes = insertUser.run(
    'Ananya Rao',
    'citizen@civic.gov.in',
    hashPassword('citizen123'),
    'citizen',
    null,
    'en',
    daysAgo(45)
  );
  const citizen2Res = insertUser.run(
    'Karthik Gowda',
    'karthik@civic.gov.in',
    hashPassword('citizen123'),
    'citizen',
    null,
    'kn',
    daysAgo(30)
  );
  const officialAllRes = insertUser.run(
    'Dr. Rajeshwari Kulkarni',
    'official@civic.gov.in',
    hashPassword('official123'),
    'official',
    'All Departments',
    'en',
    daysAgo(90)
  );
  const roadsOfficialRes = insertUser.run(
    'Suresh Babu N.',
    'roads@civic.gov.in',
    hashPassword('official123'),
    'official',
    'Roads & Infrastructure',
    'en',
    daysAgo(90)
  );
  const waterOfficialRes = insertUser.run(
    'Meenakshi Iyer',
    'water@civic.gov.in',
    hashPassword('official123'),
    'official',
    'Water Supply & Drainage',
    'en',
    daysAgo(90)
  );

  const citizen1Id = Number(citizenRes.lastInsertRowid);
  const citizen2Id = Number(citizen2Res.lastInsertRowid);
  const officialAllId = Number(officialAllRes.lastInsertRowid);
  const roadsOfficialId = Number(roadsOfficialRes.lastInsertRowid);
  const waterOfficialId = Number(waterOfficialRes.lastInsertRowid);

  const insertComplaint = db.prepare(`
    INSERT INTO complaints (
      tracking_id, citizen_id, citizen_name, title, description, language,
      category, department, priority, urgency_score, status,
      latitude, longitude, address, ward,
      before_image, after_image, video_data, audio_transcript,
      ai_summary, ai_image_analysis, ai_duplicate_of, ai_confidence,
      assigned_official_id, assigned_official_name, official_notes,
      deadline_at, is_overdue, escalated_at, escalation_reason, resolved_at,
      citizen_rating, citizen_feedback, community_verifications, created_at, updated_at
    ) VALUES (
      @tracking_id, @citizen_id, @citizen_name, @title, @description, @language,
      @category, @department, @priority, @urgency_score, @status,
      @latitude, @longitude, @address, @ward,
      @before_image, @after_image, @video_data, @audio_transcript,
      @ai_summary, @ai_image_analysis, @ai_duplicate_of, @ai_confidence,
      @assigned_official_id, @assigned_official_name, @official_notes,
      @deadline_at, @is_overdue, @escalated_at, @escalation_reason, @resolved_at,
      @citizen_rating, @citizen_feedback, @community_verifications, @created_at, @updated_at
    )
  `);

  const insertTimeline = db.prepare(
    `INSERT INTO complaint_timeline (complaint_id, actor_name, actor_role, action, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const insertVerify = db.prepare(
    `INSERT INTO complaint_verifications (complaint_id, user_id, verifier_name, verified_status, comment, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const seeds = [
    {
      tracking_id: 'CIV-2026-1001',
      citizen_id: citizen1Id,
      citizen_name: 'Ananya Rao',
      title: 'Deep water-logged pothole on 80 Feet Road near Indiranagar Metro',
      description:
        'A 4-foot wide crater has formed in the left lane of 80 Feet Road causing two-wheelers to skid during evening peak traffic. Rainwater obscures the depth.',
      language: 'en',
      category: 'Road Damage',
      department: 'Roads & Infrastructure',
      priority: 'High',
      urgency_score: 86,
      status: 'Resolved',
      latitude: 12.9784,
      longitude: 77.6408,
      address: '80 Feet Road, Near CMH Junction, Indiranagar',
      ward: 'Ward 80 · Indiranagar',
      before_image: '/src/assets/images/civic_road_pothole_before_1794640306608.jpg',
      after_image: '/src/assets/images/civic_road_repaired_after_1794640307191.jpg',
      video_data: null,
      audio_transcript: null,
      ai_summary:
        'High-risk carriageway pothole on 80 Feet Road arterial corridor affecting commuters and two-wheelers; routed to Roads & Infrastructure for hot-mix patching.',
      ai_image_analysis:
        'Detected fractured asphalt surface with standing water pooling inside an ~1.2m diameter crater adjacent to active urban traffic.',
      ai_duplicate_of: null,
      ai_confidence: 0.96,
      assigned_official_id: roadsOfficialId,
      assigned_official_name: 'Suresh Babu N.',
      official_notes: 'Milled damaged asphalt layer, laid hot-mix bitumen patch, and repainted lane markings.',
      deadline_at: daysAgo(9),
      is_overdue: 0,
      escalated_at: null,
      escalation_reason: null,
      resolved_at: daysAgo(10),
      citizen_rating: 5,
      citizen_feedback: 'Road surface was resurfaced within 36 hours. Very smooth commute now.',
      community_verifications: 18,
      created_at: daysAgo(12),
      updated_at: daysAgo(10),
    },
    {
      tracking_id: 'CIV-2026-1002',
      citizen_id: citizen2Id,
      citizen_name: 'Karthik Gowda',
      title: 'Burst drinking water main leaking onto 11th Cross Malleshwaram',
      description:
        'Underground BWSSB supply valve fractured near 11th Cross sidewalk, causing continuous clean water wastage and slippery pavement for pedestrians.',
      language: 'en',
      category: 'Water Leakage',
      department: 'Water Supply & Drainage',
      priority: 'Critical',
      urgency_score: 94,
      status: 'Resolved',
      latitude: 13.0031,
      longitude: 77.5696,
      address: '11th Cross Road, Malleshwaram',
      ward: 'Ward 65 · Malleshwaram',
      before_image: '/src/assets/images/civic_water_leak_before_1794640307370.jpg',
      after_image: '/src/assets/images/civic_water_repaired_after_1794640308122.jpg',
      video_data: null,
      audio_transcript: null,
      ai_summary:
        'Critical potable water main rupture at Malleshwaram 11th Cross causing rapid water loss and pedestrian hazard.',
      ai_image_analysis:
        'High-pressure pressurized water jet emerging from damaged street-side valve box with extensive surface runoff.',
      ai_duplicate_of: null,
      ai_confidence: 0.97,
      assigned_official_id: waterOfficialId,
      assigned_official_name: 'Meenakshi Iyer',
      official_notes: 'Isolated sub-main valve, replaced corroded cast-iron collar, and restored concrete footpath slab.',
      deadline_at: daysAgo(6),
      is_overdue: 0,
      escalated_at: null,
      escalation_reason: null,
      resolved_at: daysAgo(7),
      citizen_rating: 5,
      citizen_feedback: 'Emergency crew arrived same evening and sealed the concrete slab cleanly.',
      community_verifications: 14,
      created_at: daysAgo(8),
      updated_at: daysAgo(7),
    },
    {
      tracking_id: 'CIV-2026-1003',
      citizen_id: citizen1Id,
      citizen_name: 'Ananya Rao',
      title: 'Uncollected waste pile & overflowing bins near Jayanagar 4th Block',
      description:
        'Municipal waste bins at the residential corner have not been cleared for 4 days, attracting stray dogs and creating foul odor near the bus stop.',
      language: 'en',
      category: 'Garbage Accumulation',
      department: 'Sanitation & Waste',
      priority: 'Medium',
      urgency_score: 68,
      status: 'Resolved',
      latitude: 12.925,
      longitude: 77.5938,
      address: '9th Main, 4th Block, Jayanagar',
      ward: 'Ward 168 · Jayanagar',
      before_image: '/src/assets/images/civic_garbage_before_1794640309052.jpg',
      after_image: '/src/assets/images/civic_garbage_repaired_after_1794640308203.jpg',
      video_data: null,
      audio_transcript: null,
      ai_summary:
        'Overflowing street-corner solid waste bins at Jayanagar 4th Block requiring compactor clearance and bin sanitization.',
      ai_image_analysis:
        'Four municipal wheeled bins overflowing with unsegregated waste bags spilling onto pedestrian curb.',
      ai_duplicate_of: null,
      ai_confidence: 0.95,
      assigned_official_id: officialAllId,
      assigned_official_name: 'Dr. Rajeshwari Kulkarni',
      official_notes: 'Cleared accumulated waste via ward compactor, sanitized corner, and installed segregated green/blue bins.',
      deadline_at: daysAgo(4),
      is_overdue: 0,
      escalated_at: null,
      escalation_reason: null,
      resolved_at: daysAgo(5),
      citizen_rating: 4,
      citizen_feedback: 'Street corner is clean and segregated bins are now in place.',
      community_verifications: 11,
      created_at: daysAgo(6),
      updated_at: daysAgo(5),
    },
    {
      tracking_id: 'CIV-2026-1004',
      citizen_id: citizen2Id,
      citizen_name: 'Karthik Gowda',
      title: 'ಕೋರಮಂಗಲ 4ನೇ ಬ್ಲಾಕ್‌ನಲ್ಲಿ ಒಳಚರಂಡಿ ನೀರು ರಸ್ತೆಗೆ ಹರಿಯುತ್ತಿದೆ',
      description:
        'ಕೋರಮಂಗಲ 80 ಅಡಿ ರಸ್ತೆಯ ಪಕ್ಕದ ಮ್ಯಾನ್‌ಹೋಲ್‌ನಿಂದ ಕೊಳಚೆ ನೀರು ಉಕ್ಕಿ ಹರಿಯುತ್ತಿದ್ದು, ಶಾಲಾ ಮಕ್ಕಳಿಗೆ ಮತ್ತು ಪಾದಚಾರಿಗಳಿಗೆ ತೀವ್ರ ತೊಂದರೆಯಾಗುತ್ತಿದೆ.',
      language: 'kn',
      category: 'Sewage Overflow',
      department: 'Sewerage & Public Health',
      priority: 'Critical',
      urgency_score: 92,
      status: 'Escalated',
      latitude: 12.9352,
      longitude: 77.6245,
      address: 'Koramangala 4th Block, 80 Feet Road',
      ward: 'Ward 151 · Koramangala',
      before_image: null,
      after_image: null,
      video_data: null,
      audio_transcript: 'ಕೋರಮಂಗಲ ನಾಲ್ಕನೇ ಬ್ಲಾಕ್ ಶಾಲೆಯ ಹತ್ತಿರ ಮ್ಯಾನ್‌ಹೋಲ್ ತುಂಬಿ ರಸ್ತೆಯಲ್ಲಿ ಕೊಳಚೆ ನೀರು ನಿಂತಿದೆ.',
      ai_summary:
        '[Translated from Kannada] Severe manhole sewage overflow on Koramangala 4th Block near school zone posing an urgent public health and sanitation hazard.',
      ai_image_analysis: null,
      ai_duplicate_of: null,
      ai_confidence: 0.94,
      assigned_official_id: officialAllId,
      assigned_official_name: 'Dr. Rajeshwari Kulkarni',
      official_notes: 'Jetting truck dispatched; awaiting main trunk desilting clearance.',
      deadline_at: daysAgo(1),
      is_overdue: 1,
      escalated_at: daysAgo(1),
      escalation_reason: 'Automatic escalation: SLA resolution deadline exceeded',
      resolved_at: null,
      citizen_rating: null,
      citizen_feedback: null,
      community_verifications: 23,
      created_at: daysAgo(4),
      updated_at: daysAgo(1),
    },
    {
      tracking_id: 'CIV-2026-1005',
      citizen_id: citizen1Id,
      citizen_name: 'Ananya Rao',
      title: '14 consecutive streetlights out along Outer Ring Road service lane',
      description:
        'Streetlight feeder pillar near Bellandur Gate has tripped for 3 nights straight, leaving a 600m pedestrian stretch completely dark after 6:30 PM.',
      language: 'en',
      category: 'Streetlight Failure',
      department: 'Electrical & Streetlights',
      priority: 'High',
      urgency_score: 83,
      status: 'Escalated',
      latitude: 12.9279,
      longitude: 77.6762,
      address: 'Outer Ring Road Service Lane, Bellandur Gate',
      ward: 'Ward 150 · Bellandur',
      before_image: null,
      after_image: null,
      video_data: null,
      audio_transcript: null,
      ai_summary:
        'Extended 600m streetlight outage along Bellandur ORR service lane creating nighttime pedestrian safety risk; feeder breaker inspection needed.',
      ai_image_analysis: null,
      ai_duplicate_of: null,
      ai_confidence: 0.91,
      assigned_official_id: officialAllId,
      assigned_official_name: 'Dr. Rajeshwari Kulkarni',
      official_notes: 'Electrical crew identified underground cable fault; trench repair scheduled.',
      deadline_at: daysAgo(0, -12),
      is_overdue: 1,
      escalated_at: now,
      escalation_reason: 'Automatic escalation: SLA resolution deadline exceeded',
      resolved_at: null,
      citizen_rating: null,
      citizen_feedback: null,
      community_verifications: 19,
      created_at: daysAgo(3),
      updated_at: now,
    },
    {
      tracking_id: 'CIV-2026-1006',
      citizen_id: citizen1Id,
      citizen_name: 'Ananya Rao',
      title: 'Stormwater drain grating collapsed near Whitefield ITPL Main Road',
      description:
        'Heavy truck traffic bent the iron stormwater grate near Graphite India signal, creating an open 2-foot drop on the road shoulder.',
      language: 'en',
      category: 'Drainage Blockage',
      department: 'Water Supply & Drainage',
      priority: 'High',
      urgency_score: 80,
      status: 'In Progress',
      latitude: 12.9817,
      longitude: 77.7289,
      address: 'ITPL Main Road, Graphite India Signal, Whitefield',
      ward: 'Ward 84 · Whitefield',
      before_image: null,
      after_image: null,
      video_data: null,
      audio_transcript: null,
      ai_summary:
        'Damaged stormwater drain cover on ITPL Main Road shoulder posing vehicle and pedestrian fall hazard; heavy-duty replacement grate required.',
      ai_image_analysis: null,
      ai_duplicate_of: null,
      ai_confidence: 0.89,
      assigned_official_id: waterOfficialId,
      assigned_official_name: 'Meenakshi Iyer',
      official_notes: 'Barricaded hazard zone; prefabricated RCC slab and ductile iron grate en route.',
      deadline_at: hoursFromNow(18),
      is_overdue: 0,
      escalated_at: null,
      escalation_reason: null,
      resolved_at: null,
      citizen_rating: null,
      citizen_feedback: null,
      community_verifications: 9,
      created_at: daysAgo(1, -6),
      updated_at: daysAgo(0, -8),
    },
    {
      tracking_id: 'CIV-2026-1007',
      citizen_id: citizen2Id,
      citizen_name: 'Karthik Gowda',
      title: 'Severe road cave-in near Rajajinagar 1st Block Bus Stand',
      description:
        'Asphalt has sunken by nearly 8 inches right where BMTC buses halt, causing heavy jolts and water stagnation.',
      language: 'en',
      category: 'Road Damage',
      department: 'Roads & Infrastructure',
      priority: 'High',
      urgency_score: 79,
      status: 'Accepted',
      latitude: 12.9982,
      longitude: 77.553,
      address: 'Dr Rajkumar Road, 1st Block, Rajajinagar',
      ward: 'Ward 98 · Rajajinagar',
      before_image: '/src/assets/images/civic_road_pothole_before_1794640306608.jpg',
      after_image: null,
      video_data: null,
      audio_transcript: null,
      ai_summary:
        'Sub-grade road depression at Rajajinagar bus bay affecting public transit stops; requires base compaction and resurfacing.',
      ai_image_analysis:
        'Surface fracture and pooled runoff visible across high-load urban carriageway.',
      ai_duplicate_of: null,
      ai_confidence: 0.92,
      assigned_official_id: roadsOfficialId,
      assigned_official_name: 'Suresh Babu N.',
      official_notes: 'Site inspection logged; assigned to Ward 98 night resurfacing batch.',
      deadline_at: hoursFromNow(36),
      is_overdue: 0,
      escalated_at: null,
      escalation_reason: null,
      resolved_at: null,
      citizen_rating: null,
      citizen_feedback: null,
      community_verifications: 7,
      created_at: daysAgo(1),
      updated_at: daysAgo(0, -10),
    },
    {
      tracking_id: 'CIV-2026-1008',
      citizen_id: citizen2Id,
      citizen_name: 'Karthik Gowda',
      title: 'ಮಲ್ಲೇಶ್ವರಂ 18ನೇ ಕ್ರಾಸ್ ಹತ್ತಿರ ಕಸ ವಿಲೇವಾರಿ ವಿಳಂಬ',
      description:
        'ಮನೆಗಳಿಂದ ಕಸ ಸಂಗ್ರಹಿಸುವ ವಾಹನ ಕಳೆದ 3 ದಿನಗಳಿಂದ ಬಂದಿಲ್ಲ. ಬೀದಿ ಬದಿಯಲ್ಲಿ ಕಸ ರಾಶಿ ಬಿದ್ದಿದೆ.',
      language: 'kn',
      category: 'Garbage Accumulation',
      department: 'Sanitation & Waste',
      priority: 'Medium',
      urgency_score: 64,
      status: 'Submitted',
      latitude: 13.0115,
      longitude: 77.5681,
      address: '18th Cross, Malleshwaram',
      ward: 'Ward 65 · Malleshwaram',
      before_image: '/src/assets/images/civic_garbage_before_1794640309052.jpg',
      after_image: null,
      video_data: null,
      audio_transcript: null,
      ai_summary:
        '[Translated from Kannada] Missed door-to-door waste collection for 3 days at Malleshwaram 18th Cross leading to curbside garbage accumulation.',
      ai_image_analysis:
        'Accumulated plastic waste bags and overflowing residential bins beside footpath.',
      ai_duplicate_of: null,
      ai_confidence: 0.9,
      assigned_official_id: null,
      assigned_official_name: null,
      official_notes: null,
      deadline_at: hoursFromNow(48),
      is_overdue: 0,
      escalated_at: null,
      escalation_reason: null,
      resolved_at: null,
      citizen_rating: null,
      citizen_feedback: null,
      community_verifications: 5,
      created_at: daysAgo(0, -5),
      updated_at: daysAgo(0, -5),
    },
    {
      tracking_id: 'CIV-2026-1009',
      citizen_id: citizen1Id,
      citizen_name: 'Ananya Rao',
      title: 'Secondary pothole cluster reported 120m west of Koramangala BDA Complex',
      description:
        'Multiple shallow potholes have widened after overnight showers near the BDA complex turn.',
      language: 'en',
      category: 'Road Damage',
      department: 'Roads & Infrastructure',
      priority: 'Medium',
      urgency_score: 62,
      status: 'In Progress',
      latitude: 12.9345,
      longitude: 77.6285,
      address: '3rd Block, Near BDA Complex, Koramangala',
      ward: 'Ward 151 · Koramangala',
      before_image: null,
      after_image: null,
      video_data: null,
      audio_transcript: null,
      ai_summary:
        'Cluster of rain-widened potholes near Koramangala BDA Complex causing traffic slowdowns.',
      ai_image_analysis: null,
      ai_duplicate_of: null,
      ai_confidence: 0.88,
      assigned_official_id: roadsOfficialId,
      assigned_official_name: 'Suresh Babu N.',
      official_notes: 'Cold-mix emergency patching crew assigned for evening shift.',
      deadline_at: hoursFromNow(28),
      is_overdue: 0,
      escalated_at: null,
      escalation_reason: null,
      resolved_at: null,
      citizen_rating: null,
      citizen_feedback: null,
      community_verifications: 6,
      created_at: daysAgo(2),
      updated_at: daysAgo(0, -14),
    },
    {
      tracking_id: 'CIV-2026-1010',
      citizen_id: citizen1Id,
      citizen_name: 'Ananya Rao',
      title: 'Water pipeline joint seepage on HSR Layout 27th Main',
      description:
        'Continuous trickle from underground service joint pooling along the curb near Sector 1 park.',
      language: 'en',
      category: 'Water Leakage',
      department: 'Water Supply & Drainage',
      priority: 'Medium',
      urgency_score: 66,
      status: 'Submitted',
      latitude: 12.9121,
      longitude: 77.6446,
      address: '27th Main Road, Sector 1, HSR Layout',
      ward: 'Ward 174 · HSR Layout',
      before_image: '/src/assets/images/civic_water_leak_before_1794640307370.jpg',
      after_image: null,
      video_data: null,
      audio_transcript: null,
      ai_summary:
        'Subsurface water distribution joint seepage on HSR 27th Main causing road-edge water logging.',
      ai_image_analysis:
        'Active water flow pooling along concrete curb indicating pressurized supply pipe leak.',
      ai_duplicate_of: null,
      ai_confidence: 0.91,
      assigned_official_id: null,
      assigned_official_name: null,
      official_notes: null,
      deadline_at: hoursFromNow(40),
      is_overdue: 0,
      escalated_at: null,
      escalation_reason: null,
      resolved_at: null,
      citizen_rating: null,
      citizen_feedback: null,
      community_verifications: 4,
      created_at: daysAgo(0, -3),
      updated_at: daysAgo(0, -3),
    },
  ];

  for (const s of seeds) {
    const info = insertComplaint.run(s);
    const cid = Number(info.lastInsertRowid);
    insertTimeline.run(
      cid,
      s.citizen_name,
      'citizen',
      'Complaint Submitted',
      `Filed grievance ${s.tracking_id} under ${s.category}.`,
      s.created_at
    );
    if (s.status !== 'Submitted') {
      insertTimeline.run(
        cid,
        s.assigned_official_name || 'Department Desk',
        'official',
        'Complaint Accepted',
        `Assigned to ${s.department} with SLA deadline.`,
        daysAgo(Math.max(0, 2))
      );
    }
    if (s.status === 'Escalated') {
      insertTimeline.run(
        cid,
        'CIVIC SLA Engine',
        'system',
        'Auto-Escalated (Overdue)',
        s.escalation_reason || 'SLA deadline exceeded.',
        s.escalated_at || now
      );
    }
    if (s.status === 'Resolved' && s.resolved_at) {
      insertTimeline.run(
        cid,
        s.assigned_official_name || 'Department Desk',
        'official',
        'Resolved with Verification Photo',
        s.official_notes || 'Issue resolved and verified.',
        s.resolved_at
      );
      insertVerify.run(
        cid,
        s.citizen_id,
        'Neighborhood Resident',
        'confirmed_resolved',
        'Confirmed repair completed on site.',
        s.resolved_at
      );
    }
  }
}

export function getComplaintByIdOrTracking(idOrTracking: string | number): Complaint | null {
  const row =
    typeof idOrTracking === 'number' || /^\d+$/.test(String(idOrTracking))
      ? db.prepare('SELECT * FROM complaints WHERE id = ?').get(Number(idOrTracking))
      : db.prepare('SELECT * FROM complaints WHERE upper(tracking_id) = upper(?)').get(String(idOrTracking).trim());

  if (!row) return null;
  const complaint = row as Complaint;
  complaint.timeline = db
    .prepare('SELECT * FROM complaint_timeline WHERE complaint_id = ? ORDER BY datetime(created_at) ASC, id ASC')
    .all(complaint.id) as Complaint['timeline'];
  complaint.verifications = db
    .prepare('SELECT * FROM complaint_verifications WHERE complaint_id = ? ORDER BY datetime(created_at) DESC LIMIT 20')
    .all(complaint.id) as Complaint['verifications'];
  return complaint;
}
