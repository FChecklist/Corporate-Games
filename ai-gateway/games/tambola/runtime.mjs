// How each Corporate Tambola action is carried out: which game calls, in which order, with which fields.
// It may only use the game calls the action declares in adapter.mjs (`calls`); the engine refuses any other call.
// No Node-only APIs: this file also runs inside a Cloudflare Worker.
import adapter from "./adapter.mjs";

const STATUS_MAP = adapter.statusMap;

/** Game status text + clock -> gateway state. */
export function deriveState(summary, life, nowMs) {
  if (!summary || typeof summary.status !== "string") return "no_game";
  const hit = STATUS_MAP.find(([prefix]) => summary.status.startsWith(prefix));
  if (!hit) return "unknown";
  if (hit[1] !== "paid") return hit[1];
  if (typeof summary.startMs === "number" && nowMs < summary.startMs) return "scheduled";
  if (life && typeof life.endMs === "number" && nowMs >= life.endMs) return "ended";
  return life?.started === false && nowMs < (summary.startMs ?? 0) + 120_000 ? "scheduled" : "running";
}

const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
const tokenOf = (url) => String(url).match(/[?&]t=([0-9a-f]{48})$/)?.[1];
const rewardsOf = (prizes) => prizes.map((p) => (p.house === "full2" ? { pattern: "full", scope: "two_ticket", ordinal: p.place, text: p.text } : { pattern: p.house, scope: "ticket", ordinal: p.place, text: p.text }));

async function startRound(io, startAt, gameId) {
  const r = await io.must("schedule", { query: { at: startAt, ...(gameId ? { e: gameId } : {}) } });
  if (!r.json?.ok) throw io.refuse("start_time_not_allowed", r.json?.error ?? "That start time is not allowed.", { status: 409, recovery: ["Choose a start time in the future and at most 30 days ahead for a game that is not paid yet."] });
  return r.json;
}

