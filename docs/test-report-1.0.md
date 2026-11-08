# Test report · Version 1.0 (builds v19 → v25) · 6–8 November 2026

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

## Second full run before going live (7 November, build v20)

Every suite was run again against build v20, this time **with the security rules enforced** by a JavaScript port of
`firestore.rules` inside the stand-in (reads, queries, listeners and every write, including `getAfter` semantics for
batches). Each suite ran twice: with the new rules (as sent on 7 November) and with the rules published before that.

| Run | Checks | Result |
|---|---|---|
| run2, run4–run13 and run15 with the **new rules** enforced | 349 | 0 failures, **0 refused reads or writes** in any flow |
| run2, run5, run7, run8, run10, run11, run13, run15 with the **previously published rules** | 264 | 0 failures (run5 stops after its first two checks because under the old rules a taken name is caught after the account exists, by design) |
| run3 (algorithm), run14 (guide), explore | 34 | 0 failures |
| run16 (registration flow, both rule sets, both ways of lowercasing İ) | 71 | 0 failures; the v19 build reproduces the sign-up bug |
| evalroster | generator vs brute-force optimum | 25/25 optimum, groups recovered 82/82, stable |

Also checked by hand: the deployed `index.html` is identical to `demo/index.html` apart from the Firebase config
(project `volleyball-5fd70`), `version.txt` is `v20` in both copies, all 22 guide screenshots exist, every `data-act`
in the markup has a handler, no syntax newer than 2019 is used (works on iOS 12+; flex `gap` only affects spacing on
iOS below 14.5), and the page is 215 KB.

**Result: 718 checks, 0 failures. No bugs found in this run.**

## Build v21 (7 November, late evening): names with Turkish letters

Reported by Koray right after going live: "Deniz Doğa Çalışkan" could not register ("name already taken") although
the name was free; "Deniz Doga Caliskan" worked. Cause: the page lowercases the name to build the claim key
(Ç → ç), but the rules engine does not lowercase non-ASCII letters, so the key the page wrote never matched the
key the rule computed and the write was refused. Every name on the live list with Turkish letters had them in
lowercase only, which is why it had not shown up before. Fix: the page computes the key (lowercase and
accent-insensitive, so the two spellings above are one name), stores it in the profile for non-ASCII names, and the
rules verify the key strictly only for plain-ASCII names. Existing claims move to the new key on each player's
next visit (their own old claim document is replaced in the same write; nothing else is touched).

| Suite | Covers | Checks |
|---|---|---|
| run17 | production-like data (profiles without nameKey, claims under the old key, pre-unique-names accounts): Deniz renames to the proper spelling, duplicates with or without accents refused, "Çağla Öztürk" / "Özlem Ş." / "İrem" register, migrations for Doğukan, Gürkan (organizer), Talha Ocakçı, Tunç, Koray, the Jörg/Jorg clash, rename, account deletion; under all three possible lowercasing behaviours of the rules engine; the v20 page with the v21 rules; the v21 page with the old rules | 81 |
| all rules-enforced suites (run2, run4–run13, run15) with the v21 rules | as above, 0 refused reads or writes | 349 |
| run16, run3, run14, explore, plain suites | unchanged | 213 |

## Build v22 (7 November, night): the cases the stand-in could not see

Third round, aimed at the gap behind both bugs of the day: behaviour of the real Firebase that the stand-in did not
model. The stand-in now also enforces Firestore's limit on rule look-ups (10 per operation, 20 per batched write),
shares its data between pages of one browser context (two devices), and the suites cover edge inputs, the
self-update check and the narrowest phones.

| Suite | Covers | Checks |
|---|---|---|
| run20 | 16-player session: confirm 12 "I've paid" claims, mark all paid, 14 no-shows at "mark as played" | 6 |
| run18 | edge inputs with the rules enforced: whitespace, slashes, ".", "__x__", emoji, 60-character Turkish names, HTML in names everywhere (list, status bar, account page, log, CSV, copy text), odd emails and passwords, organizer "add to list" duplicates without accents, CSV formula cells, PDF text fallback | 28 |
| run19 | self-update over HTTP (same, newer, older, garbage version.txt; reload exactly once, no loop); two devices live (join, additions, leave request and approval, rejoin, rename, capacity change); 320 px light and dark, long names/venue/note, no horizontal overflow | 21 |
| rule look-up accounting | every suite reports the most look-ups per operation and per batch | max 4 per operation, 15 per batch (rename) |

**Result of the round: 677 checks across all suites, 0 failures after the fixes below.**

Found and fixed:
1. **Bulk organizer actions could exceed Firestore's rule look-up limit** ("Mark all as paid", "Confirm I've-paid claims", no-shows at "Mark as played"): one batch for everyone, one organizer look-up per operation, so with more than 10 people in one go the whole batch could be refused ("Firebase refused this change"). Now written in batches of 5 people. (Whether the real engine would have refused depends on caching it does not promise; the stand-in assumes no caching.)
2. Names consisting of symbols only, or whose key would be an invalid document ID (".", "..", "__x__"), are refused with a hint instead of a confusing Firebase error.
3. "Add to list" now treats "Doğukan" and "Dogukan" as the same person, like registration does.
4. Activity-log CSV: cells starting with = + - @ get a leading apostrophe so spreadsheets don't run them as formulas.

## Build v24 (8 November): typing in the session form

Reported by Koray: typing 38 into "Roster (players)" gave 83, because the page re-renders on every keystroke and a
number input cannot restore the caret, so it jumped to the front. All numeric boxes (roster, bench, duration, court
counts) are now text fields with a numeric keyboard, whose caret survives the re-render. At the same time the date and
time fields became typed European fields (DD-MM-YYYY, HH:MM 24-hour, DD-MM-YYYY HH:MM) with separators added while
typing, a hint and a disabled save button for invalid values, ISO input tolerated, and the native picker behind the icon.

| Suite | Covers | Checks |
|---|---|---|
| run21 | typing digits into every numeric box (caret at the end, 38 stays 38), dates/times typed with and without separators, backspace never re-adds separators, invalid dates (31-02-2026, 25:00) flagged and blocking, dots and single digits accepted, pickers, presets, saved session carries ISO values, band shows the date, court counts | 26 |
| all other suites | unchanged, 0 failures | 651 |

## Build v25 (8 November): delete a session, Google Maps

| Suite | Covers | Checks |
|---|---|---|
| run22 | organizer deletes the current session (open and played): confirm step with the number of sign-ups, cancel, sign-ups removed in batches within the rule look-up limit, config cleared, history untouched, log line, "No session scheduled yet", a new session afterwards; players never see the button | 15 |
| run23 | Google Maps link: pin to search the place, validation (https:// or coordinates), stored on the session, "Map ↗" in the band, 🗺️ and ⏰ lines in the announcement (opening time ahead and past), calendar entries, log diff, next week's session keeps it, map snippet under the band centred on coordinates from a pasted link / typed coordinates / the place name, no snippet on the account, log and sign-up views | 23 |
| all suites after v25 | 27 suites | 826 checks, 0 failures |

**Order matters for this one: publish the v21 rules first, then deploy the page.** The v20 page works with the v21
rules; the v21 page with the old rules would refuse new registrations and renames of names with non-ASCII letters
(plain-ASCII names keep working either way).

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
