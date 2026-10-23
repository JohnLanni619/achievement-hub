import type { ReactNode } from "react";
import type { Award } from "../api";

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="spinner" role="status">
      <span className="spinner-dot" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <span>{error.message}</span>
      {onRetry && (
        <button className="btn btn-small" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function ProgressBar({ value, total, hardcore }: { value: number; total: number; hardcore?: number }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  const hcPct = total > 0 && hardcore !== undefined ? (hardcore / total) * 100 : undefined;
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={value}
      aria-label={`${value} of ${total}`}
    >
      <div className="progress-fill" style={{ width: `${pct}%` }} />
      {hcPct !== undefined && <div className="progress-fill progress-fill-hardcore" style={{ width: `${hcPct}%` }} />}
    </div>
  );
}

const AWARD_LABELS: Record<NonNullable<Award>, string> = {
  mastered: "Mastered",
  completed: "Completed",
  beaten: "Beaten",
  "beaten-softcore": "Beaten (softcore)",
};

export function AwardBadge({ award }: { award?: Award }) {
  if (!award) return null;
  return <span className={`award award-${award}`}>{AWARD_LABELS[award]}</span>;
}

export function Img({ src, alt, size, className = "" }: { src?: string; alt: string; size: number; className?: string }) {
  if (!src) return <div className={`img-placeholder ${className}`} style={{ width: size, height: size }} aria-hidden />;
  return <img src={src} alt={alt} width={size} height={size} loading="lazy" className={className} />;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function formatDate(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}
