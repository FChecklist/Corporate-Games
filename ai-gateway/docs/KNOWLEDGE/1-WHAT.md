# 1. WHAT: what the gateway is and does

## In one paragraph

The gateway is one public, key-based API through which an AI assistant (ChatGPT, Gemini, Claude, Grok) can **organize** or **host** a Corporate Game for a person. It is a separate project: it reads the games and calls only routes the games **already have**; it never changes a game, the console or the home site. Phase 1 covers **Corporate Tambola**. Other games are added by writing an adapter (`../../README.md`, "Add another game").

Three kinds of key are used. The gateway never stores a key; it passes the caller's key to the game and keeps only a keyed hash to tell callers apart.

| Key | Who | Notes |
|---|---|---|
| `ctk_` | Organizer master key | Can do everything the gateway offers an organizer. Powerful: see risk D7 in `2-WHY.md`. |
| `cta_` | The game's own limited AI work key | Safer. The gateway refuses 10 actions for it before any game call (pay link, cancel, erase, clone, reopen, key and team care). |
| `cth_` | Host key (the organizer may have up to 5 Hosts) | Can run one game's live page and message guests; cannot create games, pay or cancel. |

## The actions (30, for Corporate Tambola)

`check_key`, `list_games`, `team_overview`, `plan_start_time`, `create_game`, `game_status`, `change_settings`, `set_guest_invites`, `create_payment_link`, `share_payment_link`, `payment_status`, `cancel_game_preview`, `cancel_game`, `list_guests`, `game_results`, `list_prizes`, `mark_prize_given`, `announce`, `live_handover`, `list_game_control_requests`, `game_timeline`, `report_link_status`, `erase_guest_data`, `clone_game`, `retire_team_member`, `change_extra_settings`, `reopen_game`, `list_activity`, `list_signin_keys`, `request_fresh_ai_key`.
Each is defined once in `games/tambola/adapter.mjs` (the routes it calls, roles, inputs, which game states allow it).

## The AI hand-over rule (fixed by the owner, 2026-11-13)

1. **Before the game starts** the AI does all the work for the organizer or Host except payment: create, settings, invites, announcements, status, clone and so on.
2. **Live steps** are never pressed by the AI: start, pause, resume, stop, next number, draw now, end, approving or deciding a claim, and changing who receives a prize. The AI calls `live_handover` (read only). It answers with the game's own page address and one plain sentence saying what to press and when. Where the game runs by the clock (the default), there is no button and the AI says so and gives the live page to watch. In "Start by hand" mode a person presses Start in the organizer's console or on a Host's page; the AI says that and presses nothing.
3. **Payment:** the AI never pays. It may create and share the game's own payment link (after the person types a confirmation sentence); a person pays on the game's own page.
4. **Human only:** publishing consent, confirming a new Host's e-mail and mobile number, anything involving paying. The AI stops and hands over.

Two test files fail if any AI-callable path presses a live action or pays: `test/handover-static.test.mjs` and `test/handover.test.mjs`. The old action `request_game_control` was **removed** because filing a pause or stop request is itself pressing a live action.

## Every answer (the "hypermedia envelope")

`state`, `allowed_next_actions` (exact endpoint and inputs for each step that makes sense now), `do_not`, `say_to_organizer` or `say_to_host`, `lifecycle` (stage, whether the state is final, where it may go) and `untrusted_fields` (text typed by people, cleaned and listed so the AI treats it as data, never as instructions).

Steps that cannot be undone (payment link, cancel, erase, stop-type steps, reopen, retire) first answer **409 `confirmation_required`** with a sentence the **person** must type. The second call carries that phrase plus an HMAC token (valid 10 minutes). Writes that must not happen twice need an `Idempotency-Key`.

## Playbooks

Generated, linked, and served by the gateway. Each step names the action, what to ask, what to say, what to expect and what to do on each error.

