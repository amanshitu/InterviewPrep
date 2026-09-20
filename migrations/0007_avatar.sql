-- Profile picture support. Stored as a data: URL directly in D1 rather
-- than an R2 object — no R2 bucket is configured for this app, and a
-- client-side-resized square avatar (see settings.js) comfortably fits
-- well under the per-column size this app is happy to store in SQLite.
ALTER TABLE users ADD COLUMN avatar_data TEXT;
