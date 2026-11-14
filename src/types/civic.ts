export type LanguageCode = 'en' | 'kn';

export type UserRole = 'citizen' | 'official';

export type ComplaintCategory =
  | 'Road Damage'
  | 'Water Leakage'
  | 'Sewage Overflow'
  | 'Garbage Accumulation'
  | 'Streetlight Failure'
  | 'Drainage Blockage'
  | 'Other';

export type DepartmentName =
  | 'Roads & Infrastructure'
  | 'Water Supply & Drainage'
  | 'Sanitation & Waste'
  | 'Electrical & Streetlights'
  | 'Sewerage & Public Health'
  | 'Municipal General Desk';

export type PriorityLevel = 'Critical' | 'High' | 'Medium' | 'Low';

export type ComplaintStatus =
  | 'Submitted'
  | 'Accepted'
  | 'In Progress'
  | 'Resolved'
  | 'Escalated';

export interface CivicUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  department: string | null;
  language: LanguageCode;
  created_at: string;
}

export interface TimelineEvent {
  id: number;
  complaint_id: number;
  actor_name: string;
  actor_role: string;
  action: string;
  note: string;
  created_at: string;
}

export interface ComplaintVerification {
  id: number;
  complaint_id: number;
  user_id: number | null;
  verifier_name: string;
  verified_status: 'confirmed_issue' | 'confirmed_resolved';
  comment: string | null;
  created_at: string;
}

export interface Complaint {
  id: number;
  tracking_id: string;
  citizen_id: number | null;
  citizen_name: string;
  title: string;
  description: string;
  language: LanguageCode;
  category: ComplaintCategory;
  department: DepartmentName;
  priority: PriorityLevel;
  urgency_score: number;
  status: ComplaintStatus;
  latitude: number;
  longitude: number;
  address: string;
  ward: string;
  before_image: string | null;
  after_image: string | null;
  video_data: string | null;
  audio_transcript: string | null;
  ai_summary: string | null;
  ai_image_analysis: string | null;
  ai_duplicate_of: string | null;
  ai_confidence: number | null;
  assigned_official_id: number | null;
  assigned_official_name: string | null;
  official_notes: string | null;
  deadline_at: string | null;
  is_overdue: number;
  escalated_at: string | null;
  escalation_reason: string | null;
  resolved_at: string | null;
  citizen_rating: number | null;
  citizen_feedback: string | null;
  community_verifications: number;
  created_at: string;
  updated_at: string;
  timeline?: TimelineEvent[];
  verifications?: ComplaintVerification[];
}

export interface AIAnalysisResult {
  category: ComplaintCategory;
  department: DepartmentName;
  priority: PriorityLevel;
  urgencyScore: number;
  summary: string;
  detectedLanguage: string;
  imageAnalysis: string | null;
  possibleDuplicateTrackingId: string | null;
  duplicateReason: string | null;
  suggestedDeadlineHours: number;
  confidence: number;
  source: 'gemini' | 'heuristic';
}

export interface AnalyticsSummary {
  totals: {
    total: number;
    pending: number;
    inProgress: number;
    resolved: number;
    escalated: number;
    overdue: number;
    avgResolutionHours: number;
    avgCitizenRating: number;
    communityVerificationsTotal: number;
  };
  byDepartment: Array<{
    department: string;
    total: number;
    resolved: number;
    pending: number;
    escalated: number;
    avgHours: number;
  }>;
  byCategory: Array<{
    category: string;
    count: number;
  }>;
  byStatus: Array<{
    status: string;
    count: number;
  }>;
  byWard: Array<{
    ward: string;
    count: number;
    openCount: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    reported: number;
    resolved: number;
  }>;
}

export interface CivicPrediction {
  ward: string;
  category: string;
  riskLevel: 'High' | 'Elevated' | 'Moderate';
  likelihoodPercent: number;
  forecastWindow: string;
  rationale: string;
  recommendedAction: string;
}

export interface PredictionsResponse {
  generatedAt: string;
  executiveBrief: string;
  predictions: CivicPrediction[];
  source: 'gemini' | 'statistical';
}
