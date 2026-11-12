import { useState } from "react";

// Hand-written inline SVG bar charts — ported from public/pages/stats.js,
// which deliberately avoids a charting dependency for a handful of simple
// bar charts. No new chart library introduced here either.

export interface TrendPoint {
  label: string;
  value: number; // 0-100, drives bar height on a shared scale
  displayValue: string; // what's actually printed above the bar
}

export function TrendBarChart({ data, ariaLabel }: { data: TrendPoint[]; ariaLabel: string }) {
  const width = Math.max(320, data.length * 34);
  const height = 140;
  const step = width / data.length;
  const barWidth = Math.min(28, step - 8);

  return (
    <div className="mt-3 overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
        {data.map((d, i) => {
          const x = i * step + (step - barWidth) / 2;
          const barHeight = Math.max(2, (d.value / 100) * (height - 30));
          const y = height - 20 - barHeight;
          return (
            <g key={`${d.label}-${i}`}>
              <rect x={x} y={y} width={barWidth} height={barHeight} rx={3} fill="var(--color-primary)" />
              <text x={x + barWidth / 2} y={y - 5} fontSize={10} textAnchor="middle" fill="var(--color-foreground)">
                {d.displayValue}
              </text>
              <text x={x + barWidth / 2} y={height - 6} fontSize={10} textAnchor="middle" fill="var(--color-muted-foreground)">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Compact, tappable "this week" chart — tapping/selecting a bar highlights
// it and swaps in its exact count below (no hover-only affordance, since
// that doesn't exist on a touchscreen).
export function WeeklyActivityChart({ days, counts }: { days: string[]; counts: number[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(1, ...counts);
  const width = 320;
  const height = 120;
  const barGap = 10;
  const barWidth = (width - barGap * (days.length - 1)) / days.length;

  const selectedDay = selected !== null ? days[selected] : null;
  const selectedCount = selected !== null ? counts[selected] : null;
  const detail =
    selectedDay && selectedCount !== null
      ? `${new Date(`${selectedDay}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}: ${selectedCount} question${selectedCount === 1 ? "" : "s"} completed.`
      : "Tap a day above to see the exact count.";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-base font-semibold text-card-foreground">
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 20V10M12 20V4M19 20v-7" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
        </svg>
        This week
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Questions completed each day — tap a bar for the exact count.</p>
      <div className="mt-3 overflow-x-auto">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="This week's completed questions">
          {days.map((day, i) => {
            const barHeight = Math.max(4, (counts[i] / max) * (height - 30));
            const x = i * (barWidth + barGap);
            const y = height - 20 - barHeight;
            const dayLabel = new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2);
            return (
              <g
                key={day}
                role="button"
                tabIndex={0}
                aria-label={`${day}: ${counts[i]} questions completed`}
                onClick={() => setSelected(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(i);
                  }
                }}
                style={{ cursor: "pointer" }}
              >
                <rect x={x} y={y} width={barWidth} height={barHeight} rx={4} fill="var(--color-primary)" opacity={selected === i ? 1 : 0.5} />
                <text x={x + barWidth / 2} y={height - 6} fontSize={10} textAnchor="middle" fill="var(--color-muted-foreground)">
                  {dayLabel}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}
