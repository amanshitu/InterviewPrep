// One-time generator: reads the AI-generated per-category JSON content
// files (scratchpad/content-gen/*.json, each {"sections":[{"label",
// "questions":[{"q","a"}]}]}) and emits one migration .sql file per
// category — new official (owner_user_id NULL, pre-approved/shared)
// question_sets + questions rows, same seeding convention as
// migrations/0016_seed_railway_exam.sql and friends.
//
// For a brand-new category it also inserts the categories row and tags
// the new set into it. For a top-up to an EXISTING category (users may
// already be enrolled) it skips the categories insert and instead
// backfills user_question_sets for every user already enrolled in that
// category — same pattern as migrations/0022_backfill_interview_prep_official_sets.sql
// — so existing users see the new content without re-enrolling.
//
// Usage: node scripts/import-new-categories.js
// Then apply each generated migrations/00NN_*.sql with
// `wrangler d1 execute interview-prep-db --local --file=...` (and
// `--remote` once reviewed).
"use strict";
const fs = require("fs");
const path = require("path");

const CONTENT_DIR = "C:\\Users\\MANOJ~1.TIW\\AppData\\Local\\Temp\\claude\\3e669211dd4378cf\\05aa7622-8533-45c8-94ba-3b7f22de0cb3\\scratchpad\\content-gen";
const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");
const now = new Date().toISOString();

