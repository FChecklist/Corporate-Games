# Hand-over from the gateway session (updated 2026-11-14)

Read first: `README.md` in this folder (status banner), then `5-CURRENT_STATE.md` and `6-OPEN_ITEMS.md`.

## Newest update: live-commit work (2026-11-13 to 14)

- The gateway was regenerated against the live Corporate Tambola commit `c6897f2` (`main` at `398b956`). The drift guard failed as designed on 15 new routes and one wording conflict; each route was classified "not offered" with a reason. 108 tests passed.
- A fresh independent audit then returned **FAIL**: (M1) the live game has a "Start by hand" mode and the gateway said there is never a start button; (M2) the live site sets `ONLY_12S`, so the default call speed 9 would make `create_game` fail (the default must be 12); (M3) the deploy note was stale and garbled.
- The fixes are on branch `wip-live-c6897f2-fixes` (`3623111`) and are **not regenerated, tested or re-audited**, because free RAM stayed near 0.7 GB (guard: 1200 MB). `main` has the two bugs and must not be deployed.
- Staging on workers.dev was **not** done: the audit is not PASS, `wrangler` is not installed, the only game address is the live one (no TEST-mode address), and the use of the Cloudflare token needs the owner's explicit go.
- 2026-11-14: the owner ordered the knowledge and code to be put on GitHub in an existing repository. This folder and the `ai-gateway/` folder are that copy (a snapshot without history; four price-bearing generated files left out).

Practical lessons for whoever continues:
- Use the file-writing tool for patch scripts that contain backslashes; shell quoting garbled a Windows path once.
- A new clone of the game needs its dependencies installed before the generator can run (a junction to existing `node_modules` worked).
- The drift guard cannot see settings, modes or environment variables outside the code. Ask the audit to check them.
- Run test files one at a time and only with at least 1200 MB free.

---

## Earlier notes, as written (machine paths made generic)


Project: `<gateway-checkout>`, local git only, commit `5f51eb5` on `main`. No remote, nothing pushed or deployed. 60 tests pass (`npm test`), `npm run drift` says no drift.
Read first: `README.md`, then `docs/OWNER_DECISIONS_AND_RISKS.md`.

Things the boss session should know:
1. **Which Tambola commit?** The gateway was generated from `<game-checkout-path>` master (2968f4c, 23 Oct). The boss survey read c6897f2 (13 Nov, `<game-test-checkout>`, branch t99/setup-path-2026-11-13), 478 commits later. Running the drift guard on c6897f2 (unpacked read-only into scratch) fails with 15 items, among them: a host key now gets 403 on `control/request`, and the fact 8 "erase data" conflict is gone. List in `docs/HOW_A_GAME_CHANGE_FLOWS.md`. Needs the owner's answer (D9) before retargeting.
2. Home already has its own `/llms.txt` (pinned by home's tests). The gateway serves its index at `/ai` and `/ai/llms.txt` only (D5).
3. The newest game line has ID-based join settings; the older commit does not (D8).
4. Master-key calls are not labelled in the game's organizer-visible AI trail (agrees with the boss survey); the gateway keeps its own log line per call.
5. Tests found three real gateway defects before the commit (top-level inputs not strictly validated; reads counted against the write limit; game id built from typed text). All fixed and covered.
6. Free RAM during the work was 0.4 to 1.2 GB (under the 1.2 GB guard); only one small game process ran at a time.

## Update: complete lifecycles (commit c593cae, local only)
- Game, organizer and Host lifecycles are generated playbooks + state machine + stage FAQ + `GET /api/ai/v1/tambola/lifecycle`; coverage matrix is in `docs/GAME_READINESS.md` (generated block). 25 actions (new: `clone_game`, `retire_team_member`, both on existing game routes). 79 tests pass against the real game code; drift clean.
- Defect found and fixed: a retired Host key stayed valid up to 5 min (gateway role cache).
- Gaps solvable inside the gateway only (owner decision): G08 extra settings (D15), G50 reopen (D17), G53 gateway activity log (D28), O04 safer AI key `cta_` (D16), O20 key list (D18), H05 Host lists games (D30).
- Gaps needing a game-code change (owner decision, engine frozen): G07 language D20, G13 ID-only join D8, G18/O18 receipts D19, G32/H11 Host presses numbers D27, G40 certificates D21, G41/O23 data export D22, G52 audit label D6, O05 scoped master key D24, O08 Host key without personal data D23, O27 support ticket D29, H15 disputes D25, H18/H25 Host leave/handover/self-retire D26.
- Caveat D9: gateway follows game master 2968f4c; boss line is c6897f2. Nothing run against a live site; nothing pushed or deployed.

## Update: six gateway-only gaps + AI hand-over rule (HEAD 2cc02d1)
- Commits: 4d8e3a9, 314c761, 83c32f2, b0c1fb8, 2cc02d1 (local only, nothing pushed/deployed).
- G08/G50/G53/O04/O20/H05 built and READY (change_extra_settings, reopen_game, list_activity, request_fresh_ai_key + cta_ key, list_signin_keys, Host list_games). 16 game-change gaps still held.
- Hand-over rule: request_game_control removed; live_handover (read-only) returns handover_url + say sentence; rule in /ai, llms.txt, OpenAPI, do_not, playbooks, FAQ, docs; tests handover-static / handover / gaps. 108 tests pass; drift clean.
- Rule 7c audit: rounds 1 and 2 FAIL (fixed), round 3 FAIL on one README line (fixed) then AUDIT: PASS.
- D9: keep following 2968f4c; regenerate + drift-check against the live commit before any deploy.
- Accepted minors: pay-link token not tied to game id; activity log in memory per instance, keyed by game id only; confirmation token reusable 10 min and not bound to all inputs; static live-path test checks non-GET routes only; live tests crash rather than skip without the harness.
