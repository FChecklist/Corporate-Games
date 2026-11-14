# Owner deploy note: Corporate Games AI gateway (prepared as a file only)

**Status: nothing is deployed, pushed or changed. This note is a plan for the owner to read and answer.** The gateway code is the latest commit in this repo (`git log -1`) (local only, no remote). The longer plan is `HOSTING_PLAN.md`.

## 1. The commits the gateway must be re-checked against

Read on 2026-11-13 by a plain public GET of each site's `/version.json` (read only, no key, nothing changed).

| Site | What it is | Live commit (from `/version.json`) | Built (UTC) | Gateway generated from |
|---|---|---|---|---|
| `https://corporate-tambola.pages.dev` (Cloudflare Pages project `corporate-tambola`) | Corporate Tambola, the only game the gateway covers today | **`c6897f29061c`** (dirty: false; version field starts "1.9") | 2026-11-13 10:28 | **`c6897f2`** (regenerated and drift-checked on 2026-11-13 in a separate clone `<live-clone-path>`; it was first built from `2968f4c`) |
| `https://home.corporatetambola.com` | the marketing site where the gateway routes would be added | `7711fb045c149b72fa9e2f1256dbb6d55bca33a1` (dirty: false) | 2026-11-12 15:15 | not part of the check; the gateway never edits it |

Notes:
- **The gateway has now been regenerated against the live commit `c6897f2`** (section 1b). The old local game checkout `<game-checkout-path>` is still at `2968f4c`; the check used a separate clone, so nothing in the game repo was touched. This is the owner's decision D9: the owner should confirm that `c6897f2` is the commit that is live when the gateway goes live; if the game is deployed again first, the check is run again.
- `https://corporatetambola.com/version.json` answers with a redirect to the home site, so it is **not** the game's address. The game's address was taken from the game's own `docs/DEPLOYS.md` (project `corporate-tambola`); the owner should confirm it is the right one for the `GAME_ORIGIN_TAMBOLA` setting (`HOSTING_PLAN.md` section 3 says "to be confirmed").
- The game answers `GET /api/mode` with **LIVE** (real payments). So the zero-live-games check below is not a formality.
- Other game sites (Bingo, Lucky Draw, Snakes and Ladders, Tic Tac Toe) have no gateway adapter yet, so there is nothing to re-check for them.

## 1b. Result of the re-check against c6897f29061c (done 2026-11-13, local only)

