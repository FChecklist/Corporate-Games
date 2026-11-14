# 3. WHERE: where each thing is

## Folder map (inside `ai-gateway/`)

| Path | What it holds |
|---|---|
| `games/tambola/adapter.mjs` | The one place that says which game routes make which actions, for which roles, with which inputs and which game states. Also `policy.excluded_actions` and `policy.excluded_prefixes` (routes deliberately not offered, each with a reason). |
| `games/tambola/content.mjs` | Playbooks, FAQ, do-nots, known fact conflicts (hand-written templates only; numbers come from the game). |
| `games/tambola/lifecycle.mjs` | Stages, state machine, coverage matrix, the three lifecycle playbooks, stage FAQ, owner decisions D13 to D30. |
| `games/tambola/runtime.mjs` | How each action runs, including `live_handover` and the pure `handOver(step, {role, consoleUrl, watchUrl, callMode, startMode, limit, pauseMax})`. |
| `games/tambola/extract.mjs` | The readers of the game's source. `gameRoot()` reads the game's location from the environment variable `CT_GAME_TAMBOLA`. |
| `games/tambola/harness/` | An in-memory copy of the game built from the game's own code: `world.ts` (environment, mirrors the live site's `ONLY_12S`), `server.ts`, `probe.ts` (the access probe), `dump-facts.ts` (constants and public facts). |
| `tools/generate.mjs` | The command behind `npm run generate` and `npm run drift`. |
| `tools/build.mjs` | The cross-checks (guard regexes, the confirmation phrase map). If the confirmation phrase "erase" is ever renamed, the guard regex near line 120 must change with it. |
| `tools/render.mjs`, `tools/global-content.mjs` | OpenAPI, `/ai`, `/llms.txt`; rules shared by all games and the error catalog. |
| `tools/record-samples.mjs` | Records a scripted organizer and Host run (28 calls, keys masked) into `samples/`. |
| `src/engine.mjs` | Roles, validation, confirmations, rate limits, idempotency, the envelope. |
| `src/activity.mjs`, `src/security.mjs`, `src/schema.mjs` | In-memory activity log; keyed hashing, tokens and personal-data checks; strict input schema. |
| `src/worker.mjs`, `src/node-server.mjs` | The Cloudflare Worker entry; a local server (loopback only). |
| `generated/` | Output of `npm run generate`. In this public copy only `SOURCE.json`, `llms.txt` and `openapi.json` are present; see `README.md` for the four price-bearing files left out. `SOURCE.json` records the game commit the output was built from. |
| `test/` | 14 files; the suites are described in `../../README.md` ("The tests"). |
| `docs/` | `OWNER_DECISIONS_AND_RISKS.md`, `OWNER_DEPLOY_NOTE.md`, `HOSTING_PLAN.md`, `GAME_READINESS.md` (with the generated coverage matrix), `GAME_CODE_GAPS_HELD.md`, `HOW_A_GAME_CHANGE_FLOWS.md`, and this `KNOWLEDGE/` folder. |
| `.github/workflows/ci.yml` | Template (inert in this sub-folder). |

## Where the game's own code is

The generator needs a checkout of the Corporate Tambola game repository. Default location `../../../tambola` relative to the gateway folder; override with the environment variable `CT_GAME_TAMBOLA`. To check a particular commit, check it out in a **separate clone or worktree** (never in the owner's working copy) and point `CT_GAME_TAMBOLA` at it. The generated output must be rebuilt from the commit that is live.

## Live addresses and commits (read-only GETs on 2026-11-13)

| Address | What | Commit read from `/version.json` |
|---|---|---|
| `https://corporate-tambola.pages.dev` | Corporate Tambola, the only game with an adapter; `/api/mode` said LIVE (real payments) | `c6897f29061c` (built 2026-11-13 10:28 UTC) |
| `https://home.corporatetambola.com` | the home site where the gateway's Worker routes would be added | `7711fb045c149b72fa9e2f1256dbb6d55bca33a1` |
| Corporate Bingo | no adapter | `f17d1906d8a7` |
| Corporate Luck by Chance | no adapter | `ebda7644b98d` |
| Corporate Lucky Draw | no adapter | `d040396f69f0` |
| Corporate Snakes and Ladders | no adapter | `042b4d666c68` |
| Corporate Tic Tac Toe | no adapter | `fa5ab0afa895` |

`https://corporatetambola.com` redirects to the home site, so it is not the game's address.

## Where the gateway would be served (plan only, nothing deployed)

Worker routes on the zone: `home.corporatetambola.com/ai*`, `home.corporatetambola.com/openapi.json`, `home.corporatetambola.com/api/ai/v1/*`. Settings: `GAME_ORIGIN_TAMBOLA` (variable) and `GATEWAY_SECRET` (a secret the owner creates; never in any file). Details in `../HOSTING_PLAN.md`. Home's own `/llms.txt` stays as it is; the gateway serves `/ai` and `/ai/llms.txt`.

## Where this copy lives on GitHub

Repository `FChecklist/Corporate-Games`, folder `ai-gateway/`, branch `wip-live-c6897f2-fixes`. The folder is a snapshot of the local gateway repository's branch of the same name (last commit `3623111`), minus the price-bearing generated files and with local paths made generic. The original local repository has no remote.