| Playbook id | Covers |
|---|---|
| `game_lifecycle` | create, configure, invite, payment (a person pays), ready, start, live, finish, post-game, close and erase within 24 hours, rerun, status and audit at every state |
| `organizer_lifecycle` | key, team of up to 5 Hosts, own games, clone, payment history, retire the key, data erase, support |
| `host_lifecycle` | receive the key, see the game, pre-game checks, run, edge cases, end, post-game, retire |
| `organizer_create_and_share_payment` | the short path from nothing to a payment link a person pays |
| `host_runs_the_game` | what a Host does and hands over |
| `game_extras_and_recovery` | extra settings, reopen, activity log, key list |
| `organizer_safer_key` | moving the AI from a master key to the limited `cta_` key |

Also served: `GET /api/ai/v1/tambola/lifecycle` and a stage-by-stage FAQ.

## The state machine

A game is always in one of these states: `no_game`, `draft`, `awaiting_payment`, `scheduled`, `running`, `ended`, `cancelled`, `did_not_start` (and the gateway reports the real state even after a refused call). Every state lists who may move it where and by which action. The lifecycle has stages for the game (create, configure, invite, payment, ready, start, live, finish, post-game, close, rerun, status and audit), the organizer (key and sign-in, team, games, payments, key care, data, help) and the Host (receive, assigned, pre-checks, run, edge cases, hand over, end, post-game, retire). Source: `games/tambola/lifecycle.mjs`.

## The coverage matrix

Generated into `../GAME_READINESS.md` (the block between `GENERATED:LIFECYCLE` markers). One row per stage and role, with a status:

| Status | Meaning |
|---|---|
| READY | the gateway has an action and tests run it against the game's own code |
| AUTOMATIC | the game or system does it by itself |
| HUMAN | a person does it by design (money, personal data, an approval, their own browser) |
| NOT_APPLICABLE | does not exist for this role or stage |
| GAP | cannot be done through the gateway today |

Totals when last generated (game / organizer / Host): READY 33 / 17 / 17, AUTOMATIC 7 / 0 / 1, HUMAN 8 / 7 / 4, NOT_APPLICABLE 1 / 0 / 0, GAP 7 / 5 / 4. The 16 GAP rows that need a **game code change** are listed by name in `../GAME_CODE_GAPS_HELD.md` (held; none are built; none are new since the lifecycle commit `c593cae`). A test checks that no GAP is left that the gateway could close by itself.

## The drift check (how the AI never reads stale rules)

Everything the AI reads is **generated from the game's own code**, never hand-copied: the action registry, the OpenAPI file, `/ai`, `/llms.txt` and the Worker bundle. `npm run generate` reads three things:
1. **Source text**: each route the gateway uses is found in the game's source and fingerprinted (who may call it, errors, fields).
2. **Constants**: a small `bun` script imports the game's own modules and reads its real limits, prize types, speeds and public fact sentences.
3. **Behaviour**: an access probe calls every route on an in-memory copy of the game as each kind of caller and records the real answers. The generator refuses to publish an action for a role the game refuses.

`npm run drift` is `generate --check`: it changes nothing, exits 1 and explains what moved. Results:

| Change in the game | What happens |
|---|---|
| A used route is renamed or removed | drift fails ("BLOCK NOT FOUND") |
| A new route or engagement action appears | the generator fails until someone uses it or lists it as excluded **with a written reason** (`policy.excluded_actions`, `policy.excluded_prefixes` in the adapter) |
| A used route's code, errors or fields change | the fingerprint changes; drift lists it; regenerate updates the AI pages |
| Who may call a route changes | the probe changes; the generator fails if an action is now refused for a role it lists |
| A number changes | regenerate; the FAQ, playbooks and OpenAPI carry it |
| A public game fact contradicts the gateway | recorded as a known conflict; a new or vanished one fails the build |

**Limit (found by the audit, see `2-WHY.md`): the drift guard is route-level only.** It cannot see game settings and modes (for example "Start by hand") or environment variables outside the code (for example `ONLY_12S` in the game's `wrangler.toml`). Those need a human or an independent audit.

## Other games

Bingo, Snakes and Ladders, Tic Tac Toe, Luck by Chance and Lucky Draw have **no adapter**. Only their route code was compared (`../GAME_READINESS.md`). Their live commits are recorded in `3-WHERE.md` for the record, with no drift check behind them.
