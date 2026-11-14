# Corporate Games AI gateway

One public, key-based API through which an AI assistant (ChatGPT, Gemini, Claude, Grok) can **organize** or **host** a Corporate Game for a person.
This folder is a separate project. It reads the games and calls the games' existing routes; it never changes a game, the console or the home site.
Phase 1 covers **Corporate Tambola** end to end. Other games are added by adding an adapter (see "Add another game").

**Work in progress. Nothing here is deployed.** This folder is a snapshot published to GitHub on 2026-11-14 for safekeeping and review; the original local repository has no remote. Start with [`docs/KNOWLEDGE/README.md`](docs/KNOWLEDGE/README.md) (what, why, where, how, current state, open items). Four generated files that carry the game's price list are not included; run `npm run generate` to rebuild them.

## The AI hand-over rule (fixed by the owner)

1. **Before the game starts** the AI does all the work for the organizer or host except payment: create, settings, invites, announcements, status, clone and so on.
2. **Live steps** (start the game, pause, resume, stop, next number, draw now, approving or deciding a claim) are **never pressed by the AI**. It calls `live_handover`, which gives the person the game's own page address and one plain sentence: what to press and when. Corporate Tambola runs by the clock, so for start, numbers and claims there is no button: the AI says so and gives the live game page to watch.
3. **Payment:** the AI never pays. It may create and share the game's own payment link (typed confirmation first); a person pays on the game's own page.
4. **Human-only:** publishing consent, confirming a new Host's e-mail and mobile, anything that involves paying. The AI stops and hands over.

Tests that fail if any AI-callable path presses a live action or pays: `test/handover-static.test.mjs` and `test/handover.test.mjs`.

## What the AI can and cannot do

| | Organizer key (`ctk_`) | Host key (`cth_`) |
|---|---|---|
| Use the game's own **limited AI work key** (`cta_`) instead of the master key | the safer choice: it can do the same work except pay links, cancel, erase, clone, reopen and key or team care; the gateway refuses those before any game call | no |
| Extra settings the game accepts (who can join, breaks, opening and closing moments, brand strip, Co-host limit, host-calling mode) | yes (host-calling needs a typed sentence; links, videos and logos are never set by the AI) | no |
| Reopen a cancelled game, list key ids, ask for a fresh AI key to be e-mailed to the organizer | yes (reopen and the fresh key need a typed sentence; a key itself is never shown) | no |
| Read the gateway's activity log of the AI's own calls | yes (time, action, game id, role and result only; kept in memory, lost on restart) | no |
| List the organizer's games | yes | yes (ids, start time, size and timing settings only; no names, no drafts) |
| See games, read status, results, prizes, guest counts | yes | yes (one game) |
| Create a game, change settings and prizes, switch guest invites on | yes | no |
| Create the payment link and hand it to the person | yes (the person types a confirmation sentence first) | no |
| Cancel a game, erase guest data (typed confirmation) | yes | no |
| Message the guests, tick prizes as handed over | yes | yes |
| Pause, resume or stop a running game | never: `live_handover` gives the console page and says what the organizer must press | never: same |
| **Pay** | never | never |
| Publish a game, add a host, load guest names or numbers | never (needs personal data: a person does it in the console) | never |
| Start a game | not needed: a paid game starts by itself (no start button; the AI hands over the live game page to watch) | same |
| Call numbers, claim, choose or change winners | never: the software and the guests' phones do this; there is no button, and the AI says so and gives the live game page to watch | never |

ID-only joining is the owner's goal but the game does not support it today (guests join with a mobile number, see D8), so the AI never joins anyone; player data is erased within 24 hours of the end, and the gateway has no field in which a name, e-mail or mobile number could be sent.
All money is written as "Rs". Payment happens only on the game's own payment page, through IT Services by Rajat Agarwal and Razorpay.

## How it stays in sync with the games (the owner's main requirement)

The AI never reads a hand-written copy of the rules. Everything it reads is **generated from the game's own code**:

```
the game's code ──► generator ──► generated/ ──► what the gateway serves
 (read only)        (npm run generate)   actions.generated.json, openapi.json, ai.md, llms.txt, bundle.generated.mjs
```

