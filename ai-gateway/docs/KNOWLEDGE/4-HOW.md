# 4. HOW: regenerate, test, check drift, stay within memory, stage

## Needs

Node 22 or newer, `bun` (the game runs on it), and a checkout of the Corporate Tambola game at the commit that is live. The tests start the game **in memory** (no network, no real database, TEST mode) on a free local port and stop it afterwards. The game's own dependencies must be installed in that checkout. When the game lives in a fresh clone whose `node_modules` is missing, the generator fails with a missing-module error (for example `@noble/hashes/sha256`); install the game's dependencies there first.

## The cycle when a game changes

```bash
# 1. say which game checkout to read (a separate clone or worktree at the live commit)
export CT_GAME_TAMBOLA=<path-to-game-checkout>

# 2. see what moved, in plain lines; changes nothing
npm run drift

# 3. rewrite generated/*
npm run generate

# 4. read the diff; anything that changes what the AI may do needs the owner's eye
git diff generated/

# 5. every suite, one file at a time
npm test

# 6. re-record the sample run
node tools/record-samples.mjs
```

If `npm run drift` reports a **new game route**, decide for each: use it in an adapter action, or list it under `policy.excluded_actions` / `policy.excluded_prefixes` in `games/tambola/adapter.mjs` with a written reason. Anything that would let the AI press a live action, decide a claim, pay or handle personal data is excluded.

Other commands: `npm run test:static` (suites that need no game process), `npm run test:live-game` (suites that start the game), `npm run dev` (local gateway; needs `GATEWAY_SECRET` and `GAME_ORIGIN_TAMBOLA` in the environment, never committed).

## Memory (RAM) guard

The machine used for this work often had under 1.2 GB free. Rule: **do not start the game harness or the test suite when free RAM is below 1200 MB.** The suites run one test file at a time (`node --test --test-concurrency=1`). A wrapper script (kept outside git, in a scratch folder) waited up to 15 minutes for free RAM of at least 1200 MB before each test file and aborted with `RAM_TOO_LOW_ABORT` if it never came. Reading free RAM on Windows: `(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1024` gives megabytes. Static reading, editing and Git work does not need the guard. Nothing in this knowledge pack required running the suite.

## Adding another game

1. `games/<game>/adapter.mjs` in the same shape as Tambola's.
2. Its harness in `games/<game>/harness/` (in-memory copy, access probe, constants dump).
3. Its `content.mjs` and `runtime.mjs`; register it in `src/games.mjs`.
4. `npm run generate`; fix what it reports; `npm test`.

## Independent audit (Rule 7c)

Before anything is staged or deployed, a fresh reviewer who did not write the change reads the diff and the generated pages against the game's code and ends with one line: `AUDIT: PASS` or `AUDIT: FAIL`. Any blocker or major finding is fixed and re-audited. Remember the drift guard cannot see game **settings and modes** or **environment variables outside the code**; ask the audit to look at those specifically.

## Staging plan (workers.dev only; nothing done yet)

Order, and the go-ahead each step needs. Nothing here costs money.

1. Verify the fixes on this branch: regenerate, drift, full suite (108 tests or more, 0 failures, including the Start-by-hand test), re-record samples, fresh audit PASS. *No go-ahead needed; needs free RAM of at least 1200 MB.*
2. Merge the verified fixes into `main` so that `main` is correct. *Needs the boss or owner's instruction.*
3. **Record the rollback point first:** run `wrangler deployments list` and keep the output. (There is no deployment yet, so the first rollback is simply deleting the Worker routes.) *Needs `wrangler` installed.*
4. Name a **TEST-mode** game address for `GAME_ORIGIN_TAMBOLA`. The only game address that exists is live, with real payments. *The owner or boss must name it.*
5. Create a staging-only `GATEWAY_SECRET` (random, 32 or more characters). The owner creates it; it is never written into a file or a message. *Owner.*
6. Deploy to a `workers.dev` address (a test address no customer uses; the free Cloudflare setup the owner already has) and run the scripted agent against it. *Needs an explicit go to install `wrangler` and use the Cloudflare token already present in the environment.*

**Do not touch** the real routes on `home.corporatetambola.com`.

## Real deploy (not started)

Needs all of the following **from the owner**, in the owner's words:
1. Confirm `c6897f2` (or the then-live commit) is the live game commit at go time; if the game was deployed again, re-run the check.
2. Go for staging, then staging checked.
3. A separate go for the real deploy, **with zero live games confirmed** at that moment.
4. Yes or no on the **one added line** in home's `/llms.txt` pointing to `/ai`.
5. `GATEWAY_SECRET` created by the owner (real one).
6. Any paid step (for example a lasting store for rate limits or the activity log) is asked separately.

Rollback: delete the three Worker routes (`home.corporatetambola.com/ai*`, `/openapi.json`, `/api/ai/v1/*`). Home and the game are untouched by the gateway, so removing the routes returns everything to how it was.