export const runners = {
  async check_key(input, io) { return { result: { role: io.role, key_kind: io.keyKind, limited: io.keyKind === "ai" } }; },

  async list_games(input, io) {
    const r = (await io.must("history")).json;
    if (io.role !== "host") return { result: r };
    // A Host (owner decision D30): the published games only, with id, time and head-count. No drafts, no other detail.
    const engagements = (r.engagements ?? []).filter((e) => e.draft === 0 || e.draft === false).map((e) => ({ id: e.id, start_round: e.start_round, call_seconds: e.call_seconds, closed: e.closed, participants: e.participants, startsAtIST: e.startsAtIST }));
    return { result: { engagements, retentionDays: r.retentionDays } };
  },

  async team_overview(input, io) { return { result: (await io.must("team")).json }; },

  async plan_start_time(input, io) {
    const r = await io.call("schedule", { query: { at: input.start_at } });
    if (r.status >= 400) throw io.refuse("invalid_input", r.json?.error ?? "That start time cannot be used.", { status: 400 });
    return { result: r.json };
  },

  async create_game(input, io) {
    const sr = await startRound(io, input.start_at);
    // the id never contains text typed by a person (the name could be an attempt at prompt injection): CG-AI-<8 random hex>
    const game_id = input.game_id ?? `CG-AI-${hex(4)}`;
    const body = { id: game_id, startRound: sr.startRound, callSeconds: input.calling_speed_seconds ?? 12, cap: input.max_players, name: input.name, tickets: input.tickets ?? 1, rounds: input.rounds ?? 1 };
    const r = await io.must("create", { body });
    if (r.json?.existed) throw io.refuse("game_id_taken", "That game id is already used. Choose another id, or leave it empty so the system makes one.", { status: 409 });
    return { game_id, result: (await io.must("summary", { params: { game_id } })).json, say_key: "created" };
  },

  async game_status(input, io) { return { game_id: input.game_id, result: (await io.must("summary", { params: { game_id: input.game_id } })).json }; },

  async change_settings(input, io) {
    const body = {};
    if (input.name !== undefined) body.name = input.name;
    if (input.start_at !== undefined) body.startRound = (await startRound(io, input.start_at, input.game_id)).startRound;
    if (input.max_players !== undefined) body.cap = input.max_players;
    if (input.calling_speed_seconds !== undefined) body.callSeconds = input.calling_speed_seconds;
    if (input.tickets !== undefined) body.tickets = input.tickets;
    if (input.rounds !== undefined) body.rounds = input.rounds;
    if (input.tie_rule !== undefined) body.ties = input.tie_rule;
    if (input.prizes !== undefined) body.rewards = rewardsOf(input.prizes);
    await io.must("settings", { params: { game_id: input.game_id }, body });
    return { game_id: input.game_id, result: (await io.must("summary", { params: { game_id: input.game_id } })).json, say_key: "changed" };
  },

  async set_guest_invites(input, io) {
    if (input.on && (input.per_guest === undefined || input.categories === undefined)) throw io.refuse("invalid_input", "To switch invitations on, say how many people each guest may invite (per_guest) and which kinds of guests (categories).", { status: 400, recovery: ["Ask the organizer: how many people may each guest invite, and which kinds of guests?"] });
    const invites = input.on ? { on: true, per: input.per_guest, cats: input.categories } : { on: false, per: input.per_guest ?? 1, cats: input.categories ?? [] };
    await io.must("settings", { params: { game_id: input.game_id }, body: { invites } });
    return { game_id: input.game_id, result: (await io.must("summary", { params: { game_id: input.game_id } })).json, say_key: "changed" };
  },

  async create_payment_link(input, io) {
    const s = (await io.must("summary", { params: { game_id: input.game_id } })).json;
    const r = await io.must("paylink_create", { params: { game_id: input.game_id }, body: {} });
    return { game_id: input.game_id, result: { payment_link_url: r.json.url, expires_in_days: Math.round(((r.json.expiresMs - io.now()) / 86_400_000) * 10) / 10, price_inr: s.priceInr ?? null, pack_people: s.pack ?? null }, say_key: "paylink" };
  },

  async share_payment_link(input, io) {
    const s = (await io.must("summary", { params: { game_id: input.game_id } })).json;
    const own = (() => { try { return new URL(s.links?.console).origin; } catch { return null; } })();
    let given = null; try { given = new URL(input.payment_link_url); } catch { /* refused below */ }
    if (!own || !given || given.origin !== own || given.pathname !== "/paylink.html" || given.username || given.password) throw io.refuse("invalid_input", "That is not this game's own payment page. Use exactly the payment_link_url that create_payment_link returned. Never put a payment link from anywhere else into a message.", { status: 400, recovery: ["Call create_payment_link (after the person's typed sentence) and use the address it returns.", "Never type a payment address yourself."] });
    const price = s.priceInr != null ? `Rs ${Number(s.priceInr).toLocaleString("en-IN")}` : "the price shown on the payment page";
    const lines = [
      "Corporate Tambola: payment request",
      `Game: ${s.id}${s.startsAtIST ? ` (starts ${s.startsAtIST})` : ""}`,
      `Amount: ${price}${s.pack ? ` for up to ${s.pack} people` : ""}`,
      `Pay here: ${given.href}`,
      "The link opens a payment page. The payment is made there by a person; the system and the AI assistant never pay. A newer link replaces this one.",
    ];
    return { game_id: input.game_id, result: { message_to_copy: lines.join("\n"), delivery: "Copy this message and send it yourself (e-mail, chat or WhatsApp). The system and the AI assistant send nothing." }, say_key: "share" };
  },

  async payment_status(input, io) {
    const s = (await io.must("summary", { params: { game_id: input.game_id } })).json;
    const out = { paid: !!s.paid, payment: s.payment, price_inr: s.priceInr ?? null };
    if (input.payment_link_url) {
      const t = tokenOf(input.payment_link_url);
      const r = await io.call("paylink_read", { params: { token: t } });
      out.link_status = r.status === 200 ? r.json.status : "unknown_link";
    }
    return { game_id: input.game_id, result: out };
  },

  async cancel_game_preview(input, io) { return { game_id: input.game_id, result: (await io.must("cancel_preview", { params: { game_id: input.game_id } })).json }; },

  async cancel_game(input, io) {
    const r = await io.must("cancel", { params: { game_id: input.game_id }, body: { confirmations: 3 } });
    return { game_id: input.game_id, result: r.json, say_key: "cancelled" };
  },

  async list_guests(input, io) {
    const r = await io.must("participants", { params: { game_id: input.game_id }, query: { limit: input.limit ?? 50, offset: input.offset ?? 0 } });
    return { game_id: input.game_id, result: r.json };
  },

  async game_results(input, io) { return { game_id: input.game_id, result: (await io.must("results", { params: { game_id: input.game_id } })).json }; },
  async list_prizes(input, io) { return { game_id: input.game_id, result: (await io.must("prizes", { params: { game_id: input.game_id } })).json }; },

  async mark_prize_given(input, io) {
    const r = await io.must("prizegiven", { params: { game_id: input.game_id }, body: { round: input.round, pattern: input.house === "full2" ? "full" : input.house, ordinal: input.place, seat: input.ticket, given: input.given } });
    return { game_id: input.game_id, result: r.json };
  },

  async announce(input, io) {
    const r = await io.must("announce", { params: { game_id: input.game_id }, body: { text: input.text } });
    return { game_id: input.game_id, result: r.json, say_key: "announced" };
  },

  // AI hand-over rule (owner): a live step is never pressed by the AI. This only READS the game's own page addresses and says, in fixed words, what the person must press.
  async live_handover(input, io) {
    const s = (await io.must("summary", { params: { game_id: input.game_id } })).json ?? {};
    const consoleUrl = typeof s.links?.console === "string" ? s.links.console : null;
    const watchUrl = typeof s.links?.bigScreen === "string" ? s.links.bigScreen : null;
    const h = handOver(input.step, { role: io.role, consoleUrl, watchUrl, callMode: s.callMode, startMode: s.startMode, limit: Number(s.limit), pauseMax: Number(io.rules?.pause_max_participants) });
    return { game_id: input.game_id, result: h.result, say_text: h.say };
  },

  async list_game_control_requests(input, io) { return { game_id: input.game_id, result: (await io.must("control_requests", { params: { game_id: input.game_id } })).json }; },
  async game_timeline(input, io) { return { game_id: input.game_id, result: (await io.must("life", { params: { game_id: input.game_id } })).json }; },
  async report_link_status(input, io) { return { game_id: input.game_id, result: (await io.must("reportlink", { params: { game_id: input.game_id } })).json }; },

  async erase_guest_data(input, io) {
    await io.must("summary", { params: { game_id: input.game_id } }); // proves the game exists and is this organizer's before anything is erased
    const r = await io.must("erase", { params: { game_id: input.game_id }, body: {} });
    return { game_id: input.game_id, result: r.json, say_key: "erased" };
  },

  async change_extra_settings(input, io) {
    const game_id = input.game_id;
    const cur = (await io.must("summary", { params: { game_id } })).json; // also proves the game exists and is this organizer's
    const body = {};
    const linked = (list) => (Array.isArray(list) ? list : []).some((m) => m && (m.mediaUrl || !["speech", "lucky"].includes(m.kind)));
    const keepsLinks = (what) => io.refuse("console_only_content", `The game has ${what} that the organizer set in the console with a link, a video or slides. This API cannot keep them, so it will not replace the list. Ask the organizer to change them in the console.`, { status: 409, recovery: ["Tell the organizer to change this part in their console.", "Do not try to remove the existing items to work around this."] });
    if (input.who_can_join !== undefined) body.whoCanJoin = input.who_can_join;
    if (input.cohost_limit !== undefined) body.coHostLimit = input.cohost_limit;
    if (input.call_mode !== undefined) body.callMode = input.call_mode;
    if (input.breaks !== undefined) {
      if (linked(cur.breaks)) throw keepsLinks("breaks");
      body.breaks = input.breaks.map((b) => {
        if (b.kind !== "lucky" && (b.winners !== undefined || b.style !== undefined)) throw io.refuse("invalid_input", "Only a lucky draw has winners and a style. Remove them from a message break.", { status: 400 });
        return { kind: b.kind, title: b.title, seconds: b.seconds ?? 60, ...(b.after !== undefined ? { after: b.after } : {}), ...(b.winners !== undefined ? { winners: b.winners } : {}), ...(b.style !== undefined ? { style: b.style } : {}) };
      });
    }
    if (input.opening !== undefined) { if (linked(cur.opening)) throw keepsLinks("an opening moment"); body.opening = input.opening.map((m) => ({ kind: m.kind, title: m.title, seconds: m.seconds ?? 60 })); }
    if (input.closing !== undefined) { if (linked(cur.closing)) throw keepsLinks("a closing moment"); body.closing = input.closing.map((m) => ({ kind: m.kind, title: m.title })); }
    if (input.remove_brand === true) {
      if (input.brand_name !== undefined || input.brand_color !== undefined) throw io.refuse("invalid_input", "Either remove the brand or set it, not both.", { status: 400 });
      body.brand = null;
    } else if (input.brand_name !== undefined || input.brand_color !== undefined) {
      const name = input.brand_name ?? cur.brand?.name, color = input.brand_color ?? cur.brand?.color;
      if (!name || !color) throw io.refuse("invalid_input", "A brand needs both a name (brand_name) and a colour (brand_color).", { status: 400, recovery: ["Ask the organizer for the company name and one of the listed colours."] });
      body.brand = { name, color, ...(cur.brand?.logo ? { logo: cur.brand.logo } : {}) }; // a logo set in the console stays: it goes from the game to the game and is never shown to the AI
    }
    if (Object.keys(body).length === 0) throw io.refuse("invalid_input", "Nothing to change: send at least one setting.", { status: 400 });
    await io.must("settings", { params: { game_id }, body });
    return { game_id, result: (await io.must("summary", { params: { game_id } })).json, say_key: "changed" };
  },

  async reopen_game(input, io) {
    const game_id = input.game_id;
    await io.must("summary", { params: { game_id } }); // proves the game exists and is this organizer's
    const sr = await startRound(io, input.start_at, game_id);
    await io.must("reopen", { params: { game_id }, body: { startRound: sr.startRound } });
    return { game_id, result: (await io.must("summary", { params: { game_id } })).json, say_key: "reopened" };
  },

  async list_activity(input, io, local) {
    const limit = input.limit ?? 50;
    let entries;
    if (input.game_id) { await io.must("summary", { params: { game_id: input.game_id } }); entries = local.activity.forGame(input.game_id, limit); } // the game answers only for its own organizer
    else entries = local.activity.forKey(local.keyId, limit);
    return { game_id: input.game_id, result: { entries, count: entries.length, kept: entries.length, note: input.game_id ? "Calls that worked on this game, by any key of this organizer's account or by a Host. Calls that were refused are shown only under the key that made them." : "The calls made with THIS key. Give a game id to see every call that worked on one game." } };
  },

  async list_signin_keys(input, io) {
    const r = (await io.must("keys")).json;
    const keys = (Array.isArray(r.keys) ? r.keys : []).map((k) => ({ id: k.id, kind: k.kind, revoked: !!k.revoked, created_ms: k.created_ms, created_at: Number.isFinite(k.created_ms) ? new Date(k.created_ms).toISOString() : null, thisOne: !!k.thisOne }));
    return { result: { keys } };
  },

  async request_fresh_ai_key(input, io) {
    const r = await io.must("ai_fresh", { body: {} });
    // The game answers with the key itself when the mail could not be sent. It is dropped here, never passed on or kept.
    const sent = r.json?.mailed === true;
    return { result: { ok: true, sent, expiresMs: r.json?.expiresMs }, say_key: sent ? "fresh_key" : "fresh_key_not_sent" };
  },

  async clone_game(input, io) {
    await io.must("summary", { params: { game_id: input.game_id } }); // proves the game exists and is this organizer's before anything is copied
    const body = {};
    if (input.start_at !== undefined) body.startRound = (await startRound(io, input.start_at)).startRound;
    const r = await io.must("clone", { params: { game_id: input.game_id }, body }); // never withPeople: the guest list is personal data
    const newId = r.json.id;
    const s = (await io.must("summary", { params: { game_id: newId } })).json;
    return { game_id: newId, result: { ...s, cloned_from: input.game_id, needs_start_time: !!r.json.needsStart, copied: Array.isArray(r.json.copied) ? r.json.copied.length : 0 }, say_key: r.json.needsStart ? "cloned_pending" : "cloned" };
  },

  async retire_team_member(input, io) {
    const r = await io.must("team_retire", { body: { id: input.team_ref } });
    return { result: r.json, say_key: "retired" };
  },
};

