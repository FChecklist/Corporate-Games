# 5. CURRENT STATE (2026-11-14)

## Branches in the original local repository

| Branch | Commit | State |
|---|---|---|
| `main` | `398b956` | Regenerated against the live game `c6897f2`. 108 tests passed. **Has two live-game mismatches (M1 Start by hand, M2 default speed 9 versus the live 12). Must not be deployed.** |
| `wip-live-c6897f2-fixes` | `3623111` (after `c3557a7`) | `main` plus the source fixes for M1 and M2, the wording and documentation fixes, and the removal of the last speed-9 leftovers (found while preparing this publication). **Not regenerated, not drift-checked, not tested, not re-audited.** This is the branch published here. |

## What is done and verified

- Phase 1 for Corporate Tambola; complete lifecycles; six gateway-only additions; the AI hand-over rule; the 16 game-change gaps listed by name (`../GAME_CODE_GAPS_HELD.md`); the owner deploy note.
- Independent audits 1 to 3 of the six-additions and hand-over work: fixed, then PASS (`2cc02d1`, 108 tests, drift clean).
- Drift check against live `c6897f2`: failed as designed with 16 items, all classified "not offered", regenerated, 108 tests passed at `398b956`.

## What is NOT verified (be honest about it)

- The fixes in `3623111`: not regenerated, not run, not audited. The generated files on that branch are stale relative to the source edits. Free memory stayed around 0.7 GB for over an hour, below the 1.2 GB guard, so the harness and suite were not run. (This public copy omits four generated files, so it cannot be verified from here without regenerating.)
- Audit 4 is **FAIL** until the fixes are verified and re-audited. Staging is not allowed until it is PASS.
- Nothing has ever been run against a live site by the gateway. No payment was made, nothing was published, nothing was deployed. No ChatGPT, Gemini, Claude or Grok model was tried against `/ai` or the OpenAPI file; only a scripted agent was used.
- The live site's `ONLY_12S` was read from the game's `wrangler.toml`, not from the running site.
- The prize hand-over with a real winner was not exercised.
- Whether the game's sealed audit trail holds the `AI: <assistant>` label for master-key calls.
- A different library version was used in the test clone (libphonenumber-js 1.13.15 versus 1.13.14 in the lock).
- The other five games have no adapter and no drift check.

## Facts to carry forward

- Live Tambola commit when last read: `c6897f29061c` (2026-11-13). The gateway must be re-checked if the game is deployed again.
- 30 actions; 3 lifecycles; 16 held gaps under 12 owner decisions.
- Accepted minor limits (from the earlier audits): the pay-link token is not tied to a game id; the activity log is in memory per instance and keyed by game id only; a confirmation token is reusable for 10 minutes and not bound to all inputs; the static live-path test checks non-GET routes only; live tests crash rather than skip when the harness is missing.
- The local gateway repository has **no remote**; this GitHub copy is a snapshot with no history.

## What this GitHub publication is

One folder, `ai-gateway/`, in the existing repository `FChecklist/Corporate-Games`, on branch `wip-live-c6897f2-fixes`, opened as a pull request that is **not to be merged** and **not to be deployed** until `6-OPEN_ITEMS.md` items 1 to 3 are done.
