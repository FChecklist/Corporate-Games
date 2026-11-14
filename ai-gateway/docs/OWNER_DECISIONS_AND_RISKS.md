# Decisions the owner needs to make, risks, and what was not verified

Plain English. "The gateway" is this project. Nothing here is deployed.

## The AI hand-over rule (fixed by the owner, 2026-11-13)

The owner's rule, now written into the playbooks, the stage FAQ, every answer's `do_not`, `/ai`, `/llms.txt` and the OpenAPI file, and guarded by tests (`test/handover-static.test.mjs`, `test/handover.test.mjs`):

1. **Before the game starts** the AI does all the work for the organizer or host, except payment: create, settings, invites, announcements, status, clone and so on, on the routes the game already has.
2. **Live steps** (start the game, pause, resume, stop, next number, draw now, approving or deciding a claim) are never pressed by the AI. It calls `live_handover`, which only reads the game, gives the person the game's own page address (the organizer's console, or the live game page to watch) and one plain sentence saying what to press and when. Corporate Tambola runs by the clock, so for start, numbers and claims there is no button: the AI says so and gives the live game page to watch.
3. **Payment:** the AI never pays. It may create and share the game's own payment link (organizer key, typed confirmation first); a person pays on the game's own page. Nothing goes through the home site.
4. **Human-only:** publishing consent, confirming a new Host's e-mail and mobile, anything that involves paying. The AI stops and hands over.

What changed in the gateway because of it: the old action that filed a pause, resume or stop request (`request_game_control`) is **removed**, because filing a request is the AI pressing a live action. The route behind it is no longer used. The game's public fact 8 ("the AI assistant cannot pause or stop the game") no longer conflicts with the gateway, so that known conflict is gone. Reading the list of requests a person filed (`list_game_control_requests`) stays, read only.

## Decisions

