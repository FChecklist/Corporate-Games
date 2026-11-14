# Game readiness: can the gateway let an AI organize or host this game?

The AI hand-over rule (owner): before the start the AI does the work except payment; live steps are never pressed by the AI, which gives the person the game's own page and says what to press (for a game run by the clock there is no button, and it says so); the AI never pays; publishing consent and a new Host's e-mail and mobile stay human. Details: `OWNER_DECISIONS_AND_RISKS.md`.

How to read this. READY means: the gateway has an adapter for the game, the generated documents come from its code, and the contract tests, the simulated organizer and host, and the negative tests all pass against a local copy of it. Only Corporate Tambola is READY. PARTLY means the game has the routes the shared action list needs but the adapter, harness and tests do not exist yet, or a known difference stops one of the shared actions. NOT READY means a needed route is missing.

Evidence used, so nobody has to guess where a statement comes from:
- **[tested]** run by this project against the real Corporate Tambola code (108 tests, including three full lifecycle walks: the game, the organizer and the Host, the six approved additions and the AI hand-over rule).
- **[code]** measured by this project: every route the Tambola adapter uses was looked up in each other game's source (`apps/edge/src/worker.ts` and the files beside it) and fingerprinted. All 21 routes exist in all six games. Where the fingerprints are equal the code is identical.
- **[boss]** taken from the boss session's survey (`AI shared action list.md`, 2026-11-13) and **not re-checked** here. The survey read code too, and made no live calls.
- **Nothing was run against a live site and no other game was started.**

## Summary

| Game | Verdict | One-line reason |
|---|---|---|
| Corporate Tambola | **READY** (phase 1, as far as the game allows) | adapter, harness, 108 tests pass (all three lifecycles walked); 30 actions; start is automatic, calls and claims are done by the software and the phones; pause and stop are pressed by the organizer (the AI hands over the page) |
| Bingo | **PARTLY** | all 21 routes exist; create, settings, summary, control, results and prizes differ from Tambola; call speed 12 only [boss]; ID-only join depends on a live flag [boss] |
| Snakes and Ladders | **PARTLY** (weakest) | routes exist; call speed must be exactly 10 and the size cap is 2000, while its own AI guide says otherwise [boss]; older consent flow in places [boss] |
| Tic Tac Toe | **PARTLY** | has real pause, resume, end and settle routes, but only for a master key or a direct host, and the classic start needs the organizer's browser [boss] |
| Luck by Chance | **PARTLY, closest** | the only family member with a real start and end route (`luck/start`, `luck/end`) [boss]; the gateway has no start or end action yet because Tambola has none |
| Lucky Draw | **PARTLY** | draw time is the start; a manual "draw now" exists only in manual mode [boss]; draw depends on an external 5-minute tick [boss] |

## Route comparison [code]

For each route the Tambola adapter uses: "same" means the handler's normalised source is identical in every game that has it; otherwise the number of different versions across the six games is shown. Different means that game needs its own adapter pass and its own probe, not that it is broken.

| Route (what the action uses) | Result |
|---|---|
| team (hosts), paylink_read, cancel_preview, cancel, prizegiven, reportlink | same in all six games |
| whoami, history, life | same in five games; Lucky Draw differs |
| participants | same except Snakes |
| results | Tambola differs from the other five (which are equal) |
| schedule | 3 versions (Tambola; Snakes = Tic Tac Toe = Luck; Bingo = Lucky Draw) |
| paylink_create | 3 versions (Tambola = Bingo = Snakes; Tic Tac Toe = Luck; Lucky Draw) |
| create, settings | a different version in each game |
| summary | 5 versions |
| control_request | 5 versions |
| control_requests | Tambola differs from the other five (which are equal) |
| prizes | 3 versions |
| announce | 3 versions (Tambola = Bingo = Snakes = Lucky Draw; Tic Tac Toe; Luck) |
| erase | same except Lucky Draw |

Meaning: the shared part (team, pay link read, cancel, prize given, report link) can be reused almost as is. Create, settings, summary and control are where each game needs its own adapter, because their fields and limits differ.

## Per game

### Corporate Tambola — READY [tested]
Every action in `docs/` and `generated/ai.md` works for the roles listed against the real game code. Known limits, stated openly to the AI:
- No start action: a paid game starts at its start time. No end action: the organizer approves a stop request in the console; before the start, cancel.
- Complete lifecycles: the game, the organizer and the Host each have a generated, linked playbook (`game_lifecycle`, `organizer_lifecycle`, `host_lifecycle`), a state machine and a coverage matrix (end of this file). Every step maps to a route the game already has; a step with no route is a GAP with the owner decision named. Clone a game and retire a team key are READY.
- No call or claim action: numbers come from a public random source and winners from the guests' phones; nobody, including the AI, can choose or change them.
- Publish, adding a host and loading guest lists need personal data, so they stay human.
- ID-only join is not supported by the game today (guests join with a mobile number).

