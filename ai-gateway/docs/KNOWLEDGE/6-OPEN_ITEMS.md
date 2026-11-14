# 6. OPEN ITEMS

Order matters. Items 1 to 3 need no money and no owner decision, only free memory (1200 MB or more).

| # | Item | Who | Blocked by |
|---|---|---|---|
| 1 | Regenerate on the fix branch (`CT_GAME_TAMBOLA` set to a clone at the live commit), run `npm run drift`, the full suite (expect 108 or more tests, 0 failures, including the new Start-by-hand test), then `node tools/record-samples.mjs`; commit | gateway session | free RAM at least 1200 MB |
| 2 | Fresh independent Rule 7c audit of the result (final line `AUDIT: PASS` or `AUDIT: FAIL`). Fix every blocker or major and re-audit. Ask it to look at game settings, modes and environment variables, which the drift guard cannot see | an independent reviewer | item 1 |
| 3 | Merge the verified fixes so `main` is correct (`main` at `398b956` has the two mismatches) | boss or owner instruction | items 1 and 2 |
| 4 | Re-read the live game's `/version.json` just before any staging or deploy; if the commit changed, run the whole check again | gateway session | owner's go |
| 5 | Name a TEST-mode game address for staging | owner or boss | none |
| 6 | Explicit go to install `wrangler` and use the existing Cloudflare token for a workers.dev-only Worker; record `wrangler deployments list` first | owner | items 2, 5 |
| 7 | Decide the staging-only `GATEWAY_SECRET` (the owner creates it; never written down) | owner | none |
| 8 | Real deploy: owner's separate go with **zero live games**; yes or no on the one line in home's `/llms.txt`; owner creates the real `GATEWAY_SECRET`; any paid step asked separately | owner | items 1 to 7 |

## Optional wording work (only if the owner orders it)

- Rename "erase" to "delete" in the confirmation phrase ("ERASE GUEST DATA ..."), the action title and the say-text, because the live game now says "delete". The guard regex in `tools/build.mjs` (near line 120 to 126) and the phrase map must change together with it.
- Document the host-calling limit of 1000 people and that the pay link lasts "at least 7 days" (the gateway says 7 days).
- Soften the `checkins` exclusion reason.

## Decisions still with the owner

D2, D3, D4 (kept), D6, D7, D8, D10, D11, D12 and D13 to D30: each is a plain question with a recommendation in `../OWNER_DECISIONS_AND_RISKS.md`. The 16 held game-change gaps are in `../GAME_CODE_GAPS_HELD.md`.

## Risks that stay open

The key problem (D7: anything holding a master key can use it directly against the game); stale pages if the live commit differs from `generated/SOURCE.json`; the typed confirmation is a protocol, not proof of a human; text typed by people reaches the AI; Worker route versus Pages custom domain not yet tried; Cloudflare bot rules might block Worker-to-game calls; rate limits are per Worker instance (D10).
