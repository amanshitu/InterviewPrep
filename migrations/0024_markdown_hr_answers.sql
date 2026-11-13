-- Adds light Markdown formatting to the 60 "HR & Behavioral" question
-- answers (migrations/seed_official_bank.sql / backfilled by 0022).
-- These are long (300-700 word), single-paragraph coaching-advice blocks
-- — a different shape from Mathematics' uniform "worked solution -> one
-- final answer" (migrations/0023), so a different treatment is used here:
--
-- 1. REPLACE(a, '. Close with', '.<blank line>Close with') etc. — inserts
--    a paragraph break before the answer's closing/wrap-up sentence,
--    covering 35 of the 60 (the rest don't use one of these exact
--    transition phrases and are left as a single paragraph rather than
--    guessing at a break point).
-- 2. REPLACE(a, 'STAR', '**STAR**') — bolds every mention of the STAR
--    framework. Safe because SQLite's REPLACE() is case-sensitive (unlike
--    LIKE, which is case-insensitive for ASCII and would have also
--    matched "Start"/"started"/"starting" — checked and ruled out before
--    relying on this).
-- 3. One targeted REPLACE per answer that has an embedded single-quoted
--    "here's the actual line to say" example (19 of the 60) or a short
--    named technique ("disagree and commit", "Product Lead") — bolds
--    that exact span. Each is an exact-substring match: if the text
--    doesn't match precisely, REPLACE silently no-ops rather than
--    corrupting anything, so a transcription slip here is self-limiting.
--
-- Every other answer (no quote, no STAR mention, no closing-phrase match)
-- is left untouched rather than forcing an arbitrary bold choice onto
-- prose that doesn't have one obvious candidate.