### Bingo — PARTLY
- Needed before READY: adapter, harness, probe and the full test set.
- Known differences [boss]: call speed must be 12; host signing key disabled; ID-only join needs the live flag `ID_ONLY` and an organizer-loaded list; some AI-guide text left over from Tambola.
- Same as Tambola [boss]: no start, no call, no claim approval.

### Snakes and Ladders — PARTLY (weakest)
- Known differences [boss]: call speed exactly 10 (its AI guide says 6/9/12/15, its guided create defaults to 9 and would be refused); size cap 1 to 2000; extra create fields (mode, board, teams); `checkin` and `presence` in the route pattern have no handler; host `override` allowed through the AI link.
- The gateway's generator would catch the speed and cap rules by itself, because it reads them from the game's code and compares them with the adapter: that is the reason to use it here.

### Tic Tac Toe — PARTLY
- Has `ttt/pause`, `ttt/resume`, `ttt/end`, `ttt/settle` [boss], but these need a master key or a direct host key (an AI link is refused), so the gateway can offer them to the organizer role only.
- Start: the classic start needs the organizer's browser to post the plan; the server-only stage flow works only where that flow is switched on [boss]. Until that is decided, the AI cannot start it.
- Data is erased 20 hours after the game, while the text says 23 [boss]: a wording conflict the generator's fact check would flag.

