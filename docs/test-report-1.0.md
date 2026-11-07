# Test report · Version 1.0 (build v19) · 6 November 2026

All automated suites run in Chromium (Playwright) against the built page, with an in-memory stand-in for
Firebase (Firestore + Auth) that reproduces server timestamps, batches, live snapshots and pending writes.

| Suite | Covers | Checks |
|---|---|---|
| run2 | accounts, login/register, profile, organizer panel | 39 |
| run3 | roster algorithm: familiarity, balance, pairs, groups vs strength | 17 |
| run4 | server-side order, registration time with seconds | 7 |
| run5 | unique names, one entry per account | 13 |
| run6 | server-controlled opening time, clock skew, countdown, retries | 15 |
| run7 | account page, rename, password change, reset, live list | 36 |
| run8 | leave confirmation, organizer approval, 3-hour rule, activity log | 47 |
| run9 | bench moves up, list stays in joining order | 14 |
| run10 | roster/bench counts, courts step, full list | 34 |
| run11 | organizer-only payment info and emails | 11 |
| run12 | feedback: notices, busy buttons, errors, offline, highlights | 38 |
| run13 | 1.0 features: I've paid, record, next week, announcement, QR, presets, undo, late leaves, account deletion | 47 |
| run14 | organizer guide: links, images, anchors, phone layout, dark mode | 10 |
| run15 | one full week end to end: session → countdown → joins → bench → payments → leave requests → roster → played → next week → history → log → deletion | 48 |
| explore | organizer self-leave, removed player, desktop layout, reduced motion, page weight | 7 |
| evalroster | generator vs brute-force optimum (25 random histories, planted groups, stability) | 100% optimum |

| run16 (build v20) | registration flow with the security rules enforced: email sign-up (validation, taken name, email in use, no profile-step flash, join right after), Google sign-up with the profile step, log in, wrong password, reset email, names with İ, "Create an account" link, the published build reproducing the sign-up bug | 71 |

**Result: 383 checks, 0 failures (1.0); 71 more in build v20, 0 failures.**

## Bugs found and fixed during this test
1. **Attendance table collapsed for organizers** (1.0 → fixed in build v17): the new "Late leave" column used a CSS class that collided with the organizer panel's class and stacked the table into one column.
2. **A past group was split by the strength ordering** (fixed in build v19): with courts of different sizes, the "strongest group on the smallest court" step cut a group of 8 court-mates to fill a 2v2. Groups now stay whole on their court; strength only breaks ties.
3. **Guide link from the demo copy** pointed to the wrong folder when the URL ends in `index.html` (fixed before release of the guide).
4. **Email sign-up refused for everyone** (reported by Koray, fixed in build v20): before the account exists the visitor is logged out, and the "is this name taken?" lookup read `names/{key}`, which the published rules only allowed for logged-in people. Firebase refused it and the form showed "Firebase refused this change. Are you signed in as an organizer?". Google sign-up was not affected (its check runs after login). Fix: the page tolerates that refusal and checks the name again right after the account is created; the new rules also let anyone look up a single claim, so a taken name is refused *before* an account is created. The test stand-in now enforces a port of the rules (`test/fakerules.js`), which is what the earlier runs were missing.
5. **Names with the Turkish capital İ** (fixed in build v20 + rules): JavaScript lowercases İ to two characters, the rules engine may not, so the claim key could differ between page and rules and the sign-up would be refused as "name taken". Both sides now fold İ to a plain i first (`nameKey()` / `nameKeyOf()`).

## Not covered by automation
- Firebase security rules run only on Google's servers; they were reviewed by hand against every write the page makes (join, leave request/cancel/leave, rejoin, rename, I've paid, account deletion, organizer writes, log entries) and were published successfully in the console, which also validates their syntax. Since build v20 the test stand-in enforces a JavaScript port of the rules (reads and writes), so a page/rules mismatch like the sign-up bug shows up in the tests.
- The bench limit is enforced by the page, not by the rules: two people joining the last bench place in the same second could both get in. The organizer can remove one.
- Push notifications, the QR library (loaded from a CDN at runtime) and real Google sign-in popups are outside the sandbox.
