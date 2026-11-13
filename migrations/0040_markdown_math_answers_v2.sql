-- Re-does the Markdown formatting on the 40 Mathematics question answers
-- (migrations/0021, lightly touched by 0023). 0023 only bolded each
-- answer's final number inside one dense run-on sentence — fine for the
-- coaching-advice categories, but math workings read far better as
-- numbered steps with the actual formulas/expressions set in `code`
-- spans (this app's Markdown renderer — components/layout/Markdown.tsx —
-- supports bold, italic, inline code, and numbered/bulleted lists) so a
-- formula is never run together with surrounding prose. Also wraps the
-- few bare expressions embedded directly in question text (2^10, a
-- quadratic, etc.) in code spans for the same reason.

UPDATE questions SET q = 'What is the sum of the first 50 natural numbers?' WHERE id = 'math-q01';
UPDATE questions SET a = '1. The sum of the first *n* natural numbers is `n(n+1)/2`.
2. For *n* = 50: `50 × 51 / 2 = 1275`, so the sum is **1275**.' WHERE id = 'math-q01';

UPDATE questions SET a = '1. Prime factorize both numbers: `36 = 2² × 3²` and `60 = 2² × 3 × 5`.
2. The HCF takes the lowest power of each common prime factor: `2² × 3 = 12`, so the HCF is **12**.' WHERE id = 'math-q02';

UPDATE questions SET a = '1. Prime factorize both numbers: `12 = 2² × 3` and `18 = 2 × 3²`.
2. The LCM takes the highest power of each prime factor present: `2² × 3² = 36`, so the LCM is **36**.' WHERE id = 'math-q03';

UPDATE questions SET q = 'Find the remainder when `2^10` is divided by 7.' WHERE id = 'math-q04';
UPDATE questions SET a = '1. Compute `2^10 = 1024`.
2. Dividing by 7: `7 × 146 = 1022`, leaving a remainder of `1024 − 1022 = 2`, so the remainder is **2**.' WHERE id = 'math-q04';

UPDATE questions SET a = '1. Write the number as `15k + 7` for some integer *k*.
2. Since `15k` is always divisible by 5, the remainder on dividing by 5 comes only from the 7: `7 ÷ 5` leaves a remainder of **2**.' WHERE id = 'math-q05';

UPDATE questions SET a = '1. The required number is `LCM(12, 15, 20) + 5`.
2. `LCM(12, 15, 20) = 60`, so the smallest such number is `60 + 5 = 65`, i.e. **65**.' WHERE id = 'math-q06';

UPDATE questions SET q = 'Simplify: `0.75 × 0.75 + 0.75 × 0.25 + 0.25 × 0.25`.' WHERE id = 'math-q07';
UPDATE questions SET a = '1. Compute each term: `0.75 × 0.75 = 0.5625`, `0.75 × 0.25 = 0.1875`, `0.25 × 0.25 = 0.0625`.
2. Add them: `0.5625 + 0.1875 + 0.0625 = 0.8125`, i.e. **0.8125** (equivalently 13/16).' WHERE id = 'math-q07';

UPDATE questions SET q = 'What is the value of the square root of `0.0081`?' WHERE id = 'math-q08';
UPDATE questions SET a = '1. Write `0.0081 = 81/10000`.
2. The square root of a fraction is the square root of the numerator over the square root of the denominator: `√81 / √10000 = 9/100 = 0.09`, so the answer is **0.09**.' WHERE id = 'math-q08';

UPDATE questions SET a = '1. Starting from 100, a 20% increase gives `100 × 1.2 = 120`.
2. A 20% decrease on that gives `120 × 0.8 = 96`.
3. The net change is `96 − 100 = −4`, i.e. a net decrease of **4%**.' WHERE id = 'math-q09';

UPDATE questions SET a = '1. Starting from 100, a 25% increase gives `100 × 1.25 = 125`.
2. A 20% decrease on that gives `125 × 0.8 = 100`.
3. The final price equals **100%** of the original — no net change.' WHERE id = 'math-q10';

UPDATE questions SET a = '1. Let the original cost price be `₹x`, so the original selling price (20% profit) is `1.2x`.
2. Buying 10% cheaper and selling ₹30 more gives a new cost price of `0.9x` and a new selling price of `1.2x + 30`.
3. A 40% gain on the new cost price means `1.4 × 0.9x = 1.26x` equals that new selling price.
4. Solving `1.26x = 1.2x + 30` gives `0.06x = 30`, so `x = 500`, i.e. a cost price of **₹500**.' WHERE id = 'math-q11';

UPDATE questions SET a = '1. The amount after 2 years at 20% compounded annually is `15,000 × (1.2)² = 15,000 × 1.44 = ₹21,600`.
2. The compound interest is `21,600 − 15,000 = 6,600`, i.e. **₹6,600**.' WHERE id = 'math-q12';

UPDATE questions SET a = '1. The amount in year 3 equals the amount in year 2 multiplied by `(1 + rate/100)`, since compound interest grows the existing amount by one more year''s interest.
2. So `5,717.25 / 5,445 = 1.05`, meaning the rate is `0.05`, i.e. **5% per annum**.' WHERE id = 'math-q13';