- The drift guard **failed first, as designed**: the live game has routes the gateway had never seen. Sixteen items (fifteen routes and one wording conflict). The routes: `/api/host/become-organizer`, `/api/pass`, the public randomness beacon, and these game actions: logo, rehearsals, rehearsal, rehearsalclose, gamelog, changes, discard, checkin, checkins, presence, who, override.
- **None was given to the AI.** Each is listed as "not offered" with its reason in the adapter. The two that matter most: `override` (a person changes who receives a prize: a live decision, so the AI hand-over rule keeps it human) and the rehearsal start and close (live-like, human). `discard` (delete a draft) is not offered; the AI can still cancel a game after a typed confirmation.
- The game's own public fact 8 now says "delete data" instead of "erase data" (the game removed the word "erase" from customer text). The recorded wording conflict follows the new word.
- The route `control/request` (read of open requests) now refuses a Host who comes in through the game's AI link (the organizer is unchanged); the registry and `ai.md` show the new access table.
- The claim hand-over sentence now says that only a person can change who receives a prize (the new override control), instead of saying there is nothing to decide.
- After this, `npm run generate` passes and **all tests pass against c6897f2** (108 live and static tests), including the live walk of the organizer, Host and limited-key lifecycles.
- **The independent audit of this re-check first returned FAIL, with two findings the route-level drift guard cannot see (they are in the game's settings and modes, not in its route list), now fixed in the gateway:**
  1. The live game has a **"Start by hand"** mode (the organizer or a Host presses Start at the start time). The gateway had said as fact that there is no start button. The gateway now reads the game's start mode; in that mode `live_handover` (step start) gives the person the page and says what to press, and the AI still presses nothing. By default the game still starts by itself.
  2. The live site sets **`ONLY_12S`**: every new game that the system calls uses one speed, a new number every 12 seconds, and any other speed is refused. The gateway's default of 9 would have made `create_game` fail. The default is now 12, and the test game mirrors the live setting so a test would catch it.
  - Smaller wording fixes: the AI no longer says "nobody can change a winner" (a person can change who receives a prize); this note's stale lines about 2968f4c were corrected.
  - Not changed, noted: the gateway's own text still says "erase" (the confirmation phrase "ERASE GUEST DATA ..." and the action title). The game itself now says "delete" in customer text. This is wording only; changing the phrase is a small change the owner can order.
- Not yet done: a fresh independent Rule 7c audit of these changes (required before staging), and the check of the other games (they have no adapter; their live commits are only recorded below).
- Other sites' live commits (read-only, for the record): Bingo `f17d1906d8a7`, Luck by Chance `ebda7644b98d`, Luck Draw `d040396f69f0`, Snakes and Ladders `042b4d666c68`, Tic Tac Toe `fa5ab0afa895`. The gateway has no adapter for them, so no drift check exists for them.

## 2. Re-check steps (all local, none touches a live site or a game repo)

1. In the game checkout, bring in the live commit and check it out in a separate worktree, never in the owner's working copy: `git -C <game-checkout-path> fetch origin` (reads only; adds objects to `.git`), then `git -C <game-checkout-path> worktree add <live-clone-path> c6897f29061c`. If the commit is not on `origin`, stop and ask the owner where it came from.
2. In this repo, point the generator at that worktree by setting the environment variable `CT_GAME_TAMBOLA` to `<live-clone-path>` (do not copy files), then run `npm run drift`. The probe also needs bun and at least 1.2 GB of free memory.
3. If it says **no drift**: write the live commit in the deploy log and go on.
4. If it reports drift: run `npm run generate`, read `git diff generated/` line by line, run the full test list (`npm run test:static`, then the live-game suites one file at a time with at least 1.2 GB of free memory), fix anything that fails, commit, and get a fresh independent audit (Rule 7c) with a final line "AUDIT: PASS". Any route that changed or any public fact that changed is shown to the owner in plain words first.
5. Check the three things that matter most for this gateway on the live commit: the game's pause limit (`PAUSE_MAX_PARTICIPANTS`, now 2000), that no route the gateway calls was removed or renamed, and that the game still refuses a stranger's key on the organizer routes (the generator's behavioural probe does this).
6. Staging only: deploy to a `workers.dev` address with `GAME_ORIGIN_TAMBOLA` pointing at a game in TEST mode, run the simulated agent through the organizer, Host and limited-key lifecycles, and look at the audit lines. Real payments are never touched.

## 3. Rollback id

**There is none yet, because nothing has ever been deployed.** For the first deploy the rollback is: **delete the three Worker routes** (`home.corporatetambola.com/ai*`, `home.corporatetambola.com/openapi.json`, `home.corporatetambola.com/api/ai/v1/*`). Every path then falls back to the home site at once; the Worker stays idle and neither a game nor the home site is touched.

Before any later deploy, run `wrangler deployments list` and write the id of the version that is live into the deploy log first. `wrangler rollback <that id>` is then the way back. The id is recorded **before** the deploy, not after.

## 4. What the owner has to say to go

Nothing happens on a general "yes". Each item needs the owner's words in chat:

1. **The live Corporate Tambola commit and address**: "the live game is `c6897f2` at `corporate-tambola.pages.dev`" (or the correct ones). This unlocks section 2.
2. **Go for the staging deploy** to `workers.dev` (free).
3. **Go for the real deploy** on `home.corporatetambola.com`, saying that **zero live games are running** at that moment (the game is in LIVE mode, so real money is involved), and that the rollback in section 3 is understood.
4. **Whether home's own `/llms.txt` gets one added line** (D5). Without a yes, home is not touched.
5. **Any paid step** (for example the Workers Logs storage, or a plan above free) is a separate yes. The plan uses the free plan only.
6. **The secret `GATEWAY_SECRET`** is created by the owner (`wrangler secret put GATEWAY_SECRET`, at least 32 random characters); no one else types it and it is never written into a file.

## 5. After the go (so the owner knows what to expect)

`GET /ai`, `/ai/llms.txt` and `/openapi.json` answer without a key; a call with no key answers `missing_key`; a call with a test organizer key on a TEST game works; home's own pages are unchanged. The version id, the date and the live game commit are written in the deploy log.

## 6. What is not verified

- Nothing has been run against a live site: only the two `/version.json` files and `/api/mode` were read.
- The gateway was compared with the live commit `c6897f2` only through the game's own source and a local copy of its code (tests and the drift guard). Settings that live outside the code, such as the live site's environment variables (`ONLY_12S`), were read from the game's `wrangler.toml`, not from the running site.
- Whether a Worker route wins over a Pages custom domain on the same hostname has to be proven on a staging hostname (`HOSTING_PLAN.md`).
- The gateway's rate limits, idempotency store and activity log live in one Worker instance's memory; there is no durable store yet.
