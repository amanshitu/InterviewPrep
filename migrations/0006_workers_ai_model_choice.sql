-- Lets each user pick which Workers AI model generates their MCQs/
-- insight, instead of one hardcoded model for everyone — so if a model
-- gets deprecated (as happened with @cf/meta/llama-3.1-8b-instruct on
-- 2026-05-30), users can self-serve switch to another rather than
-- waiting on a code fix. NULL means "use the app default".
ALTER TABLE users ADD COLUMN workers_ai_model TEXT;
