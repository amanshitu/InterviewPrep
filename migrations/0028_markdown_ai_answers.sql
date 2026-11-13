-- Adds light Markdown formatting to the 45 "AI Automation & Product"
-- (set_id = 'ai') question answers, completing the Interview Prep
-- category's incremental markdown pass (Math 0023, HR 0024, PM 0025,
-- EM 0026, Tech 0027).
--
-- Like Tech, AI's answers are dense single-paragraph architecture/product
-- explanations rather than the coaching-advice shape of HR/PM/EM, so the
-- same readability-first treatment applies:
--
-- 1. REPLACE() before 7 sentence-initial transition phrases (". Finally,",
--    ". I also", ". I'd also", ". Ultimately", ". Practically,", ". My
--    practical", ". My honest") breaks up the wall-of-text answers at
--    genuine sentence boundaries. Together these touch 37 of the 45
--    answers (82%); the rest are left as a single paragraph.
-- 2. A small set of named frameworks/terms get a blanket, case-sensitive
--    bold wherever they appear exactly, each checked first to confirm the
--    match count is concentrated and won't dilute emphasis by
--    over-matching: MoSCoW (1), RICE (1), EU AI Act (2), catastrophic
--    forgetting (1), prompt injection (5), Center of Excellence (2), and
--    two quoted terms bolded with their existing quote marks intact as
--    used in the source text — 'AI theater' (1) and 'last mile' (1).

UPDATE questions SET a = REPLACE(a, '. Finally,', '.

Finally,') WHERE set_id = 'ai';
UPDATE questions SET a = REPLACE(a, '. I also', '.

I also') WHERE set_id = 'ai';
UPDATE questions SET a = REPLACE(a, '. I''d also', '.

I''d also') WHERE set_id = 'ai';
UPDATE questions SET a = REPLACE(a, '. Ultimately', '.

Ultimately') WHERE set_id = 'ai';
UPDATE questions SET a = REPLACE(a, '. Practically,', '.

Practically,') WHERE set_id = 'ai';
UPDATE questions SET a = REPLACE(a, '. My practical', '.

My practical') WHERE set_id = 'ai';
UPDATE questions SET a = REPLACE(a, '. My honest', '.

My honest') WHERE set_id = 'ai';

UPDATE questions SET a = REPLACE(a, 'MoSCoW', '**MoSCoW**') WHERE set_id = 'ai';
UPDATE questions SET a = REPLACE(a, 'RICE', '**RICE**') WHERE set_id = 'ai';
UPDATE questions SET a = REPLACE(a, 'EU AI Act', '**EU AI Act**') WHERE set_id = 'ai';
UPDATE questions SET a = REPLACE(a, 'catastrophic forgetting', '**catastrophic forgetting**') WHERE set_id = 'ai';
UPDATE questions SET a = REPLACE(a, 'prompt injection', '**prompt injection**') WHERE set_id = 'ai';
UPDATE questions SET a = REPLACE(a, 'Center of Excellence', '**Center of Excellence**') WHERE set_id = 'ai';
UPDATE questions SET a = REPLACE(a, '''AI theater''', '**''AI theater''**') WHERE set_id = 'ai';
UPDATE questions SET a = REPLACE(a, '''last mile''', '**''last mile''**') WHERE set_id = 'ai';
