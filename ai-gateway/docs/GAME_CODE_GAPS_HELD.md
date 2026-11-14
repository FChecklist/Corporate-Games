# The 16 things the gateway cannot do until the game's code changes (all held)

Plain words. Nothing here is built, and nothing will be built until the owner decides to change the game. The gateway may only call routes the game already has.

The count is 16 rows. They fall under **12 owner decisions** (D6, D8, D19 to D27, and D29). The earlier note said "12": that was the number of **decisions**, not rows. Two decisions cover more than one row each (D19, D22, D26, D27), which is why 12 decisions make 16 rows.

**No row is new.** All 16 were already in the lifecycle matrix at the commit `c593cae` (the "complete lifecycles" commit). The registry at that commit lists 22 gaps: these 16 plus the 6 gateway-only ones. The owner approved those 6 and they are now built (`4d8e3a9`), so what is left is exactly the same 16.

| Row | Who | What the AI cannot do today | Why (the game) | Decision |
|---|---|---|---|---|
| G07 | Organizer | Set the language of the game | The game has no language setting | D20 |
| G13 | Guest | Guests join by ID only | The game joins guests by mobile number | D8 |
| G18 | Organizer | Receipt, invoice and payment history for a game | The game sends them by e-mail only | D19 |
| O18 | Organizer | Payment history and receipts across games | The game sends them by e-mail only | D19 |
| G32 | Host | Press Next number in host-calling mode | Needs the Host's own browser signature, not a key | D27 |
| H11 | Host | Press Next number in host-calling mode (Host's view of the same gap) | Same | D27 |
| G40 | Organizer | Certificates for winners or players | The game has none | D21 |
| G41 | Organizer | Export the game's own data (results without personal data) | The report link goes by e-mail only | D22 |
| O23 | Organizer | Export the organizer's own data | The game has no key-based export | D22 |
| G52 | Organizer | See the AI's calls in the game's own audit trail | The game does not label master-key calls "AI: name" | D6 |
| O05 | Organizer | A master key that expires or has limited rights | A master key is all or nothing | D24 |
| O08 | Organizer | Make a Host key without personal data | The game needs the Host's e-mail or mobile and a person confirming | D23 |
| O27 | Organizer | Raise a support ticket by key | The game has none | D29 |
| H15 | Host | Settle a dispute or review a claim | Winners come from the guests' phones; the game has no review route | D25 |
| H18 | Host | Hand the Host job to another Host, or leave the game | A Host has no route for it | D26 |
| H25 | Host | A Host retires their own key | Only the organizer's key can retire a Host | D26 |

Each decision is explained, with the question for the owner, in `OWNER_DECISIONS_AND_RISKS.md`. The gateway's own activity log (built, `list_activity`) gives the organizer a record of the AI's calls; G52 is only about the game's own audit trail, which stays held.

The 16 rows come straight from the generated matrix in `GAME_READINESS.md` (the rows marked GAP with `game_change`); a test checks that no gap is left that the gateway could solve by itself.
