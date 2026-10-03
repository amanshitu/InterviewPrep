// Accuracy trend, weakest topics/questions, streaks — derived from
// /api/activity (the append-only history table).
import { $, el, escapeHtml, toastError, api, state, renderNav } from "../app.js";

// Small header icons + stat-tile icons — purely decorative, matching the
// app-wide modernization pass (no new data, just visual polish).
const STREAK_TILE_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2c1.2 3 .5 4.6-.6 6.2C10 10 9 11.4 9 13.2A3 3 0 0 0 15 14c0-1-.4-1.7-.9-2.3.9.6 2.4 2 2.4 4.3a5.5 5.5 0 1 1-11 0C5.5 11.8 8.8 8.4 12 2Z" fill="var(--accent)"/></svg>`;
const TROPHY_TILE_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 5H4a3 3 0 0 0 3 5M17 5h3a3 3 0 0 1-3 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M12 13v4M8 21h8M9 21v-2a3 3 0 0 1 6 0v2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CHECKLIST_TILE_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4 6l1 1 1.5-1.5M4 12l1 1 1.5-1.5M4 18l1 1 1.5-1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const DONUT_TILE_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>`;
const AIM_HEADER_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/></svg>`;
const BARS_HEADER_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 20V10M12 20V4M19 20v-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const LIST_HEADER_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const SPARKLE_HEADER_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;

function buildBarChartSvg(data) {
  const width = Math.max(320, data.length * 34);
  const height = 140;
  const step = width / data.length;
  const barWidth = Math.min(28, step - 8);
  const bars = data
    .map((d, i) => {
      const x = i * step + (step - barWidth) / 2;
      const barHeight = Math.max(2, (d.value / 100) * (height - 30));
      const y = height - 20 - barHeight;
      return `
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="3" fill="var(--primary)"></rect>
        <text x="${(x + barWidth / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" font-size="10" text-anchor="middle" fill="var(--text)">${d.value}%</text>
        <text x="${(x + barWidth / 2).toFixed(1)}" y="${height - 6}" font-size="10" text-anchor="middle" fill="var(--text-muted)">${escapeHtml(d.label)}</text>
      `;
    })
    .join("");
  const wrap = document.createElement("div");
  wrap.style.overflowX = "auto";
  wrap.style.marginTop = "12px";
  wrap.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Accuracy trend chart">${bars}</svg>`;
  return wrap;
}

export async function render() {
  state.currentView = "stats";
  const main = $("#main");
  main.innerHTML = "";
  main.appendChild(el(`<div class="view"><div class="card empty-state"><p>Loading stats…</p></div></div>`));
  renderNav();

  let events = [];
  let progress = null;
  const [activityResult, progressResult] = await Promise.allSettled([
    api("/api/activity?limit=2000"),
    api("/api/stats/progress"),
  ]);
  if (activityResult.status === "fulfilled") events = activityResult.value.events || [];
  else toastError(activityResult.reason.message);
  if (progressResult.status === "fulfilled") progress = progressResult.value;

  paint(events, progress);
  loadInsight();
}

