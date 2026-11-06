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

**Result: 383 checks, 0 failures.**

## Bugs found and fixed during this test
1. **Attendance table collapsed for organizers** (1.0 → fixed in build v17): the new "Late leave" column used a CSS class that collided with the organizer panel's class and stacked the table into one column.
2. **A past group was split by the strength ordering** (fixed in build v19): with courts of different sizes, the "strongest group on the smallest court" step cut a group of 8 court-mates to fill a 2v2. Groups now stay whole on their court; strength only breaks ties.
3. **Guide link from the demo copy** pointed to the wrong folder when the URL ends in `index.html` (fixed before release of the guide).

## Not covered by automation
- Firebase security rules run only on Google's servers; they were reviewed by hand against every write the page makes (join, leave request/cancel/leave, rejoin, rename, I've paid, account deletion, organizer writes, log entries) and were published successfully in the console, which also validates their syntax.
- The bench limit is enforced by the page, not by the rules: two people joining the last bench place in the same second could both get in. The organizer can remove one.
- Push notifications, the QR library (loaded from a CDN at runtime) and real Google sign-in popups are outside the sandbox.
