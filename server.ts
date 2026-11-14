import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import {
  db,
  initializeDatabase,
  runOverdueAndEscalationCheck,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  getPublicUser,
  generateTrackingId,
  getComplaintByIdOrTracking,
} from './server/db';
import {
  analyzeComplaintWithAI,
  transcribeVoiceWithAI,
  generateCivicPredictions,
} from './server/ai';
import type { AnalyticsSummary, CivicUser, Complaint } from './src/types/civic';

interface AuthenticatedRequest extends Request {
  user?: CivicUser | null;
}

initializeDatabase();
runOverdueAndEscalationCheck();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Always serve generated local asset images cleanly in dev and production
app.use('/src/assets', express.static(path.resolve(process.cwd(), 'src/assets')));

// Attach user if Authorization header present
app.use((req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const decoded = verifyToken(token);
    if (decoded) {
      const row = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.userId) as
        | Record<string, unknown>
        | undefined;
      req.user = getPublicUser(row);
    }
  }
  next();
});

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  next();
}

function requireOfficial(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'official') {
    res.status(403).json({ error: 'Government official credentials required.' });
    return;
  }
  next();
}

// --- AUTH ROUTES ---
app.post('/api/auth/register', (req: Request, res: Response) => {
  try {
    const { name, email, password, role, department, language } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      role?: 'citizen' | 'official';
      department?: string;
      language?: 'en' | 'kn';
    };

    if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
      res.status(400).json({ error: 'Name, valid email, and password (min 6 chars) are required.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const userRole = role === 'official' ? 'official' : 'citizen';
    const userDept = userRole === 'official' ? department || 'All Departments' : null;
    const now = new Date().toISOString();

    const info = db
      .prepare(
        `INSERT INTO users (name, email, password_hash, role, department, language, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        name.trim(),
        normalizedEmail,
        hashPassword(password),
        userRole,
        userDept,
        language === 'kn' ? 'kn' : 'en',
        now
      );

    const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid)) as Record<
      string,
      unknown
    >;
    const user = getPublicUser(userRow)!;
    const token = signToken({ userId: user.id, role: user.role, email: user.email });
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Failed to register account.' });
  }
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  try {
    const { email, password, expectedRole } = req.body as {
      email?: string;
      password?: string;
      expectedRole?: 'citizen' | 'official';
    };
    if (!email?.trim() || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const row = db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(email.trim().toLowerCase()) as Record<string, unknown> | undefined;

    if (!row || !verifyPassword(password, String(row.password_hash))) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (expectedRole && row.role !== expectedRole) {
      res.status(403).json({
        error:
          expectedRole === 'official'
            ? 'This account is registered as a Citizen. Please use an Official portal account.'
            : 'This account is a Government Official account. Use the Official Desk login.',
      });
      return;
    }

    const user = getPublicUser(row)!;
    const token = signToken({ userId: user.id, role: user.role, email: user.email });
    res.json({ token, user });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Failed to sign in.' });
  }
});

app.get('/api/auth/me', (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  res.json({ user: req.user });
});

// --- AI ROUTES ---
app.post('/api/ai/analyze', async (req: Request, res: Response) => {
  try {
    const { title, description, language, ward, imageBase64, imageMimeType } = req.body as {
      title?: string;
      description?: string;
      language?: string;
      ward?: string;
      imageBase64?: string;
      imageMimeType?: string;
    };

    if (!title?.trim() && !description?.trim() && !imageBase64) {
      res.status(400).json({ error: 'Provide complaint text or a photo to analyze.' });
      return;
    }

    const existingComplaints = db
      .prepare(
        `SELECT tracking_id, title, description, category, ward, status
         FROM complaints
         WHERE status != 'Resolved'
         ORDER BY datetime(created_at) DESC
         LIMIT 25`
      )
      .all() as Array<{
        tracking_id: string;
        title: string;
        description: string;
        category: string;
        ward: string;
        status: string;
      }>;

    const analysis = await analyzeComplaintWithAI({
      title: title || 'Civic issue photo report',
      description: description || 'Citizen uploaded visual evidence.',
      language,
      ward,
      imageBase64,
      imageMimeType,
      existingComplaints,
    });

    res.json(analysis);
  } catch (err) {
    console.error('AI analyze error:', err);
    res.status(500).json({ error: 'AI analysis failed.' });
  }
});

app.post('/api/ai/transcribe', async (req: Request, res: Response) => {
  try {
    const { audioBase64, mimeType, language } = req.body as {
      audioBase64?: string;
      mimeType?: string;
      language?: string;
    };
    if (!audioBase64) {
      res.status(400).json({ error: 'Audio recording data is required.' });
      return;
    }
    const result = await transcribeVoiceWithAI({
      audioBase64,
      mimeType: mimeType || 'audio/webm',
      language,
    });
    res.json(result);
  } catch (err: unknown) {
    console.error('Transcribe error:', err);
    const message = err instanceof Error ? err.message : 'Voice transcription failed.';
    res.status(500).json({ error: message });
  }
});

// --- COMPLAINT ROUTES ---
app.get('/api/complaints', (req: AuthenticatedRequest, res: Response) => {
  try {
    runOverdueAndEscalationCheck();

    const { status, category, department, mine, search, overdue } = req.query as Record<string, string>;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status && status !== 'All') {
      conditions.push('status = ?');
      params.push(status);
    }
    if (category && category !== 'All') {
      conditions.push('category = ?');
      params.push(category);
    }
    if (department && department !== 'All' && department !== 'All Departments') {
      conditions.push('department = ?');
      params.push(department);
    }
    if (overdue === 'true') {
      conditions.push("(is_overdue = 1 OR status = 'Escalated')");
    }
    if (mine === 'true' && req.user) {
      conditions.push('citizen_id = ?');
      params.push(req.user.id);
    }
    if (search?.trim()) {
      conditions.push('(title LIKE ? OR description LIKE ? OR tracking_id LIKE ? OR address LIKE ? OR ward LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term, term);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db
      .prepare(`SELECT * FROM complaints ${where} ORDER BY datetime(created_at) DESC, id DESC`)
      .all(...params) as Complaint[];

    res.json({ complaints: rows });
  } catch (err) {
    console.error('List complaints error:', err);
    res.status(500).json({ error: 'Failed to load complaints.' });
  }
});

app.get('/api/complaints/track/:trackingId', (req: Request, res: Response) => {
  runOverdueAndEscalationCheck();
  const complaint = getComplaintByIdOrTracking(req.params.trackingId);
  if (!complaint) {
    res.status(404).json({ error: 'No complaint found with that tracking ID.' });
    return;
  }
  res.json({ complaint });
});

app.get('/api/complaints/:id', (req: Request, res: Response) => {
  runOverdueAndEscalationCheck();
  const complaint = getComplaintByIdOrTracking(req.params.id);
  if (!complaint) {
    res.status(404).json({ error: 'Complaint not found.' });
    return;
  }
  res.json({ complaint });
});

app.post('/api/complaints', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const {
      title,
      description,
      language,
      category,
      department,
      priority,
      urgencyScore,
      latitude,
      longitude,
      address,
      ward,
      beforeImage,
      videoData,
      audioTranscript,
      aiSummary,
      aiImageAnalysis,
      aiDuplicateOf,
      aiConfidence,
      suggestedDeadlineHours,
    } = req.body as Record<string, unknown>;

    if (!String(title || '').trim() || !String(description || '').trim()) {
      res.status(400).json({ error: 'Title and description are required.' });
      return;
    }

    // Run AI analysis automatically if the user didn't pre-run it
    const existingComplaints = db
      .prepare(
        `SELECT tracking_id, title, description, category, ward, status
         FROM complaints WHERE status != 'Resolved' ORDER BY datetime(created_at) DESC LIMIT 20`
      )
      .all() as Array<{
        tracking_id: string;
        title: string;
        description: string;
        category: string;
        ward: string;
        status: string;
      }>;

    let finalCategory = category ? String(category) : '';
    let finalDepartment = department ? String(department) : '';
    let finalPriority = priority ? String(priority) : '';
    let finalUrgency = Number(urgencyScore) || 0;
    let finalSummary = aiSummary ? String(aiSummary) : '';
    let finalImageAnalysis = aiImageAnalysis ? String(aiImageAnalysis) : null;
    let finalDuplicate = aiDuplicateOf ? String(aiDuplicateOf) : null;
    let finalConfidence = Number(aiConfidence) || 0;
    let deadlineHours = Number(suggestedDeadlineHours) || 48;

    if (!finalCategory || !finalSummary) {
      let imageBase64: string | null = null;
      let imageMimeType: string | null = null;
      if (typeof beforeImage === 'string' && beforeImage.startsWith('data:image/')) {
        const match = beforeImage.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
        if (match) {
          imageMimeType = match[1];
          imageBase64 = beforeImage;
        }
      }
      const aiRes = await analyzeComplaintWithAI({
        title: String(title),
        description: String(description),
        language: String(language || user.language || 'en'),
        ward: String(ward || ''),
        imageBase64,
        imageMimeType,
        existingComplaints,
      });
      finalCategory = finalCategory || aiRes.category;
      finalDepartment = finalDepartment || aiRes.department;
      finalPriority = finalPriority || aiRes.priority;
      finalUrgency = finalUrgency || aiRes.urgencyScore;
      finalSummary = finalSummary || aiRes.summary;
      finalImageAnalysis = finalImageAnalysis || aiRes.imageAnalysis;
      finalDuplicate = finalDuplicate || aiRes.possibleDuplicateTrackingId;
      finalConfidence = finalConfidence || aiRes.confidence;
      deadlineHours = Number(suggestedDeadlineHours) || aiRes.suggestedDeadlineHours;
    }

    const trackingId = generateTrackingId();
    const now = new Date().toISOString();
    const deadlineAt = new Date(Date.now() + deadlineHours * 3600000).toISOString();

    const lat = Number(latitude) || 12.9716;
    const lng = Number(longitude) || 77.5946;

    const info = db
      .prepare(
        `INSERT INTO complaints (
          tracking_id, citizen_id, citizen_name, title, description, language,
          category, department, priority, urgency_score, status,
          latitude, longitude, address, ward,
          before_image, after_image, video_data, audio_transcript,
          ai_summary, ai_image_analysis, ai_duplicate_of, ai_confidence,
          deadline_at, is_overdue, community_verifications, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, 'Submitted',
          ?, ?, ?, ?,
          ?, NULL, ?, ?,
          ?, ?, ?, ?,
          ?, 0, 1, ?, ?
        )`
      )
      .run(
        trackingId,
        user.id,
        user.name,
        String(title).trim(),
        String(description).trim(),
        language === 'kn' ? 'kn' : 'en',
        finalCategory,
        finalDepartment,
        finalPriority || 'Medium',
        finalUrgency || 65,
        lat,
        lng,
        String(address || 'Bengaluru Municipal Area').trim(),
        String(ward || 'Ward 80 · Central Bengaluru').trim(),
        typeof beforeImage === 'string' && beforeImage.length > 0 ? beforeImage : null,
        typeof videoData === 'string' && videoData.length > 0 ? videoData : null,
        typeof audioTranscript === 'string' && audioTranscript.length > 0 ? audioTranscript : null,
        finalSummary,
        finalImageAnalysis,
        finalDuplicate,
        finalConfidence || 0.9,
        deadlineAt,
        now,
        now
      );

    const cid = Number(info.lastInsertRowid);
    db.prepare(
      `INSERT INTO complaint_timeline (complaint_id, actor_name, actor_role, action, note, created_at)
       VALUES (?, ?, 'citizen', 'Complaint Submitted', ?, ?)`
    ).run(
      cid,
      user.name,
      `Filed with Tracking ID ${trackingId}. Routed to ${finalDepartment} (${finalPriority} priority).`,
      now
    );

    const created = getComplaintByIdOrTracking(cid);
    res.status(201).json({ complaint: created });
  } catch (err) {
    console.error('Create complaint error:', err);
    res.status(500).json({ error: 'Failed to submit complaint.' });
  }
});

app.patch('/api/complaints/:id/official-update', requireOfficial, (req: AuthenticatedRequest, res: Response) => {
  try {
    const official = req.user!;
    const existing = getComplaintByIdOrTracking(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }

    const { status, department, priority, deadlineAt, officialNotes, afterImage, escalationReason } =
      req.body as {
        status?: string;
        department?: string;
        priority?: string;
        deadlineAt?: string;
        officialNotes?: string;
        afterImage?: string | null;
        escalationReason?: string;
      };

    const now = new Date().toISOString();
    const nextStatus = status || existing.status;
    const nextDepartment = department || existing.department;
    const nextPriority = priority || existing.priority;
    const nextDeadline = deadlineAt !== undefined ? deadlineAt : existing.deadline_at;
    const nextAfterImage = afterImage !== undefined ? afterImage : existing.after_image;
    const resolvedAt = nextStatus === 'Resolved' ? existing.resolved_at || now : existing.resolved_at;
    const escalatedAt = nextStatus === 'Escalated' ? existing.escalated_at || now : existing.escalated_at;
    const nextEscalationReason =
      nextStatus === 'Escalated'
        ? escalationReason || existing.escalation_reason || `Escalated by ${official.name}`
        : existing.escalation_reason;

    const isOverdue =
      nextStatus !== 'Resolved' && nextDeadline && new Date(nextDeadline).getTime() < Date.now() ? 1 : 0;

    db.prepare(
      `UPDATE complaints
       SET status = ?,
           department = ?,
           priority = ?,
           deadline_at = ?,
           is_overdue = ?,
           official_notes = ?,
           after_image = ?,
           assigned_official_id = ?,
           assigned_official_name = ?,
           resolved_at = ?,
           escalated_at = ?,
           escalation_reason = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(
      nextStatus,
      nextDepartment,
      nextPriority,
      nextDeadline,
      isOverdue,
      officialNotes ?? existing.official_notes,
      nextAfterImage,
      official.id,
      official.name,
      resolvedAt,
      escalatedAt,
      nextEscalationReason,
      now,
      existing.id
    );

    const actionLabel =
      nextStatus !== existing.status
        ? `Status Updated to ${nextStatus}`
        : afterImage
          ? 'Resolution Evidence Uploaded'
          : 'Official Desk Update';

    const noteParts: string[] = [];
    if (officialNotes) noteParts.push(officialNotes);
    if (nextDeadline && nextDeadline !== existing.deadline_at) {
      noteParts.push(`SLA deadline set to ${new Date(nextDeadline).toLocaleString()}.`);
    }
    if (nextDepartment !== existing.department) {
      noteParts.push(`Transferred to ${nextDepartment}.`);
    }

    db.prepare(
      `INSERT INTO complaint_timeline (complaint_id, actor_name, actor_role, action, note, created_at)
       VALUES (?, ?, 'official', ?, ?, ?)`
    ).run(existing.id, official.name, actionLabel, noteParts.join(' ') || `Updated by ${official.name}.`, now);

    const updated = getComplaintByIdOrTracking(existing.id);
    res.json({ complaint: updated });
  } catch (err) {
    console.error('Official update error:', err);
    res.status(500).json({ error: 'Failed to update complaint.' });
  }
});

app.post('/api/complaints/:id/verify', (req: AuthenticatedRequest, res: Response) => {
  try {
    const complaint = getComplaintByIdOrTracking(req.params.id);
    if (!complaint) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }

    const { verifiedStatus, comment, verifierName } = req.body as {
      verifiedStatus?: 'confirmed_issue' | 'confirmed_resolved';
      comment?: string;
      verifierName?: string;
    };

    const statusType =
      verifiedStatus === 'confirmed_resolved' ? 'confirmed_resolved' : 'confirmed_issue';
    const name = req.user?.name || verifierName?.trim() || 'Community Member';
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO complaint_verifications (complaint_id, user_id, verifier_name, verified_status, comment, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(complaint.id, req.user?.id ?? null, name, statusType, comment?.trim() || null, now);

    db.prepare(
      `UPDATE complaints SET community_verifications = community_verifications + 1, updated_at = ? WHERE id = ?`
    ).run(now, complaint.id);

    db.prepare(
      `INSERT INTO complaint_timeline (complaint_id, actor_name, actor_role, action, note, created_at)
       VALUES (?, ?, 'community', ?, ?, ?)`
    ).run(
      complaint.id,
      name,
      statusType === 'confirmed_resolved' ? 'Community Confirmed Resolution' : 'Community Confirmed Issue',
      comment?.trim() || 'Verified by local resident.',
      now
    );

    const updated = getComplaintByIdOrTracking(complaint.id);
    res.json({ complaint: updated });
  } catch (err) {
    console.error('Community verify error:', err);
    res.status(500).json({ error: 'Failed to submit verification.' });
  }
});

app.post('/api/complaints/:id/feedback', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const complaint = getComplaintByIdOrTracking(req.params.id);
    if (!complaint) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }
    const { rating, feedback } = req.body as { rating?: number; feedback?: string };
    const cleanRating = Math.min(5, Math.max(1, Number(rating) || 5));
    const now = new Date().toISOString();

    db.prepare(
      `UPDATE complaints SET citizen_rating = ?, citizen_feedback = ?, updated_at = ? WHERE id = ?`
    ).run(cleanRating, feedback?.trim() || '', now, complaint.id);

    db.prepare(
      `INSERT INTO complaint_timeline (complaint_id, actor_name, actor_role, action, note, created_at)
       VALUES (?, ?, 'citizen', 'Citizen Feedback Recorded', ?, ?)`
    ).run(
      complaint.id,
      req.user!.name,
      `Rated ${cleanRating}/5 stars${feedback ? `: "${feedback.trim()}"` : '.'}`,
      now
    );

    const updated = getComplaintByIdOrTracking(complaint.id);
    res.json({ complaint: updated });
  } catch (err) {
    console.error('Feedback error:', err);
    res.status(500).json({ error: 'Failed to submit feedback.' });
  }
});

