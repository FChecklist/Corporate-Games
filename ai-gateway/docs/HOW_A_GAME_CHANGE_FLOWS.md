# How a change in a game flows into what the AI reads

## The rule
The gateway never keeps its own copy of the game's rules. `generated/` is made from the game's code by one command. If the game changes and the gateway has not been regenerated, `npm run drift` fails (and so does the daily CI run once the project has a remote).

## The cycle

| Step | Command | What you get |
|---|---|---|
| 1 | `npm run drift` | exit 0 "No drift", or exit 1 with plain lines saying what moved; exit 2 "GENERATION FAILED" with the decisions needed |
| 2 | decide | for each new route or action the generator names: use it in an action (`games/<game>/adapter.mjs`) or exclude it with a written reason (`policy.excluded_prefixes` / `excluded_actions`). For a changed access rule: change the roles of the action. For a changed public fact: record or remove the known conflict (`content.mjs`) |
| 3 | `npm run generate` | rewrites `generated/*`; `generated/SOURCE.json` says which game commit it was made from |
| 4 | `git diff generated/` | read it. If it changes what the AI may do, the owner should see it |
| 5 | `npm test` | all suites must pass; the FAQ numbers are checked against the code again |
| 6 | commit | the deploy is a separate, owner-approved step (`HOSTING_PLAN.md`) |

## What each kind of game change does

| Game change | Detected by | Result |
|---|---|---|
| A route used by the gateway is renamed or removed | static reader | generation fails: "BLOCK NOT FOUND" |
| A new route, or a new engagement action | route inventory | generation fails until it is classified |
| A route's code changes (fields, errors, status codes) | fingerprint | generation succeeds; the diff shows the changed fingerprint and facts; the AI pages follow |
| Who may call a route changes | access probe on a local copy of the game | generation fails if an action is offered to a role the game now refuses; otherwise the access table in `/ai` changes |
| A number changes (limits, prices, prize types, call speeds, days) | constants dump | pages, FAQ and OpenAPI carry the new number |
| The game's public facts change | constants dump | the facts shown on `/ai` change; a new or vanished contradiction with the gateway fails the build |
| A new game status text | status reader | generation fails until it is mapped to a state |

Each row above is proven by `test/drift.test.mjs`, which makes the change in an in-memory copy of the game and checks the result.

## A real example (run on 2026-11-13)

(Historical: on 2026-11-13 the gateway was regenerated against the live commit c6897f2; see `OWNER_DEPLOY_NOTE.md`.) The gateway was first generated from the Corporate Tambola checkout at `<game-checkout-path>` (master, commit 2968f4c, 23 Oct 2026). The game's working line has moved since: the boss survey read commit c6897f2 (13 Nov 2026, branch `t99/setup-path-2026-11-13` of `<game-test-checkout>`), 478 commits and about 1,000 changed lines in the main worker file further on.
That commit was unpacked read-only into a scratch folder and the drift guard was run against it:

```
GENERATION FAILED:
 - NEW GAME ROUTE not classified: POST /api/host/become-organizer
 - NEW GAME ROUTE not classified: POST /api/pass
 - NEW GAME ROUTE PATTERN not classified: /api/beacon/{x}/public/{x}
 - NEW GAME ACTION not classified: /api/z/{id}/logo, rehearsals, rehearsal, rehearsalclose, gamelog, changes,
   discard, checkin, checkins, presence, who, override
 - action request_game_control: the game answers 403 for a host key on control_request. The adapter must not offer it to host. (Historical drift listing: this action has since been removed under the AI hand-over rule, so this item can no longer occur.)
 - The conflict "erase data" is recorded as known but no longer exists: update content.mjs.
```

Meaning, in plain words: eleven new engagement actions and three new routes need a decision (most are likely to be excluded: logos, rehearsals, check-in, override); in the newer game a **host key can no longer ask for a pause or stop** (only the organizer can), and the game's public fact 8 no longer says the AI cannot erase data, so one of the recorded conflicts is gone. Nothing reached the AI silently; this is the guard doing its job, and it is the list of work needed to retarget the gateway to that commit.
The gateway has **not** been retargeted: which Tambola commit is the one to follow (live site, release branch, or the newest working line) is decision D9 in `OWNER_DECISIONS_AND_RISKS.md`.