UPDATE questions SET a = '1. Let the cost price per article be `₹1`.
2. The selling price of 20 articles equals the cost price of 25 articles: `20 × SP = 25 × 1`, so `SP = 25/20 = 1.25` per article.
3. The profit percentage is `(1.25 − 1) × 100 = 25`, i.e. **25%**.' WHERE id = 'math-q14';

UPDATE questions SET a = '1. The cost price is `₹1,200`, regardless of the loss actually taken.
2. To gain 10% instead, the selling price should be `1,200 × 1.1 = 1,320`, i.e. **₹1,320**.' WHERE id = 'math-q15';

UPDATE questions SET a = '1. Apply both discounts to a base of 100: `100 × 0.9 × 0.8 = 72`.
2. The final price is 72% of the original, which corresponds to a single equivalent discount of `100 − 72 = 28`, i.e. **28%**.' WHERE id = 'math-q16';

UPDATE questions SET a = '1. Let the numbers be `4x` and `5x`.
2. After subtracting 6 from each: `(4x − 6)/(5x − 6) = 3/4`.
3. Cross-multiplying gives `4(4x − 6) = 3(5x − 6)` → `16x − 24 = 15x − 18` → `x = 6`, so the numbers are **24 and 30**.' WHERE id = 'math-q17';

UPDATE questions SET a = '1. The sum of all 11 numbers is `11 × 48 = 528`.
2. The sum of the first 6 is `6 × 45 = 270`, and the sum of the last 6 is `6 × 52 = 312`.
3. The 6th number is counted in both groups, so `270 + 312 = 582` double-counts it: `582 − 528 = 54` gives the 6th number, i.e. **54**.' WHERE id = 'math-q18';

UPDATE questions SET a = '1. By the rule of alligation, the ratio of cheaper to dearer quantity is `(dearer price − mean price) : (mean price − cheaper price)`.
2. Substituting: `(30 − 24) : (24 − 20) = 6 : 4 = 3 : 2`, so the rice should be mixed in the ratio **3:2**.' WHERE id = 'math-q19';

UPDATE questions SET a = '1. Let A''s age 10 years ago be `x` and B''s be `2x`.
2. Today their ages are `x + 10` and `2x + 10`, in the ratio 3:5: `(x + 10)/(2x + 10) = 3/5`.
3. Cross-multiplying gives `5(x + 10) = 3(2x + 10)` → `5x + 50 = 6x + 30` → `x = 20`, so A''s present age is `x + 10 = 30`, i.e. **30 years**.' WHERE id = 'math-q20';

UPDATE questions SET a = '1. The mixture has `40 × 0.1 = 4` litres of water and 36 litres of milk.
2. Adding `w` litres of water gives a new total of `(40 + w)` litres and new water content of `(4 + w)` litres.
3. Setting `(4 + w)/(40 + w) = 0.2` gives `4 + w = 8 + 0.2w` → `0.8w = 4` → `w = 5`, i.e. **5 litres**.' WHERE id = 'math-q21';

UPDATE questions SET a = '1. The total weight of all 25 students is `25 × 52 = 1,300` kg.
2. After one leaves, the remaining 24 students weigh `24 × 51.5 = 1,236` kg in total.
3. The student who left weighs `1,300 − 1,236 = 64` kg, i.e. **64 kg**.' WHERE id = 'math-q22';

UPDATE questions SET a = '1. The fraction of milk is `2/5 = 0.4` in Vessel A and `4/5 = 0.8` in Vessel B.
2. By alligation, to reach a target fraction of 0.5, the ratio of A to B is `(0.8 − 0.5) : (0.5 − 0.4) = 0.3 : 0.1 = 3 : 1`, so they should be mixed in the ratio **3:1** (A to B).' WHERE id = 'math-q23';

UPDATE questions SET a = '1. Let the numbers of ₹1, ₹0.50, and ₹0.25 coins be `5x`, `6x`, and `8x`.
2. Their total value is `5x×1 + 6x×0.50 + 8x×0.25 = 5x + 3x + 2x = 10x`.
3. Setting `10x = 210` gives `x = 21`, so the number of ₹0.50 coins is `6 × 21 = 126`, i.e. **126**.' WHERE id = 'math-q24';

UPDATE questions SET a = '1. The original speed is `420/6 = 70` km/h.
2. Increasing it by 10 km/h gives a new speed of `80` km/h.
3. The new time is `420/80 = 5.25` hours, i.e. **5 hours and 15 minutes**.' WHERE id = 'math-q25';

UPDATE questions SET a = '1. Moving in opposite directions, the relative speed is `54 + 36 = 90` km/h `= 90 × 5/18 = 25` m/s.
2. The distance to cover while crossing is the sum of lengths: `120 + 180 = 300` m.
3. Time taken is `300/25 = 12`, i.e. **12 seconds**.' WHERE id = 'math-q26';

UPDATE questions SET a = '1. Upstream speed is `24/6 = 4` km/h, and downstream speed is `24/4 = 6` km/h.
2. The boat''s speed in still water is the average: `(4 + 6)/2 = 5` km/h.
3. The stream''s speed is half the difference: `(6 − 4)/2 = 1` km/h.

