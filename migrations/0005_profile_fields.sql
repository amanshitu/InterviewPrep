-- Expanded profile: a headline/current-role, years of experience, and a
-- short bio (all optional, filled in progressively rather than forced at
-- signup — feed into the AI Stats coaching insight for more personalized
-- context) plus the user's IANA timezone (auto-detected client-side at
-- signup, editable in Settings), so daily boundaries (quota reset, the
-- daily test set, AI usage cap) reset at the user's own midnight instead
-- of an arbitrary UTC one.

ALTER TABLE users ADD COLUMN headline TEXT;
ALTER TABLE users ADD COLUMN years_experience INTEGER;
ALTER TABLE users ADD COLUMN bio TEXT;
ALTER TABLE users ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC';