function sqlStr(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

// migrationNumber, outFile, contentFile, newCategory (true) or topUp (existing category id)
const MANIFEST = [
  {
    migrationNumber: 42,
    contentFile: "upsc-gs.json",
    newCategory: { id: "upsc-gs", name: "UPSC / Civil Services (Prelims GS)", description: "General Studies for UPSC Civil Services Prelims — polity, history, geography, economy, environment, and science & technology." },
    setId: "upsc-gs-bank",
    track: "upsc",
    title: "UPSC Prelims GS Prep",
    slug: "upsc_gs",
  },
  {
    migrationNumber: 43,
    contentFile: "defence-exam.json",
    newCategory: { id: "defence-exam", name: "Defence Exams (NDA/CDS/AFCAT)", description: "General knowledge, current affairs, and defence/military awareness for NDA, CDS, and AFCAT entrance exams." },
    setId: "defence-exam-bank",
    track: "defence",
    title: "Defence Exam Prep",
    slug: "defence",
  },
  {
    migrationNumber: 44,
    contentFile: "insurance-exam.json",
    newCategory: { id: "insurance-exam", name: "Insurance Exams", description: "Insurance awareness, reasoning, and aptitude for LIC, GIC, and NIACL recruitment exams." },
    setId: "insurance-exam-bank",
    track: "insurance",
    title: "Insurance Exam Prep",
    slug: "insurance",
  },
  {
    migrationNumber: 45,
    contentFile: "current-affairs-gk.json",
    newCategory: { id: "current-affairs-gk", name: "Current Affairs & General Knowledge", description: "Static and current general knowledge spanning schemes, awards, sports, and national/international affairs — a cross-cutting GK category useful alongside any other exam." },
    setId: "current-affairs-gk-bank",
    track: "gk",
    title: "Current Affairs & GK Prep",
    slug: "gk",
  },
  {
    migrationNumber: 46,
    contentFile: "judiciary-law.json",
    newCategory: { id: "judiciary-law", name: "Judiciary & Law (CLAT)", description: "Legal reasoning, constitutional law, and legal GK for CLAT and judicial service exams." },
    setId: "judiciary-law-bank",
    track: "law",
    title: "Judiciary & Law Prep",
    slug: "law",
  },
  {
    migrationNumber: 47,
    contentFile: "gate-engineering.json",
    newCategory: { id: "gate-engineering", name: "GATE (Engineering)", description: "Engineering mathematics, general aptitude, and core CS/EE/ME/CE fundamentals for GATE-style exams." },
    setId: "gate-engineering-bank",
    track: "gate",
    title: "GATE Engineering Prep",
    slug: "gate",
  },
  {
    migrationNumber: 48,
    contentFile: "mba-entrance.json",
    newCategory: { id: "mba-entrance", name: "MBA Entrance (CAT/XAT/MAT)", description: "Quantitative aptitude, verbal ability, logical reasoning, and data interpretation for MBA entrance exams." },
    setId: "mba-entrance-bank",
    track: "mba",
    title: "MBA Entrance Prep",
    slug: "mba",
  },
  {
    migrationNumber: 49,
    contentFile: "computer-awareness.json",
    newCategory: { id: "computer-awareness", name: "Computer Awareness / IT", description: "Computer fundamentals, networking, and IT general knowledge — a frequent section in Banking/SSC exams." },
    setId: "computer-awareness-bank",
    track: "computer-awareness",
    title: "Computer Awareness Prep",
    slug: "compaware",
  },
  {
    migrationNumber: 50,
    contentFile: "math-aptitude-topup.json",
    topUpCategoryId: "math-aptitude",
    setId: "math-aptitude-bank-2",
    track: "math",
    title: "Mathematics Prep — Part 2",
    slug: "mathx",
  },
  {
    migrationNumber: 51,
    contentFile: "interview-prep-topup.json",
    topUpCategoryId: "interview-prep",
    setId: "interview-prep-extra",
    track: "interview-prep-extra",
    title: "Interview Prep — Additional Questions",
    slug: "ipx",
  },
];

let grandTotalQuestions = 0;

for (const entry of MANIFEST) {
  const contentPath = path.join(CONTENT_DIR, entry.contentFile);
  if (!fs.existsSync(contentPath)) {
    console.error(`SKIP ${entry.contentFile}: not found yet at ${contentPath}`);
    continue;
  }
  const data = JSON.parse(fs.readFileSync(contentPath, "utf8"));
  const sections = data.sections || [];
  const totalQuestions = sections.reduce((n, s) => n + (s.questions || []).length, 0);
  grandTotalQuestions += totalQuestions;

  const lines = [];
  lines.push(`-- Generated by scripts/import-new-categories.js from scratchpad content-gen/${entry.contentFile}.`);
  lines.push(`-- ${totalQuestions} questions across ${sections.length} sections. Same seeding convention as`);
  lines.push(`-- migrations/0016_seed_railway_exam.sql: owner_user_id NULL, pre-approved/shared.`);
  lines.push("");

  if (entry.newCategory) {
    lines.push(
      `INSERT INTO categories (id, name, description) VALUES (${sqlStr(entry.newCategory.id)}, ${sqlStr(entry.newCategory.name)}, ${sqlStr(entry.newCategory.description)});`,
    );
    lines.push("");
  }

  const categoryId = entry.newCategory ? entry.newCategory.id : entry.topUpCategoryId;

  lines.push(
    `INSERT INTO question_sets (id, owner_user_id, title, track, visibility, created_at, approved_at, approved_by) VALUES (${sqlStr(entry.setId)}, NULL, ${sqlStr(entry.title)}, ${sqlStr(entry.track)}, 'shared', ${sqlStr(now)}, ${sqlStr(now)}, NULL);`,
  );
  lines.push(`INSERT INTO question_set_categories (set_id, category_id) VALUES (${sqlStr(entry.setId)}, ${sqlStr(categoryId)});`);
  lines.push("");

  let questionIndex = 0;
  sections.forEach((section, topicOrder) => {
    (section.questions || []).forEach((q, sortOrder) => {
      questionIndex += 1;
      const uniqueId = `${entry.slug}-q${String(questionIndex).padStart(5, "0")}`;
      lines.push(
        `INSERT INTO questions (id, set_id, topic_label, topic_order, sort_order, q, a, created_at) VALUES (${sqlStr(uniqueId)}, ${sqlStr(entry.setId)}, ${sqlStr(section.label)}, ${topicOrder}, ${sortOrder}, ${sqlStr(q.q)}, ${sqlStr(q.a)}, ${sqlStr(now)});`,
      );
    });
  });
  lines.push("");

  if (entry.topUpCategoryId) {
    lines.push(
      `-- Backfill: subscribe every user already enrolled in '${categoryId}' to this new set,`,
      `-- same pattern as migrations/0022_backfill_interview_prep_official_sets.sql.`,
      `INSERT INTO user_question_sets (user_id, set_id, subscribed_at)`,
      `  SELECT u.id, ${sqlStr(entry.setId)}, ${sqlStr(now)}`,
      `  FROM users u`,
      `  WHERE EXISTS (SELECT 1 FROM user_categories uc WHERE uc.user_id = u.id AND uc.category_id = ${sqlStr(categoryId)})`,
      `    AND NOT EXISTS (SELECT 1 FROM user_question_sets WHERE user_id = u.id AND set_id = ${sqlStr(entry.setId)});`,
    );
    lines.push("");
  }

  const outPath = path.join(MIGRATIONS_DIR, `00${entry.migrationNumber}_seed_${entry.slug}.sql`);
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
  console.log(`Wrote ${outPath} — ${totalQuestions} questions, ${sections.length} sections.`);
}

console.log(`\nGrand total new questions across all generated files so far: ${grandTotalQuestions}`);
