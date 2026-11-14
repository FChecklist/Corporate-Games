# Knowledge pack: Corporate Games AI gateway

Plain words. This folder is the complete record of the AI gateway: what it is, why it is built this way, where everything is, how to work on it, where it stands today and what is still open.

> **Status on 2026-11-14: work in progress, NOT deployed, NOT merged, NOT fully verified.**
> This is branch `wip-live-c6897f2-fixes`. Its last commit has source fixes that were **not** regenerated, tested or re-audited (see `5-CURRENT_STATE.md`). Do not deploy from this branch until the steps in `6-OPEN_ITEMS.md` are done and the owner says go.

| File | Question it answers |
|---|---|
| [1-WHAT.md](1-WHAT.md) | What does the gateway do? Playbooks, state machine, coverage matrix, drift check, hand-over rule |
| [2-WHY.md](2-WHY.md) | Why is it like this? Owner decisions with dates, audit findings and fixes, the drift found against the live game |
| [3-WHERE.md](3-WHERE.md) | Where is each thing: files, folders, generated output, live addresses and commits |
| [4-HOW.md](4-HOW.md) | How do I regenerate, test, check drift, stay inside the RAM limit, stage, and what go-aheads are needed |
| [5-CURRENT_STATE.md](5-CURRENT_STATE.md) | What is true right now, and what is not verified |
| [6-OPEN_ITEMS.md](6-OPEN_ITEMS.md) | What is left to do, and who must decide |
| [HANDOVER.md](HANDOVER.md) | The gateway session's own hand-over note, kept as written (paths made generic) |

Older, longer documents sit next to this folder and are still correct unless a file here says otherwise: `../README.md`, `../docs/OWNER_DECISIONS_AND_RISKS.md`, `../docs/OWNER_DEPLOY_NOTE.md`, `../docs/HOSTING_PLAN.md`, `../docs/GAME_READINESS.md`, `../docs/GAME_CODE_GAPS_HELD.md`, `../docs/HOW_A_GAME_CHANGE_FLOWS.md`.

## What was left out of this public copy, and why

This copy sits in a public repository. Four generated files are **not** included because they carry the game's price list, and the owner's rule is no prices in public:
`generated/actions.generated.json`, `generated/ai.md`, `generated/bundle.generated.mjs`, `samples/organizer-and-host-run.md`.
They are rebuilt by `npm run generate` and `node tools/record-samples.mjs` (see `4-HOW.md`). Until they are rebuilt, `npm run drift` and the tests will say the generated files are missing; that is expected, not a fault.

Also removed or made generic: local machine paths (shown as `<live-clone-path>`, `<game-checkout-path>` and so on), and one comment that used a real price as a formatting example.
No secrets, keys, tokens, e-mail addresses or phone numbers of real people are in this folder. The e-mail-like and phone-like strings inside `test/` are made-up test data on example domains.
`GATEWAY_SECRET` is only ever named here as a setting; its value does not exist in any file and the owner creates it.
Git history is not included: this copy is one snapshot of the branch.

The CI file `.github/workflows/ci.yml` sits inside this sub-folder, so GitHub does **not** run it. It is a template (it has placeholders that must be filled in).
