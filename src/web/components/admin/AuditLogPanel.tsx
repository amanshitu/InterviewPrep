import { useEffect, useState } from "react";
import { getAuditLog, type AuditLogEntry } from "../../api/admin";
import { Skeleton } from "../layout/Skeleton";

const ACTION_LABELS: Record<string, string> = {
  question_report_resolved: "Resolved a question report",
  question_report_dismissed: "Dismissed a question report",
  feedback_resolved: "Resolved feedback",
  question_set_approved: "Approved a question set",
  question_set_rejected: "Rejected a question set",
  question_edited: "Edited a question",
  user_stats_viewed: "Viewed a user's stats",
};

function describe(entry: AuditLogEntry): string {
  return ACTION_LABELS[entry.action] || entry.action;
}

export function AuditLogPanel() {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);

  useEffect(() => {
    getAuditLog()
      .then((res) => setEntries(res.entries))
      .catch(() => setEntries([]));
  }, []);

  if (entries === null) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No admin actions recorded yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="pb-2 pr-3 font-medium">When</th>
            <th className="pb-2 pr-3 font-medium">Admin</th>
            <th className="pb-2 pr-3 font-medium">Action</th>
            <th className="pb-2 font-medium">Target / detail</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-border/60 align-top">
              <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">{new Date(e.created_at).toLocaleString()}</td>
              <td className="py-2 pr-3">
                <div className="font-medium text-foreground">{e.admin_name}</div>
                <div className="text-xs text-muted-foreground">{e.admin_email}</div>
              </td>
              <td className="py-2 pr-3 text-foreground">{describe(e)}</td>
              <td className="py-2 text-muted-foreground">
                {e.target_type ? `${e.target_type}${e.target_id ? ` · ${e.target_id}` : ""}` : "—"}
                {e.detail ? <span className="block text-xs">{e.detail}</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