/**
 * What to hand to the person for one live step. Pure: fixed words only, plus the page addresses the game itself gave.
 * It looks at the game's own settings so it never invents a button and never denies one that exists:
 *  - host-calling mode: a Host presses "Next number" for every number (the AI never does);
 *  - more than pauseMax people: the game has no pause, resume or stop at all;
 *  - otherwise numbers and claims run by the clock (no button), and pause, resume and stop are pressed in a signed browser (the organizer's console, or a Host's own Host page).
 */
export function handOver(step, { role = "organizer", consoleUrl = null, watchUrl = null, callMode = "auto", startMode = "auto", limit = null, pauseMax = null } = {}) {
  const hostCalling = callMode === "host";
  const noPause = Number.isFinite(limit) && Number.isFinite(pauseMax) && limit > pauseMax;
  const watch = watchUrl ? `Open the live game page to watch it: ${watchUrl}` : "The live game page appears once the game is published and paid. There is nothing to press.";
  const page = consoleUrl ? `the organizer's own console page: ${consoleUrl}` : "the organizer's own console (the game gave no page address, so ask the organizer to open their console)";
  const base = (over) => ({ step, ai_presses: false, clock_run: false, who_presses: "nobody", press: null, handover_url: null, watch_url: watchUrl, ...over });
  if (step === "start" && startMode === "manual") {
    const who = role === "host" ? "Tell the Host: this game is set to Start by hand, so the organizer or you press Start at the start time, on your own Host page (the link the system sent you). It cannot be pressed before the start time." : `Tell the organizer: this game is set to Start by hand, so you or a Host press Start at the start time, never before it. You press it in ${page}; a Host presses it on their own Host page (the link the system sent them).`;
    return { result: base({ who_presses: "the organizer in their console, or a Host on their own Host page", press: "Start", handover_url: consoleUrl }), say: `${who} The AI cannot and does not press it, and files nothing in the game. If nobody presses it, the game does not start. ${watchUrl ? `To watch: ${watchUrl}` : ""}`.trim() };
  }
  if (step === "next_number" && hostCalling) {
    const who = role === "host" ? "Tell the Host: this game is in host-calling mode, so you press Next number yourself for every number, on your own Host page (the link the system sent you). The organizer can also press it in their console." : `Tell the organizer: this game is in host-calling mode, so you or a Host press Next number for every number. You press it in ${page}; a Host presses it on their own Host page (the link the system sent them).`;
    return { result: base({ who_presses: "the organizer in their console, or a Host on their own Host page", press: "next number", handover_url: consoleUrl }), say: `${who} The AI cannot and does not press it, and files nothing in the game. The software still decides which number comes. If nobody presses, the game waits. ${watchUrl ? `To watch: ${watchUrl}` : ""}`.trim() };
  }
  if (["start", "next_number", "draw_now", "decide_claim"].includes(step)) {
    const what = { start: "There is no start button in this game: a paid game starts by itself at its start time (the organizer can change this to Start by hand in the console; then the AI hands the Start over).", next_number: "There is no next-number button in this game: the software calls every number from a public random source.", draw_now: "There is no draw-now button in Corporate Tambola: the software calls the numbers by the clock.", decide_claim: "There is no claim for the AI to approve or decide: the guests' phones agree on a winner and the software records it. If a prize must go to someone else, only a person can change it, in the organizer's console or on a Host's own Host page; the AI never does." }[step];
    const extra = hostCalling && step !== "decide_claim" ? " In this game a Host presses Next number for every number (host-calling mode): ask for next_number to hand that over." : "";
    return { result: base({ clock_run: true, who_presses: "nobody: the clock and the software do it" }), say: `${what}${extra} The AI presses nothing and invents no button. ${watch}` };
  }
  const control = { pause: "pause", resume: "resume", stop: "stop (this ends the game for everyone and cannot be undone)" }[step];
  if (noPause) return { result: base({ clock_run: true, who_presses: "nobody: this game has no pause, resume or stop" }), say: `This game is larger than ${pauseMax} people, and the game has no pause, resume or stop for a game that size: it runs without them. There is nothing to press, and the AI invents no button. ${watch}` };
  const who = role === "host" ? "Tell the Host: press it on your own Host page (the link the system sent you), or ask the organizer to open " : "Tell the organizer: open ";
  return { result: base({ who_presses: "a person, in their own signed browser (the organizer's console, or a Host's own Host page)", press: control, handover_url: consoleUrl }), say: `${who}${page} and press ${control} themselves. The AI cannot and does not press it, and files nothing in the game. ${watchUrl ? `To watch the game: ${watchUrl}` : ""}`.trim() };
}

