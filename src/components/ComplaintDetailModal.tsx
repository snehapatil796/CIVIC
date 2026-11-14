import { useState } from 'react';
import {
  X,
  MapPin,
  Users,
  Star,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Video,
  Mic,
} from 'lucide-react';
import type { CivicUser, Complaint } from '../types/civic';
import { BeforeAfterSlider } from './BeforeAfterSlider';
import { StatusIndicator, PriorityText, formatDeadlineCountdown } from './StatusLabel';

interface ComplaintDetailModalProps {
  complaint: Complaint | null;
  user: CivicUser | null;
  token: string | null;
  onClose: () => void;
  onComplaintUpdated: (updated: Complaint) => void;
  onOpenTrackingId?: (trackingId: string) => void;
  onRequireAuth?: () => void;
}

export function ComplaintDetailModal({
  complaint,
  user,
  token,
  onClose,
  onComplaintUpdated,
  onOpenTrackingId,
  onRequireAuth,
}: ComplaintDetailModalProps) {
  const [verifyComment, setVerifyComment] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [rating, setRating] = useState<number>(complaint?.citizen_rating || 5);
  const [feedback, setFeedback] = useState(complaint?.citizen_feedback || '');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!complaint) return null;

  async function handleVerify(type: 'confirmed_issue' | 'confirmed_resolved') {
    if (!complaint) return;
    setVerifying(true);
    setMessage(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`/api/complaints/${complaint.id}/verify`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          verifiedStatus: type,
          comment: verifyComment,
          verifierName: user?.name || 'Local Resident',
        }),
      });
      const data = await res.json();
      if (res.ok && data.complaint) {
        onComplaintUpdated(data.complaint);
        setVerifyComment('');
        setMessage('Community verification recorded.');
      }
    } finally {
      setVerifying(false);
    }
  }

  async function handleFeedbackSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!complaint) return;
    if (!token) {
      onRequireAuth?.();
      return;
    }
    setSubmittingFeedback(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/complaints/${complaint.id}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rating, feedback }),
      });
      const data = await res.json();
      if (res.ok && data.complaint) {
        onComplaintUpdated(data.complaint);
        setMessage('Thank you. Your feedback has been logged publicly.');
      }
    } finally {
      setSubmittingFeedback(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-mono-tabular font-semibold text-slate-900">
                {complaint.tracking_id}
              </span>
              <span aria-hidden="true">·</span>
              <span>{complaint.category}</span>
              <span aria-hidden="true">·</span>
              <span>{complaint.department}</span>
              <span aria-hidden="true">·</span>
              <StatusIndicator status={complaint.status} isOverdue={complaint.is_overdue} />
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-1">{complaint.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close complaint detail modal"
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto p-6 space-y-6">
          {/* Metadata summary grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-5 border-b border-slate-200 text-xs">
            <div>
              <span className="text-slate-500 block">Location &amp; Ward</span>
              <span className="font-medium text-slate-900 mt-1 inline-flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-blue-700 mt-0.5 shrink-0" />
                <span>
                  {complaint.address} ({complaint.ward})
                </span>
              </span>
              <div className="font-mono-tabular text-slate-500 mt-0.5">
                {complaint.latitude.toFixed(5)}, {complaint.longitude.toFixed(5)}
              </div>
            </div>
            <div>
              <span className="text-slate-500 block">Priority &amp; Urgency</span>
              <div className="mt-1 flex items-center gap-2">
                <PriorityText priority={complaint.priority} />
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular text-slate-700">
                  Urgency {complaint.urgency_score}/100
                </span>
              </div>
              <div className="text-slate-500 mt-0.5">
                Reported by {complaint.citizen_name} ·{' '}
                {new Date(complaint.created_at).toLocaleDateString()}
              </div>
            </div>
            <div>
              <span className="text-slate-500 block">SLA Deadline &amp; Oversight</span>
              <div className="mt-1 inline-flex items-center gap-1.5 font-medium text-slate-900">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span className="tabular-nums">
                  {formatDeadlineCountdown(complaint.deadline_at, complaint.status)}
                </span>
              </div>
              <div className="text-slate-500 mt-0.5">
                Assigned: {complaint.assigned_official_name || 'Pending department pickup'}
              </div>
            </div>
          </div>

          {/* Duplicate & Escalation Notices */}
          {complaint.ai_duplicate_of && (
            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-between gap-3 text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  AI flagged potential similarity to existing report{' '}
                  <strong className="font-mono-tabular">{complaint.ai_duplicate_of}</strong>.
                </span>
              </div>
              {onOpenTrackingId && (
                <button
                  type="button"
                  onClick={() => onOpenTrackingId(complaint.ai_duplicate_of!)}
                  className="font-semibold text-amber-900 underline whitespace-nowrap"
                >
                  Inspect {complaint.ai_duplicate_of}
                </button>
              )}
            </div>
          )}

          {complaint.escalation_reason && (
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-800">
              <AlertTriangle className="w-4 h-4 text-red-700 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Escalation Active</p>
                <p className="mt-0.5">{complaint.escalation_reason}</p>
              </div>
            </div>
          )}

          {/* Description + AI Analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Citizen Grievance Report</h3>
                <p className="text-sm text-slate-700 leading-relaxed mt-1.5">
                  {complaint.description}
                </p>
              </div>

              {complaint.audio_transcript && (
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <Mic className="w-3.5 h-3.5 text-blue-700" />
                    <span>Voice Complaint Transcript</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    {complaint.audio_transcript}
                  </p>
                </div>
              )}

              {complaint.ai_summary && (
                <div className="p-4 rounded-lg bg-blue-50/60 border border-blue-200/80 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-blue-950">AI Triage Summary</span>
                    {complaint.ai_confidence && (
                      <span className="font-mono-tabular text-blue-700">
                        {Math.round(complaint.ai_confidence * 100)}% confidence
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-800 leading-relaxed">{complaint.ai_summary}</p>
                  {complaint.ai_image_analysis && (
                    <p className="text-xs text-slate-600 pt-2 border-t border-blue-200/70">
                      <strong className="text-slate-800">Visual Inspection:</strong>{' '}
                      {complaint.ai_image_analysis}
                    </p>
                  )}
                </div>
              )}

              {complaint.official_notes && (
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <h4 className="text-xs font-semibold text-slate-900">
                    Official Department Action Notes
                  </h4>
                  <p className="text-xs text-slate-700 mt-1 leading-relaxed">
                    {complaint.official_notes}
                  </p>
                </div>
              )}
            </div>

            {/* Before & After Photos + Video */}
            <div className="space-y-4">
              <BeforeAfterSlider
                beforeSrc={complaint.before_image}
                afterSrc={complaint.after_image}
                title={complaint.title}
              />

              {complaint.video_data && (
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-950">
                  <div className="px-3 py-2 bg-slate-900 text-xs text-slate-200 flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5" />
                    <span>Attached Video Evidence</span>
                  </div>
                  <video src={complaint.video_data} controls className="w-full max-h-56" />
                </div>
              )}
            </div>
          </div>

          {/* Community Verification & Audit Timeline */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t border-slate-200">
            {/* Community Verification */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-700" />
                  <span>Community Verification</span>
                </h3>
                <span className="font-mono-tabular text-xs font-semibold text-slate-700">
                  {complaint.community_verifications} local verifications
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Neighbors can corroborate an unresolved civic hazard or confirm that municipal repairs
                were genuinely completed.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={verifyComment}
                  onChange={(e) => setVerifyComment(e.target.value)}
                  placeholder="Optional neighborhood observation..."
                  className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
                <button
                  type="button"
                  disabled={verifying}
                  onClick={() =>
                    handleVerify(
                      complaint.status === 'Resolved' ? 'confirmed_resolved' : 'confirmed_issue'
                    )
                  }
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap disabled:opacity-50"
                >
                  {complaint.status === 'Resolved' ? 'Confirm Repair Done' : 'Confirm Issue Exists'}
                </button>
              </div>

              {complaint.verifications && complaint.verifications.length > 0 && (
                <div className="space-y-2 pt-2 max-h-36 overflow-y-auto">
                  {complaint.verifications.map((v) => (
                    <div
                      key={v.id}
                      className="text-xs text-slate-600 pb-2 border-b border-slate-100 last:border-b-0"
                    >
                      <span className="font-semibold text-slate-800">{v.verifier_name}</span>
                      <span aria-hidden="true"> · </span>
                      <span className="text-emerald-700 font-medium">
                        {v.verified_status === 'confirmed_resolved'
                          ? 'Confirmed Resolved'
                          : 'Confirmed Active Issue'}
                      </span>
                      {v.comment && <p className="text-slate-600 mt-0.5">{v.comment}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Audit Timeline */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">Response Timeline</h3>
              <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
                {complaint.timeline?.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-start gap-3 text-xs pb-2.5 border-b border-slate-100 last:border-b-0"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-700 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">{ev.action}</span>
                        <span className="font-mono-tabular text-slate-400 whitespace-nowrap">
                          {new Date(ev.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-slate-600 mt-0.5">{ev.note}</p>
                      <p className="text-slate-400 mt-0.5">
                        {ev.actor_name} · {ev.actor_role}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Citizen Resolution Feedback */}
          {complaint.status === 'Resolved' && (
            <div className="pt-4 border-t border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">
                Citizen Resolution Feedback
              </h3>
              {complaint.citizen_feedback && (
                <div className="mb-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-950">
                  <div className="flex items-center gap-1 font-semibold">
                    <span>Citizen Rating: {complaint.citizen_rating}/5</span>
                    <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                  </div>
                  <p className="mt-1">{complaint.citizen_feedback}</p>
                </div>
              )}

              <form onSubmit={handleFeedbackSubmit} className="flex flex-col sm:flex-row gap-2">
                <select
                  value={rating}
                  onChange={(e) => setRating(Number(e.target.value))}
                  aria-label="Resolution rating"
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value={5}>5 Stars · Excellent</option>
                  <option value={4}>4 Stars · Good</option>
                  <option value={3}>3 Stars · Satisfactory</option>
                  <option value={2}>2 Stars · Needs Follow-up</option>
                  <option value={1}>1 Star · Unresolved</option>
                </select>
                <input
                  type="text"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Share feedback on repair quality..."
                  className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <button
                  type="submit"
                  disabled={submittingFeedback}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg whitespace-nowrap"
                >
                  {submittingFeedback ? 'Saving...' : 'Save Feedback'}
                </button>
              </form>
            </div>
          )}

          {message && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800">
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
