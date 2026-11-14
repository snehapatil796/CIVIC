import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Wrench,
} from 'lucide-react';
import type { ComplaintStatus, PriorityLevel } from '../types/civic';

export function StatusIndicator({
  status,
  isOverdue,
  labelOverride,
}: {
  status: ComplaintStatus | string;
  isOverdue?: number;
  labelOverride?: string;
}) {
  const label = labelOverride || status;
  if (status === 'Resolved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }
  if (status === 'Escalated' || isOverdue === 1) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{isOverdue === 1 && status !== 'Escalated' ? `${label} · Overdue` : label}</span>
      </span>
    );
  }
  if (status === 'In Progress') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
        <Wrench className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }
  if (status === 'Accepted') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 whitespace-nowrap">
        <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 whitespace-nowrap">
      <FileText className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function PriorityText({ priority }: { priority: PriorityLevel | string }) {
  const colorClass =
    priority === 'Critical'
      ? 'text-red-700 font-semibold'
      : priority === 'High'
        ? 'text-amber-700 font-semibold'
        : priority === 'Medium'
          ? 'text-blue-700 font-medium'
          : 'text-slate-600 font-medium';

  return <span className={`text-xs whitespace-nowrap ${colorClass}`}>{priority} Priority</span>;
}

export function formatDeadlineCountdown(deadlineAt: string | null, status: string): string {
  if (!deadlineAt) return 'No SLA set';
  if (status === 'Resolved') return 'Completed';
  const diffMs = new Date(deadlineAt).getTime() - Date.now();
  const absHours = Math.round(Math.abs(diffMs) / 3600000);
  if (diffMs < 0) {
    if (absHours < 24) return `Overdue by ${absHours}h`;
    return `Overdue by ${Math.round(absHours / 24)}d`;
  }
  if (absHours < 24) return `${absHours}h remaining`;
  return `${Math.round(absHours / 24)}d remaining`;
}
