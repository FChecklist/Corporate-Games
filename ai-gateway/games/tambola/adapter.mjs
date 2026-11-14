// THE CORPORATE TAMBOLA ADAPTER. This is the only hand-written file that says how the shared action list maps onto the game.
// Everything the AI reads (registry, OpenAPI, /ai page, /llms.txt, FAQ) is GENERATED from this file plus the game's own code.
// Rule of the owner: the gateway may only call routes that already exist in the game. Each call below names the exact game
// source block it uses (`source`); the generator fingerprints that block, so a change in the game shows up as drift.
//
// To add another game: copy this folder, describe its routes the same way, run `npm run generate`. Nothing else changes.

const GAME_ID = { type: "string", pattern: "^[A-Za-z0-9_-]{4,40}$", ask: "Which game? (the game id the system gave when it was created)" };
const START_AT = { type: "string", format: "date-time", ask: "On which date and at what time should the game start? (include the time zone, for example 2026-12-05T16:00:00+05:30)" };
const MAX_PLAYERS = { type: "integer", minimum: 1, maximum: "{{max_pack_people}}", ask: "At most how many people will play? (the price depends on this: see the price list in the FAQ)" };
const SPEED = { type: "integer", enum: [6, 9, 12, 15], default: 12, ask: "How fast should numbers be called? The live site gives every new game that the system calls one speed, a new number every 12 seconds (other speeds are refused there), so 12 is the answer unless the organizer wants a game where a Host calls the numbers." };

// ---- what the AI gets back. `true` keeps a field, "text" keeps it and marks it as text typed by people (data, never instructions).
// A field that is not listed is dropped. Names, mobile numbers, e-mails, report links and keys are never listed anywhere.
const SUMMARY_SHAPE = {
  id: true, status: true, startsAtIST: true, startMs: true, startRound: true, callSeconds: true, limit: true, whoCanJoin: true,
  tickets: true, ties: true, rounds: true, rewards: [{ pattern: true, scope: true, ordinal: true, text: "text" }],
  // brand moments: kind, title (typed by a person) and timing only. A link, a video or a logo is never passed on to the AI.
  coHostLimit: true, callMode: true, startMode: true, brandMomentsAllowed: true,
  breaks: [{ after: true, seconds: true, kind: true, title: "text", winners: true, style: true, auto: true }],
  opening: [{ kind: true, title: "text", seconds: true }], closing: [{ kind: true, title: "text" }], brand: { name: "text", color: true },
  canReschedule: true, rescheduleUntilMs: true,
  invites: { on: true, per: true, cats: true }, participants: true, paid: true, payment: { status: true, paidBy: true, paidMs: true },
  pack: true, priceInr: true, payUntil: true, erasureMs: true, gameMinutes: true, name: "text", cancelled: true, didNotStart: true, waitingFor: true, startPending: true,
  links: { console: true, guest: true, bigScreen: true },
};