/** One plain sentence for the organizer, built only from fixed words and numbers (never from text typed by people). */
export function say(actionId, state, ctx = {}) {
  const k = ctx.say_key;
  if (ctx.say_text) return ctx.say_text;
  const T = {
    created: "The draft game is saved. Nobody can see it and nothing is paid. Next: check the details with the organizer, set the prizes, then make the payment link.",
    changed: "The change is saved. Read the summary back to the organizer to be sure it is what they want.",
    paylink: "The payment link is ready. Give it to the person who will pay (for example the finance team). The AI never pays. The game starts by itself at its start time once the payment is confirmed.",
    share: "Here is a message the organizer can copy and send themself. The system sends nothing.",
    cancelled: "The game is cancelled. If it had been paid, the payment stays as credit for the next game (no refunds).",
    announced: "The message is now shown on every guest's phone.",
    cloned: "A new draft game was made with the same settings and prizes. It has a new game id. Nothing is paid and guests cannot see it. Next: check it with the organizer, then the payment link.",
    cloned_pending: "A new draft game was made with the same settings and prizes, under a new game id. It has no start time yet, so it cannot be paid. Ask the organizer for the date and time and set it with change_settings.",
    reopened: "The game is back at its new start time and is paid: the payment stays with it, nothing more is due. Guests who had joined must join again, so send them the guest link once more.",
    fresh_key: "The game has e-mailed a fresh AI key (valid for 24 hours) to the organizer. It is not shown here. The organizer pastes it into this conversation if they want to use it. It cannot pay, cancel, erase or manage keys or the team.",
    fresh_key_not_sent: "The game could not e-mail the key, so no key was handed out. Ask the organizer to get a fresh AI key in their console. Never ask for a key to be read out or sent in a message.",
    retired: "The team member is retired: their key stopped working at once. If they should come back, the organizer adds them again in the console.",
    erased: "All guest names, numbers and technical records for this game are erased. Winner records stay.",
  };
  if (k && T[k]) return T[k];
  const S = {
    no_game: "No game is chosen yet. Ask the organizer for the date, time and size of the game, or pick one of their games.",
    draft: "The game is a free draft. Nothing is paid. Next: prizes, then the payment link.",
    awaiting_payment: "The game is waiting for payment. It will not start until a person pays on the payment page.",
    scheduled: "The game is paid and will start by itself at its start time.",
    running: "The game is being played. Numbers and winners are decided by the software.",
    ended: "The game is over. Guest data is erased by the system within 24 hours of the end.",
    cancelled: "The game was cancelled by the organizer.",
    did_not_start: "The game did not start because nobody paid in time. Guest data was erased. A new game can be made.",
    unknown: "The game is in a state this gateway does not know. Do not guess: ask the organizer to open the console.",
  };
  return S[state] ?? S.unknown;
}
