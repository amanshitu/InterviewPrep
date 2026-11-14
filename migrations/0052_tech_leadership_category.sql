-- Two question_sets existed from before the multi-category system (Sept
-- 2026, community-submitted, owner_user_id NOT NULL so the Phase 7.0
-- migration's "tag every official set into interview-prep" backfill never
-- picked them up) and were orphaned from every category ever since,
-- invisible to any user. Content audit (session validation) found they
-- are personalized senior technical-leadership interview practice
-- material (career story, behavioral STAR, delivery/estimation, technical
-- architecture, AI automation) — thematically close to, but distinct from,
-- the existing generic Interview Prep bank, and containing identifying
-- details (real employer, named colleague, compensation figures) that
-- don't belong in the shared 'interview-prep' category. Given its own
-- dedicated category instead, and the small number of questions that name
-- a specific real program ("Protomiq AI Automation Program") removed
-- entirely rather than just tagged in.

INSERT INTO categories (id, name, description) VALUES (
  'tech-leadership-interview',
  'Technical Leadership Interview Prep',
  'Senior technical delivery, architecture, and AI-automation leadership interview practice — TAM/TDM/TPM, Engineering Manager, and Solution Architect style questions.'
);

INSERT INTO question_set_categories (set_id, category_id) VALUES
  ('b0f90063-9fa5-4258-9d16-820afc2f828e', 'tech-leadership-interview'),
  ('bc58bcd8-f7cb-43e6-b641-7bad43d89f67', 'tech-leadership-interview');

-- Remove every question that names the specific real program ("Protomiq
-- AI Automation Program") anywhere in its question or answer text.
DELETE FROM questions WHERE id IN (
  '4baa5e3a-c1f5-4bd0-9937-eb197055c7ff','60a7f30b-ebee-4032-84da-9f7d115dc62b','421b4890-24d4-4fc5-b789-d1b3ee28fb48',
  '8e59b35b-6316-4514-b530-4587d1f0dbaf','f31683dc-1952-4f06-a6a3-2b5e2c2929fc','71c6882f-1e43-4940-9bb7-a89340229af7',
  '53240e7b-89e3-4c74-a730-25b1ef0c3877','98e457f2-e825-4380-b042-3780c996aed1','6f6271f0-a195-4e8f-99ce-aab4b25d23a6',
  '09c02ef2-aafd-4a37-a322-7a77733fb1b7','ab98f06a-794c-4605-9997-09c021e9570c','da97915f-f4df-4f12-9bde-b5c995448001',
  'eb084cec-c5d9-48e7-bf3d-dce0902d9dea','db9afd5f-47cb-40bc-9ca7-66e668cf1cd6','7011546a-fa74-4f4b-af8c-cfe898c2075d',
  '192ce073-50ac-4019-8ece-ae82da27fd49','e5b45911-8c0a-4de4-8dc4-d189467e30d0','92ea45a9-db2f-4a09-9dc8-554292032043',
  '7aeb8b69-49e5-4119-8087-a71007c1bd80','6eb1d4e6-c2ba-4997-8e49-1284885f4111','ad99a512-2768-474f-ad24-731b731bf247',
  '502c9081-de54-4510-bf87-3ee3514cfcbe','adff6ae9-d795-44ff-9660-2e56010a5c50','e9f43e32-14d1-467f-9d9d-2d65d9b2e809',
  '008a65fb-f0cb-41dd-a7ec-102a5d3a1886','5f6d10ec-aef3-4727-978d-7a83aeccd4f8','b887f601-dd39-4bde-ad8c-c90a7a6cce6f',
  '3713b920-4aae-4af9-b105-7aafd27bba77','907de467-653f-4035-80c4-e9c771b08c4b','c0e66a42-01ec-4824-8368-05eae1dda9ac',
  'bfaf88c1-ccdf-4250-b1c7-6b0dde95d496','f3775862-9c9f-47f7-96fd-5d2aa99a9133','129ee812-41b8-4a90-84e3-6099aa17f037',
  'fa02ed83-f767-468d-80c1-9ed65360e8d2','f6f7431e-8f2d-4973-87fa-4a385dbb1d60','dc2c6950-3dd8-451a-8237-c497b0984701',
  'ae7f6a8f-fbc8-484e-9294-6720e71f923f','8986d531-78e3-4803-8d7e-a1b8a8cebc35','fe451a34-b0c1-4858-bf98-ff75e0863a45',
  'fba7301f-da43-4dac-ab76-98b9c148bea3','e8ddc5b8-41d1-417c-b07a-cca63bf1117a'
);