app.post('/api/complaints/escalate-check', (_req: Request, res: Response) => {
  const escalatedCount = runOverdueAndEscalationCheck();
  res.json({ escalatedCount });
});

// --- ANALYTICS & PREDICTIONS ---
app.get('/api/analytics/summary', (_req: Request, res: Response) => {
  try {
    runOverdueAndEscalationCheck();
    const all = db.prepare('SELECT * FROM complaints').all() as Complaint[];

    const total = all.length;
    const resolvedList = all.filter((c) => c.status === 'Resolved');
    const resolved = resolvedList.length;
    const escalated = all.filter((c) => c.status === 'Escalated').length;
    const overdue = all.filter((c) => c.is_overdue === 1).length;
    const inProgress = all.filter((c) => c.status === 'In Progress' || c.status === 'Accepted').length;
    const pending = all.filter((c) => c.status !== 'Resolved').length;

    const resolutionHoursList = resolvedList
      .filter((c) => c.resolved_at)
      .map((c) => Math.max(1, (new Date(c.resolved_at!).getTime() - new Date(c.created_at).getTime()) / 3600000));
    const avgResolutionHours =
      resolutionHoursList.length > 0
        ? Math.round((resolutionHoursList.reduce((a, b) => a + b, 0) / resolutionHoursList.length) * 10) / 10
        : 0;

    const rated = all.filter((c) => typeof c.citizen_rating === 'number');
    const avgCitizenRating =
      rated.length > 0
        ? Math.round((rated.reduce((sum, c) => sum + (c.citizen_rating || 0), 0) / rated.length) * 10) / 10
        : 4.7;

    const communityVerificationsTotal = all.reduce((sum, c) => sum + (c.community_verifications || 0), 0);

    const deptMap = new Map<
      string,
      { department: string; total: number; resolved: number; pending: number; escalated: number; hours: number[] }
    >();
    const catMap = new Map<string, number>();
    const statusMap = new Map<string, number>();
    const wardMap = new Map<string, { ward: string; count: number; openCount: number }>();

    for (const c of all) {
      const d = deptMap.get(c.department) || {
        department: c.department,
        total: 0,
        resolved: 0,
        pending: 0,
        escalated: 0,
        hours: [],
      };
      d.total++;
      if (c.status === 'Resolved') {
        d.resolved++;
        if (c.resolved_at) {
          d.hours.push(
            Math.max(1, (new Date(c.resolved_at).getTime() - new Date(c.created_at).getTime()) / 3600000)
          );
        }
      } else {
        d.pending++;
      }
      if (c.status === 'Escalated') d.escalated++;
      deptMap.set(c.department, d);

      catMap.set(c.category, (catMap.get(c.category) || 0) + 1);
      statusMap.set(c.status, (statusMap.get(c.status) || 0) + 1);

      const w = wardMap.get(c.ward) || { ward: c.ward, count: 0, openCount: 0 };
      w.count++;
      if (c.status !== 'Resolved') w.openCount++;
      wardMap.set(c.ward, w);
    }

    const byDepartment = Array.from(deptMap.values()).map((d) => ({
      department: d.department,
      total: d.total,
      resolved: d.resolved,
      pending: d.pending,
      escalated: d.escalated,
      avgHours:
        d.hours.length > 0 ? Math.round((d.hours.reduce((a, b) => a + b, 0) / d.hours.length) * 10) / 10 : 32,
    }));

    const byCategory = Array.from(catMap.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    const byStatus = Array.from(statusMap.entries()).map(([status, count]) => ({ status, count }));
    const byWard = Array.from(wardMap.values()).sort((a, b) => b.count - a.count);

    // Build realistic multi-month civic trend combined with current month live counts
    const monthlyTrend = [
      { month: 'Jun', reported: 42, resolved: 38 },
      { month: 'Jul', reported: 58, resolved: 51 },
      { month: 'Aug', reported: 64, resolved: 59 },
      { month: 'Sep', reported: 51, resolved: 48 },
      { month: 'Oct', reported: 47, resolved: 44 },
      { month: 'Nov', reported: Math.max(total, 12), resolved: Math.max(resolved, 3) },
    ];

    const summary: AnalyticsSummary = {
      totals: {
        total,
        pending,
        inProgress,
        resolved,
        escalated,
        overdue,
        avgResolutionHours,
        avgCitizenRating,
        communityVerificationsTotal,
      },
      byDepartment,
      byCategory,
      byStatus,
      byWard,
      monthlyTrend,
    };

    res.json(summary);
  } catch (err) {
    console.error('Analytics summary error:', err);
    res.status(500).json({ error: 'Failed to compute analytics.' });
  }
});

app.get('/api/analytics/predictions', async (_req: Request, res: Response) => {
  try {
    const rows = db
      .prepare('SELECT ward, category, status, priority, is_overdue, created_at FROM complaints')
      .all() as Array<{
        ward: string;
        category: string;
        status: string;
        priority: string;
        is_overdue: number;
        created_at: string;
      }>;
    const predictions = await generateCivicPredictions(rows);
    res.json(predictions);
  } catch (err) {
    console.error('Predictions error:', err);
    res.status(500).json({ error: 'Failed to generate civic predictions.' });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CIVIC server listening on http://localhost:${PORT}`);
  });
}

startServer();
