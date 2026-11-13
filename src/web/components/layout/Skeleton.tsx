// Shared shimmer block for page-shaped loading skeletons — replaces the
// plain "Loading X…" text cards that used to flash at the top of each
// page's content area while its first fetch was in flight (looked like a
// stray "loading badge" rather than an intentional loading state,
// especially once production's real network latency made it linger).
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

export function SkeletonCard({ className = "", children }: { className?: string; children?: React.ReactNode }) {
  return <div className={`rounded-lg border border-border bg-card p-5 ${className}`}>{children}</div>;
}
