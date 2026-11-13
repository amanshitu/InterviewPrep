-- Adds light Markdown formatting to the "Railway Exam" (set_id =
-- 'railway-exam-bank', 300 questions) question answers — the first
-- category outside Interview Prep in the incremental markdown pass.
-- This content is a different shape again: short, single-sentence
-- factual GK/aptitude/reasoning answers (~200 chars avg) rather than
-- long coaching paragraphs or dense architecture explanations, so there's
-- no paragraph-break need. Per the user's explicit choice, each answer is
-- individually reviewed and the specific fact that most directly answers
-- the question is bolded (a named entity, a date, a computed value) —
-- the same "bold the final answer" idea used for Math (0023), now applied
-- across a GK/aptitude/reasoning bank. Each REPLACE is an exact-substring
-- match scoped to one id, so a mismatch silently no-ops rather than
-- corrupting anything.
--
-- This is part 1 of 3 (questions railway-q01 through railway-q100).
-- railway-q09's answer is left unbolded — its content doesn't actually
-- answer its own question (talks about Tejas Express when the question
-- asks about the Delhi-Katra corporatized railway), which looks like a
-- pre-existing content bug unrelated to formatting; flagged separately
-- rather than silently bolding a wrong answer.

UPDATE questions SET a = REPLACE(a, 'Lord Dalhousie', '**Lord Dalhousie**') WHERE id = 'railway-q01';
UPDATE questions SET a = REPLACE(a, 'Gorakhpur railway station', '**Gorakhpur railway station**') WHERE id = 'railway-q02';
UPDATE questions SET a = REPLACE(a, 'Centre for Railway Information Systems', '**Centre for Railway Information Systems**') WHERE id = 'railway-q03';
UPDATE questions SET a = REPLACE(a, 'East Central Railway', '**East Central Railway**') WHERE id = 'railway-q04';
UPDATE questions SET a = REPLACE(a, '34 km stretch from Bori Bunder (Bombay) to Thane', '**34 km stretch from Bori Bunder (Bombay) to Thane**') WHERE id = 'railway-q05';
UPDATE questions SET a = REPLACE(a, 'Panval Nadi Viaduct', '**Panval Nadi Viaduct**') WHERE id = 'railway-q06';
UPDATE questions SET a = REPLACE(a, 'Rail Coach Factory (RCF), Kapurthala', '**Rail Coach Factory (RCF), Kapurthala**') WHERE id = 'railway-q07';
UPDATE questions SET a = REPLACE(a, '2016-17 Railway Budget', '**2016-17 Railway Budget**') WHERE id = 'railway-q08';
UPDATE questions SET a = REPLACE(a, '1,676 mm (5 ft 6 in)', '**1,676 mm (5 ft 6 in)**') WHERE id = 'railway-q10';
UPDATE questions SET a = REPLACE(a, '"USBJO"', '**"USBJO"**') WHERE id = 'railway-q11';
UPDATE questions SET a = REPLACE(a, '6×7 = 42', '6×7 = **42**') WHERE id = 'railway-q12';
UPDATE questions SET a = REPLACE(a, 'the man''s sister', 'the man''s **sister**') WHERE id = 'railway-q13';
UPDATE questions SET a = REPLACE(a, 'Neither conclusion follows', '**Neither conclusion follows**') WHERE id = 'railway-q14';
UPDATE questions SET a = REPLACE(a, 'gives South-West', 'gives **South-West**') WHERE id = 'railway-q15';
UPDATE questions SET a = REPLACE(a, 'Letter → Word → Phrase → Sentence → Paragraph', '**Letter → Word → Phrase → Sentence → Paragraph**') WHERE id = 'railway-q16';
UPDATE questions SET a = REPLACE(a, 'the uncle (or aunt, depending on A''s gender) of D', 'the **uncle (or aunt, depending on A''s gender)** of D') WHERE id = 'railway-q17';
UPDATE questions SET a = REPLACE(a, 'Agra does not belong', '**Agra** does not belong') WHERE id = 'railway-q18';
UPDATE questions SET a = REPLACE(a, 'Heart : Body (or Human)', '**Heart : Body (or Human)**') WHERE id = 'railway-q19';
UPDATE questions SET a = REPLACE(a, '97.5° − 90° = 7.5°', '97.5° − 90° = **7.5°**') WHERE id = 'railway-q20';
UPDATE questions SET a = REPLACE(a, '20 × (18/5) = 72 km/h', '20 × (18/5) = **72 km/h**') WHERE id = 'railway-q21';
UPDATE questions SET a = REPLACE(a, 'A''s age = 3 × 6 = 18 years', 'A''s age = 3 × 6 = **18 years**') WHERE id = 'railway-q22';
UPDATE questions SET a = REPLACE(a, '₹7,200 − ₹1,800 = ₹5,400', '₹7,200 − ₹1,800 = **₹5,400**') WHERE id = 'railway-q23';
UPDATE questions SET a = REPLACE(a, 'Sum = 6 + 15 = 21', 'Sum = 6 + 15 = **21**') WHERE id = 'railway-q24';
UPDATE questions SET a = REPLACE(a, '500/41.67 ≈ 12 seconds', '500/41.67 ≈ **12 seconds**') WHERE id = 'railway-q25';
UPDATE questions SET a = REPLACE(a, '12,100 − 10,000 = ₹2,100', '12,100 − 10,000 = **₹2,100**') WHERE id = 'railway-q26';
UPDATE questions SET a = REPLACE(a, 'the largest is 65', 'the largest is **65**') WHERE id = 'railway-q27';
UPDATE questions SET a = REPLACE(a, 'Time taken together = 36/5 = 7.2 days', 'Time taken together = 36/5 = **7.2 days**') WHERE id = 'railway-q28';
UPDATE questions SET a = REPLACE(a, 'Area = side² = 16² = 256 cm²', 'Area = side² = 16² = **256 cm²**') WHERE id = 'railway-q29';
UPDATE questions SET a = REPLACE(a, 'profit percentage = 12.5%', 'profit percentage = **12.5%**') WHERE id = 'railway-q30';
UPDATE questions SET a = REPLACE(a, 'Ampere (A)', '**Ampere (A)**') WHERE id = 'railway-q31';
UPDATE questions SET a = REPLACE(a, 'Nitrogen (N₂)', '**Nitrogen (N₂)**') WHERE id = 'railway-q32';
UPDATE questions SET a = REPLACE(a, 'ATP (adenosine triphosphate)', '**ATP (adenosine triphosphate)**') WHERE id = 'railway-q33';
UPDATE questions SET a = REPLACE(a, 'Law of Inertia', '**Law of Inertia**') WHERE id = 'railway-q34';
UPDATE questions SET a = REPLACE(a, 'has a pH of 7', 'has a pH of **7**') WHERE id = 'railway-q35';
UPDATE questions SET a = REPLACE(a, 'The cerebellum', 'The **cerebellum**') WHERE id = 'railway-q36';
UPDATE questions SET a = REPLACE(a, 'formula NaCl, and its chemical name is sodium chloride', 'formula **NaCl**, and its chemical name is **sodium chloride**') WHERE id = 'railway-q37';
UPDATE questions SET a = REPLACE(a, 'Carbon-12 and Carbon-14', '**Carbon-12 and Carbon-14**') WHERE id = 'railway-q38';
UPDATE questions SET a = REPLACE(a, 'diesel-electric system', '**diesel-electric system**') WHERE id = 'railway-q39';
UPDATE questions SET a = REPLACE(a, 'hemoglobin protein', '**hemoglobin** protein') WHERE id = 'railway-q40';
UPDATE questions SET a = REPLACE(a, 'Railway Recruitment Board', '**Railway Recruitment Board**') WHERE id = 'railway-q41';
UPDATE questions SET a = REPLACE(a, 'connecting Maharashtra, Goa, and Karnataka', 'connecting **Maharashtra, Goa, and Karnataka**') WHERE id = 'railway-q42';
UPDATE questions SET a = REPLACE(a, 'Public Sector Undertaking', '**Public Sector Undertaking**') WHERE id = 'railway-q43';
UPDATE questions SET a = REPLACE(a, 'doubling the average speed of freight trains', '**doubling the average speed of freight trains**') WHERE id = 'railway-q44';
UPDATE questions SET a = REPLACE(a, '(Kevadiya)', '(**Kevadiya**)') WHERE id = 'railway-q45';
UPDATE questions SET a = REPLACE(a, 'The next number is 42', 'The next number is **42**') WHERE id = 'railway-q46';
UPDATE questions SET a = REPLACE(a, 'coded as "EPH"', 'coded as **"EPH"**') WHERE id = 'railway-q47';
UPDATE questions SET a = REPLACE(a, 'C is A''s maternal aunt or uncle', 'C is A''s **maternal aunt or uncle**') WHERE id = 'railway-q48';
UPDATE questions SET a = REPLACE(a, 'A syllogism is a form of logical reasoning', 'A **syllogism** is a form of logical reasoning') WHERE id = 'railway-q49';
UPDATE questions SET a = REPLACE(a, 'lateral inversion', '**lateral inversion**') WHERE id = 'railway-q50';
UPDATE questions SET a = REPLACE(a, '150 / 20 = 7.5 seconds', '150 / 20 = **7.5 seconds**') WHERE id = 'railway-q51';
UPDATE questions SET a = REPLACE(a, '(P times R times T) / 100', '**(P times R times T) / 100**') WHERE id = 'railway-q52';
UPDATE questions SET a = REPLACE(a, 'The numbers are 3x = 24 and 5x = 40', 'The numbers are 3x = **24** and 5x = **40**') WHERE id = 'railway-q53';
UPDATE questions SET a = REPLACE(a, 'Average = (Sum of all values) / (Number of values)', '**Average = (Sum of all values) / (Number of values)**') WHERE id = 'railway-q54';
UPDATE questions SET a = REPLACE(a, '500 minus 100 = Rs. 400', '500 minus 100 = **Rs. 400**') WHERE id = 'railway-q55';
UPDATE questions SET a = REPLACE(a, 'A physical change alters', 'A **physical change** alters') WHERE id = 'railway-q56';
UPDATE questions SET a = REPLACE(a, 'A chemical change produces', 'A **chemical change** produces') WHERE id = 'railway-q56';
UPDATE questions SET a = REPLACE(a, 'protein hemoglobin', 'protein **hemoglobin**') WHERE id = 'railway-q57';
UPDATE questions SET a = REPLACE(a, 'equal and opposite reaction', '**equal and opposite reaction**') WHERE id = 'railway-q58';
UPDATE questions SET a = REPLACE(a, 'pH value less than 7', '**pH value less than 7**') WHERE id = 'railway-q59';
UPDATE questions SET a = REPLACE(a, 'pH value greater than 7', '**pH value greater than 7**') WHERE id = 'railway-q59';
UPDATE questions SET a = REPLACE(a, 'ultraviolet (UV) radiation', '**ultraviolet (UV) radiation**') WHERE id = 'railway-q60';
UPDATE questions SET a = REPLACE(a, 'headquarters is at New Delhi', 'headquarters is at **New Delhi**') WHERE id = 'railway-q061';
UPDATE questions SET a = REPLACE(a, 'located in Chennai, Tamil Nadu', 'located in **Chennai, Tamil Nadu**') WHERE id = 'railway-q062';
UPDATE questions SET a = REPLACE(a, 'Chhatrapati Shivaji Maharaj Terminus (CSMT) in Mumbai', '**Chhatrapati Shivaji Maharaj Terminus (CSMT) in Mumbai**') WHERE id = 'railway-q063';
UPDATE questions SET a = REPLACE(a, 'is at Churchgate, Mumbai', 'is at **Churchgate, Mumbai**') WHERE id = 'railway-q064';
UPDATE questions SET a = REPLACE(a, 'is at Garden Reach, Kolkata', 'is at **Garden Reach, Kolkata**') WHERE id = 'railway-q065';
UPDATE questions SET a = REPLACE(a, 'is at Secunderabad, Telangana', 'is at **Secunderabad, Telangana**') WHERE id = 'railway-q066';
UPDATE questions SET a = REPLACE(a, 'is at Gorakhpur, Uttar Pradesh', 'is at **Gorakhpur, Uttar Pradesh**') WHERE id = 'railway-q067';
UPDATE questions SET a = REPLACE(a, 'headquarters at Hajipur, Bihar', 'headquarters at **Hajipur, Bihar**') WHERE id = 'railway-q068';
UPDATE questions SET a = REPLACE(a, 'is at Bhubaneswar, Odisha', 'is at **Bhubaneswar, Odisha**') WHERE id = 'railway-q069';
UPDATE questions SET a = REPLACE(a, 'is at Bilaspur, Chhattisgarh', 'is at **Bilaspur, Chhattisgarh**') WHERE id = 'railway-q070';
UPDATE questions SET a = REPLACE(a, 'is at Jaipur, Rajasthan', 'is at **Jaipur, Rajasthan**') WHERE id = 'railway-q071';
UPDATE questions SET a = REPLACE(a, 'headquartered at Hubballi, Karnataka', 'headquartered at **Hubballi, Karnataka**') WHERE id = 'railway-q072';
UPDATE questions SET a = REPLACE(a, 'ran on April 16, 1853', 'ran on **April 16, 1853**') WHERE id = 'railway-q073';
UPDATE questions SET a = REPLACE(a, 'Great Indian Peninsula Railway (GIPR)', '**Great Indian Peninsula Railway (GIPR)**') WHERE id = 'railway-q074';
UPDATE questions SET a = REPLACE(a, 'starting in 1951-52, with six initial zones', 'starting in **1951-52, with six initial zones**') WHERE id = 'railway-q075';
UPDATE questions SET a = REPLACE(a, 'from 1924 until 2016', '**from 1924 until 2016**') WHERE id = 'railway-q076';
UPDATE questions SET a = REPLACE(a, 'British colonial administration', '**British colonial administration**') WHERE id = 'railway-q077';
UPDATE questions SET a = REPLACE(a, 'journey in 1853', 'journey in **1853**') WHERE id = 'railway-q078';
UPDATE questions SET a = REPLACE(a, 'East Indian Railway Company', '**East Indian Railway Company**') WHERE id = 'railway-q079';
UPDATE questions SET a = REPLACE(a, 'separate zone of Indian Railways in 2010', 'separate zone of Indian Railways in **2010**') WHERE id = 'railway-q080';
UPDATE questions SET a = REPLACE(a, 'introduced in 1969', 'introduced in **1969**') WHERE id = 'railway-q081';
UPDATE questions SET a = REPLACE(a, 'introduced in 1988', 'introduced in **1988**') WHERE id = 'railway-q082';
UPDATE questions SET a = REPLACE(a, 'first launched in 2019', 'first launched in **2019**') WHERE id = 'railway-q083';
UPDATE questions SET a = REPLACE(a, 'point-to-point, non-stop services', '**point-to-point, non-stop services**') WHERE id = 'railway-q084';
UPDATE questions SET a = REPLACE(a, 'speeds of up to 160 km/h', 'speeds of up to **160 km/h**') WHERE id = 'railway-q085';
UPDATE questions SET a = REPLACE(a, '3-tier AC accommodation', '**3-tier AC accommodation**') WHERE id = 'railway-q086';
UPDATE questions SET a = REPLACE(a, '3-tier (3A) service', '**3-tier (3A) service**') WHERE id = 'railway-q087';
UPDATE questions SET a = REPLACE(a, 'fully unreserved, superfast services', '**fully unreserved, superfast services**') WHERE id = 'railway-q088';
UPDATE questions SET a = REPLACE(a, 'operated by IRCTC', 'operated by **IRCTC**') WHERE id = 'railway-q089';
UPDATE questions SET a = REPLACE(a, 'as the Vande Bharat Express', 'as the **Vande Bharat Express**') WHERE id = 'railway-q090';
UPDATE questions SET a = REPLACE(a, 'Broad Gauge (1,676 mm), Metre Gauge (1,000 mm), and Narrow Gauge (762 mm or 610 mm)', '**Broad Gauge (1,676 mm), Metre Gauge (1,000 mm), and Narrow Gauge (762 mm or 610 mm)**') WHERE id = 'railway-q091';
UPDATE questions SET a = REPLACE(a, '25 kV AC (alternating current)', '**25 kV AC (alternating current)**') WHERE id = 'railway-q092';
UPDATE questions SET a = REPLACE(a, 'Eastern DFC (Punjab to West Bengal) and the Western DFC (Mumbai/JNPT to Delhi-NCR)', '**Eastern DFC (Punjab to West Bengal) and the Western DFC (Mumbai/JNPT to Delhi-NCR)**') WHERE id = 'railway-q093';
UPDATE questions SET a = REPLACE(a, 'planning, constructing, and operating India''s Dedicated Freight Corridors', '**planning, constructing, and operating India''s Dedicated Freight Corridors**') WHERE id = 'railway-q094';
UPDATE questions SET a = REPLACE(a, 'about 359 metres above the Chenab River', 'about **359 metres** above the Chenab River') WHERE id = 'railway-q095';
UPDATE questions SET a = REPLACE(a, 'India''s longest combined rail-road bridge', '**India''s longest combined rail-road bridge**') WHERE id = 'railway-q096';
UPDATE questions SET a = REPLACE(a, 'opened in 1914', 'opened in **1914**') WHERE id = 'railway-q097';
UPDATE questions SET a = REPLACE(a, 'reduce fuel costs and carbon emissions', '**reduce fuel costs and carbon emissions**') WHERE id = 'railway-q098';
UPDATE questions SET a = REPLACE(a, 'headquartered in Lucknow', 'headquartered in **Lucknow**') WHERE id = 'railway-q099';
UPDATE questions SET a = REPLACE(a, 'use standard gauge (1,435 mm) tracks', 'use **standard gauge (1,435 mm)** tracks') WHERE id = 'railway-q100';
