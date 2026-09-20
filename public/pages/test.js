// Daily AI-generated multiple-choice test.
import { $, $all, el, escapeHtml, toast, api, state, renderNav, navigate } from "../app.js";

let testBatch = [];

export async function render() {
  state.currentView = "test";
  const main = $("#main");
  main.innerHTML = "";
  main.appendChild(el(`<div class="view"><div class="card empty-state"><p>Loading today's test — generating questions can take a few seconds the first time.</p></div></div>`));
  renderNav();
  try {
    const data = await api("/api/test/today");
    testBatch = data.questions;
  } catch (err) {
    testBatch = [];
    toast(err.message);
  }
  paint();
}

function paint() {
  const main = $("#main");
  main.innerHTML = "";
  const view = el(`<div class="view"></div>`);

  const answeredCount = testBatch.filter((q) => q.answered).length;
  const correctCount = testBatch.filter((q) => q.correct).length;

  view.appendChild(el(`
    <div class="card">
      <div class="section-title" style="font-size:20px;">Daily test</div>
      <p class="section-sub" style="margin-top:6px;">${answeredCount}/${testBatch.length} answered${answeredCount ? ` · ${correctCount} correct` : ""}</p>
      <button class="btn btn-ghost" id="back-home-btn" style="margin-top:14px;">Back to Today</button>
    </div>
  `));

  if (testBatch.length === 0) {
    view.appendChild(el(`
      <div class="card empty-state">
        <p>No completed questions yet — finish some of today's questions to unlock the daily test.</p>
      </div>
    `));
  } else {
    const list = el(`<div style="display:flex;flex-direction:column;gap:12px;"></div>`);
    testBatch.forEach((item, idx) => {
      const card = el(`
        <div class="q-card" data-tidx="${idx}">
          <div class="q-topic-tag">${escapeHtml(item.topic_label || "")}</div>
          <div class="q-card-head" style="margin-top:6px;">
            <div>
              <div class="q-index">Q${idx + 1}</div>
              <div class="q-text">${escapeHtml(item.q)}</div>
            </div>
          </div>
        </div>
      `);
      const optsWrap = el(`<div class="mcq-options"></div>`);
      item.options.forEach((opt, optIdx) => {
        let cls = "mcq-option";
        if (item.answered) {
          if (optIdx === item.correctIndex) cls += " mcq-correct";
          else if (optIdx === item.selectedIndex) cls += " mcq-incorrect";
        }
        const btn = el(`<button type="button" class="${cls}" data-opt="${optIdx}">${escapeHtml(opt)}</button>`);
        if (item.answered) btn.disabled = true;
        else btn.addEventListener("click", () => answerTest(idx, optIdx));
        optsWrap.appendChild(btn);
      });
      card.appendChild(optsWrap);
      list.appendChild(card);
    });
    view.appendChild(list);
  }

  main.appendChild(view);
  $("#back-home-btn", view).addEventListener("click", () => navigate("/"));
  renderNav();
}

async function answerTest(idx, optIdx) {
  const item = testBatch[idx];
  if (!item || item.answered) return;
  try {
    const data = await api("/api/test/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question_id: item.id, selected_index: optIdx }),
    });
    item.answered = true;
    item.selectedIndex = optIdx;
    item.correct = data.correct;
    item.correctIndex = data.correctIndex;
    paint();
  } catch (err) {
    toast(err.message);
  }
}
