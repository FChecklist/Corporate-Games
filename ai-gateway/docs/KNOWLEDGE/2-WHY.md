# 2. WHY: owner decisions, audits, and the drift found against the live game

Dates are the dates in the git history or the notes. Where a note gave no date, none is invented.

## Timeline

| Date | Event | Commit |
|---|---|---|
| 2026-11-13 | Phase 1: gateway for Corporate Tambola, nothing deployed | `5f51eb5` |
| 2026-11-13 | Complete lifecycles (game, organizer, Host), state machine, coverage matrix; 25 actions | `c593cae` |
| 2026-11-13 | Owner approves six gateway-only additions and fixes the AI hand-over rule | `4d8e3a9` |
| 2026-11-13 | Independent audits 1, 2, 3 of that work: each FAIL, each fixed; then PASS (108 tests) | `314c761`, `83c32f2`, `b0c1fb8`, `2cc02d1` |
| 2026-11-13 | The 16 held game-change gaps listed by name; owner deploy note written | `65b8d27` |
| 2026-11-13 to 14 | Owner approves the AI gateway for the **next safe steps only** (re-check against the live game, then a test address). Not the real deploy. | |
| 2026-11-14 | Regenerated against the live game commit `c6897f2`; 15 new routes classified "not offered" | `398b956` (main) |
| 2026-11-14 | Audit 4 of that work: FAIL (two real mismatches found); fixes written, **not verified** | `3623111` (this branch) |
| 2026-11-14 | Owner orders the complete knowledge and code to be put on GitHub, in an existing repo | this folder |

## Decisions the owner made