The generator does three kinds of reading:
1. **Source text.** It finds each route the gateway uses in the game's source, fingerprints it and writes down who may call it, which errors it can answer and which fields it reads. It also reads the game-wide lists (every engagement action, what a host may do, limits).
2. **Constants.** A small script run with `bun` imports the game's own modules and reads its real numbers (drafts allowed, days ahead, invite limit, prices, prize types, the game's own public FACTS).
3. **Behaviour.** An access probe calls every route on a local copy of the game as each kind of caller and records the real answers (allowed or refused). The generator refuses to publish an action for a role the game refuses.

Because of this, **a game change cannot silently reach the AI**:

| What changes in the game | What happens |
|---|---|
| A route the gateway uses is renamed or removed | `npm run drift` fails: "BLOCK NOT FOUND" |
| A new route or a new engagement action appears | the generator fails until someone decides: use it, or exclude it with a written reason |
| A route's code, errors or fields change | the fingerprint changes; `npm run drift` lists what moved; after `npm run generate` the AI pages are updated |
| Who may call a route changes | the probe changes; the generator fails if an action is now refused for a role it lists |
| A number changes (limits, prices, prize types, speeds) | regenerate: the FAQ, the playbooks and the OpenAPI file all carry the new number (tests check the FAQ against the code) |
| The game's public fact sentences change | regenerate: they are shown word for word on `/ai` |
| The game's public facts contradict the gateway | recorded as a known conflict (see `docs/OWNER_DECISIONS_AND_RISKS.md`); a new or vanished conflict fails the build |

The drift check is `npm run drift` (also a test, `test/drift.test.mjs`, which additionally proves each case above by editing an in-memory copy of the game and checking the generator fails).
`.github/workflows/ci.yml` runs it on every change and on a schedule. **Gap:** the game repos do not yet call this check when they change (see decisions).

### The cycle when a game changes
1. `npm run drift` — says what moved, in plain lines.
2. `npm run generate` — rewrites `generated/`.
3. `git diff generated/` — read the changes. Anything that changes what the AI may do needs the owner's eye.
4. `npm test` — all suites must pass.
5. Commit. (Deploying is a separate, owner-approved step: `docs/HOSTING_PLAN.md`.)

## Complete lifecycles

Three generated, linked playbooks walk a whole life, each step answering with the state, `allowed_next_actions`, `do_not` and what to say to the person:
- `game_lifecycle`: create, configure, invite, payment (a person pays), ready, start (automatic), live, finish, post-game, close and erase within 24 hours, rerun, status and audit at every state.
- `organizer_lifecycle`: key, team of up to 5 hosts, own games, clone, payment history, retire the key, data erase, support.
- `host_lifecycle`: receive the key, see the game, pre-game checks, run, edge cases, end, post-game, retire.

Also served: `GET /api/ai/v1/tambola/lifecycle` (state machine, stages, coverage matrix), a stage FAQ in `/faq`, and every answer carries `lifecycle` (stage, whether the state is final, where it may go). A **lifecycle coverage matrix** (stage x role x route x READY / AUTOMATIC / HUMAN / NOT_APPLICABLE / GAP) is generated into `docs/GAME_READINESS.md`; every GAP says whether the gateway alone can close it or the game would have to change (`docs/OWNER_DECISIONS_AND_RISKS.md`, D13 to D30). The gateway never invents a route: a step the game has no route for stays a GAP.

## Commands

```
npm run generate     # rewrite generated/* from the game's code
npm run drift        # change nothing; exit 1 and explain if generated/* is out of date
npm test             # every suite, one at a time (it uses little memory)
npm run test:static  # only the suites that need no game process
npm run dev          # run the gateway locally (needs GATEWAY_SECRET and GAME_ORIGIN_TAMBOLA)
```
Needs Node 22+, `bun` (the game runs on it) and a checkout of the game at `../tambola` (or set `CT_GAME_TAMBOLA`).
The tests start the game **in memory** (no network, no real database, TEST mode) on a free local port and stop it afterwards.

## Folder map