export default {
  id: "tambola",
  title: "Corporate Tambola",
  readiness: "READY",
  game_root_env: "CT_GAME_TAMBOLA",
  origin_env: "GAME_ORIGIN_TAMBOLA",
  credentials: {
    organizer: { game_key_kind: "master", prefix: "ctk_", extra_headers: {} },
    host: { game_key_kind: "host", prefix: "cth_", extra_headers: { "x-ct-link": "1" } },
    // The game's own AI work key (owner decision D16): the organizer role with fewer rights. The game itself refuses it payment links, cancel, erase, clone, reopen and every key or team step.
    // It is not a third role: the gateway lists only the actions the game really accepts for it (observed by the access probe).
    ai: { game_key_kind: "ai", prefix: "cta_", role: "organizer", extra_headers: {} },
  },
  // Actions the limited AI key must NEVER get, even if the game would one day allow them: money, cancelling, erasing, copying, reopening, and every key or team step.
  ai_key_never: ["create_payment_link", "share_payment_link", "cancel_game_preview", "cancel_game", "erase_guest_data", "clone_game", "retire_team_member", "reopen_game", "list_signin_keys", "request_fresh_ai_key"],

  // The game's own source blocks this adapter relies on. `start` is a unique piece of text on the first line of the block.
  routes: {
    whoami: { method: "GET", path: "/api/whoami", file: "worker", start: 'req.method === "GET" && p === "/api/whoami"' },
    schedule: { method: "GET", path: "/api/z/schedule", file: "worker", start: 'req.method === "GET" && p === "/api/z/schedule"' },
    create: { method: "POST", path: "/api/z", file: "worker", start: 'req.method === "POST" && p === "/api/z") {' },
    history: { method: "GET", path: "/api/history", file: "worker", start: 'req.method === "GET" && p === "/api/history"' },
    team: { method: "GET", path: "/api/org/team", file: "worker", start: 'req.method === "GET" && p === "/api/org/team"' },
    summary: { method: "GET", path: "/api/z/{game_id}/summary", file: "worker", start: 'action === "summary" && req.method === "GET"' },
    settings: { method: "PATCH", path: "/api/z/{game_id}/settings", file: "worker", start: 'action === "settings" && (req.method === "PATCH"' },
    paylink_create: { method: "POST", path: "/api/z/{game_id}/paylink", file: "worker", start: "const plm = p.match(", back: 1 },
    paylink_read: { method: "GET", path: "/api/paylink/{token}", file: "pay", start: "const plm = p.match(/^\\/api\\/paylink\\/" },
    cancel_preview: { method: "GET", path: "/api/z/{game_id}/cancel-preview", file: "worker", start: 'action === "cancel-preview" && req.method === "GET"' },
    cancel: { method: "POST", path: "/api/z/{game_id}/cancel", file: "worker", start: 'action === "cancel" && req.method === "POST"' },
    control_requests: { method: "GET", path: "/api/z/{game_id}/control/request", file: "worker", start: 'if (sub === "/request" && req.method === "GET")' },
    participants: { method: "GET", path: "/api/z/{game_id}/participants", file: "worker", start: 'action === "participants" && req.method === "GET"' },
    results: { method: "GET", path: "/api/z/{game_id}/results", file: "worker", start: 'action === "results" && req.method === "GET"' },
    prizes: { method: "GET", path: "/api/z/{game_id}/prizes", file: "worker", start: 'action === "prizes" && req.method === "GET"' },
    prizegiven: { method: "POST", path: "/api/z/{game_id}/prizegiven", file: "worker", start: 'action === "prizegiven" && req.method === "POST"' },
    announce: { method: "POST", path: "/api/z/{game_id}/announce", file: "worker", start: 'action === "announce" && req.method === "POST"' },
    life: { method: "GET", path: "/api/z/{game_id}/life", file: "worker", start: 'action === "life" && req.method === "GET"' },
    reportlink: { method: "GET", path: "/api/z/{game_id}/reportlink", file: "worker", start: 'action === "reportlink" && req.method === "GET"' },
    erase: { method: "POST", path: "/api/z/{game_id}/erase", file: "worker", start: 'action === "erase" && req.method === "POST"' },
    clone: { method: "POST", path: "/api/z/{game_id}/clone", file: "worker", start: 'action === "clone" && req.method === "POST"' },
    team_retire: { method: "POST", path: "/api/org/team/retire", file: "worker", start: 'req.method === "POST" && p === "/api/org/team/retire"' },
    reopen: { method: "POST", path: "/api/z/{game_id}/reopen", file: "worker", start: 'action === "reopen" && req.method === "POST"' },
    keys: { method: "GET", path: "/api/org/keys", file: "worker", start: 'req.method === "GET" && p === "/api/org/keys"' },
    ai_fresh: { method: "POST", path: "/api/org/ai/fresh", file: "worker", start: 'req.method === "POST" && p === "/api/org/ai/fresh"' },
  },

  // EVERY route of the game must be either used above or named here with a reason. A NEW route in the game that is in neither list makes
  // generation fail, so somebody must decide (once) whether the AI may use it. This is how new game functions reach the gateway on purpose.
  policy: {
    excluded_actions: {
      join: "guest action (mobile number)", claims: "guest action", bogey: "guest action", settle: "nobody may set winners", info: "public settings, covered by game_status", reuse: "copies guest lists (personal data)", roster: "loads guest names and numbers (personal data)", publish: "needs the organizer's own e-mail, mobile and tick-boxes: human only",
      unbind: "needs a guest's seat to free a phone (personal data handling), later", seats: "guest action", names: "guest names (personal data)", mark: "marks a guest as organizer/host: later", won: "guest action", over: "guest action", invites: "guest action", vote: "guest action", confirm: "winner's own details",
      logo: "the organizer's logo as a picture for e-mails: not needed by the AI",
      rehearsals: "rehearsal cards of a real game: later (a rehearsal is a live-like run that only a person starts)", rehearsal: "starts a rehearsal of a real game: a live-like action that only a person presses (AI hand-over rule)", rehearsalclose: "closes a rehearsal early: a live-like action that only a person presses",
      gamelog: "the game's own plain-words log: later (the gateway keeps its own activity log, list_activity)", changes: "the game's own change history: later (the gateway keeps its own activity log, list_activity)",
      discard: "deletes an unpublished draft: not offered yet; the AI can cancel a game after a typed confirmation", checkin: "guest check-in (a guest's own action)", checkins: "guest check-in list (personal data)", presence: "guest phones saying they are listening", who: "guest action (employee ID lookup)",
      override: "decides who receives a prize: a person only (AI hand-over rule: the AI never approves or decides a claim)",
      myprizes: "winner's own details", person: "one guest's details (personal data)", forget: "deletes one guest by mobile number (personal data)", cohost: "Co-host header", leave: "guest's own right", datareq: "guest's own right",
    },
    excluded_prefixes: [
      ["/api/host/become-organizer", "a Host becomes an organizer: an account step with personal data, only a person"], ["/api/pass", "a prospect's demo pass link: sales, not part of a game"], ["/api/beacon/", "the public randomness beacon (read by guests' phones)"],
      ["/api/auth/", "sign-in is a human step"], ["/api/start", "sign-up is a human step"], ["/api/org", "account, keys, hosts and co-hosts: the organizer's console (they need personal data)"], ["/api/checkout", "payments are never made by the AI"], ["/api/payments/", "payments are never made by the AI"], ["/api/proforma", "payments"],
      ["/api/purge", "owner only"], ["/api/lifecycle/", "scheduler only"], ["/api/inbound-email", "mail service only"], ["/api/notices", "site news"], ["/api/z/suggestions", "suggestion board: later"], ["/api/z/ai-manifest", "the game's own AI link manual, replaced by this gateway"],
      ["/api/owner/", "platform owner only"], ["/api/invoice/", "invoices: human"], ["/api/credit-note/", "invoices: human"], ["/api/report/", "report link: secret, goes to the organizer's e-mail"], ["/api/paylink/", "the public pay page (used by the payer, never by the AI), except the read of its status"],
      ["/api/z/{id}/people", "guest lists (personal data)"], ["/api/z/{id}/waiting", "guest lists (personal data)"], ["/api/z/{id}/me", "guest action"], ["/api/z/{id}/control", "control: pause, resume and stop are live actions that only a person presses (AI hand-over rule); the AI only reads the open requests (control_requests) and hands over the page"],
    ],
  },

  // Game states the gateway reports. Worked out from the game's own `status` text (see statusMap) and its clock.
  states: {
    no_game: "No game chosen yet.",
    draft: "A free draft exists. It is not visible to guests and nothing is paid.",
    awaiting_payment: "Published but not paid. The game does not start until it is paid.",
    scheduled: "Paid. It will start by itself at the start time.",
    running: "The game has started and is being played.",
    ended: "The game is over. Guest data is erased within 24 hours of the end.",
    cancelled: "The organizer cancelled the game.",
    did_not_start: "Nobody paid in time, so the game was closed and guest data erased.",
  },
  // status text of the game (from its summary route) -> gateway state. A new status text in the game with no entry here makes the drift test fail.
  statusMap: [
    ["draft", "draft"],
    ["published, payment due before the start", "awaiting_payment"],
    ["published, NOT PAID", "awaiting_payment"],
    ["published and paid", "paid"],
    ["published, DEMO GAME", "paid"],
    ["cancelled by the organizer", "cancelled"],
    ["did not start", "did_not_start"],
  ],

  // What each role can do in each state: this is the "allowed_next_actions" that every answer carries.
  stateActions: {
    no_game: { organizer: ["list_games", "plan_start_time", "create_game", "team_overview", "list_signin_keys", "request_fresh_ai_key"], host: ["game_status"] },
    draft: { organizer: ["game_status", "change_settings", "change_extra_settings", "set_guest_invites", "create_payment_link", "share_payment_link", "payment_status", "cancel_game_preview", "cancel_game", "clone_game", "list_games"], host: ["game_status"] },
    awaiting_payment: { organizer: ["game_status", "change_settings", "change_extra_settings", "set_guest_invites", "create_payment_link", "share_payment_link", "payment_status", "cancel_game_preview", "cancel_game", "clone_game"], host: ["game_status"] },
    scheduled: { organizer: ["game_status", "payment_status", "change_settings", "change_extra_settings", "set_guest_invites", "list_guests", "announce", "live_handover", "cancel_game_preview", "cancel_game", "clone_game", "game_timeline"], host: ["game_status", "list_guests", "announce", "game_timeline", "live_handover"] },
    running: { organizer: ["game_status", "list_guests", "announce", "game_results", "list_prizes", "mark_prize_given", "live_handover", "list_game_control_requests", "clone_game", "game_timeline"], host: ["game_status", "list_guests", "announce", "game_results", "list_prizes", "mark_prize_given", "live_handover", "game_timeline"] },
    ended: { organizer: ["game_status", "game_results", "list_prizes", "mark_prize_given", "report_link_status", "game_timeline", "clone_game", "erase_guest_data"], host: ["game_status", "game_results", "list_prizes", "mark_prize_given", "report_link_status", "game_timeline"] },
    cancelled: { organizer: ["game_status", "cancel_game_preview", "reopen_game", "erase_guest_data", "clone_game", "list_games", "create_game"], host: ["game_status"] },
    did_not_start: { organizer: ["game_status", "clone_game", "list_games", "create_game"], host: ["game_status"] },
  },

  actions: [
    {
      id: "check_key", title: "Check the key and the role", common: "check_key", kind: "read", roles: ["organizer", "host"],
      summary: "Tells you which role the key has (organizer or host). Call this first.",
      calls: ["whoami"], inputs: { properties: {}, required: [] }, example: {},
      output: { role: true, key_kind: true, limited: true },
      states: ["any"],
    },
    {
      id: "list_games", title: "List the games", common: "list_games", kind: "read", roles: ["organizer", "host"],
      summary: "Lists the recent games of the organizer's account with their start time and number of guests. A Host sees only the published games (no drafts) and nothing more about them. Guest names and numbers are never shown.",
      calls: ["history"], inputs: { properties: {}, required: [] }, example: {},
      output: { engagements: [{ id: true, created_ms: true, start_round: true, call_seconds: true, closed: true, draft: true, participants: true, startsAtIST: true }], retentionDays: true },
    },
    {
      id: "team_overview", title: "How many Hosts are set up", common: "team_overview", kind: "read", roles: ["organizer"],
      summary: "Counts of Hosts and Co-hosts and whether each Host has finished set-up. Names, e-mails and mobile numbers are never shown. Hosts are added by the organizer in the console.",
      calls: ["team"], inputs: { properties: {}, required: [] }, example: {},
      output: { maxHosts: true, hosts: [{ id: true, setup: true, emailConfirmed: true }], cohosts: [{ id: true, eid: true }] },
    },
    {
      id: "plan_start_time", title: "Turn a date and time into a game start", common: "plan_start_time", kind: "read", roles: ["organizer"],
      summary: "Checks that a start date and time is allowed and shows it in Indian time. Changes nothing.",
      calls: ["schedule"], inputs: { properties: { start_at: START_AT }, required: ["start_at"] }, example: { start_at: "{{start_at}}" },
      output: { ok: true, startRound: true, startMs: true, startsInMinutes: true, startsAtIST: true, error: true },
    },
    {
      id: "create_game", title: "Create a game (free draft)", common: "create_game", kind: "write", roles: ["organizer"],
      summary: "Creates a free draft. Guests cannot see it and nothing is paid or published. Up to 10 drafts at a time.",
      calls: ["schedule", "create", "summary"],
      inputs: {
        properties: {
          name: { type: "string", maxLength: 60, ask: "What should the game be called? (this is shown to the guests)", free_text: true },
          start_at: START_AT, max_players: MAX_PLAYERS, calling_speed_seconds: SPEED,
          tickets: { type: "integer", enum: [1, 2], default: 1, ask: "Should each person get 1 ticket or 2 tickets?" },
          rounds: { type: "integer", minimum: 1, maximum: 5, default: 1, ask: "How many rounds (1 to 5)?" },
          game_id: { type: "string", pattern: "^[A-Za-z0-9_-]{4,40}$", ask: "Optional: your own short game id (letters, digits, - and _). Leave empty and the system makes one." },
        },
        required: ["name", "start_at", "max_players"],
      },
      example: { name: "Annual Day Game", start_at: "{{start_at}}", max_players: 100, calling_speed_seconds: 12, tickets: 1, rounds: 1 },
      output: SUMMARY_SHAPE, produces: "draft", idempotency: "recommended",
    },
    {
      id: "game_status", title: "Read the whole game", common: "game_status", kind: "read", roles: ["organizer", "host"],
      summary: "Everything saved about the game, its state, the next steps and the price. Safe to call at any time.",
      calls: ["summary", "life"], inputs: { properties: { game_id: GAME_ID }, required: ["game_id"] }, example: { game_id: "{{game_id}}" },
      output: SUMMARY_SHAPE,
    },
    {
      id: "change_settings", title: "Change the game settings and prizes", common: "change_settings", kind: "write", roles: ["organizer"],
      summary: "Changes name, start time, size, speed, tickets, rounds and the prize list. The prize list REPLACES the old one: always send every prize.",
      calls: ["schedule", "settings", "summary"],
      inputs: {
        properties: {
          game_id: GAME_ID,
          name: { type: "string", maxLength: 60, ask: "What should the game be called?", free_text: true },
          start_at: START_AT, max_players: MAX_PLAYERS, calling_speed_seconds: SPEED,
          tickets: { type: "integer", enum: [1, 2], ask: "Should each person get 1 ticket or 2 tickets?" },
          rounds: { type: "integer", minimum: 1, maximum: 5, ask: "How many rounds (1 to 5)?" },
          tie_rule: { type: "string", enum: ["share", "next"], ask: "If two people finish on the same number: share the prize place (share) or give the next places one after another (next)?" },
          prizes: {
            type: "array", maxItems: 300, ask: "What is each prize? (a short description of the item, never a person's name or number)",
            items: { type: "object", additionalProperties: false, required: ["house", "place", "text"], properties: {
              house: { type: "string", enum: "{{houses}}", ask: "Which prize type is it?" },
              place: { type: "integer", minimum: 1, ask: "1st, 2nd, 3rd ... winner of this prize type?" },
              text: { type: "string", maxLength: 80, ask: "What is the prize? (for example: Gift voucher worth Rs 500)", free_text: true },
            } },
          },
        },
        required: ["game_id"], atLeastOneOf: ["name", "start_at", "max_players", "calling_speed_seconds", "tickets", "rounds", "tie_rule", "prizes"],
      },
      example: { game_id: "{{game_id}}", prizes: [{ house: "early5", place: 1, text: "Gift voucher worth Rs 500" }, { house: "full", place: 1, text: "Gift voucher worth Rs 1000" }] },
      output: SUMMARY_SHAPE, idempotency: "recommended",
    },
    {
      id: "set_guest_invites", title: "Allow guests to invite others", common: "set_invites", kind: "write", roles: ["organizer"],
      summary: "Switches guest invitations on or off and sets how many people each guest may invite and which kinds of guests.",
      calls: ["settings", "summary"],
      inputs: {
        properties: {
          game_id: GAME_ID,
          on: { type: "boolean", ask: "Should guests be allowed to invite other people?" },
          per_guest: { type: "integer", minimum: 1, maximum: "{{max_invites_per_person}}", ask: "How many people may each guest invite?" },
          categories: { type: "array", items: { type: "string", enum: "{{invite_categories}}" }, ask: "Which kinds of guests may be invited?" },
        },
        required: ["game_id", "on"],
      },
      example: { game_id: "{{game_id}}", on: true, per_guest: 2, categories: ["colleagues"] },
      output: SUMMARY_SHAPE, idempotency: "recommended",
    },
    {
      id: "create_payment_link", title: "Create the payment link", common: "create_payment_link", kind: "write", roles: ["organizer"],
      summary: "Makes ONE payment link for the game that a person (for example the finance team) opens and pays on the payment page. A new link cancels the old one. The AI never pays.",
      calls: ["summary", "paylink_create"],
      inputs: { properties: { game_id: GAME_ID }, required: ["game_id"] }, example: { game_id: "{{game_id}}" },
      confirm: { phrase: "CREATE PAYMENT LINK {game_id}", why: "A new payment link cancels the earlier one. Ask the organizer to confirm." },
      output: { payment_link_url: true, expires_in_days: true, price_inr: true, pack_people: true },
      idempotency: "required", enforce_states: ["draft", "awaiting_payment"], ai_forbidden_exception: "Owner decision: the organizer's AI may create and share the payment link (never pay).",
    },
    {
      id: "share_payment_link", title: "Prepare a message that shares the payment link", common: "share_payment_link", kind: "read", roles: ["organizer"],
      summary: "Writes a ready message (with the game name, the price and the link) for the organizer to copy and send themself. The system sends nothing.",
      calls: ["summary"],
      inputs: { properties: { game_id: GAME_ID, payment_link_url: { type: "string", format: "uri", pattern: "^https://[^/\\s]+/paylink\\.html\\?t=[0-9a-f]{48}$", ask: "Paste the payment link made in the earlier step." } }, required: ["game_id", "payment_link_url"] },
      example: { game_id: "{{game_id}}", payment_link_url: "{{payment_link_url}}" },
      output: { message_to_copy: true, delivery: true },
    },
    {
      id: "payment_status", title: "Has the game been paid?", common: "payment_status", kind: "read", roles: ["organizer"],
      summary: "Tells whether the game has been paid. Give the payment link too to see whether it is still open, paid, expired or being confirmed.",
      calls: ["summary", "paylink_read"],
      inputs: { properties: { game_id: GAME_ID, payment_link_url: { type: "string", format: "uri", pattern: "^https://[^/\\s]+/paylink\\.html\\?t=[0-9a-f]{48}$", ask: "Optional: the payment link, to see its own status." } }, required: ["game_id"] },
      example: { game_id: "{{game_id}}" },
      output: { paid: true, payment: { status: true, paidBy: true, paidMs: true }, link_status: true, price_inr: true },
    },
    {
      id: "cancel_game_preview", title: "What would cancelling do?", common: "cancel_preview", kind: "read", roles: ["organizer"],
      summary: "Shows whether the game can be cancelled and what happens to any payment (it becomes credit; there are no refunds).",
      calls: ["cancel_preview"], inputs: { properties: { game_id: GAME_ID }, required: ["game_id"] }, example: { game_id: "{{game_id}}" },
      output: { canCancel: true, reason: true, paid: true, cancelled: true, credit: { amountInr: true, expiresMs: true } },
    },
    {
      id: "cancel_game", title: "Cancel the game", common: "end_or_delete_game", kind: "write", roles: ["organizer"],
      summary: "Cancels a game that has not started. A paid game becomes credit for the next game (no refund). This cannot be undone.",
      calls: ["summary", "cancel"], inputs: { properties: { game_id: GAME_ID }, required: ["game_id"] }, example: { game_id: "{{game_id}}" },
      confirm: { phrase: "CANCEL GAME {game_id}", why: "Cancelling cannot be undone." },
      output: { cancelled: true, credit: { amountInr: true, expiresMs: true }, already: true },
      idempotency: "required", enforce_states: ["draft", "awaiting_payment", "scheduled"], ai_forbidden_exception: "Owner decision: cancel needs the person's explicit confirmation.",
    },
    {
      id: "list_guests", title: "Count the guests", common: "guest_count", kind: "read", roles: ["organizer", "host"],
      summary: "How many guests have joined, with ticket ids only. Names and mobile numbers are never shown.",
      calls: ["participants"], inputs: { properties: { game_id: GAME_ID, limit: { type: "integer", minimum: 1, maximum: 200, default: 50 }, offset: { type: "integer", minimum: 0, default: 0 } }, required: ["game_id"] }, example: { game_id: "{{game_id}}" },
      output: { participants: [{ pid: true, jr: true, role: true }], total: true, cap: true, offset: true, limit: true },
    },
    {
      id: "game_results", title: "Winners so far (ticket level)", common: "results", kind: "read", roles: ["organizer", "host"],
      summary: "Which prizes have been won, in which round, and by how many tickets. The winners are decided by the software only.",
      calls: ["results"], inputs: { properties: { game_id: GAME_ID }, required: ["game_id"] }, example: { game_id: "{{game_id}}" },
      output: { results: [{ pattern: true, ordinal: true, round: true, idx: true, count: true }] },
    },
    {
      id: "list_prizes", title: "Prizes won and whether they were handed over", common: "list_prizes", kind: "read", roles: ["organizer", "host"],
      summary: "Prizes won, by ticket number, and whether each has been given. Winners' names and numbers are never shown here; the organizer sees them in the console.",
      calls: ["prizes"], inputs: { properties: { game_id: GAME_ID }, required: ["game_id"] }, example: { game_id: "{{game_id}}" },
      output: { prizes: [{ round: true, pattern: true, ordinal: true, seat: true, confirmed: true, given: true, givenMs: true, givenBy: true, notGiven: true }] },
    },
    {
      id: "mark_prize_given", title: "Tick a prize as handed over", common: "mark_prize_given", kind: "write", roles: ["organizer", "host"],
      summary: "Marks one prize as given to the winner (or takes the tick back).",
      calls: ["prizegiven"],
      inputs: { properties: { game_id: GAME_ID, round: { type: "integer", minimum: 1, ask: "Which round?" }, house: { type: "string", enum: "{{houses}}", ask: "Which prize type?" }, place: { type: "integer", minimum: 1, ask: "Which winner place?" }, ticket: { type: "integer", minimum: 1, ask: "Which ticket number won?" }, given: { type: "boolean", ask: "Has it been handed over?" } }, required: ["game_id", "round", "house", "place", "ticket", "given"] },
      example: { game_id: "{{game_id}}", round: 1, house: "early5", place: 1, ticket: 1, given: true },
      output: { ok: true, givenMs: true }, idempotency: "recommended",
    },
    {
      id: "announce", title: "Send a message to every guest's phone", common: "announce", kind: "write", roles: ["organizer", "host"],
      summary: "Shows one short message (160 characters, no links, no personal data) on every phone and the big screen. Send an empty text to clear it.",
      calls: ["announce"], inputs: { properties: { game_id: GAME_ID, text: { type: "string", maxLength: 160, ask: "What should the message say? (no links, no names or numbers)", free_text: true, no_links: true, allow_empty: true } }, required: ["game_id", "text"] },
      example: { game_id: "{{game_id}}", text: "Next round starts in 5 minutes." },
      output: { ok: true, sent: { id: true, text: "text", at: true }, cleared: true }, idempotency: "required",
    },
    {
      id: "live_handover", title: "Hand a live step to the person (the AI presses nothing)", common: "end_or_delete_game", kind: "read", roles: ["organizer", "host"],
      summary: "AI hand-over rule. Live steps (start the game, pause, resume, stop, next number, draw now, approve or decide a claim) are never pressed by the AI and nothing is filed in the game. This gives you the game's own page address and the one sentence to say: what the person must press and when. For a game run by the clock (Corporate Tambola in its normal mode) there is no button for start, numbers or claims: it says so and gives the live game page to watch. If the game is in host-calling mode, a Host presses Next number for every number: it hands that over. A game of more than the game's pause limit has no pause, resume or stop at all: it says so.",
      calls: ["summary"],
      inputs: { properties: { game_id: GAME_ID, step: { type: "string", enum: ["start", "pause", "resume", "stop", "next_number", "draw_now", "decide_claim"], ask: "Which live step is it: start, pause, resume, stop, next number, draw now or a claim?" } }, required: ["game_id", "step"] },
      example: { game_id: "{{game_id}}", step: "pause" },
      output: { step: true, ai_presses: true, clock_run: true, who_presses: true, press: true, handover_url: true, watch_url: true },
      ai_forbidden_exception: "Read only: the AI hands the person the game's own page. It presses nothing, files nothing and pays nothing.",
    },
    {
      id: "list_game_control_requests", title: "Open pause/stop requests", common: "list_control_requests", kind: "read", roles: ["organizer"],
      summary: "Requests to pause, resume or stop that are waiting for the organizer's approval.",
      calls: ["control_requests"], inputs: { properties: { game_id: GAME_ID }, required: ["game_id"] }, example: { game_id: "{{game_id}}" },
      output: { requests: [{ id: true, action: true, at_ms: true }] },
      ai_forbidden_exception: "Read only: lists requests the organizer has not approved yet.",
    },
    {
      id: "game_timeline", title: "When the game ends and the data is erased", common: "timeline", kind: "read", roles: ["organizer", "host"],
      summary: "When the game is scheduled to end, whether it started, and when guest data is erased.",
      calls: ["life"], inputs: { properties: { game_id: GAME_ID }, required: ["game_id"] }, example: { game_id: "{{game_id}}" },
      output: { endMs: true, endSrc: true, reportSent: true, purged: true, personalDeleteAtMs: true, fullDeleteAtMs: true, started: true },
    },
    {
      id: "report_link_status", title: "Is the report ready?", common: "report_status", kind: "read", roles: ["organizer", "host"],
      summary: "Whether the end-of-game report is ready and sent. The report link itself goes to the organizer's e-mail and is never shown here.",
      calls: ["reportlink"], inputs: { properties: { game_id: GAME_ID }, required: ["game_id"] }, example: { game_id: "{{game_id}}" },
      output: { ready: true, sent: true },
    },
    {
      id: "erase_guest_data", title: "Erase all guest data now", common: "delete_data", kind: "write", roles: ["organizer"],
      summary: "Permanently deletes every guest's name, number and technical record for this game. Winner records stay. This cannot be undone. Guest data is anyway erased by the system within 24 hours after the game ends.",
      calls: ["summary", "erase"], inputs: { properties: { game_id: GAME_ID }, required: ["game_id"] }, example: { game_id: "{{game_id}}" },
      confirm: { phrase: "ERASE GUEST DATA {game_id}", why: "Erasing cannot be undone." },
      output: { ok: true, erased: true }, idempotency: "required", enforce_states: ["ended", "cancelled", "did_not_start", "draft"], ai_forbidden_exception: "Owner decision: erase needs the person's explicit confirmation and only when the game is not running.",
    },
    {
      id: "clone_game", title: "Make a new draft like this game (run it again)", common: "clone_game", kind: "write", roles: ["organizer"],
      summary: "Makes a NEW free draft with the same settings and prizes as an existing game (also an ended or cancelled one). Payment, guests, hosts and the date are never copied: give a new start time now, or the draft waits ('start pending') until you set one. The guest list is never copied by this API.",
      calls: ["schedule", "summary", "clone"],
      inputs: { properties: { game_id: { ...GAME_ID, ask: "Which game should the new one be like? (the game id of the earlier game)" }, start_at: { ...START_AT, ask: "Optional: when should the NEW game start? (include the time zone). Leave it out and the draft waits until you set a start time." } }, required: ["game_id"] },
      example: { game_id: "{{game_id}}", start_at: "{{start_at}}" },
      output: { ...SUMMARY_SHAPE, cloned_from: true, needs_start_time: true, copied: true },
      produces: "draft", idempotency: "recommended", ai_forbidden_exception: "Owner decision D14: the organizer's own key may make a new draft like an earlier game (never with the guest list). The game itself refuses an AI work key.",
      do_not: ["The new game has a NEW game id (in `game_id` of the answer). Use that id from now on, not the old one.", "If `needs_start_time` is true the draft cannot be paid yet: ask for a start time and call change_settings with start_at."],
    },
    {
      id: "retire_team_member", title: "Retire a Host or Co-host", common: "retire_team_member", kind: "write", roles: ["organizer"],
      summary: "Retires one Host or Co-host so their key stops working at once (a Co-host's name and number are erased). Use the member id from team_overview. A retired Host key cannot be brought back; the organizer adds a new Host in the console.",
      calls: ["team_retire"],
      inputs: { properties: { team_ref: { type: "string", pattern: "^[0-9a-f]{10}$", ask: "Which team member should be retired? (the member id from team_overview)" } }, required: ["team_ref"] },
      example: { team_ref: "0123456789" },
      confirm: { phrase: "RETIRE TEAM MEMBER {team_ref}", why: "A retired key stops working at once and cannot be brought back." },
      output: { ok: true, revoked: true },
      idempotency: "required", ai_forbidden_exception: "Owner decision D13: the organizer's own key may retire a team member, only after the person's typed confirmation.",
    },
    {
      id: "change_extra_settings", title: "Set who can join, brand moments, brand strip, host-calling and Co-host limit", common: "change_extra_settings", kind: "write", roles: ["organizer"],
      summary: "Sets the other settings the game already has, before the game starts: who can join, breaks during the game, the opening and closing moment, the company name and colour on the tickets, who calls the numbers, and how many people a Co-host may list. Each list (breaks, opening, closing) REPLACES the old one. Only plain messages and lucky draws can be set here: no links, videos or logos.",
      calls: ["settings", "summary"],
      inputs: {
        properties: {
          game_id: GAME_ID,
          who_can_join: { type: "string", enum: ["anyone", "list"], ask: "Who may join: anyone who has the guest link (anyone), or only people on a list that the organizer loads in the console (list)?" },
          cohost_limit: { type: "integer", minimum: "{{cohost_limit_min}}", maximum: "{{cohost_limit_max}}", ask: "How many people may each Co-host list ({{cohost_limit_min}} to {{cohost_limit_max}})?" },
          breaks: {
            type: "array", maxItems: "{{max_breaks}}", ask: "Which breaks during the game? (a short message or a lucky draw; leave the list empty to remove all breaks)",
            items: { type: "object", additionalProperties: false, required: ["kind", "title"], properties: {
              kind: { type: "string", enum: ["speech", "lucky"], ask: "A message for the guests (speech) or a lucky draw (lucky)?" },
              title: { type: "string", maxLength: 80, ask: "A short title (no names, numbers or links).", free_text: true, no_links: true },
              seconds: { type: "integer", minimum: 15, maximum: 600, ask: "How long should the break last, in seconds (15 to 600, in steps of 3)? Leave it out for 60." },
              after: { type: "integer", minimum: 1, maximum: 89, ask: "After how many numbers have been called (1 to 89)? Leave it out and the system spreads the breaks evenly." },
              winners: { type: "integer", enum: [1, 3, 5, 10], ask: "A lucky draw picks 1, 3, 5 or 10 people. How many?" },
              style: { type: "string", enum: ["draw", "scratch"], ask: "A lucky draw is shown as a draw or as a scratch card?" },
            } },
          },
          opening: {
            type: "array", maxItems: "{{max_edge_moments}}", ask: "What should be shown to the guests before the first number? (a short message; leave the list empty to remove it)",
            items: { type: "object", additionalProperties: false, required: ["kind", "title"], properties: {
              kind: { type: "string", enum: ["speech"], ask: "Only a message (speech) can be set through this API." },
              title: { type: "string", maxLength: 80, ask: "The message (no names, numbers or links).", free_text: true, no_links: true },
              seconds: { type: "integer", minimum: 15, maximum: "{{opening_window_seconds}}", ask: "How many seconds (15 to {{opening_window_seconds}}, in steps of 3)? Leave it out for 60." },
            } },
          },
          closing: {
            type: "array", maxItems: "{{max_edge_moments}}", ask: "What should be shown on the final screen? (a short message; leave the list empty to remove it)",
            items: { type: "object", additionalProperties: false, required: ["kind", "title"], properties: {
              kind: { type: "string", enum: ["speech"], ask: "Only a message (speech) can be set through this API." },
              title: { type: "string", maxLength: 80, ask: "The message (no names, numbers or links).", free_text: true, no_links: true },
            } },
          },
          brand_name: { type: "string", maxLength: "{{brand_name_max}}", ask: "The company name to show on every ticket (at most {{brand_name_max}} characters). Needs a brand_color too.", free_text: true, no_links: true },
          brand_color: { type: "string", enum: "{{brand_colors}}", ask: "Which brand colour? Pick one of the colours listed." },
          remove_brand: { type: "boolean", ask: "Remove the company name and colour from the tickets? (true removes it; a logo set in the console is removed too)" },
          call_mode: { type: "string", enum: ["auto", "host"], ask: "Who calls the numbers: the software (auto, recommended) or a Host who presses a button for every number (host)?" },
        },
        required: ["game_id"], atLeastOneOf: ["who_can_join", "cohost_limit", "breaks", "opening", "closing", "brand_name", "brand_color", "remove_brand", "call_mode"],
      },
      example: { game_id: "{{game_id}}", who_can_join: "anyone", brand_name: "Acme", brand_color: "{{brand_color_example}}" },
      confirm: { phrase: "SET HOST CALLING {game_id}", when: { call_mode: "host" }, why: "In host-calling mode the game waits for a Host to press a button for every number. If nobody presses, the game stalls. The AI cannot press it." },
      output: SUMMARY_SHAPE, idempotency: "recommended",
      do_not: ["Never put a link, a video, a logo, a name or a number in any of these fields.", "Read the game first (game_status): a break, opening or closing moment with a link, a video or slides that the organizer set in the console cannot be kept by this action, so it is refused rather than removed.", "Host-calling mode makes the game wait for a person at a Host's browser for every number: do not suggest it unless the organizer asks for it."],
    },
    {
      id: "reopen_game", title: "Move a cancelled paid game to a new date (reopen)", common: "reopen_game", kind: "write", roles: ["organizer"],
      summary: "Brings a CANCELLED game back at a new start time. Only a game that was paid is possible, within 365 days of the payment. The payment stays with the game: nothing more is due and nothing is paid by the AI. Guests who had joined must join again.",
      calls: ["summary", "schedule", "reopen"],
      inputs: { properties: { game_id: GAME_ID, start_at: { ...START_AT, ask: "On which date and at what time should the reopened game start? (include the time zone; it must be within 365 days of the payment)" } }, required: ["game_id", "start_at"] },
      example: { game_id: "{{game_id}}", start_at: "{{start_at}}" },
      confirm: { phrase: "REOPEN GAME {game_id}", why: "Reopening moves the money (the credit the cancel made) back onto this game." },
      output: SUMMARY_SHAPE, idempotency: "required", enforce_states: ["cancelled"], ai_forbidden_exception: "Owner decision D17: the organizer's own key may reopen a cancelled paid game after the person's typed confirmation. The AI never pays: the game moves the existing credit.",
      do_not: ["Never reopen unless the organizer asked for it.", "If the game was never paid, reopening is not possible: use clone_game for a new draft."],
    },
    {
      id: "list_activity", title: "What did the AI do? (the gateway's own activity log)", common: "activity_log", kind: "read", roles: ["organizer"], local: true,
      summary: "Lists the latest calls made through this gateway: time, action, game id, which kind of key, and the result. Never the key, never what was sent. Give a game id to see every call that worked on that game (also by Host keys and the safer AI key); leave it out to see this key's own calls. The log is kept in the gateway's memory only and is lost when the gateway restarts.",
      calls: ["summary"],
      inputs: { properties: { game_id: { ...GAME_ID, ask: "Optional: only the calls that worked on this game." }, limit: { type: "integer", minimum: 1, maximum: 100, default: 50, ask: "How many of the latest calls (1 to 100)?" } }, required: [] },
      example: {},
      output: { entries: [{ at: true, action: true, game_id: true, role: true, key_kind: true, status: true, ok: true, error_code: true, agent: "text", replay: true }], count: true, kept: true, note: true },
      ai_forbidden_exception: "Read only: the gateway's own log of calls, without keys or inputs.",
    },
    {
      id: "list_signin_keys", title: "List the organizer's sign-in keys (ids and dates only)", common: "list_keys", kind: "read", roles: ["organizer"],
      summary: "Shows the organizer's own sign-in keys: an id, the kind (organizer key, AI link, ...), whether it is retired, when it was made, and which one is being used right now. Never the keys themselves. Retiring or replacing a key is done by the organizer in the console.",
      calls: ["keys"], inputs: { properties: {}, required: [] }, example: {},
      output: { keys: [{ id: true, kind: true, revoked: true, created_ms: true, created_at: true, thisOne: true }] },
      ai_forbidden_exception: "Owner decision D18: a read-only list of key ids and dates. The gateway never calls the routes that retire, replace or show a key.",
    },
    {
      id: "request_fresh_ai_key", title: "Ask the game to e-mail the organizer a fresh 24-hour AI key", common: "fresh_ai_key", kind: "write", roles: ["organizer"],
      summary: "The game e-mails the organizer a new AI work key that works for 24 hours (a safer key than the organizer key: it cannot pay, cancel, erase or manage keys and the team). The key goes to the organizer's e-mail ONLY: the AI never sees it. The organizer pastes it into the conversation themself.",
      calls: ["ai_fresh"], inputs: { properties: {}, required: [] }, example: {},
      confirm: { phrase: "SEND ME A FRESH AI KEY", why: "The game makes a new key and e-mails it to the organizer. At most 5 fresh keys can be open at once." },
      output: { ok: true, sent: true, expiresMs: true },
      idempotency: "required", ai_forbidden_exception: "Owner decision D16: the organizer's own key may ask for a fresh, limited AI key to be e-mailed to the organizer. The key is never shown to the AI.",
      do_not: ["Never ask the organizer to read the new key aloud in a place others can see; it goes to their e-mail only.", "The new key is NOT shown by this API."],
    },
  ],

  // Things the system must say with a number from the game's own code. {{...}} is filled by the generator from the game.
  // The common (cross-game) action list and where Corporate Tambola cannot do it:
  commonNotes: {
    start_game: { support: "automatic", note: "A paid game starts by itself at its start time. By default there is no start button (if the organizer chose Start by hand, a person presses Start and live_handover says so): the AI starts nothing and gives the person the live game page to watch (live_handover)." },
    end_game: { support: "handover", note: "The AI never presses stop, pause or resume. It calls live_handover, gives the person the page and says what to press; only a person presses it: the organizer in their console, or a Host on their own Host page. Before the start, cancel_game ends it." },
    run_calls_and_claims: { support: "not_applicable", note: "Numbers are drawn by the software from a public random source and winners are decided by the guests' phones. In the normal mode no person, host or AI calls numbers or claims for anyone, so there is no next-number or claim button to hand over. In host-calling mode a Host presses Next number for each number; the AI never does." },
    create_invites: { support: "partial", note: "set_guest_invites switches guest invitations on. Personal invite lists (names and numbers) are loaded by the organizer in the console; the gateway never handles personal data." },
    publish: { support: "human_only", note: "Publishing needs the organizer's own e-mail, mobile number and tick-boxes. The payment link publishes and starts the paid game, so the AI does not need to publish." },
    pay: { support: "forbidden", note: "The AI never pays. A person pays on the payment page through Razorpay (IT Services by Rajat Agarwal)." },
    add_host: { support: "human_only", note: "Adding a Host needs the Host's e-mail or mobile number. The organizer does it in the console (up to {{max_hosts}} Hosts) and gives the Host key to the Host." },
    join_by_id: { support: "not_supported", note: "Guests join with their mobile number today. Joining by employee, associate, vendor or member id is not supported by the game." },
  },
};
