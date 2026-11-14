# Hosting plan: home.corporatetambola.com (plan only, nothing deployed)

## 1. How home is built today (read from `<home-site-checkout>`, read only)

- A static site written by hand. `node tools/build.mjs` copies it to `dist/` and writes `version.json`. No packages.
- Cloudflare Pages project `corporate-home`, build command `node tools/build.mjs`, output `dist`, custom domain `home.corporatetambola.com`. Its README says the deploy to the free plan is **"not done yet"**; the project's own dashboard settings were not visible to this work.
- No `wrangler.toml` (on purpose: settings live in the Pages dashboard). No Worker is bound to the domain.
- `functions/` already exists with `_middleware.js` and `api/t.ts` (first-party visitor analytics, a branch that is not live).
- `_headers` sets a strict policy for every page (`default-src 'self'`, `frame-ancestors 'none'`, nosniff). It also has entries for **`/llms.txt` and `/llms-full.txt`: home already has its own `llms.txt`**, written for the marketing site, and home's own tests (`tests/cases.mjs`, `tests/wording-links.mjs`) pin its wording.
- `_redirects` has no rule for `/ai`, `/openapi.json` or `/api/ai/*`, so nothing in home blocks those paths.
- Home's payment-frame origin list does not contain home (boss survey, live check). This does not matter: the gateway never opens a payment page.

## 2. Recommendation: a separate Worker, `corporate-games-ai-gateway`

The brief asks for a separate worker so that a game change or a gateway fix never touches the tested marketing site and can be rolled back alone. The entry file already exists: `src/worker.mjs`.

| Path on home.corporatetambola.com | Served by |
|---|---|
| `/ai`, `/ai/llms.txt`, `/ai/openapi.json` | the Worker (static text from `generated/`) |
| `/openapi.json` | the Worker |
| `/api/ai/v1/*` | the Worker (the key-based API) |
| `/llms.txt` | **decision D5**: see below |
| everything else | unchanged: Pages `corporate-home` |

Mechanism: Worker Routes on the zone, with these exact patterns: `home.corporatetambola.com/ai*`, `home.corporatetambola.com/openapi.json`, `home.corporatetambola.com/api/ai/v1/*`. A route that matches runs the Worker; every other path still reaches Pages.
**Not verified:** that a Worker route takes precedence over a Pages custom domain on the same hostname, and that nothing else (for example the home analytics function at `/api/t`) is affected. It must be proven on a staging hostname before the real one (step 4 of the checklist).

### Fallback if routes cannot be used
Put a thin wrapper in the home project, `functions/api/ai/[[path]].ts` and `functions/ai.ts`, that imports the same generated bundle and engine. This is the other design in the boss survey. It works the same for the AI, but it ties the gateway's deploys to home's, which the brief wants to avoid. Choose it only if routes fail on staging.

### D5: home's existing `/llms.txt`
Option A (recommended): leave home's `/llms.txt` as it is, and ask for **one added line** in it ("AI assistants that organise or host a game: https://home.corporatetambola.com/ai"). That is a small change to the home site and needs the owner's approval and home's own tests re-run. The gateway's own index is served at `/ai/llms.txt` and `/ai`.
Option B: the Worker also takes `/llms.txt` and replaces home's page for AI readers. Not recommended: it hides the marketing description and breaks home's pinned tests.
Until decided, the gateway's `/llms.txt` answers only on the Worker itself and on `/ai/llms.txt`.

## 3. What the Worker needs

- `wrangler.toml` in **this** project (example below; not active).
- Variable `GAME_ORIGIN_TAMBOLA` = the Corporate Tambola site's live origin (to be confirmed; the entry file's comment says `https://corporatetambola.com`).
- Secret `GATEWAY_SECRET`, random, at least 32 characters. It signs the confirmation tokens and hashes the keys. Changing it only invalidates confirmation sentences in progress.
- No database, no key storage. The free plan is enough for the first version.

```toml
# wrangler.toml (EXAMPLE, not used)
name = "corporate-games-ai-gateway"
main = "src/worker.mjs"
compatibility_date = "2026-10-01"
routes = [
  { pattern = "home.corporatetambola.com/ai*", zone_name = "corporatetambola.com" },
  { pattern = "home.corporatetambola.com/openapi.json", zone_name = "corporatetambola.com" },
  { pattern = "home.corporatetambola.com/api/ai/v1/*", zone_name = "corporatetambola.com" },
]
[vars]
GAME_ORIGIN_TAMBOLA = "https://corporatetambola.com"   # confirm
# secret: wrangler secret put GATEWAY_SECRET
```

## 4. Limits of the first version (owner decisions in `OWNER_DECISIONS_AND_RISKS.md`)

- **Rate limits and Idempotency-Keys are kept in the memory of one Worker instance.** Cloudflare may run several instances, so a determined caller could get more than the stated limit, and a repeated Idempotency-Key may not be recognised on another instance. The game itself still protects the important steps (one open payment link per game; no payment link for a paid game; the typed confirmation is signed and expires after 10 minutes). A strict version needs a Durable Object or KV, which is an extra or paid step: ask first.
- **Audit:** the Worker prints one JSON line per call (time, action, game id, role, key hash, assistant label, result code). No key, no input, no personal data. Keeping those lines needs Workers Logs switched on in the Cloudflare dashboard (owner action). The game's own log records the calls too; **calls made with a master key are not shown in the organizer's own "AI activity" view** (decision D6).
- Every call to the game is a public HTTPS request from the Worker. Cloudflare bot rules on the game hosts could block it (boss survey, not verified).
- CORS allows any origin (`*`) because the key travels in a header, not a cookie.

## 5. Deploy checklist (every step needs the owner's explicit go)

1. Owner says go, in writing. No paid step is taken without a separate yes.
2. **Zero live games running** on every game the gateway points at.
3. Check out the game at the **commit that is live** and run `npm run drift`. The generated pages must describe the deployed game, not a newer one. If it reports drift: `npm run generate`, review `git diff generated/`, `npm test`, commit.
4. Staging first: deploy to `workers.dev` with `GAME_ORIGIN_TAMBOLA` pointing at a game in TEST mode and run the simulated agent against it. Then add the routes on a test hostname and prove that `/ai` is answered by the Worker, that `/` and `/api/t` are still answered by Pages, and that home's own tests still pass.
5. **Record the rollback id** (`wrangler deployments list`; copy the id of the version that is live now. For the first deploy the rollback is "remove the three routes", which returns every path to Pages at once).
6. `wrangler secret put GATEWAY_SECRET`, then `wrangler deploy`.
7. Post-deploy: `GET /ai`, `/ai/llms.txt`, `/openapi.json` answer 200 without a key; `GET /api/ai/v1` lists the games; a call with no key answers `missing_key`; a call with a test organizer key on a TEST game works; home's pages are unchanged.
8. Write the version id, the date and the game commit hash in the owner's deploy log.

## 6. Rollback
Fastest: delete the three routes (every path falls back to Pages in seconds; the Worker stays idle). Or `wrangler rollback <recorded id>`. Neither touches a game or the home site.
