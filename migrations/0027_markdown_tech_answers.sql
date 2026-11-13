-- Adds light Markdown formatting to the 120 "Technical Architecture"
-- (set_id = 'tech') question answers, continuing the incremental per-
-- category pass (Math 0023, HR 0024, PM 0025, EM 0026).
--
-- Tech's content is a different shape from the coaching-advice sets: each
-- answer is a single, dense 150-300 word paragraph walking through a real
-- architecture decision, with no repeating "give a concrete example"
-- closing sentence and very few embedded quoted dialogue examples. So the
-- treatment here leans almost entirely on readability — inserting
-- paragraph breaks at genuine sentence-initial transition points — rather
-- than the quote-bolding style used for HR/PM/EM:
--
-- 1. REPLACE() before 7 different sentence-initial transition phrases
--    (". Finally,", ". I also", ". I'd also", ". I always", ". My
--    decision", ". My actual", ". In practice,") breaks up the
--    wall-of-text answers at their genuine secondary/closing points.
--    Each phrase is necessarily preceded by a period in the match, so
--    every insertion lands on a real sentence boundary, never mid-
--    sentence. Together these touch 81 of the 120 answers (68%); answers
--    using none of these transitions are left as a single paragraph
--    rather than guessing at an arbitrary break point.
-- 2. A small set of named architecture patterns get a blanket,
--    case-sensitive bold wherever they appear exactly — each checked
--    first to confirm it's a genuinely specific term, not a word that's
--    common enough to dilute the emphasis by over-matching: circuit
--    breaker (4), Saga pattern (1), CQRS (1), Zero Trust (2), modular
--    monolith (2), Conway's Law (1), TOGAF (1), and the quoted term
--    'distributed monolith.' (1, bolded with its existing quote marks
--    intact, matching how it's used in the source text).

UPDATE questions SET a = REPLACE(a, '. Finally,', '.

Finally,') WHERE set_id = 'tech';
UPDATE questions SET a = REPLACE(a, '. I also', '.

I also') WHERE set_id = 'tech';
UPDATE questions SET a = REPLACE(a, '. I''d also', '.

I''d also') WHERE set_id = 'tech';
UPDATE questions SET a = REPLACE(a, '. I always', '.

I always') WHERE set_id = 'tech';
UPDATE questions SET a = REPLACE(a, '. My decision', '.

My decision') WHERE set_id = 'tech';
UPDATE questions SET a = REPLACE(a, '. My actual', '.

My actual') WHERE set_id = 'tech';
UPDATE questions SET a = REPLACE(a, '. In practice,', '.

In practice,') WHERE set_id = 'tech';

UPDATE questions SET a = REPLACE(a, 'circuit breaker', '**circuit breaker**') WHERE set_id = 'tech';
UPDATE questions SET a = REPLACE(a, 'Saga pattern', '**Saga pattern**') WHERE set_id = 'tech';
UPDATE questions SET a = REPLACE(a, 'CQRS', '**CQRS**') WHERE set_id = 'tech';
UPDATE questions SET a = REPLACE(a, 'Zero Trust', '**Zero Trust**') WHERE set_id = 'tech';
UPDATE questions SET a = REPLACE(a, 'modular monolith', '**modular monolith**') WHERE set_id = 'tech';
UPDATE questions SET a = REPLACE(a, 'Conway''s Law', '**Conway''s Law**') WHERE set_id = 'tech';
UPDATE questions SET a = REPLACE(a, 'TOGAF', '**TOGAF**') WHERE set_id = 'tech';
UPDATE questions SET a = REPLACE(a, '''distributed monolith.''', '**''distributed monolith.''**') WHERE set_id = 'tech';