// A compact, tappable "this week" bar chart — real data (questions
// actually completed each day, from the same activity log everything else
// on this page reads from), not placeholder numbers. Tapping/selecting a
// bar highlights it and swaps in its exact count below, rather than
// requiring a hover (which doesn't exist on a touchscreen).
function buildWeeklyActivityCard(events) {
  const completedEvents = events.filter((e) => e.event_type === "reveal");
  const today = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const counts = days.map((day) => completedEvents.filter((e) => (e.occurred_at || "").slice(0, 10) === day).length);
  const max = Math.max(1, ...counts);
  const width = 320, height = 120;
  const barGap = 10;
  const barWidth = (width - barGap * (days.length - 1)) / days.length;
  const bars = days
    .map((day, i) => {
      const barHeight = Math.max(4, (counts[i] / max) * (height - 30));
      const x = i * (barWidth + barGap);
      const y = height - 20 - barHeight;
      const dayLabel = new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2);
      return `
        <g class="week-bar" data-day="${day}" data-count="${counts[i]}" tabindex="0" role="button" aria-label="${day}: ${counts[i]} questions completed">
          <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="4" fill="var(--primary)" opacity="0.5"/>
          <text x="${(x + barWidth / 2).toFixed(1)}" y="${height - 6}" font-size="10" text-anchor="middle" fill="var(--text-muted)">${escapeHtml(dayLabel)}</text>
        </g>`;
    })
    .join("");

  const card = el(`
    <div class="card">
      <div class="section-title" style="font-size:16px;display:flex;align-items:center;gap:8px;">${BARS_HEADER_ICON} This week</div>
      <p class="section-sub" style="margin-top:4px;">Questions completed each day — tap a bar for the exact count.</p>
      <div style="margin-top:12px;overflow-x:auto;">
        <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="This week's completed questions">${bars}</svg>
      </div>
      <p class="section-sub" id="week-chart-detail" style="margin-top:8px;">Tap a day above to see the exact count.</p>
    </div>
  `);

  card.querySelectorAll(".week-bar").forEach((bar) => {
    const activate = () => {
      card.querySelectorAll(".week-bar rect").forEach((r) => r.setAttribute("opacity", "0.5"));
      bar.querySelector("rect").setAttribute("opacity", "1");
      const dateLabel = new Date(`${bar.dataset.day}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
      const count = bar.dataset.count;
      card.querySelector("#week-chart-detail").textContent = `${dateLabel}: ${count} question${count === "1" ? "" : "s"} completed.`;
    };
    bar.addEventListener("click", activate);
    bar.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); }
    });
  });

  return card;
}

function buildFocusCard(focusAreas) {
  const card = el(`
    <div class="card">
      <div class="section-title" style="font-size:16px;display:flex;align-items:center;gap:8px;">${AIM_HEADER_ICON} Focus areas</div>
      <p class="section-sub" style="margin-top:4px;">Where to spend your next study session, ranked worst-first.</p>
    </div>
  `);
  if (!focusAreas || focusAreas.length === 0) {
    card.appendChild(el(`<p class="section-sub" style="margin-top:10px;">Not enough data yet — complete a few more questions and this will fill in.</p>`));
    return card;
  }
  const list = el(`<div class="focus-list"></div>`);
  focusAreas.forEach((t, idx) => {
    const bits = [`${t.completed}/${t.total} done (${t.completionPct}%)`];
    if (t.accuracyPct !== null) bits.push(`${t.accuracyPct}% accuracy`);
    list.appendChild(el(`
      <div class="focus-item">
        <span class="focus-item-rank">${idx + 1}</span>
        <div class="focus-item-body">
          <div class="focus-item-title">${escapeHtml(t.topic)}</div>
          <div class="focus-item-sub">${escapeHtml(bits.join(" · "))}</div>
        </div>
      </div>
    `));
  });
  card.appendChild(list);
  return card;
}

function buildProgressByTopicCard(topics) {
  const card = el(`
    <div class="card">
      <div class="section-title" style="font-size:16px;display:flex;align-items:center;gap:8px;">${LIST_HEADER_ICON} Progress by topic</div>
      <p class="section-sub" style="margin-top:4px;">Completion and accuracy across everything in your curriculum.</p>
    </div>
  `);
  if (!topics || topics.length === 0) {
    card.appendChild(el(`<p class="section-sub" style="margin-top:10px;">No topics yet.</p>`));
    return card;
  }
  const list = el(`<div class="weak-list"></div>`);
  topics.forEach((t) => {
    const fillClass = t.completionPct >= 80 ? "is-success" : t.completionPct >= 40 ? "" : "is-danger";
    const accuracyBit = t.accuracyPct !== null ? `<span class="weak-row-sub">${t.accuracyPct}% accuracy over ${t.attempts} attempt${t.attempts === 1 ? "" : "s"}</span>` : "";
    list.appendChild(el(`
      <div class="weak-row">
        <span class="weak-row-label">${escapeHtml(t.topic)}</span>
        <div class="weak-row-bar"><div class="weak-row-fill ${fillClass}" style="width:${t.completionPct}%"></div></div>
        <span class="weak-row-pct">${t.completed}/${t.total} · ${t.completionPct}%</span>
        ${accuracyBit}
      </div>
    `));
  });
  card.appendChild(list);
  return card;
}

function buildInsightCard() {
  return el(`
    <div class="card">
      <div class="group-days">AI-generated</div>
      <div class="section-title" style="font-size:16px;margin-top:2px;display:flex;align-items:center;gap:8px;">${SPARKLE_HEADER_ICON} Your coaching insight</div>
      <div id="insight-body" style="margin-top:10px;"><p class="section-sub">Generating your insight…</p></div>
    </div>
  `);
}

async function loadInsight() {
  const body = $("#insight-body");
  if (!body) return;
  try {
    const data = await api("/api/stats/insight");
    if (data.limited) {
      body.innerHTML = "";
      body.appendChild(el(`<p class="section-sub">${escapeHtml(data.message)}</p>`));
      return;
    }
    body.innerHTML = "";
    body.appendChild(el(`<p style="font-size:14px;line-height:1.6;">${escapeHtml(data.insight)}</p>`));
    if (data.generatedBy) {
      body.appendChild(el(`<p class="section-sub" style="margin-top:8px;">via ${escapeHtml(data.generatedBy)}${data.cached ? " · today's insight, cached" : ""}</p>`));
    }
  } catch (err) {
    body.innerHTML = "";
    body.appendChild(el(`<p class="form-error">${escapeHtml(err.message)}</p>`));
  }
}

function paint(events, progress) {
  const currentUser = state.currentUser;
  const main = $("#main");
  main.innerHTML = "";
  const view = el(`<div class="view"></div>`);

  view.appendChild(el(`
    <div class="card">
      <div class="section-title">Stats</div>
      <p class="section-sub" style="margin-top:6px;">Your progress over time, and where to focus next.</p>
    </div>
  `));

  view.appendChild(el(`
    <div class="stat-grid">
      <div class="stat-tile"><div class="stat-tile-top">${STREAK_TILE_ICON}<div class="stat-tile-value">${(currentUser.streak && currentUser.streak.count) || 0}</div></div><div class="stat-tile-label">Current streak</div></div>
      <div class="stat-tile"><div class="stat-tile-top">${TROPHY_TILE_ICON}<div class="stat-tile-value">${(currentUser.streak && currentUser.streak.longest) || 0}</div></div><div class="stat-tile-label">Longest streak</div></div>
      <div class="stat-tile"><div class="stat-tile-top">${CHECKLIST_TILE_ICON}<div class="stat-tile-value">${events.length}</div></div><div class="stat-tile-label">Logged actions</div></div>
      <div class="stat-tile"><div class="stat-tile-top">${DONUT_TILE_ICON}<div class="stat-tile-value">${progress ? progress.overall.completionPct + "%" : "—"}</div></div><div class="stat-tile-label">Overall completion</div></div>
    </div>
  `));

  view.appendChild(buildWeeklyActivityCard(events));
  view.appendChild(buildFocusCard(progress ? progress.focusAreas : null));
  view.appendChild(buildInsightCard());

  const reviewEvents = events.filter((e) => e.event_type === "review" && e.result).slice().reverse();

  const byDay = {};
  reviewEvents.forEach((e) => {
    const day = (e.occurred_at || "").slice(0, 10);
    if (!byDay[day]) byDay[day] = { got: 0, again: 0 };
    if (e.result === "got_it") byDay[day].got++;
    else byDay[day].again++;
  });
  const days = Object.keys(byDay).sort().slice(-14);
  const trendData = days.map((d) => {
    const { got, again } = byDay[d];
    const total = got + again;
    return { label: d.slice(5), value: total ? Math.round((got / total) * 100) : 0 };
  });

  const chartCard = el(`
    <div class="card">
      <div class="section-title" style="font-size:16px;display:flex;align-items:center;gap:8px;">${BARS_HEADER_ICON} Accuracy trend</div>
      <p class="section-sub" style="margin-top:4px;">% marked "got it" on each day you reviewed, last ${trendData.length || 0} days.</p>
    </div>
  `);
  if (trendData.length === 0) {
    chartCard.appendChild(el(`<p class="section-sub" style="margin-top:14px;">No review history yet — run a daily review to start building this.</p>`));
  } else {
    chartCard.appendChild(buildBarChartSvg(trendData));
  }
  view.appendChild(chartCard);

  view.appendChild(buildProgressByTopicCard(progress ? progress.topics : null));

  const questionAgg = {};
  reviewEvents.forEach((e) => {
    if (e.question_id) {
      const key = e.question_id;
      questionAgg[key] = questionAgg[key] || { total: 0, again: 0, text: e.question_text };
      questionAgg[key].total++;
      if (e.result === "again") questionAgg[key].again++;
    }
  });

  const weakQuestions = Object.keys(questionAgg)
    .map((qid) => ({ qid, ...questionAgg[qid], rate: questionAgg[qid].again / questionAgg[qid].total }))
    .filter((x) => x.total >= 2 && x.rate > 0)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 8);

  const weakQCard = el(`<div class="card"><div class="section-title" style="font-size:16px;display:flex;align-items:center;gap:8px;">${AIM_HEADER_ICON} Weakest questions</div></div>`);
  if (weakQuestions.length === 0) {
    weakQCard.appendChild(el(`<p class="section-sub" style="margin-top:8px;">Not enough review history yet.</p>`));
  } else {
    const list = el(`<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;"></div>`);
    weakQuestions.forEach((q) => {
      list.appendChild(el(`
        <div class="weak-row">
          <span class="weak-row-label">${escapeHtml(q.text || q.qid)}</span>
          <span class="weak-row-pct">${Math.round(q.rate * 100)}% again (${q.total}×)</span>
        </div>
      `));
    });
    weakQCard.appendChild(list);
  }
  view.appendChild(weakQCard);

  main.appendChild(view);
  renderNav();
}
