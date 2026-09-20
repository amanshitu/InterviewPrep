// Spaced-repetition review, drawn from everything the user has completed.
import { $, $all, el, escapeHtml, toastSuccess, toastError, api, state, renderNav, navigate } from "../app.js";

const DEFAULT_REVIEW_COUNT = 15;

let reviewBatch = []; // [{id, q, a, topic_label, revealed, graded}]

export async function render(count) {
  state.currentView = "review";
  const main = $("#main");
  main.innerHTML = "";
  main.appendChild(el(`<div class="view"><div class="card empty-state"><p>Loading review batch…</p></div></div>`));
  renderNav();
  try {
    const data = await api(`/api/review?count=${count || DEFAULT_REVIEW_COUNT}`);
    reviewBatch = data.questions.map((q) => ({ ...q, revealed: false, graded: false }));
  } catch (err) {
    reviewBatch = [];
    toastError(err.message);
  }
  paint();
}

function paint() {
  const main = $("#main");
  main.innerHTML = "";
  const view = el(`<div class="view"></div>`);

  view.appendChild(el(`
    <div class="card">
      <div class="section-title" style="font-size:20px;">Daily review</div>
      <p class="section-sub" style="margin-top:6px;">${reviewBatch.length} random questions pulled from your completed questions.</p>
      <button class="btn btn-secondary" id="reshuffle-btn" style="margin-top:14px;">New batch</button>
      <button class="btn btn-ghost" id="back-home-btn" style="margin-top:14px;">Back to Today</button>
    </div>
  `));

  if (reviewBatch.length === 0) {
    view.appendChild(el(`
      <div class="card empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M12 2 3 6.5v6C3 17.2 6.9 21.3 12 22.5 17.1 21.3 21 17.2 21 12.5v-6L12 2Z" stroke="currentColor" stroke-width="1.4"/></svg>
        <p>No completed questions yet — finish some of today's questions to unlock review.</p>
      </div>
    `));
  } else {
    const list = el(`<div style="display:flex;flex-direction:column;gap:12px;"></div>`);
    reviewBatch.forEach((item, idx) => {
      list.appendChild(el(`
        <div class="q-card" data-ridx="${idx}">
          <div class="q-topic-tag">${escapeHtml(item.topic_label || "")}</div>
          <div class="q-card-head" style="margin-top:6px;">
            <div>
              <div class="q-index">Q${idx + 1}</div>
              <div class="q-text">${escapeHtml(item.q)}</div>
            </div>
          </div>
          ${item.revealed
            ? `<div class="q-answer">${escapeHtml(item.a)}</div>
               ${item.graded
                 ? `<p class="section-sub" style="margin-top:8px;">Graded: ${item.graded === "got_it" ? "Got it" : "Review again soon"}</p>`
                 : `<div class="q-actions">
                      <button class="btn btn-success btn-small" data-got="${idx}">Got it</button>
                      <button class="btn btn-warn btn-small" data-again="${idx}">Review again soon</button>
                    </div>`}`
            : `<button class="btn btn-secondary btn-small" data-reveal-review="${idx}">Show model answer</button>`}
          ${item.times_shown ? `<div class="section-sub" style="margin-top:8px;">Reviewed ${item.times_shown}× before</div>` : ""}
        </div>
      `));
    });
    view.appendChild(list);
  }

  main.appendChild(view);

  $("#reshuffle-btn", view).addEventListener("click", () => render(reviewBatch.length || DEFAULT_REVIEW_COUNT));
  $("#back-home-btn", view).addEventListener("click", () => navigate("/"));
  $all("[data-reveal-review]", view).forEach((btn) => {
    btn.addEventListener("click", () => {
      reviewBatch[parseInt(btn.dataset.revealReview, 10)].revealed = true;
      paint();
    });
  });
  $all("[data-got]", view).forEach((btn) => {
    btn.addEventListener("click", () => markReviewResult(parseInt(btn.dataset.got, 10), "got_it"));
  });
  $all("[data-again]", view).forEach((btn) => {
    btn.addEventListener("click", () => markReviewResult(parseInt(btn.dataset.again, 10), "again"));
  });

  renderNav();
}

async function markReviewResult(idx, result) {
  const item = reviewBatch[idx];
  if (!item) return;
  item.graded = result;
  paint();
  try {
    await api("/api/questions/review-result", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question_id: item.id, result }),
    });
    toastSuccess(result === "got_it" ? "Nice — noted." : "Got it, we'll bring this back sooner.");
  } catch (err) {
    toastError(err.message);
  }
}
