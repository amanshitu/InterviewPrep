export function StatusBadge({ status }: { status: "approved" | "rejected" | "pending" | "admin" | "user" }) {
  const styles: Record<string, string> = {
    approved: "bg-success/15 text-success",
    rejected: "bg-destructive/15 text-destructive",
    pending: "bg-warning/15 text-warning",
    admin: "bg-primary/15 text-primary",
    user: "bg-muted text-muted-foreground",
  };
  const labels: Record<string, string> = {
    approved: "Approved",
    rejected: "Rejected",
    pending: "Pending",
    admin: "Admin",
    user: "User",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