| Id | Decision | What the gateway does today | Recommendation |
|---|---|---|---|
| **D9** | **Which Corporate Tambola commit does the gateway follow?** | **Now: the live commit c6897f29061c** (read from the live site's /version.json on 2026-11-13, built 10:28 UTC). The gateway was first built from 2968f4c; on 2026-11-13 it was regenerated against c6897f2 (checked out in a separate clone, `<live-clone-path>`). The drift guard first failed with 16 items (15 new game routes or route patterns and one wording conflict); each was classified as NOT offered to the AI (see `OWNER_DEPLOY_NOTE.md`), the gateway was regenerated, and all tests pass against c6897f2. | The owner confirms that c6897f2 is the commit that is live when the gateway goes live. If the game is deployed again before then, the same check is run again. |
| D1 | Publishing stays a human step | No publish action. It needs the organizer's own e-mail, mobile number and tick-boxes, which the AI must not handle. | Yes, keep. |
| D2 | The AI may create the payment link, but the game's own public fact 8 says "the AI assistant cannot make a pay link" | The gateway offers `create_payment_link` to the organizer key only, after the person types a sentence. The FAQ tells the AI openly that the game's page says otherwise. | Keep, and when the game is next changed, update its fact 8 wording (the engine itself is untouched). Until then the conflict is recorded and any new conflict fails the build. |
| D3 | The AI may cancel a game and erase guest data, after a typed confirmation | As described; same fact 8 conflict. | Keep, or take both away and leave them to the console. |
| D4 | Pause, resume and stop are live actions: the AI never presses or files them (the AI hand-over rule) | `live_handover` gives the organizer or Host the console page and one sentence saying what to press. The old request action was removed. | Keep: this is the owner's fixed rule. |
| D5 | Home already has its own `/llms.txt` | The gateway serves its index at `/ai` and `/ai/llms.txt`, and does not touch `/llms.txt`. | Add one line to home's `/llms.txt` that points to `/ai` (needs home's tests re-run), instead of replacing it. |
| D6 | **Master-key calls are not shown in the organizer's own "AI activity" view** in the game | The gateway sends the label `AI: <assistant>` on every call and keeps its own log line per call (no key, no input). In the game, calls with a master key are recorded under the organizer; the declared label is inside the game's sealed audit details (not opened in this work). | Accept for version 1. A fuller fix is a game change (not allowed under the hard rule) or an AI-key connector later. |
| D7 | **Giving an AI a master key is powerful.** A master key can also create hosts, close the account and spend credit. The gateway limits only what is done through it; a key in the AI's hands can still be sent straight to the game. | An organizer key (`ctk_`), the game's own limited AI key (`cta_`, new: it cannot pay, make a payment link, cancel, erase, copy, reopen or handle keys and the team) or a host key (`cth_`) is accepted; the gateway offers no payment, publish, host or account action and has no generic proxy. The organizer can ask the game to e-mail a fresh 24-hour `cta_` key to themself, so the master key need not be given to an AI at all. | Hand a key out only for the event, retire it afterwards, prefer a host key where the job allows. The longer-term answer is the OAuth connector (like PROJEXA's) that never gives the AI the key. |
| D8 | Players join by ID only | Tambola (this commit) joins with a mobile number; the gateway says so. The newer commit has ID-based join settings (`idKind`, who can join) but loading the list of IDs is a human step because it carries names. | Decide with D9; then add a "join by ID" setting to the action list. |
| D10 | Where the gateway's rate limits and idempotency are kept | In the memory of one Worker instance (free, simple). Several instances can each allow the full limit. | Fine for a first version. The strict version needs a Durable Object or KV, an extra or paid step: ask first. |
| D11 | Should the game repos call the gateway's drift check when they change? | The check exists and the CI template is in `.github/workflows/ci.yml`, but no game calls it. | Yes: one `repository_dispatch` line in each game's CI. Until then the daily run is the safety net. |
| D12 | Start of the OAuth connector and WebMCP | Not built. Key-based API first, as agreed. | After D9 and the first live test. |

## Risks

1. **The key problem (D7).** The biggest one. Nothing in this project can stop an AI that holds a key from using it directly against the game.
2. **Stale documents.** The pages the AI reads describe the game commit they were generated from (`generated/SOURCE.json`). If the live game is a different commit, the AI is told the wrong things. Mitigation: deploy checklist step 3, the daily drift run, D9.
3. **The typed confirmation is a protocol, not proof.** The gateway can require the exact sentence and a signed token, and refuses anything else, but it cannot know that a human typed it rather than the AI. The AI is told not to, and the sentence is shown to the person in `say_to_organizer`.
4. **Text typed by people reaches the AI** (game name, prize text, announcements). It is cleaned, listed as untrusted and never used to build instructions; a model can still be influenced by it. The AI is told to treat it as data.
5. **Hand-over of the key.** The plan starts with a person giving the AI a key. The boss survey found no "copy my key" step in the consoles; this is not part of this project.
6. **Worker route versus Pages custom domain** has not been tried (see `HOSTING_PLAN.md`). Fallback: a Pages Function in home.
7. **Game errors pass through.** When the game refuses something, its own sentence is shown (cleaned). Some game sentences use "we" or "us"; the gateway's own texts never do.
8. **Cloudflare bot rules** might block server-to-server calls from the Worker to the game hosts. Not tried.

## Found while building the six approved additions

- **The game's "fresh AI key" route returns the key itself** (in `aiMessage`) when the e-mail could not be sent. The gateway drops it: the AI is never shown a key, and a test proves no key reaches any answer or log.
- **The gateway's activity log** (G53/D28) is kept in memory only: bounded (200 entries per key, 2000 in all), no keys, no inputs, only calls whose key the game accepted, lost when the gateway restarts. A lasting store is a separate step that may cost money: ask first.
- **The independent audit of the first version of this work (FAIL, then fixed)** found: (1) the hand-over text said "there is no next-number button" and "press pause" for every game, but in host-calling mode a Host does press Next number, and a game above the game's pause limit has no pause at all. The text now reads the game's own settings and size and never invents or denies a button. (2) `share_payment_link` accepted a payment address on any host: it now refuses anything that is not the game's own payment page. (3) The payment message was cut at 200 characters, which chopped the end of the link: fixed, with a test that shares a real link. (4) A Host's game list now fails closed if the game ever renames the draft flag; the activity log's count is the caller's own; the `npm run dev` entry file had a syntax error since phase 1 and was fixed.
- **The second independent audit (FAIL, then fixed)** found: (1) in host-calling mode the game's own console says "You or a Host press Next number", so the organizer text now says the organizer can press it too (it had said only a Host); pause and stop can also be pressed by a Host on their own Host page, and the wording now says so. (2) The payment message the person copies now carries only the game id and the game's own payment address (printed from the parsed address), never a name a person typed, so a game named like an instruction or an address leaves no trace in it. (3) The activity log attributes a call to a game only when the action is one the game itself refuses for another organizer; a public read by a stranger's key therefore no longer lands in the owner's log. Each has a test.
- **A game's console-set breaks, opening and closing moments** may hold a link, a video or slides. The gateway will not replace such a list (`console_only_content`) and never shows or sets a link, video or logo.

## Found by this project's tests (and fixed before the commit)

The first run of the negative tests found three real defects in the gateway itself, which the simulated agent had not noticed:
- the top level of every action's inputs was not being checked (unknown fields and personal data in text were let through) — now strict, and a test fails if that is ever loosened;
- read calls were counted against the (smaller) write limit — fixed;
- a generated game id contained letters of the game's name, which is text typed by a person — now random.

The lifecycle tests (whole game, whole organizer life, whole Host life, walked against the real game code) found one more:
- **A retired Host key kept working for up to 5 minutes**, because the gateway remembered a key's role for 5 minutes. After `retire_team_member` the game refused the key at once, but the gateway still answered `check_key` "valid". Fixed: `check_key` always asks the game again, and any refusal from the game drops the remembered role. A test retires a key and proves the very next call is refused.
- A refused call used to report the state `no_game` even for a game that existed; it now reports the real state, so the AI is not sent back to the start.

The lifecycle work also added two actions on routes the game already has (the engine is untouched): `clone_game` (a new draft with the same settings and prizes; never the payment, the date, the guests or the hosts) and `retire_team_member` (typed confirmation first). Decisions D13 to D30 below say which lifecycle gaps remain, who can close each (the gateway alone, or a game change that only the owner can order), and what the owner is asked.

## Not verified

- Nothing was run against a live site. No payment was made, nothing was published, nothing was deployed.
- ChatGPT, Gemini, Claude and Grok were not tried against the OpenAPI file or `/ai`. Only a scripted agent (no paid model) was used.
- The prize hand-over with a **real winner** (winners come from the guests' phones) was not exercised; `mark_prize_given` and `list_prizes` were only called on a game with no winner yet.
- Whether the game's sealed audit log really holds the AI label for master-key calls.
- Whether the live game is at the commit the gateway was generated from (D9).
- The other five games: only their route code was compared (see `GAME_READINESS.md`); none was started.
- The test machine had 0.4 to 1.2 GB of free memory during this work, below the 1.2 GB guard. Only one small game process ran at a time and the tests are set to run one file at a time; no heavy run was made.
- "Rs" is used for money as the owner wrote it; no rupee symbol anywhere (a test checks this).

<!-- GENERATED:LIFECYCLE-DECISIONS:START (written by npm run generate; do not edit by hand) -->
## Lifecycle decisions (generated from the coverage matrix)

Kinds: **done** = made inside the gateway on a route the game already has (the owner may veto); **gateway_only** = the game already has the route, only the gateway changes (owner decision); **game_change** = needs a change in the game's code (owner decision, the engine is frozen); **existing** = decided or recorded earlier in this document.

| Id | Kind | Decision | Question for the owner | Matrix rows |
|---|---|---|---|---|
| D1 | existing | Publishing stays a human step | Keep publishing human-only? | G12, G19 |
| D4 | existing | Pause and stop are live actions: the AI never presses or files them (AI hand-over rule). It gives the person the page and says what to press | Keep it as it is? | G29, H13 |
| D6 | existing | Calls made with the organizer key are not labelled 'AI: <name>' in the game's own audit trail | Should the game label master-key calls from the gateway? | G52 |
| D7 | existing | A master key given to an AI is powerful | Accept it, or move to the safer key (D16)? | O02, O19 |
| D8 | existing | Players join by ID only | The game joins with a mobile number today. Change the game, or accept? | G13 |
| D13 | done | The organizer's AI may retire a Host or Co-host, after the person's typed confirmation | Keep it, or make retiring a console-only step? | O09 |
| D14 | done | The organizer's AI may make a new draft like an earlier game (never with the guest list) | Keep it? | G48 |
| D15 | done | The AI may set who can join, breaks, an opening and closing moment, the company name and colour, host-calling mode and the Co-host limit. Breaks and moments are plain messages and lucky draws only: no links, videos or logos. Host-calling mode needs the person's typed confirmation | Keep it as it is, or also allow links, videos and a logo (they are shown on every guest's phone)? Host-calling mode makes the game wait for a person at a Host's browser for every number. | G08 |
| D16 | done | The gateway accepts the game's own limited AI key (cta_). It is the organizer role without payment links, cancel, erase, clone, reopen, keys and team steps. The organizer key can ask the game to e-mail a fresh 24-hour AI key to the organizer (typed confirmation); the key is never shown to the AI | Keep both key kinds, or accept only the limited key? This changes the earlier rule 'organizer = master key'. | O04 |
| D17 | done | The organizer key may reopen a cancelled paid game at a new date (typed confirmation). The game moves the existing credit; the AI never pays | Keep it, or leave reopening to the console? | G50 |
| D18 | done | The organizer key may read the list of the organizer's own sign-in keys (ids and dates, never the keys). Retiring or replacing a key stays in the console | Keep it, or hide the list from the AI? | O20 |
| D19 | game_change | Receipts, invoices and payment history for the organizer through a key | The game sends them by e-mail only. Add a key-based read route in the game? | G18, O18 |
| D20 | game_change | A language setting for the game | The game has no language setting. Add one? | G07 |
| D21 | game_change | Certificates for winners or participants | The game has none. Add one? | G40 |
| D22 | game_change | Export of the organizer's own game data | The report link goes by e-mail only. Add a key-based export without personal data? | G41, O23 |
| D23 | game_change | Hosts: creating a Host and a Host key without a person typing personal data and a person confirming | The game needs the Host's e-mail or mobile and a human confirmation. Allow a label-only Host created by the organizer's key? | O07, O08, H01 |
| D24 | game_change | A master key that expires or has limited rights | Today a master key is all or nothing. Add expiring or scoped keys? | O05 |
| D25 | game_change | Review of a claim or a dispute by a Host or the organizer | Winners come from the guests' phones and there is no review route. Add one, or accept? | H15 |
| D26 | game_change | A Host key: leave a game, hand it over, retire itself | A Host has no route for these. Add them, or leave it to the organizer? | H18, H25 |
| D27 | game_change | A Host presses the next number (host-calling mode) with the Host key | Today it needs the Host's own browser signature. Add a key-based route, or keep it human? | G32, H11 |
| D28 | done | The gateway keeps an activity log of the calls made through it, in its own memory (bounded, no keys, no inputs). It is lost when the gateway restarts. The organizer reads it with list_activity | Is a memory log enough, or should a lasting store be added? A lasting store is a separate step that may cost money (ask first). | G53 |
| D29 | game_change | A support ticket raised by key | The game has none. Add one, or point to the Trust page and the console? | O27 |
| D30 | done | A Host may list the organizer's published games (id, time and head-count only; no drafts) | Keep it, or let a Host see only the game the organizer names? | H05 |
<!-- GENERATED:LIFECYCLE-DECISIONS:END -->
