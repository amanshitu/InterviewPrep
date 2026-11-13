-- Adds light Markdown formatting to the 60 "Engineering & People Management"
-- (set_id = 'em') question answers, continuing the incremental per-category
-- pass (Math in 0023, HR in 0024, PM in 0025).
--
-- EM's answers differ from PM's in one important way: PM's closing
-- "Give a concrete example..." sentence is almost always its own fresh
-- sentence (preceded by a period), while EM mixes that with a much more
-- common variant where the same clause is joined onto the previous
-- sentence with ", and give a concrete example..." (lowercase, mid-
-- sentence). Only the fresh-sentence form gets a paragraph break here —
-- splitting a joined clause would break the sentence's grammar. A
-- case-sensitive GLOB check confirms only the capitalized, sentence-
-- initial form exists in this set (19 of 60 answers, far lower mechanical
-- coverage than PM's 89% — EM's prose just doesn't close as uniformly),
-- so the other 41 are left as a single paragraph.
--
-- Named frameworks/artifacts get a blanket, case-sensitive REPLACE()
-- wherever they appear exactly (STAR, PIP, OKR, RAID, Conway's Law,
-- Situation-Behavior-Impact, Project Aristotle) — each checked via GLOB
-- to confirm it isn't a false-positive substring match before relying on
-- it. 10 answers also get a targeted exact-substring bold for an embedded
-- quoted example phrase (a sample line of feedback, a contrasting pair of
-- goal phrasings, etc.) — if the text doesn't match precisely, REPLACE
-- silently no-ops rather than corrupting anything.
--
-- Verified after applying: 20 distinct em rows contain '**', matching the
-- hand-calculated expected total with no overlapping targets, and no
-- garbled quote artifacts.

UPDATE questions SET a = REPLACE(a, '. Give a concrete example', '.

Give a concrete example') WHERE set_id = 'em';
UPDATE questions SET a = REPLACE(a, '. Close with', '.

Close with') WHERE set_id = 'em';

UPDATE questions SET a = REPLACE(a, 'STAR', '**STAR**') WHERE set_id = 'em';
UPDATE questions SET a = REPLACE(a, 'PIP', '**PIP**') WHERE set_id = 'em';
UPDATE questions SET a = REPLACE(a, 'OKR', '**OKR**') WHERE set_id = 'em';
UPDATE questions SET a = REPLACE(a, 'RAID', '**RAID**') WHERE set_id = 'em';
UPDATE questions SET a = REPLACE(a, 'Conway''s Law', '**Conway''s Law**') WHERE set_id = 'em';
UPDATE questions SET a = REPLACE(a, 'Situation-Behavior-Impact', '**Situation-Behavior-Impact**') WHERE set_id = 'em';
UPDATE questions SET a = REPLACE(a, 'Project Aristotle', '**Project Aristotle**') WHERE set_id = 'em';

UPDATE questions SET a = REPLACE(a, '''would I grab a beer with them''', '**''would I grab a beer with them''**') WHERE id = 'em1-02';
UPDATE questions SET a = REPLACE(a, '''culture add''', '**''culture add''**') WHERE id = 'em1-02';

UPDATE questions SET a = REPLACE(a, '''when X happened, the impact was Y''', '**''when X happened, the impact was Y''**') WHERE id = 'em3-02';

UPDATE questions SET a = REPLACE(a, '''what went well, what would we do differently''', '**''what went well, what would we do differently''**') WHERE id = 'em4-03';

UPDATE questions SET a = REPLACE(a, '''close 20 tickets''', '**''close 20 tickets''**') WHERE id = 'em1-05';
UPDATE questions SET a = REPLACE(a, '''reduce P1 incident recurrence by 30%''', '**''reduce P1 incident recurrence by 30%''**') WHERE id = 'em1-05';

UPDATE questions SET a = REPLACE(a, '''disagree and commit''', '**''disagree and commit''**') WHERE id = 'em3-05';

UPDATE questions SET a = REPLACE(a, '''partially explained''', '**''partially explained''**') WHERE id = 'em3-10';
UPDATE questions SET a = REPLACE(a, '''fully excused''', '**''fully excused''**') WHERE id = 'em3-10';

UPDATE questions SET a = REPLACE(a, '''how does that land for you''', '**''how does that land for you''**') WHERE id = 'em3-13';
UPDATE questions SET a = REPLACE(a, '''what''s your reaction to that''', '**''what''s your reaction to that''**') WHERE id = 'em3-13';

UPDATE questions SET a = REPLACE(a, '''chat and vibe check''', '**''chat and vibe check''**') WHERE id = 'em1-13';

UPDATE questions SET a = REPLACE(a, '''letting it emerge organically''', '**''letting it emerge organically''**') WHERE id = 'em4-15';
