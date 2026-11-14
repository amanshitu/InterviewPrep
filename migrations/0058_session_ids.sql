-- A session's id (used for listing/revoking from Settings → Sessions) is
-- kept separate from its token (the actual cookie secret) so the list
-- endpoint never has to return anything security-sensitive to the client.
ALTER TABLE sessions ADD COLUMN id TEXT;
UPDATE sessions SET id = lower(hex(randomblob(16))) WHERE id IS NULL;
CREATE UNIQUE INDEX idx_sessions_id ON sessions(id);
