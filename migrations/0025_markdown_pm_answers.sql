-- Adds light Markdown formatting to the 75 "Delivery & Program Management"
-- (set_id = 'pm') question answers, continuing the incremental per-category
-- pass started in 0023 (Math) and 0024 (HR). Same shape as HR: long,
-- single-paragraph coaching-advice blocks, so the same three techniques
-- apply:
--
-- 1. REPLACE(a, '. Give a concrete example', '.<blank line>Give a concrete
--    example') and 3 sibling variants ('. Give an example', '. Close with',
--    '. Close by') — inserts a paragraph break before the answer's closing
--    sentence. PM is far more mechanically consistent than HR here: 67 of
--    the 75 answers (89%) end in one of these exact phrases (verified with
--    a case-sensitive GLOB check — all instances use capitalized "Give",
--    there's no lowercase variant actually present). The remaining 8 are
--    left as a single paragraph rather than guessing at a break point.
-- 2. Blanket REPLACE() for named frameworks/artifacts that are unambiguous
--    and exact wherever they appear (case-sensitive REPLACE, so this can't
--    accidentally match "Start-Stop-Continue" or similar lowercase-tailed
--    words): STAR (3 occurrences, all "Use STAR..." — verified via GLOB,
--    not the 14 a case-insensitive LIKE scan found, which was mostly
--    "Start"), RAID (8), SAFe (1), and "Earned Value Management" (1).
-- 3. One targeted REPLACE per answer with an embedded single-quoted
--    "here's the actual line to say" example (6 of the 75) — bolds that
--    exact span. Each is an exact-substring match: if the text doesn't
--    match precisely, REPLACE silently no-ops rather than corrupting
--    anything.
--
-- Every other answer (no quote, no named-framework mention, no closing-
-- phrase match) is left untouched rather than forcing an arbitrary bold
-- choice onto prose that doesn't have one obvious candidate.

UPDATE questions SET a = REPLACE(a, '. Give a concrete example', '.

Give a concrete example') WHERE set_id = 'pm';
UPDATE questions SET a = REPLACE(a, '. Give an example', '.

Give an example') WHERE set_id = 'pm';
UPDATE questions SET a = REPLACE(a, '. Close with', '.

Close with') WHERE set_id = 'pm';
UPDATE questions SET a = REPLACE(a, '. Close by', '.

Close by') WHERE set_id = 'pm';

UPDATE questions SET a = REPLACE(a, 'STAR', '**STAR**') WHERE set_id = 'pm';
UPDATE questions SET a = REPLACE(a, 'RAID', '**RAID**') WHERE set_id = 'pm';
UPDATE questions SET a = REPLACE(a, 'SAFe', '**SAFe**') WHERE set_id = 'pm';
UPDATE questions SET a = REPLACE(a, 'Earned Value Management', '**Earned Value Management**') WHERE set_id = 'pm';

UPDATE questions SET a = REPLACE(a,
  '''this is what it costs.''',
  '**''this is what it costs.''**'
) WHERE id = 'pm4-02';

UPDATE questions SET a = REPLACE(a,
  '''we can hit that date with reduced scope, or hit full scope with more time/resources, or hit both if you can approve additional budget for extra capacity''',
  '**''we can hit that date with reduced scope, or hit full scope with more time/resources, or hit both if you can approve additional budget for extra capacity''**'
) WHERE id = 'pm3-07';

UPDATE questions SET a = REPLACE(a,
  '''delivery predictability has improved from 65% to 88% commitment accuracy over the last quarter''',
  '**''delivery predictability has improved from 65% to 88% commitment accuracy over the last quarter''**'
) WHERE id = 'pm4-05';

UPDATE questions SET a = REPLACE(a,
  '''there''s a meaningful risk to the date, here''s what we''re doing about it''',
  '**''there''s a meaningful risk to the date, here''s what we''re doing about it''**'
) WHERE id = 'pm2-10';

UPDATE questions SET a = REPLACE(a,
  '''is this cadence and format working for you, what would make this more useful''',
  '**''is this cadence and format working for you, what would make this more useful''**'
) WHERE id = 'pm2-07';

UPDATE questions SET a = REPLACE(a,
  '''I''m deeply engaged on X''s crisis today, here''s who''s driving Y and I''ll sync at end of day''',
  '**''I''m deeply engaged on X''s crisis today, here''s who''s driving Y and I''ll sync at end of day''**'
) WHERE id = 'pm5-07';
