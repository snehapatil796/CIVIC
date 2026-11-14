import { useMemo, useState } from 'react';
import {
  ShieldCheck,
  Clock,
  AlertTriangle,
  Upload,
  CheckCircle2,
  MapPin,
} from 'lucide-react';
import type {
  CivicUser,
  Complaint,
  ComplaintStatus,
  PriorityLevel,
} from '../types/civic';
import { DEPARTMENTS } from '../i18n/translations';
import { StatusIndicator, PriorityText, formatDeadlineCountdown } from './StatusLabel';
import { BeforeAfterSlider } from './BeforeAfterSlider';

interface OfficialDeskViewProps {
  user: CivicUser | null;
  token: string | null;
  complaints: Complaint[];
  onRequireOfficialAuth: () => void;
  onComplaintUpdated: (updated: Complaint) => void;
}

export function OfficialDeskView({
  user,
  token,
  complaints,
  onRequireOfficialAuth,
  onComplaintUpdated,
}: OfficialDeskViewProps) {
  const [deptFilter, setDeptFilter] = useState<string>(
    user?.department && user.department !== 'All Departments' ? user.department : 'All Departments'
  );
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(complaints[0]?.id ?? null);

  const filtered = useMemo(() => {
    return complaints.filter((c) => {
      if (deptFilter !== 'All Departments' && c.department !== deptFilter) return false;
      if (statusFilter !== 'All' && c.status !== statusFilter) return false;
      if (onlyOverdue && c.is_overdue !== 1 && c.status !== 'Escalated') return false;
      return true;
    });
  }, [complaints, deptFilter, statusFilter, onlyOverdue]);

  const selected = useMemo(
    () => complaints.find((c) => c.id === selectedId) || filtered[0] || null,
    [complaints, filtered, selectedId]
  );

  // Action editor state
  const [editStatus, setEditStatus] = useState<ComplaintStatus>('In Progress');
  const [editDept, setEditDept] = useState<string>('Roads & Infrastructure');
  const [editPriority, setEditPriority] = useState<PriorityLevel>('High');
  const [editDeadline, setEditDeadline] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [afterImage, setAfterImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectComplaint = (c: Complaint) => {
    setSelectedId(c.id);
    setEditStatus(c.status);
    setEditDept(c.department);
    setEditPriority(c.priority);
    setEditDeadline(c.deadline_at ? c.deadline_at.slice(0, 16) : '');
    setEditNotes(c.official_notes || '');
    setAfterImage(c.after_image);
    setFeedbackMsg(null);
    setErrorMsg(null);
  };

  if (!user || user.role !== 'official') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 max-w-xl mx-auto text-center space-y-4 my-8">
        <ShieldCheck className="w-10 h-10 text-blue-700 mx-auto" />
        <h2 className="text-xl font-bold text-slate-900">Government Official Portal</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          Department engineers and municipal commissioners use this workspace to inspect reported
          evidence, assign SLA deadlines, escalate overdue issues, and upload after-repair proof.
        </p>
        <button
          type="button"
          onClick={onRequireOfficialAuth}
          className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
        >
          Sign In to Official Desk
        </button>
      </div>
    );
  }

  const handleAfterImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAfterImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !token) return;
    setSaving(true);
    setFeedbackMsg(null);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/complaints/${selected.id}/official-update`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: editStatus,
          department: editDept,
          priority: editPriority,
          deadlineAt: editDeadline ? new Date(editDeadline).toISOString() : selected.deadline_at,
          officialNotes: editNotes,
          afterImage,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Update failed.');
        return;
      }
      onComplaintUpdated(data.complaint);
      setFeedbackMsg(`Updated ${data.complaint.tracking_id} (${data.complaint.status}).`);
    } catch {
      setErrorMsg('Network error updating complaint.');
    } finally {
      setSaving(false);
    }
  };

  const overdueCount = complaints.filter(
    (c) => c.status !== 'Resolved' && (c.is_overdue === 1 || c.status === 'Escalated')
  ).length;

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Government Official Response Desk
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            Signed in as <strong>{user.name}</strong> · {user.department || 'All Departments'} ·{' '}
            <span className="text-red-700 font-semibold tabular-nums">
              {overdueCount} overdue/escalated
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white"
          >
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white"
          >
            {['All', 'Submitted', 'Accepted', 'In Progress', 'Escalated', 'Resolved'].map((s) => (
              <option key={s} value={s}>
                {s === 'All' ? 'All Statuses' : s}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setOnlyOverdue((v) => !v)}
            className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
              onlyOverdue
                ? 'bg-red-700 text-white border-red-700'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            Overdue &amp; Escalated ({overdueCount})
          </button>
        </div>
      </div>

      {/* Two-Column Operational Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Queue List */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
            <span>Department Queue</span>
            <span className="font-mono-tabular text-slate-500">{filtered.length} items</span>
          </div>

          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No grievances match the current department/status filters.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[680px] overflow-y-auto">
              {filtered.map((c) => {
                const isSelected = selected?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectComplaint(c)}
                    className={`w-full text-left p-4 transition-colors ${
                      isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono-tabular font-semibold text-slate-900">
                        {c.tracking_id}
                      </span>
                      <StatusIndicator status={c.status} isOverdue={c.is_overdue} />
                    </div>
                    <p className="text-sm font-semibold text-slate-900 mt-1 line-clamp-1">
                      {c.title}
                    </p>
                    <div className="flex items-center justify-between gap-2 mt-1.5 text-xs text-slate-500">
                      <span className="truncate">{c.ward}</span>
                      <PriorityText priority={c.priority} />
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                      <Clock className="w-3 h-3" />
                      <span className="tabular-nums">
                        {formatDeadlineCountdown(c.deadline_at, c.status)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Complaint Inspector & Action Form */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          {!selected ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Select a complaint from the queue to inspect evidence and take action.
            </div>
          ) : (
            <div className="space-y-6">
              <div className="border-b border-slate-200 pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono-tabular text-xs font-bold text-blue-700">
                    {selected.tracking_id} · {selected.category}
                  </span>
                  <StatusIndicator status={selected.status} isOverdue={selected.is_overdue} />
                </div>
                <h2 className="text-lg font-bold text-slate-900 mt-1">{selected.title}</h2>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {selected.address} ({selected.ward}) ·{' '}
                    <span className="font-mono-tabular">
                      {selected.latitude.toFixed(4)}, {selected.longitude.toFixed(4)}
                    </span>
                  </span>
                </p>
              </div>

              <div className="space-y-3">
                <p className="text-sm text-slate-700 leading-relaxed">{selected.description}</p>
                {selected.ai_summary && (
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
                    <span className="font-semibold text-slate-900 block mb-0.5">
                      AI Triage Brief
                    </span>
                    {selected.ai_summary}
                  </div>
                )}
                {selected.is_overdue === 1 && selected.status !== 'Resolved' && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      This complaint has exceeded its SLA deadline and is flagged overdue for
                      priority resolution.
                    </span>
                  </div>
                )}
              </div>

              <BeforeAfterSlider
                beforeSrc={selected.before_image}
                afterSrc={afterImage ?? selected.after_image}
                title={selected.title}
              />

              {/* Update Form */}
              <form
                onSubmit={handleSaveUpdate}
                className="space-y-4 pt-4 border-t border-slate-200"
              >
                <h3 className="text-sm font-bold text-slate-900">
                  Update Status, SLA Deadline &amp; Resolution Evidence
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Workflow Status
                    </label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as ComplaintStatus)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="Submitted">Submitted</option>
                      <option value="Accepted">Accepted</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Resolved">Resolved</option>
                      <option value="Escalated">Escalated</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Assign Department
                    </label>
                    <select
                      value={editDept}
                      onChange={(e) => setEditDept(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      {DEPARTMENTS.filter((d) => d !== 'All Departments').map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Priority Level
                    </label>
                    <select
                      value={editPriority}
                      onChange={(e) => setEditPriority(e.target.value as PriorityLevel)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="Critical">Critical</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      SLA Resolution Deadline
                    </label>
                    <input
                      type="datetime-local"
                      value={editDeadline}
                      onChange={(e) => setEditDeadline(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Official Inspection &amp; Repair Notes
                  </label>
                  <textarea
                    rows={3}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Document site findings, crew assigned, or work completed..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>

                <label className="border border-dashed border-slate-300 rounded-lg p-3.5 hover:border-blue-600 transition-colors cursor-pointer flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                    <Upload className="w-4 h-4 text-blue-700" />
                    <span>
                      {afterImage
                        ? 'Resolution Photo Loaded (Click to replace)'
                        : 'Upload After-Repair Resolution Evidence Photo'}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">JPG / PNG</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAfterImageUpload}
                    className="sr-only"
                  />
                </label>

                {feedbackMsg && (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{feedbackMsg}</span>
                  </div>
                )}

                {errorMsg && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                    {errorMsg}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg"
                  >
                    {saving ? 'Saving Update...' : 'Save Official Response'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