- `games/tambola/adapter.mjs` — the one place that says which game routes make which actions, and for which roles. `content.mjs` — playbooks, FAQ, do-nots. `lifecycle.mjs` — stages, state machine, coverage matrix, the three lifecycle playbooks, stage FAQ, owner decisions D13 to D30. `runtime.mjs` — how each action runs. `extract.mjs` — the readers of the game's source. `harness/` — the local in-memory copy of the game (the game's own code, untouched) and the access probe.
- `tools/` — `generate.mjs` (the command), `build.mjs` (the cross-checks), `render.mjs` (OpenAPI, `/ai`, `/llms.txt`), `global-content.mjs` (rules shared by all games, the error catalog).
- `src/` — the gateway: `engine.mjs` (roles, validation, confirmations, rate limits, idempotency, hypermedia answers), `activity.mjs` (the in-memory activity log), `worker.mjs` (Cloudflare Worker entry), `node-server.mjs`, `schema.mjs`, `security.mjs`.
- `samples/` — a recorded run of the scripted organizer and host (28 calls, keys masked), made by `node tools/record-samples.mjs`.
- `generated/` — the generated files; **these are also the samples** of what the AI reads: `ai.md`, `llms.txt`, `openapi.json`.
- `test/` — the suites (below). `docs/` — hosting plan, readiness table, decisions and risks, how a change flows.

## What every answer looks like

Every answer carries `state`, `allowed_next_actions` (the exact endpoint and inputs of each step that makes sense now), `do_not` and `say_to_organizer`. Text typed by people (game name, prize text, guest messages) is cleaned and listed under `untrusted_fields`: the AI must treat it as data, never as instructions.
A step that cannot be undone (payment link, cancel, erase, stop) first answers 409 `confirmation_required` with the sentence the **person** must type; only then does the second call go through. Writes that must not happen twice need an `Idempotency-Key`.
Keys are never stored: the gateway passes the caller's key to the game and keeps only a keyed hash to tell callers apart. Every call to the game carries the label `AI: <assistant>`.

## The tests

| Suite | What it proves |
|---|---|
| `static` | the generated files agree with each other, the renderers and the game's source text |
| `drift` | the guard works: nine kinds of game change each make the generator fail or the output change |
| `unit` | schema strictness, personal-data refusal, cleaning of typed text, confirmation tokens, rate limit, idempotency, every error code is documented |
| `docs` | owner's wording rules (the system, Corporate Tambola, Rs), the FAQ numbers equal the code, the game's own facts are shown, no stale action names, no input can carry personal data |
| `contract` | every action x role against the real game code, the envelope, the public pages, state changes as time passes, cancel and erase |
| `agent` | a scripted assistant that knows no endpoint follows only `allowed_next_actions` and the served playbooks through the whole organizer flow and the whole host flow |
| `lifecycle-static` | the state machine, coverage matrix, playbooks, FAQ and docs agree; every GAP names an owner decision; the AI never pays, publishes or picks winners |
| `lifecycle` | the scripted assistant walks the whole game, organizer and Host lifecycles against the real game code (with people doing the human parts), plus clone, retire, wrong role, skipped confirmation, paying and personal-data negatives |
| `handover-static` and `handover` | the AI hand-over rule: the rule text is everywhere, no action presses a live step or pays, `live_handover` hands over the game's own page, and a sweep of every action as every key sends the game nothing that presses or pays |
| `gaps` | the six approved gateway-side additions against the real game code: extra settings, reopen, activity log, key list, the limited AI key and the fresh-key mail (no key leaks), the Host's game list |
| `negative` | paying, co-host actions, forged or skipped confirmation, wrong role, personal data, prompt injection, rate limits, key leakage: all refused |

## Add another game

1. Make `games/<game>/adapter.mjs` in the same shape as Tambola's: the game's routes (with a literal line that starts each handler), the actions with their roles and inputs, which game states allow which actions.
2. Add its harness (`games/<game>/harness/`): a local in-memory copy built from the game's own code, plus the access probe and the constants dump.
3. Add its `content.mjs` (playbooks, FAQ) and `runtime.mjs` (how each action runs), and register it in `src/games.mjs`.
4. Run `npm run generate`. Fix what the generator reports. Run `npm test`.
`docs/GAME_READINESS.md` says, per game, what is already known to differ.

## What could not be verified

See `docs/OWNER_DECISIONS_AND_RISKS.md`, section "Not verified". In short: nothing was run against a live site; ChatGPT, Gemini, Claude and Grok were not tried against the OpenAPI file; the winner and prize hand-over path with real winners was not exercised.