The boat''s speed is **5 km/h** and the stream''s speed is **1 km/h**.' WHERE id = 'math-q27';

UPDATE questions SET a = '1. A''s rate is `1/20` per day and B''s rate is `1/30` per day, so combined: `1/20 + 1/30 = 3/60 + 2/60 = 5/60 = 1/12` per day.
2. In 5 days together they complete `5/12` of the work, leaving `7/12` remaining.
3. B alone takes `(7/12) ÷ (1/30) = (7/12) × 30 = 17.5` days to finish the rest, i.e. **17.5 days**.' WHERE id = 'math-q28';

UPDATE questions SET a = '1. Their combined one-day work is `1/10 + 1/15 + 1/30 = 3/30 + 2/30 + 1/30 = 6/30 = 1/5`.
2. Working together, they complete the entire work in `1 ÷ (1/5) = 5` days, i.e. **5 days**.' WHERE id = 'math-q29';

UPDATE questions SET a = '1. The train''s speed is `72 km/h = 72 × 5/18 = 20` m/s.
2. To fully cross the platform, it must cover its own length plus the platform''s: `300 + 500 = 800` m.
3. Time taken is `800/20 = 40`, i.e. **40 seconds**.' WHERE id = 'math-q30';

UPDATE questions SET a = '1. Let the usual time be `t`. Walking at `4/5` of the usual speed gives a new time of `t ÷ (4/5) = 1.25t` (time and speed are inversely proportional for a fixed distance).
2. The extra time is `1.25t − t = 0.25t`, and this equals 10 minutes.
3. So `0.25t = 10` gives `t = 40`, i.e. **40 minutes**.' WHERE id = 'math-q31';

UPDATE questions SET a = '1. The speed difference, `60 − 48 = 12` km/h, represents distance lost to stoppages each hour.
2. At the train''s actual moving speed of 60 km/h, covering this lost 12 km takes `12/60 = 0.2` hour `= 12` minutes.

The train stops for **12 minutes per hour** on average.' WHERE id = 'math-q32';

UPDATE questions SET q = 'If `x + 1/x = 5`, find the value of `x² + 1/x²`.' WHERE id = 'math-q33';
UPDATE questions SET a = '1. Squaring both sides of `x + 1/x = 5` gives `(x + 1/x)² = x² + 2 + 1/x² = 25`.
2. So `x² + 1/x² = 25 − 2 = 23`, i.e. **23**.' WHERE id = 'math-q33';

UPDATE questions SET q = 'Solve for x: `2x² − 7x + 3 = 0`.' WHERE id = 'math-q34';
UPDATE questions SET a = '1. Using the quadratic formula with `a = 2, b = −7, c = 3`, the discriminant is `(−7)² − 4(2)(3) = 49 − 24 = 25`, and `√25 = 5`.
2. So `x = (7 ± 5)/4`, giving `x = 3` or `x = 0.5`.

The two solutions are **x = 3** and **x = 0.5**.' WHERE id = 'math-q34';

UPDATE questions SET a = '1. By Heron''s formula, the semi-perimeter is `s = (13 + 14 + 15)/2 = 21`.
2. The area is `√(s(s−a)(s−b)(s−c)) = √(21 × 8 × 7 × 6) = √7056 = 84`, i.e. **84 cm²**.' WHERE id = 'math-q35';

UPDATE questions SET q = 'The circumference of a circle is 44 cm. Find its area. (Use `π = 22/7`.)' WHERE id = 'math-q36';
UPDATE questions SET a = '1. From the circumference formula, `2πr = 44`, so `r = 44 ÷ (2 × 22/7) = 44 × 7/44 = 7` cm.
2. The area is `πr² = 22/7 × 49 = 154`, i.e. **154 cm²**.' WHERE id = 'math-q36';

UPDATE questions SET q = 'The three angles of a triangle are in the ratio `x : 2x : 3x` (in degrees). Find the value of x.' WHERE id = 'math-q37';
UPDATE questions SET a = '1. The angles of a triangle sum to 180°: `x + 2x + 3x = 6x = 180`.
2. So `x = 30`, i.e. **30**.' WHERE id = 'math-q37';

UPDATE questions SET a = '1. The ladder, wall, and ground form a right triangle.
2. By the Pythagorean theorem, the height is `√(17² − 8²) = √(289 − 64) = √225 = 15`, i.e. **15 metres**.' WHERE id = 'math-q38';

UPDATE questions SET q = 'Factorize: `x² − 5x + 6`.' WHERE id = 'math-q39';
UPDATE questions SET a = '1. Looking for two numbers that multiply to 6 and add to −5 gives `−2` and `−3`.
2. So `x² − 5x + 6` factorizes as **(x − 2)(x − 3)**.' WHERE id = 'math-q39';

UPDATE questions SET a = '1. The side length is the cube root of 512: `8` cm, since `8³ = 512`.
2. The total surface area of a cube is `6 × side² = 6 × 64 = 384`, i.e. **384 cm²**.' WHERE id = 'math-q40';