UPDATE questions SET a = REPLACE(a, '. Close with', '.

Close with') WHERE set_id = 'hr';
UPDATE questions SET a = REPLACE(a, '. Close by', '.

Close by') WHERE set_id = 'hr';
UPDATE questions SET a = REPLACE(a, '. End with', '.

End with') WHERE set_id = 'hr';
UPDATE questions SET a = REPLACE(a, '. End on', '.

End on') WHERE set_id = 'hr';

UPDATE questions SET a = REPLACE(a, 'STAR', '**STAR**') WHERE set_id = 'hr';

UPDATE questions SET a = REPLACE(a,
  '''17+ years building and running enterprise platforms across SharePoint/M365, Salesforce, .NET and Azure, the last several as a Technical Account Manager and Architecture Lead running multi-client delivery for LTIMindtree-anchored programs.''',
  '**''17+ years building and running enterprise platforms across SharePoint/M365, Salesforce, .NET and Azure, the last several as a Technical Account Manager and Architecture Lead running multi-client delivery for LTIMindtree-anchored programs.''**'
) WHERE id = 'hr1-01';

UPDATE questions SET a = REPLACE(a,
  '''Based on market benchmarking for this scope, I''m targeting the 50-55 LPA range''',
  '**''Based on market benchmarking for this scope, I''m targeting the 50-55 LPA range''**'
) WHERE id = 'hr4-01';

UPDATE questions SET a = REPLACE(a,
  '''I was asked to own the client relationship because engineering alone wasn''t enough to keep the account healthy''',
  '**''I was asked to own the client relationship because engineering alone wasn''t enough to keep the account healthy''**'
) WHERE id = 'hr1-02';

UPDATE questions SET a = REPLACE(a,
  '''My current CTC is X, but that reflects a TAM-plus-Architecture-Lead role at my current organization; the scope of this role and the market band for TDM/EM/Architect titles is meaningfully higher, which is why I''m targeting Y.''',
  '**''My current CTC is X, but that reflects a TAM-plus-Architecture-Lead role at my current organization; the scope of this role and the market band for TDM/EM/Architect titles is meaningfully higher, which is why I''m targeting Y.''**'
) WHERE id = 'hr4-02';

UPDATE questions SET a = REPLACE(a,
  '''As TAM and Architecture Lead I already run RAID logs, steering committees, resourcing and appraisals across concurrent programs — I''m looking for a title and mandate that matches the scope I''m already carrying.''',
  '**''As TAM and Architecture Lead I already run RAID logs, steering committees, resourcing and appraisals across concurrent programs — I''m looking for a title and mandate that matches the scope I''m already carrying.''**'
) WHERE id = 'hr1-03';

UPDATE questions SET a = REPLACE(a,
  '''I''m Manoj, a Technical Account Manager and Architecture Lead with 17 years across SharePoint, Salesforce, .NET and Azure; I run multiple enterprise delivery programs and lead the people side — hiring, appraisals, scaling — for a subcontractor team under LTIMindtree; I''m now looking to step into a TDM/EM or Solution Architect mandate where that scope is the primary job, not an add-on.''',
  '**''I''m Manoj, a Technical Account Manager and Architecture Lead with 17 years across SharePoint, Salesforce, .NET and Azure; I run multiple enterprise delivery programs and lead the people side — hiring, appraisals, scaling — for a subcontractor team under LTIMindtree; I''m now looking to step into a TDM/EM or Solution Architect mandate where that scope is the primary job, not an add-on.''**'
) WHERE id = 'hr1-04';

UPDATE questions SET a = REPLACE(a,
  '''What does success look like in this role at the 6-month and 12-month marks, and how is it measured?''',
  '**''What does success look like in this role at the 6-month and 12-month marks, and how is it measured?''**'
) WHERE id = 'hr4-05';

UPDATE questions SET a = REPLACE(a,
  '''Because I''ve been hands-on across architecture and delivery simultaneously, I''ve sometimes held onto decisions I should have delegated sooner, which is exactly why I''m formalizing the shift toward a management/architect title with clearer delegation boundaries.''',
  '**''Because I''ve been hands-on across architecture and delivery simultaneously, I''ve sometimes held onto decisions I should have delegated sooner, which is exactly why I''m formalizing the shift toward a management/architect title with clearer delegation boundaries.''**'
) WHERE id = 'hr1-06';

UPDATE questions SET a = REPLACE(a, '''disagree and commit''', '**''disagree and commit''**') WHERE id IN ('hr2-06', 'hr3-12');

UPDATE questions SET a = REPLACE(a,
  '''iBoss Tech Solutions, operating as Scalong, is the delivery partner; LTIMindtree holds the prime contract with the end client, so my day-to-day is client-facing architecture and delivery leadership while LTIMindtree manages the overall commercial relationship.''',
  '**''iBoss Tech Solutions, operating as Scalong, is the delivery partner; LTIMindtree holds the prime contract with the end client, so my day-to-day is client-facing architecture and delivery leadership while LTIMindtree manages the overall commercial relationship.''**'
) WHERE id = 'hr1-07';

UPDATE questions SET a = REPLACE(a,
  '''I''ve taken the TAM and Architecture Lead role about as far as its current mandate allows — I''m running program governance and people management at a scope that matches a formal TDM/EM/Architect title, and I want that to be the explicit job rather than something layered onto a TAM function.''',
  '**''I''ve taken the TAM and Architecture Lead role about as far as its current mandate allows — I''m running program governance and people management at a scope that matches a formal TDM/EM/Architect title, and I want that to be the explicit job rather than something layered onto a TAM function.''**'
) WHERE id = 'hr1-08';

UPDATE questions SET a = REPLACE(a,
  '''Based on what you''ve shared about the program''s scope and challenges, I''m confident the blend of architecture depth and delivery/people leadership I''ve built over 17 years maps directly to what you need here.''',
  '**''Based on what you''ve shared about the program''s scope and challenges, I''m confident the blend of architecture depth and delivery/people leadership I''ve built over 17 years maps directly to what you need here.''**'
) WHERE id = 'hr4-08';

UPDATE questions SET a = REPLACE(a,
  '''I worked too many hours and burned out my team by caring too much''',
  '**''I worked too many hours and burned out my team by caring too much''**'
) WHERE id = 'hr2-11';

UPDATE questions SET a = REPLACE(a, '''Product Lead''', '**''Product Lead''**') WHERE id = 'hr1-12';

UPDATE questions SET a = REPLACE(a,
  '''I have a competing offer at Z; I''d genuinely prefer this role if we can close the gap''',
  '**''I have a competing offer at Z; I''d genuinely prefer this role if we can close the gap''**'
) WHERE id = 'hr4-13';

UPDATE questions SET a = REPLACE(a,
  '''the program''s scope narrowed after a client reorg, and I moved on once it was clear the role wouldn''t return to full scope''',
  '**''the program''s scope narrowed after a client reorg, and I moved on once it was clear the role wouldn''t return to full scope''**'
) WHERE id = 'hr1-14';

UPDATE questions SET a = REPLACE(a,
  '''I can''t commit to that date with current scope, but here''s what I can commit to, or here''s what would need to change to hit it,''',
  '**''I can''t commit to that date with current scope, but here''s what I can commit to, or here''s what would need to change to hit it,''**'
) WHERE id = 'hr2-14';

UPDATE questions SET a = REPLACE(a,
  '''In five years I see myself running either a large delivery/engineering organization as a Director-level TDM/EM, or owning enterprise architecture and AI-automation strategy for a business unit — the common thread is owning outcomes at a portfolio level rather than a single program.''',
  '**''In five years I see myself running either a large delivery/engineering organization as a Director-level TDM/EM, or owning enterprise architecture and AI-automation strategy for a business unit — the common thread is owning outcomes at a portfolio level rather than a single program.''**'
) WHERE id = 'hr1-15';