| Decision | What it means | Where it is enforced |
|---|---|---|
| **AI hand-over rule** (2026-11-13) | The AI does everything before the start except payment; it never presses a live action and never pays; it gives the game's own page and one plain sentence. Human-only: publishing consent, confirming a new Host's e-mail and mobile, anything involving paying. | playbooks, FAQ, every answer's `do_not`, `/ai`, `/llms.txt`, OpenAPI, tests `handover-static` and `handover` |
| The engine is frozen | The gateway may call only routes the game already has. Anything needing a game change is **held** (16 rows) until the owner decides. | `../GAME_CODE_GAPS_HELD.md` |
| Six gateway-only gaps approved (2026-11-13) | extra settings (G08/D15), reopen (G50/D17), gateway activity log (G53/D28), limited AI key `cta_` (O04/D16), read key list (O20/D18), Host lists games (H05/D30) | built, tested (`test/gaps.test.mjs`) |
| **D9: follow the live game commit** | The gateway follows whichever commit is live (now `c6897f29061c`, read from the live site's `/version.json` on 2026-11-13, built 10:28 UTC). The owner must confirm it is still the live commit at go time; if the game is deployed again first, the check is run again. | `../OWNER_DECISIONS_AND_RISKS.md` row D9 |
| D1 publishing stays human | No publish action (needs the organizer's own e-mail, mobile, tick-boxes) | no action exists |
| D5 home keeps its own `/llms.txt` | The gateway serves `/ai` and `/ai/llms.txt` and does not touch home's `/llms.txt`; one added line pointing to `/ai` is a yes-or-no for the owner | `../HOSTING_PLAN.md` |
| Wording rules | "the system", not "we"; "Corporate Tambola", not "Tambola"; money written as "Rs", never a rupee symbol | `test/docs.test.mjs` |
| No paid steps without asking | rate limits and the activity log live in the memory of one Worker instance; a lasting store (Durable Object or KV) is an extra, possibly paid, step to ask about first | D10, D28 |

All other open decisions (D2 to D8, D10 to D12, D13 to D30) with the question for the owner and a recommendation are in `../OWNER_DECISIONS_AND_RISKS.md`.

## Why each design choice

- **Generated from the game's code, never hand-written** (the owner's main requirement): so a game change cannot silently reach the AI. The price is that the drift guard must be kept honest (see the audit findings: it is route-level only).
- **Typed confirmation sentence plus signed token** for irreversible steps: a protocol, not proof that a human typed it. The AI is told not to type it and the sentence is shown to the person.
- **Keys are never stored or shown.** The game's "fresh AI key" route returns the key in a message when the e-mail fails; the gateway drops it, and a test proves no key reaches any answer or log.
- **A limited key `cta_`** exists because a master key can also create Hosts, close the account and spend credit (D7). Nothing in this project can stop an AI that holds a master key from using it directly against the game.
- **Retired Host keys stop working at once.** The first lifecycle tests found the gateway remembered a key's role for 5 minutes; `check_key` now always asks the game again.
- **Text typed by people is untrusted data** (game name, prize text, announcements): cleaned, listed under `untrusted_fields`, never used to build instructions.

## Defects found by the project's own tests (fixed before commit)

1. The top level of every action's inputs was not strictly checked (unknown fields and personal data got through). Now strict; a test fails if loosened.
2. Read calls were counted against the smaller write limit.
3. A generated game id contained letters of the game's name (text typed by a person). Now random.
4. A retired Host key stayed valid up to 5 minutes (role cache). Fixed.
5. A refused call reported the state `no_game` even for an existing game. It now reports the real state.

## Independent audits (Rule 7c: a fresh reviewer, final line "AUDIT: PASS" or "AUDIT: FAIL")

| Audit | Work audited | Result | Findings (all fixed unless noted) |
|---|---|---|---|
| 1 | six gaps and hand-over rule | FAIL | The hand-over text said "no next-number button" and "press pause" for every game; in host-calling mode a Host presses Next number, and above the game's pause limit there is no pause. The text now reads the game's mode and limit. |
| 2 | same, after fixes | FAIL | In host-calling mode the organizer can press Next number too (text said only a Host); a Host can pause and stop on their own page; payment message wording; activity log attribution. |
| 3 | same, after fixes | FAIL | One README line wrongly described joining by ID and the Host game-list row. |
| then | same, after fixes | PASS | 108 tests; drift clean (commit `2cc02d1`). |
| 4 | regenerate against live `c6897f2` (`398b956`) | **FAIL** | see below; fixes are in `3623111` and **not yet verified or re-audited** |

### Audit 4 findings (live-commit work)

- **M1 (major): "Start by hand".** The live game lets the organizer choose to start by hand (the organizer or a Host presses Start, never before the start time). The gateway had stated as fact that there is no start button. Fix (unverified): the gateway reads the game's start mode; in that mode `live_handover` (step `start`) gives the person the page and says what to press, and the AI presses nothing. By default the game still starts by itself.
- **M2 (major): the 12-second default.** The live site sets `ONLY_12S="1"` in the game's `wrangler.toml`: every new game that the system calls uses one speed, a new number every 12 seconds, and other speeds are refused. The gateway default was 9, so `create_game` would have failed. Fix (unverified): default 12; the test game now mirrors `ONLY_12S`.
- **Found afterwards, while preparing this publication (2026-11-14, not part of the audit):** M2 was only partly fixed. Three places still offered or used speed 9: the `create_game` example in the adapter, the playbook sentence "Offer the recommended speed (9 seconds)", and `tools/record-samples.mjs`. All three now say 12 (commit `3623111`, source only, not verified). Lesson: after changing a default, search for the old number everywhere (examples, playbook text, sample recorders), not only in the schema.
- **M3 (major, documentation): the deploy note was stale and partly garbled** (including a path with a stray tab character). Fixed; later lesson: write patch scripts with a file-writing tool, not shell quoting.
- Smaller, fixed: the AI no longer says "nobody can change a winner" (a person can change who receives a prize).
- Smaller, **not fixed** (wording only, owner can order): the gateway text still says "erase" while the game now says "delete"; the pay link lasts "at least 7 days" in the game while the gateway says 7 days; the host-calling 1000-player limit is not documented; the exclusion reason for `checkins` is slightly overstated; a Host can use `override` through the game's AI link, but the gateway never calls it.

## The drift found against live `c6897f2` (2026-11-13/14)

The first run of the drift guard **failed as designed**: 16 items (15 routes or route patterns, and one wording conflict). Each route was classified **not offered to the AI**, with a written reason in `policy.excluded_actions` or `policy.excluded_prefixes`:

| Route | Why it is not offered |
|---|---|
| `override` | decides who receives a prize: a person only (hand-over rule: the AI never approves or decides a claim) |
| `rehearsal`, `rehearsals`, `rehearsalclose` | a rehearsal is a live-like run only a person starts |
| `discard` | deletes an unpublished draft; the AI can still cancel a game after a typed confirmation |
| `gamelog`, `changes` | the game's own logs; the gateway keeps its own activity log (`list_activity`) |
| `checkin`, `checkins`, `presence`, `who` | guests' own actions or personal data |
| `logo` | a picture for e-mails; not needed by the AI |
| `/api/host/become-organizer` | an account step with personal data |
| `/api/pass` | a prospect's demo pass link (sales) |
| `/api/beacon/` | the public randomness beacon read by guests' phones |

Other changes the live commit brought:
- The game's public fact 8 now says "delete data" instead of "erase data"; the recorded wording conflict follows the new word.
- `control/request` now refuses a Host who comes in through the game's AI link (the organizer is unchanged).
- The claim hand-over sentence now says only a person can change who receives a prize (new `override` control).

After regeneration, 108 tests passed against `c6897f2` at `398b956`, including the live lifecycle walks. That is **why `main` must not be deployed**: it still has the M1 and M2 mismatches.

## Why the staging step is blocked

(1) Audit 4 is FAIL until the fixes are verified and re-audited. (2) The only game address that exists is the live one with real payments; a staging gateway needs a TEST-mode game address. (3) `wrangler` is not installed and installing it plus using a Cloudflare token is an explicit go-ahead the owner has not given. See `4-HOW.md` and `6-OPEN_ITEMS.md`.