### Luck by Chance — PARTLY, closest to READY
- The host job is two plain calls: `luck/start` (at least 2 players, game published and paid, returns "pending", starts about 2 minutes later) and optionally `luck/end` (ends after the round in play) [boss]. Both need a master key or a direct host key.
- To add: a start and an end action to the shared list (they are already in the brief's common list). Tambola does not use them, so they will be written with this game.
- Differences [boss]: no opening, closing or breaks; prize text with money or betting words is refused; size cap 2000; no pause.

### Lucky Draw — PARTLY
- An AI key can create, change settings, set winners and prizes, announce and read results; publish, pay, people lists, "draw now" and erase need a person or a master key [boss]. The pay link lasts exactly 7 days.
- "Draw now" exists only in manual mode, and an automatic draw can run up to 5 minutes late because of an external tick [boss].
- Its `whoami`, `history`, `life` and `erase` handlers differ from the family's: it needs its own probe.

## What READY will need for each of them (same checklist every time)
1. Adapter and harness written; `npm run generate` passes (the generator rejects every disagreement with the game).
2. Probe matrix reviewed by a person: it says exactly which call each key kind may make.
3. Contract tests, the simulated organizer and host, and the negative tests pass.
4. The game's own public facts agree with the gateway, or each conflict is recorded and decided by the owner.
5. A decision on any step that today needs a browser or a human consent (start in Tic Tac Toe, ID lists, publish).

<!-- GENERATED:LIFECYCLE-MATRIX:START (written by npm run generate; do not edit by hand) -->
## Lifecycle coverage matrix (Corporate Tambola)

Stage x role x route x status, for the whole game, the organizer and the Host. Generated from the adapter and the game's code by `npm run generate`; do not edit by hand. Every route shown exists in the game; the gateway only calls routes that already exist.

| Lifecycle | READY | AUTOMATIC | HUMAN | NOT_APPLICABLE | GAP |
|---|---|---|---|---|---|
| game | 33 | 7 | 8 | 1 | 7 |
| organizer | 17 | 0 | 7 | 0 | 5 |
| host | 17 | 1 | 4 | 0 | 4 |

**Gaps that can be solved inside the gateway only (the game already has the route; the owner still decides):** none left. The six that were open (G08, G50, G53, O04, O20, H05) were approved by the owner and are READY.

**Gaps that need a change in the game's code (owner decision; the engine is frozen):** G07, G13, G18, G32, G40, G41, G52, O05, O08, O18, O23, O27, H11, H15, H18, H25.

- **READY**: The gateway has an action for it and the tests run it against the game's own code.
- **AUTOMATIC**: The game or the system does it by itself. There is nothing to call.
- **HUMAN**: A person does it, by design: it needs money, personal data, an approval or the person's own browser. The AI explains it and waits.
- **NOT_APPLICABLE**: Corporate Tambola has no such step.
- **GAP**: Not possible through the API today. The row says who can solve it and which owner decision is needed.

### State machine

| State | Stage | What can happen next (by whom, through what) |
|---|---|---|
| `no_game` | create | organizer: create_game -> draft (new game id); organizer: clone_game -> draft (new game id); organizer: request_fresh_ai_key -> no_game |
| `draft` | configure | organizer: change_settings -> draft; organizer: set_guest_invites -> draft; organizer: change_extra_settings -> draft; organizer: create_payment_link -> draft; human: a person pays on the payment page (the payment publishes and schedules the game) -> scheduled; human: the organizer publishes the game in the console (needs their own e-mail, mobile and tick-boxes) -> awaiting_payment; organizer: cancel_game -> cancelled; organizer: clone_game -> draft (new game id); system: an unpublished draft is forgotten after 30 days -> no_game |
| `awaiting_payment` | payment | organizer: change_settings -> awaiting_payment; organizer: set_guest_invites -> awaiting_payment; organizer: change_extra_settings -> awaiting_payment; organizer: create_payment_link -> awaiting_payment; human: a person pays on the payment page -> scheduled; system: nobody paid before the start time -> did_not_start; organizer: cancel_game -> cancelled; organizer: clone_game -> draft (new game id) |
| `scheduled` | ready | organizer: change_settings -> scheduled; organizer: set_guest_invites -> scheduled; organizer: change_extra_settings -> scheduled; organizer or host: announce -> scheduled; organizer or host: live_handover -> scheduled; system: the start time arrives -> running; organizer: cancel_game -> cancelled; organizer: clone_game -> draft (new game id) |
| `running` | live | organizer or host: announce -> running; organizer or host: mark_prize_given -> running; organizer or host: live_handover -> running; human: a person presses pause or resume in their own console or Host page -> running; human: the organizer in their console, or a Host on their Host page, presses stop -> ended; system: the game is over -> ended; organizer: clone_game -> draft (new game id) |
| `ended` (final) | post_game | organizer or host: mark_prize_given -> ended; organizer: erase_guest_data -> ended; system: guest data is erased within 24 hours of the end -> ended; organizer: clone_game -> draft (new game id) |
| `cancelled` | close | organizer: reopen_game -> scheduled; organizer: erase_guest_data -> cancelled; organizer: clone_game -> draft (new game id); organizer: create_game -> draft (new game id) |
| `did_not_start` (final) | close | organizer: clone_game -> draft (new game id); organizer: create_game -> draft (new game id) |

### Matrix: game lifecycle

| Id | Stage | Step | Who | Game route(s) | Status | Gap: who solves it, decision |
|---|---|---|---|---|---|---|
| G01 | create | Check the key and the role | organizer | `GET /api/whoami` | READY |  |
| G02 | create | See which games already exist | organizer | `GET /api/history` | READY |  |
| G03 | create | Check the start date and time | organizer | `GET /api/z/schedule` | READY |  |
| G04 | create | Create a free draft | organizer | `GET /api/z/schedule`<br>`POST /api/z`<br>`GET /api/z/{game_id}/summary` | READY |  |
| G05 | configure | Change name, start time, size, speed, tickets, rounds, tie rule | organizer | `GET /api/z/schedule`<br>`PATCH /api/z/{game_id}/settings`<br>`GET /api/z/{game_id}/summary` | READY |  |
| G06 | configure | Set the prizes (the list replaces the old one) | organizer | `GET /api/z/schedule`<br>`PATCH /api/z/{game_id}/settings`<br>`GET /api/z/{game_id}/summary` | READY |  |
| G07 | configure | Set the language of the game | organizer | (none) | GAP | needs a game change, D20 |
| G08 | configure | Set who can join (anyone with the link or only a list), breaks, opening and closing moments, brand strip, host-calling mode, Co-host limit | organizer | `PATCH /api/z/{game_id}/settings`<br>`GET /api/z/{game_id}/summary` | READY | D15 |
| G09 | invite | Switch guest invitations on or off, how many each guest may invite, which kinds of guests | organizer | `PATCH /api/z/{game_id}/settings`<br>`GET /api/z/{game_id}/summary` | READY |  |
| G10 | invite | Get the guest link to share (links.guest in the game status) | organizer | `GET /api/z/{game_id}/summary`<br>`GET /api/z/{game_id}/life` | READY |  |
| G11 | invite | See how many guests have joined (ticket ids only) | organizer, host | `GET /api/z/{game_id}/participants` | READY |  |
| G12 | invite | Load guest names, numbers or invite lists | human | `POST /api/z/{id}/roster` | HUMAN | D1 |
| G13 | invite | Guests join by ID only (employee, associate, vendor or member id) | guest | (none) | GAP | needs a game change, D8 |
| G14 | payment | Create ONE payment link (a new link cancels the old one) | organizer | `GET /api/z/{game_id}/summary`<br>`POST /api/z/{game_id}/paylink` | READY |  |
| G15 | payment | Prepare the message that shares the payment link | organizer | `GET /api/z/{game_id}/summary` | READY |  |
| G16 | payment | Pay on the payment page | human | (none) | HUMAN |  |
| G17 | payment | Has the game been paid? Is the link open, paid or expired? | organizer | `GET /api/z/{game_id}/summary`<br>`GET /api/paylink/{token}` | READY |  |
| G18 | payment | Receipt, invoice and payment history by key | organizer | (none) | GAP | needs a game change, D19 |
| G19 | ready | Publish the game | human | `POST /api/z/{id}/publish` | HUMAN | D1 |
| G20 | ready | See that the game is paid and scheduled | organizer | `GET /api/z/{game_id}/summary`<br>`GET /api/z/{game_id}/life` | READY |  |
| G21 | ready | See what cancelling would do (credit, no refund) | organizer | `GET /api/z/{game_id}/cancel-preview` | READY |  |
| G22 | ready | Cancel the game | organizer | `GET /api/z/{game_id}/summary`<br>`POST /api/z/{game_id}/cancel` | READY |  |
| G23 | start | The lobby: guests join with the guest link | guest | (none) | AUTOMATIC |  |
| G24 | start | Send a short message to every phone | organizer, host | `POST /api/z/{game_id}/announce` | READY |  |
| G25 | start | The game starts at its start time | system | (none) | AUTOMATIC |  |
| G26 | live | Numbers are called by the software from a public random source | system | (none) | AUTOMATIC |  |
| G27 | live | A guest claims a prize and an organizer approves or rejects the claim | guest | (none) | NOT_APPLICABLE |  |
| G28 | live | Hand over a pause, resume or stop: the AI gives the person the game's own page and says what to press | organizer, host | `GET /api/z/{game_id}/summary` | READY |  |
| G29 | live | Press pause, resume or stop in a signed browser (the organizer's console or a Host's own Host page) | human | (none) | HUMAN | D4 |
| G30 | live | See the open pause and stop requests | organizer | `GET /api/z/{game_id}/control/request` | READY |  |
| G31 | live | Read which prizes have been won so far | organizer, host | `GET /api/z/{game_id}/results` | READY |  |
| G32 | live | A Host presses the next number (host-calling mode) | host | (none) | GAP | needs a game change, D27 |
| G33 | finish | The game ends by itself | system | (none) | AUTOMATIC |  |
| G34 | finish | Read the results (ticket level) | organizer, host | `GET /api/z/{game_id}/results` | READY |  |
| G35 | finish | See the prizes won and whether each was handed over | organizer, host | `GET /api/z/{game_id}/prizes` | READY |  |
| G36 | finish | Tick a prize as handed over | organizer, host | `POST /api/z/{game_id}/prizegiven` | READY |  |
| G37 | finish | See the winners' names and numbers | human | (none) | HUMAN |  |
| G38 | post_game | Is the end-of-game report ready and sent? | organizer, host | `GET /api/z/{game_id}/reportlink` | READY |  |
| G39 | post_game | Open the report | human | (none) | HUMAN |  |
| G40 | post_game | Certificates for winners or participants | organizer | (none) | GAP | needs a game change, D21 |
| G41 | post_game | Export the game's own data (results file without personal data) | organizer | (none) | GAP | needs a game change, D22 |
| G42 | close | Guest data is erased within 24 hours of the end | system | (none) | AUTOMATIC |  |
| G43 | close | When will the data be erased and has it been? | organizer, host | `GET /api/z/{game_id}/life` | READY |  |
| G44 | close | Erase all guest data now | organizer | `GET /api/z/{game_id}/summary`<br>`POST /api/z/{game_id}/erase` | READY |  |
| G45 | close | An unpaid game is closed at the start time and its guest data is erased | system | (none) | AUTOMATIC |  |
| G46 | close | An unpublished draft is forgotten after 30 days | system | (none) | AUTOMATIC |  |
| G47 | close | Forget one guest by mobile number | human | `POST /api/z/{id}/forget` | HUMAN |  |
| G48 | rerun | Run it again: a new draft like this game (never with the guest list) | organizer | `GET /api/z/schedule`<br>`GET /api/z/{game_id}/summary`<br>`POST /api/z/{game_id}/clone` | READY | D14 |
| G49 | rerun | Copy the guest list into the new game | human | `POST /api/z/{id}/reuse` | HUMAN |  |
| G50 | rerun | Reopen a cancelled paid game at a new date | organizer | `GET /api/z/{game_id}/summary`<br>`GET /api/z/schedule`<br>`POST /api/z/{game_id}/reopen` | READY | D17 |
| G51 | status_audit | Know where the game stands at every step: state, allowed next actions, do not, what to say | organizer, host | `GET /api/z/{game_id}/summary`<br>`GET /api/z/{game_id}/life` | READY |  |
| G52 | status_audit | See the AI's calls in the game's own audit trail | organizer | (none) | GAP | needs a game change, D6 |
| G54 | start | The Host opens the game and sees the start time | host | `GET /api/z/{game_id}/summary`<br>`GET /api/z/{game_id}/life` | READY |  |
| G55 | start | See how many guests have joined before the start | organizer, host | `GET /api/z/{game_id}/participants` | READY |  |
| G56 | post_game | See when the game ended and when guest data is erased | organizer, host | `GET /api/z/{game_id}/life` | READY |  |
| G53 | status_audit | Read the gateway's own activity log | organizer | `GET /api/z/{game_id}/summary` | READY | D28 |

### Matrix: organizer lifecycle

| Id | Stage | Step | Who | Game route(s) | Status | Gap: who solves it, decision |
|---|---|---|---|---|---|---|
| O01 | key_and_signin | Sign up or sign in and get the organizer key | human | `POST /api/start` | HUMAN |  |
| O02 | key_and_signin | Give the key to the AI assistant | human | (none) | HUMAN | D7 |
| O03 | key_and_signin | Check that the key works, which role it has and whether it is the limited AI key | organizer, host | `GET /api/whoami` | READY |  |
| O04 | key_and_signin | Use the game's own safer AI key (cta_) instead of the organizer key, and ask for a fresh 24-hour one | organizer | `POST /api/org/ai/fresh` | READY | D16 |
| O05 | key_and_signin | A master key that expires or has limited rights | organizer | (none) | GAP | needs a game change, D24 |
| O06 | team | See the team: how many Hosts and Co-hosts and whether each finished set-up | organizer | `GET /api/org/team` | READY |  |
| O07 | team | Add a Host (name and e-mail or mobile; up to 5 Hosts) | human | `POST /api/org/host` | HUMAN | D23 |
| O08 | team | Make a Host key without personal data | organizer | (none) | GAP | needs a game change, D23 |
| O09 | team | Retire a Host or Co-host | organizer | `POST /api/org/team/retire` | READY | D13 |
| O10 | games | List own games | organizer | `GET /api/history` | READY |  |
| O11 | games | Edit a game | organizer | `GET /api/z/schedule`<br>`PATCH /api/z/{game_id}/settings`<br>`GET /api/z/{game_id}/summary` | READY |  |
| O12 | games | Cancel a game | organizer | `GET /api/z/{game_id}/summary`<br>`POST /api/z/{game_id}/cancel` | READY |  |
| O13 | games | Clone or rerun a game | organizer | `GET /api/z/schedule`<br>`GET /api/z/{game_id}/summary`<br>`POST /api/z/{game_id}/clone` | READY |  |
| O14 | games | Read one game in full | organizer | `GET /api/z/{game_id}/summary`<br>`GET /api/z/{game_id}/life` | READY |  |
| O15 | payments | See whether a game is paid | organizer | `GET /api/z/{game_id}/summary`<br>`GET /api/paylink/{token}` | READY |  |
| O16 | payments | See the credit that a cancellation leaves | organizer | `GET /api/z/{game_id}/cancel-preview` | READY |  |
| O17 | payments | Pay a game | human | (none) | HUMAN |  |
| O18 | payments | Payment history and receipts across games | organizer | (none) | GAP | needs a game change, D19 |
| O19 | key_care | Retire, rotate or revoke the organizer's keys and AI links | human | `POST /api/org/keys/revoke` | HUMAN | D7 |
| O20 | key_care | Read the list of the organizer's own sign-in keys (ids and dates) | organizer | `GET /api/org/keys` | READY | D18 |
| O21 | key_care | Limits: calls per minute per key, a typed confirmation lasts 10 minutes, keys are never stored | system | The gateway enforces them and lists them on /ai (section 1). | READY |  |
| O22 | data | Erase the guest data of a game | organizer | `GET /api/z/{game_id}/summary`<br>`POST /api/z/{game_id}/erase` | READY |  |
| O23 | data | Export the organizer's own data | organizer | (none) | GAP | needs a game change, D22 |
| O24 | data | Close the organizer account | human | `POST /api/org/close` | HUMAN |  |
| O25 | support | Answers to the organizer's questions at every stage | system | The lifecycle FAQ at GET /api/ai/v1/tambola/lifecycle and on /ai. | READY |  |
| O26 | support | Reach a person for help | human | (none) | HUMAN |  |
| O27 | support | Raise a support ticket by key | organizer | (none) | GAP | needs a game change, D29 |
| O28 | games | Check a start time before saving | organizer | `GET /api/z/schedule` | READY |  |
| O29 | games | Create a new game | organizer | `GET /api/z/schedule`<br>`POST /api/z`<br>`GET /api/z/{game_id}/summary` | READY |  |

### Matrix: host lifecycle

| Id | Stage | Step | Who | Game route(s) | Status | Gap: who solves it, decision |
|---|---|---|---|---|---|---|
| H01 | receive | The organizer adds the Host; the Host opens the one-time link and confirms e-mail or mobile | human | `POST /api/org/host` | HUMAN | D23 |
| H02 | receive | The Host accepts the role | human | `POST /api/org/role/accept` | HUMAN |  |
| H03 | receive | Check the host key | host | `GET /api/whoami` | READY |  |
| H04 | assigned | Open the game the organizer named (by game id) | host | `GET /api/z/{game_id}/summary`<br>`GET /api/z/{game_id}/life` | READY |  |
| H05 | assigned | List the published games of the organizer's account | host | `GET /api/history` | READY | D30 |
| H06 | prechecks | See how many guests have joined | host | `GET /api/z/{game_id}/participants` | READY |  |
| H07 | prechecks | Check the start time and that the game is paid and scheduled | host | `GET /api/z/{game_id}/summary`<br>`GET /api/z/{game_id}/life` | READY |  |
| H08 | prechecks | See when the game ends and when data is erased | host | `GET /api/z/{game_id}/life` | READY |  |
| H09 | prechecks | Send a short message to every phone | host | `POST /api/z/{game_id}/announce` | READY |  |
| H10 | run | Numbers are called by the software | system | (none) | AUTOMATIC |  |
| H11 | run | Press the next number in host-calling mode | host | (none) | GAP | needs a game change, D27 |
| H12 | run | Hand over a pause, resume or stop: give the person the page and say what to press | host | `GET /api/z/{game_id}/summary` | READY |  |
| H13 | run | A person presses it in their own console or Host page | human | (none) | HUMAN | D4 |
| H14 | run | Read the winners so far (ticket level) | host | `GET /api/z/{game_id}/results` | READY |  |
| H15 | edge_cases | Settle a dispute or review a claim | host | (none) | GAP | needs a game change, D25 |
| H16 | edge_cases | Remove a guest or add a late guest | human | (none) | HUMAN |  |
| H17 | edge_cases | Something is wrong: hand over a pause or a stop to the person | host | `GET /api/z/{game_id}/summary` | READY |  |
| H18 | handover | Hand the Host job to another Host, or leave the game | host | (none) | GAP | needs a game change, D26 |
| H19 | end | See that the game has ended | host | `GET /api/z/{game_id}/summary`<br>`GET /api/z/{game_id}/life` | READY |  |
| H20 | end | See the prizes won | host | `GET /api/z/{game_id}/prizes` | READY |  |
| H21 | end | Tick a prize as handed over | host | `POST /api/z/{game_id}/prizegiven` | READY |  |
| H22 | post_game | Is the report ready and sent? | host | `GET /api/z/{game_id}/reportlink` | READY |  |
| H23 | post_game | When is guest data erased? | host | `GET /api/z/{game_id}/life` | READY |  |
| H24 | retire | The organizer retires the Host | organizer | `POST /api/org/team/retire` | READY |  |
| H25 | retire | A Host retires their own key | host | (none) | GAP | needs a game change, D26 |
| H26 | run | Open the running game and read its state | host | `GET /api/z/{game_id}/summary`<br>`GET /api/z/{game_id}/life` | READY |  |

<!-- GENERATED:LIFECYCLE-MATRIX:END -->
