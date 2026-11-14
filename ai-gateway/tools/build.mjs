// BUILD THE REGISTRY. Pure function: (adapter + content + the game's source facts + the game's constants + the access probe) -> registry.
// Everything it writes is derived from the game's own code or from the adapter. It FAILS (throws) when the adapter and the game disagree,
// for example: a route the adapter uses is gone, an action is allowed for a role the game refuses, an enum no longer matches the game.
import { fingerprintRoute, extractGlobals, extractBlock, statusStrings, normalize, extractRouteInventory, canonicalPattern } from "../games/tambola/extract.mjs";
import { limits, doNotGlobal, handOverRule, errorCatalog, envelopeFields } from "./global-content.mjs";
import * as lifecycleDefault from "../games/tambola/lifecycle.mjs";

const clone = (x) => JSON.parse(JSON.stringify(x));
/** The owner writes "the system", never "we": the game's own sentences are carried over word for word except for that. */
export const plain = (t) => String(t).replace(/\bWe\b/g, "The system").replace(/\bwe\b/g, "the system").replace(/\bOur\b/g, "The system's").replace(/\bour\b/g, "the system's").replace(/\bus\b/g, "the system");
const inr = (n) => `Rs ${Number(n).toLocaleString("en-IN")}`;
export const GENERATOR_VERSION = 1;

/** Replace {{name}} inside text; a string that is exactly one {{name}} may become a list or a number. */
export function resolve(value, vars, where = "") {
  if (typeof value === "string") {
    const whole = value.match(/^\{\{([a-z_]+)\}\}$/);
    if (whole && !value.includes(":")) { if (!(whole[1] in vars)) throw new Error(`Unknown placeholder {{${whole[1]}}} in ${where}`); return vars[whole[1]]; }
    return value.replace(/\{\{([a-z_]+(?::[a-zA-Z0-9_.]+)?)\}\}/g, (m, k) => { if (!(k in vars)) throw new Error(`Unknown placeholder ${m} in ${where}`); return String(vars[k]); });
  }
  if (Array.isArray(value)) return value.map((v, i) => resolve(v, vars, `${where}[${i}]`));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, vars, `${where}.${k}`)]));
  return value;
}

export function buildRegistry({ adapter, content, lifecycle = lifecycleDefault, sources, facts, probe }) {
  const gid = adapter.id;
  const globals = extractGlobals(sources);
  const problems = [];
  const fail = (m) => problems.push(m);

  // ---------------------------------------------------------------- routes: fingerprints of the game's own source blocks
  const routes = {};
  for (const [name, r] of Object.entries(adapter.routes)) {
    const src = sources[r.file];
    let fp;
    try { fp = fingerprintRoute(src, { start: r.start, back: r.back }); } catch (e) { fail(`route ${name}: ${e.message}`); continue; }
    routes[name] = { method: r.method, path: r.path, source: { file: r.file, start: r.start, ...(r.back ? { back: r.back } : {}) }, ...fp, observed_access: probe[name] ?? null };
    if (!probe[name]) fail(`route ${name}: no probe result (run the access probe)`);
  }
  if (problems.length) throw Object.assign(new Error("GENERATION FAILED: " + problems.join(" | ")), { problems }); // a missing route block: stop here, the checks below need every route
  const summaryBlock = extractBlock(sources.worker, adapter.routes.summary.start).text;
  const statuses = statusStrings(summaryBlock);

  // ---------------------------------------------------------------- game-wide checks
  if (adapter.actions.some((a) => JSON.stringify(a).includes('"^[A-Za-z0-9_-]{4,40}$"')) && globals.game_id_regex.replace(/^\/|\/$/g, "") !== "^[A-Za-z0-9_-]{4,40}$") fail(`game id rule changed in the game: ${globals.game_id_regex}`);
  for (const s of statuses) if (!adapter.statusMap.some(([p]) => s.startsWith(p))) fail(`the game has a status text with no state mapping: "${s}"`);
  for (const [p] of adapter.statusMap) if (!statuses.some((s) => s.startsWith(p))) fail(`state mapping "${p}" matches no status text of the game any more`);

  // ---------------------------------------------------------------- every route of the game is either used or consciously excluded
  const inventory = extractRouteInventory(sources);
  const usedPaths = new Set(Object.values(adapter.routes).map((r) => r.path.replace("{game_id}", "{id}")));
  const usedExact = new Set(Object.values(adapter.routes).map((r) => r.method + " " + r.path));
  const ex = adapter.policy;
  const classify = (path) => (usedPaths.has(path) ? "used" : ex.excluded_prefixes.find(([p]) => path.startsWith(p))?.[1] ?? null);
  const classified = { exact: {}, patterns: {}, engagement_actions: {} };
  for (const r of inventory.exact) { const [m, path] = r.split(" "); const c = usedExact.has(r) ? "used" : classify(path); if (!c) fail(`NEW GAME ROUTE not classified: ${r}. Decide: use it in an action or add it to policy.excluded_prefixes with a reason.`); classified.exact[r] = c ?? "UNCLASSIFIED"; void m; }
  for (const p of inventory.patterns) { const cp = canonicalPattern(p); const c = cp === "/api/z/{id}/{x}" ? "engagement actions (classified one by one below)" : classify(cp); if (!c) fail(`NEW GAME ROUTE PATTERN not classified: ${p} (as ${cp})`); classified.patterns[p] = c ?? "UNCLASSIFIED"; }
  for (const name of globals.action_list) {
    const used = Object.values(adapter.routes).some((r) => r.path === `/api/z/{game_id}/${name}`);
    const c = used ? "used" : ex.excluded_actions[name] ?? null;
    if (!c) fail(`NEW GAME ACTION not classified: /api/z/{id}/${name}. Decide: use it in an action or add it to policy.excluded_actions with a reason.`);
    classified.engagement_actions[name] = c ?? "UNCLASSIFIED";
  }
  for (const name of Object.keys(ex.excluded_actions)) if (!globals.action_list.includes(name)) fail(`policy.excluded_actions lists "${name}" which the game no longer has: remove it.`);

  // ---------------------------------------------------------------- placeholders from the game's constants
  const packs = facts.packs;
  const maxPack = Math.max(...packs.map((p) => p.people));
  const houses = facts.prize_houses.map((h) => h.id).filter((id) => id !== "full2");
  const vars = {
    houses, invite_categories: facts.invite_categories, max_invites_per_person: facts.max_invites_per_person, max_pack_people: maxPack,
    max_hosts: globals.max_hosts, max_rounds: facts.max_rounds, max_drafts: facts.max_drafts, draft_days: facts.draft_days, max_ahead_days: facts.max_ahead_days,
    paylink_ttl_days: facts.paylink_ttl_days, demo_cap: facts.demo_cap,
    cohost_limit_min: facts.cohost_limit_min, cohost_limit_max: facts.cohost_limit_max, brand_colors: facts.brand_colors, brand_color_example: facts.brand_colors[0], brand_name_max: facts.brand_name_max,
    opening_window_seconds: facts.opening_window_seconds, max_breaks: facts.max_breaks, max_edge_moments: facts.max_edge_moments,
    call_gaps: globals.call_gaps_seconds.join(", ").replace(/, (\d+)$/, " or $1"),
  };
  const speedEnum = adapter.actions.find((a) => a.id === "create_game").inputs.properties.calling_speed_seconds.enum;
  if (JSON.stringify(speedEnum) !== JSON.stringify(globals.call_gaps_seconds)) fail(`call speeds in the adapter ${JSON.stringify(speedEnum)} differ from the game ${JSON.stringify(globals.call_gaps_seconds)}`);

  // ---------------------------------------------------------------- actions
  const actions = adapter.actions.map((a0) => {
    const a = clone(a0);
    a.inputs = { type: "object", ...resolve(a.inputs, vars, `action ${a.id}.inputs`) }; // top level is always a strict object: unknown fields are refused
    a.example = resolve(a.example ?? {}, { ...vars, game_id: "{{game_id}}", start_at: "{{start_at}}", payment_link_url: "{{payment_link_url}}" }, `action ${a.id}.example`);
    a.example = JSON.parse(JSON.stringify(a.example)); // placeholders for the game_id etc. stay as {{...}} until used
    if (a.confirm) a.confirm = resolve(a.confirm, vars, `action ${a.id}.confirm`);
    a.idempotency = a.idempotency ?? "none";
    a.do_not = a.do_not ?? [];
    a.game_calls = a.calls.map((c) => ({ call: c, method: routes[c]?.method, path: routes[c]?.path }));
    for (const c of a.calls) if (!routes[c]) fail(`action ${a.id} uses undeclared route ${c}`);
    return a;
  });
  const byId = Object.fromEntries(actions.map((a) => [a.id, a]));

  // ---------------------------------------------------------------- the safety cross-checks against the game's real behaviour
  const credOf = { organizer: "organizer", host: "host_link" };
  const notFoundOk = new Set(["prizegiven"]); // a 404 "no such reward" still means the key was accepted
  const hostSet = new Set(globals.host_actions);
  const aiNever = new Set(adapter.ai_key_never ?? []);
  const aiRefused = (c) => { const o = routes[c]?.observed_access?.game_ai_key; return o === undefined || o === 401 || o === 403 || (o === 404 && !notFoundOk.has(c)); };
  const forbiddenRe = new RegExp(globals.ai_forbidden_regex.slice(1, globals.ai_forbidden_regex.lastIndexOf("/")));
  const usedRoutes = new Set();
  for (const a of actions) {
    for (const role of a.roles) {
      for (const c of a.calls) {
        const obs = routes[c]?.observed_access?.[credOf[role]];
        if (obs === undefined) continue;
        const denied = obs === 401 || obs === 403 || (obs === 404 && !notFoundOk.has(c) && !["summary", "participants", "prizes", "life", "reportlink", "results", "control_request", "control_requests", "announce", "paylink_create", "settings", "cancel", "cancel_preview", "erase"].includes(c));
        if (obs === 401 || obs === 403 || (obs === 404 && !notFoundOk.has(c))) fail(`action ${a.id}: the game answers ${obs} for a ${role} key on ${c}. The adapter must not offer it to ${role}.`);
        void denied;
      }
    }
    for (const c of a.calls) usedRoutes.add(c);
    // the game's own limited AI key (cta_) is the organizer role with fewer rights: it gets an action only when the game answers it on every route the action calls
    // the activity log attributes a call to a game only when a call of the action is one the game refuses for another organizer (a public read proves nothing about ownership)
    a.proves_game_owner = a.calls.some((c) => { const o = routes[c]?.observed_access?.other_organizer; return o === 401 || o === 403 || o === 404; });
    a.ai_key = a.roles.includes("organizer") && !aiNever.has(a.id) && a.calls.every((c) => !aiRefused(c));
    if (aiNever.has(a.id) && a.calls.every((c) => !aiRefused(c)) && a.roles.includes("organizer")) a.ai_key_note = "the game would allow it, the gateway never offers it to an AI key";
    if (a.ai_key && (a.confirm?.phrase ?? "").match(/PAYMENT LINK|ERASE|CANCEL|RETIRE|FRESH AI KEY|REOPEN/)) fail(`action ${a.id} is destructive or key-related but the game answers it for the limited AI key: review before offering it (add it to ai_key_never in the adapter, or decide).`);
    if (a.kind === "write" && !a.roles.includes("host")) {
      for (const c of a.calls.filter((x) => routes[x].method !== "GET")) {
        const obs = routes[c]?.observed_access?.host_link;
        if (obs !== 401 && obs !== 403) fail(`action ${a.id} is organizer-only but the game lets a host (link) call ${c} (answered ${obs}). Review before offering it.`);
      }
    }
    if (a.roles.includes("host")) {
      for (const c of a.calls) {
        const m = routes[c].path.match(/^\/api\/z\/\{game_id\}\/([a-z-]+)(?:\/|$)/);
        if (m && m[1] !== "control" && !hostSet.has(m[1])) fail(`action ${a.id} (host) uses /${m[1]}, which the game does not allow a Host through an AI link (HOST_ACTIONS = ${globals.host_actions.join(", ")}).`);
      }
    }
    // payment and other "AI may never" areas of the game must be named exceptions
    for (const c of a.calls) {
      const p = routes[c].path.replace("{game_id}", "X").replace("{token}", "0".repeat(48));
      if (forbiddenRe.test(p) && !a.ai_forbidden_exception && !["paylink_read"].includes(c)) fail(`action ${a.id}: ${p} is in the game's list of things an AI may not do, and the adapter gives no exception with a reason.`);
      if (/^\/api\/(checkout|payments|credit|org\/(close|keys\/|ai(?!\/fresh$)))|pay-with-credit|\/publish$|\/checkout$|\/forget$|\/settle$/.test(p)) fail(`action ${a.id}: ${p} is a payment, account, key-changing or publishing route. The gateway must never call it.`);
      if (c === "keys" && routes[c].method !== "GET") fail(`action ${a.id}: the key list may only be READ (GET), never changed.`);
      if (c === "ai_fresh" && (routes[c].method !== "POST" || !a.confirm || a.idempotency !== "required")) fail(`action ${a.id}: asking for a fresh AI key needs a typed confirmation and an Idempotency-Key.`);
    }
    for (const s of a.enforce_states ?? []) if (!(s in adapter.states)) fail(`action ${a.id}: unknown state ${s}`);
  }
  for (const name of Object.keys(routes)) if (!usedRoutes.has(name) && name !== "whoami") fail(`route ${name} is declared but no action uses it`);

  // ---------------------------------------------------------------- states and hypermedia table
  for (const [st, perRole] of Object.entries(adapter.stateActions)) {
    if (!(st in adapter.states)) fail(`stateActions has unknown state ${st}`);
    for (const [role, ids] of Object.entries(perRole)) for (const id of ids) {
      if (!byId[id]) fail(`state ${st}/${role}: unknown action ${id}`);
      else if (!byId[id].roles.includes(role)) fail(`state ${st}: action ${id} is listed for ${role} but the action is not for that role`);
    }
  }
  for (const a of actions) if (a.id !== "check_key" && !Object.values(adapter.stateActions).some((per) => Object.values(per).some((ids) => ids.includes(a.id))) && !Object.values(lifecycle.alwaysActions).some((ids) => ids.includes(a.id))) fail(`action ${a.id} can never be reached from any state`);
  for (const a of actions) for (const s of a.enforce_states ?? []) { /* paid-only steps are listed under scheduled etc. */ void s; }

  // ---------------------------------------------------------------- facts text, conflicts, lists
  const fact = (n) => plain(facts.facts.find((f) => f.n === n)?.say ?? (fail(`game fact ${n} missing`), ""));
  const titles = (role) => actions.filter((a) => a.roles.includes(role) && a.id !== "check_key").map((a) => a.title.charAt(0).toLowerCase() + a.title.slice(1));
  const detected = [];
  const f8 = fact(8);
  const phraseMap = [["make a pay link", "create_payment_link"], ["cancel a game", "cancel_game"], ["delete data", "erase_guest_data"]]; // "pause or stop the game" is no longer a conflict: the AI hand-over rule means the AI presses and files neither
  for (const [phrase, actionId] of phraseMap) if (f8.includes(phrase) && byId[actionId]) detected.push({ fact: 8, phrase, action: actionId });
  const known = content.knownFactConflicts.map(({ fact: f, phrase, action }) => ({ fact: f, phrase, action }));
  const key = (c) => `${c.fact}|${c.phrase}|${c.action}`;
  for (const c of detected) if (!known.some((k) => key(k) === key(c))) fail(`NEW CONFLICT between the game's public fact ${c.fact} ("${c.phrase}") and the gateway action ${c.action}. Record the owner's decision in content.mjs (knownFactConflicts) or remove the action.`);
  for (const k of known) if (!detected.some((c) => key(c) === key(k))) fail(`The conflict "${k.phrase}" is recorded as known but no longer exists: update content.mjs.`);
  const conflictText = detected.length === 0 ? "Yes. The game's public facts and this gateway agree." :
    `Not completely. The game's public fact 8 says the AI assistant cannot ${detected.map((c) => c.phrase).join(", ")}. That sentence describes the game's own AI link. Through this gateway, with the organizer's own key, the AI can make the payment link, can cancel a game that has not started, and can erase guest data when the game is over, but only after the organizer has agreed and typed the confirmation sentence the system shows (the AI never pays, never publishes, and never chooses winners). The owner has to decide whether to change the public fact or to remove these steps (see the owner decisions).`;

  const notes = adapter.commonNotes;
  const cannotList = [
    "pay for anything (the AI can create the payment link, but a person pays on the payment page)",
    "publish a game (it needs the organizer's own e-mail, mobile number and tick-boxes)",
    "choose, change or predict winners, numbers or tickets (the software decides)",
    "see or send guests' names, mobile numbers or e-mails",
    "load guest lists or add hosts or co-hosts (they need personal data, so the organizer does it in the console)",
    "press a live action: start the game, pause, resume, stop, next number, draw now, or approve or decide a claim (the AI gives the person the game's own page and says what to press; for a game run by the clock there is no button, and the AI says so)",
    "call numbers or claim prizes for anyone (the software and the guests' phones do that)",
    "close the organizer's account, retire or replace a key, or see any key itself (the AI can list key ids and ask for a fresh AI key to be e-mailed to the organizer)",
  ].join("; ");
  Object.assign(vars, {
    price_table: `Up to ${packs.map((p) => `${p.people} people: ${inr(p.price_inr)}`).join("; ")}.`,
    gst_note: facts.gst_on ? "GST is added on top of these prices." : "No GST is charged.",
    houses_table: facts.prize_houses.map((h) => `${h.id} (${h.label}): ${h.how} Up to ${h.max} winner${h.max === 1 ? "" : "s"}.`).join(" "),
    can_organizer: titles("organizer").join(", "), can_host: titles("host").join(", "),
    cannot_list: `The AI cannot ${cannotList}.`, fact_conflicts: conflictText,
    start_end: `${notes.start_game.note} ${notes.end_game.note}`,
    not_supported: Object.entries(notes).filter(([, v]) => v.support !== "automatic" && v.support !== "handover").map(([, v]) => v.note.replace("{{max_hosts}}", String(globals.max_hosts))).join(" "),
    error_table: errorCatalog.map((e) => `${e.code}: ${e.todo}`).join(" "),
  });
  for (let n = 1; n <= facts.facts.length; n++) vars[`fact:${n}`] = fact(n);
  for (const a of actions) for (const [f, p] of Object.entries(a.inputs.properties ?? {})) if (p.ask) vars[`ask:${a.id}.${f}`] = p.ask;

  // ---------------------------------------------------------------- playbooks (every step must name a real action the role may use)
  const lifecycleIds = new Set(lifecycle.lifecyclePlaybooks.map((p) => p.id));
  const playbooks = [...content.playbooks, ...lifecycle.lifecyclePlaybooks].map((pb) => {
    const steps = pb.steps.map((s) => {
      const who = s.by ?? pb.who;
      if (s.action) {
        const a = byId[s.action];
        if (!a) fail(`playbook ${pb.id} step ${s.n}: unknown action ${s.action}`);
        else if (!a.roles.includes(who) && !(who === "host" && s.action === "check_key")) fail(`playbook ${pb.id} step ${s.n}: ${s.action} is not allowed for ${who}`);
      } else if (s.by && s.by !== "human" && s.by !== "system") fail(`playbook ${pb.id} step ${s.n}: a step by the ${s.by} needs an action`);
      if (s.by && s.action && (s.by === "human" || s.by === "system")) fail(`playbook ${pb.id} step ${s.n}: a ${s.by} step has no action`);
      if (pb.lifecycle && !lifecycle.stages[pb.lifecycle]?.some((x) => x.id === s.stage)) fail(`playbook ${pb.id} step ${s.n}: unknown stage ${s.stage}`);
      return resolve(s, vars, `playbook ${pb.id} step ${s.n}`);
    });
    for (const r of pb.related ?? []) if (![...content.playbooks.map((p) => p.id), ...lifecycleIds].includes(r)) fail(`playbook ${pb.id}: related playbook ${r} does not exist`);
    pb.steps.forEach((s, i) => { if (s.n !== i + 1) fail(`playbook ${pb.id}: step numbers must run 1,2,3 (found ${s.n} at position ${i + 1})`); });
    return { id: pb.id, title: pb.title, who: pb.who, goal: pb.goal, ...(pb.lifecycle ? { lifecycle: pb.lifecycle, related: pb.related ?? [] } : {}), steps };
  });
  const catalogCodes = new Set(errorCatalog.map((e) => e.code));
  for (const pb of playbooks) for (const s of pb.steps) for (const e of s.on_error) if (!catalogCodes.has(e.code)) fail(`playbook ${pb.id} step ${s.n}: error code ${e.code} is not in the error catalog`);

  const faq = content.faq.map((f) => ({ q: f.q, a: resolve(f.a, vars, `faq "${f.q}"`), from: f.from }));

  // ---------------------------------------------------------------- lifecycle: state machine, coverage matrix, FAQ
  const lc = lifecycle;
  const rolesOf = (by) => (Array.isArray(by) ? by : [by]);
  const offered = (id, role) => Object.values(adapter.stateActions).some((per) => (per[role] ?? []).includes(id)) || (lc.alwaysActions[role] ?? []).includes(id);
  for (const [role, ids] of Object.entries(lc.alwaysActions)) for (const id of ids) { if (!byId[id]) fail(`lifecycle: always-action ${id} is unknown`); else if (!byId[id].roles.includes(role)) fail(`lifecycle: always-action ${id} is not for ${role}`); }
  for (const st of Object.keys(adapter.states)) if (!lc.stateMachine[st]) fail(`lifecycle: state ${st} has no state machine entry`);
  for (const st of Object.keys(lc.stateMachine)) if (!(st in adapter.states)) fail(`lifecycle: state machine has unknown state ${st}`);
  for (const [st, sm] of Object.entries(lc.stateMachine)) {
    if (!sm.transitions.length) fail(`lifecycle: state ${st} has no transitions`);
    if (!lc.stageOfState[st]) fail(`lifecycle: state ${st} has no stage`);
    for (const t of sm.transitions) {
      if (!(t.to in adapter.states)) fail(`lifecycle: ${st} -> ${t.to}: unknown state`);
      if (/^(human|system): /.test(t.via)) { if (!t.via.startsWith(t.by + ":")) fail(`lifecycle: ${st} -> ${t.to}: "${t.via}" must be by ${t.via.split(":")[0]}`); continue; }
      if (!byId[t.via]) { fail(`lifecycle: ${st} -> ${t.to}: unknown action ${t.via}`); continue; }
      for (const r of rolesOf(t.by)) {
        if (!byId[t.via].roles.includes(r)) fail(`lifecycle: ${st}: ${t.via} is not an action of the ${r}`);
        else if (!(adapter.stateActions[st]?.[r] ?? []).includes(t.via) && !(lc.alwaysActions[r] ?? []).includes(t.via)) fail(`lifecycle: ${st}: ${t.via} is not offered to the ${r} in that state (stateActions)`);
      }
    }
    for (const role of ["organizer", "host"]) for (const id of adapter.stateActions[st]?.[role] ?? []) if (byId[id]?.kind === "write" && !sm.transitions.some((t) => t.via === id && rolesOf(t.by).includes(role))) fail(`lifecycle: state ${st}: the ${role} may call the write action ${id} but the state machine does not say what it does`);
  }
  const decisionIds = new Set(Object.keys(lc.decisions));
  const usedDecision = new Set();
  const inventoryRoutes = new Set(inventory.exact);
  const routeExists = (r) => {
    const m = String(r).match(/^([A-Z]+) (\/\S+)$/); if (!m) return false;
    const act = m[2].match(/^\/api\/z\/\{id\}\/([a-z-]+)$/);
    if (act) return globals.action_list.includes(act[1]);
    return inventoryRoutes.has(r) || sources.worker.includes(`"${m[2]}"`);
  };
  const rowIds = new Set(); const rowsPerStage = {};
  for (const row of lc.matrix) {
    const where = `lifecycle row ${row.id}`;
    if (rowIds.has(row.id)) fail(`${where}: duplicate id`); rowIds.add(row.id);
    if (!lc.stages[row.lifecycle]?.some((x) => x.id === row.stage)) fail(`${where}: unknown stage ${row.lifecycle}/${row.stage}`);
    (rowsPerStage[row.lifecycle + "/" + row.stage] ??= []).push(row.id);
    if (!(row.status in lc.lifecycleStatuses)) fail(`${where}: unknown status ${row.status}`);
    if (row.status === "READY") {
      if (row.action) {
        const a = byId[row.action];
        if (!a) fail(`${where}: unknown action ${row.action}`);
        else for (const r of row.roles.filter((x) => x === "organizer" || x === "host")) { if (!a.roles.includes(r)) fail(`${where}: ${row.action} is not an action of the ${r}`); else if (row.action !== "check_key" && !offered(row.action, r)) fail(`${where}: ${row.action} is never offered to the ${r} in any state`); }
      } else if (!row.via) fail(`${where}: READY needs an action or a via`);
    } else if (row.action) fail(`${where}: only READY rows have an action`);
    if (row.status === "GAP") { if (!["gateway_only", "game_change"].includes(row.solve)) fail(`${where}: a GAP needs solve = gateway_only or game_change`); if (!row.decision) fail(`${where}: a GAP needs a decision id`); }
    if (row.decision) { if (!decisionIds.has(row.decision)) fail(`${where}: unknown decision ${row.decision}`); usedDecision.add(row.decision); }
    if (row.game_route && !routeExists(row.game_route)) fail(`${where}: the game has no route ${row.game_route} (the matrix says it has)`);
    if (row.verify) {
      const r = adapter.routes[row.verify.route];
      if (!r) fail(`${where}: verify names unknown route ${row.verify.route}`);
      else { const text = extractBlock(sources[r.file], r.start, { back: r.back ?? 0 }).text; for (const w of row.verify.contains) if (!text.includes(w)) fail(`${where}: the game's ${row.verify.route} route no longer mentions "${w}"`); }
    }
  }
  for (const [l, list] of Object.entries(lc.stages)) for (const sg of list) if (!rowsPerStage[l + "/" + sg.id]) fail(`lifecycle: stage ${l}/${sg.id} has no row in the matrix`);
  for (const a of actions) if (!lc.matrix.some((r) => r.action === a.id)) fail(`lifecycle: action ${a.id} is in no row of the coverage matrix`);
  for (const d of decisionIds) if (!usedDecision.has(d)) fail(`lifecycle: decision ${d} is used by no row`);
  const matrixSteps = new Set(lc.matrix.filter((r) => r.action).map((r) => `${r.lifecycle}|${r.stage}|${r.action}`));
  for (const pb of lc.lifecyclePlaybooks) for (const s of pb.steps) if (s.action && s.action !== "check_key" && !matrixSteps.has(`${pb.lifecycle}|${s.stage}|${s.action}`)) fail(`playbook ${pb.id} step ${s.n}: ${s.action} at stage ${s.stage} is not in the coverage matrix for that lifecycle and stage`);

  const faqStage = lc.lifecycleFaq.map((f) => { if (!lc.stages[f.lifecycle]?.some((x) => x.id === f.stage)) fail(`lifecycle FAQ "${f.q}": unknown stage ${f.lifecycle}/${f.stage}`); return { ...f, a: resolve(f.a, vars, `lifecycle faq "${f.q}"`) }; });
  for (const [l, list] of Object.entries(lc.stages)) for (const sg of list) if (!faqStage.some((f) => f.lifecycle === l && f.stage === sg.id)) fail(`lifecycle: stage ${l}/${sg.id} has no FAQ entry`);
  const matrixOut = lc.matrix.map((row) => ({ ...resolve(row, vars, `lifecycle row ${row.id}`), routes: row.action ? byId[row.action]?.game_calls.map((c) => `${c.method} ${c.path}`) ?? [] : row.game_route ? [row.game_route] : [] }));
  const count = (f) => matrixOut.filter(f).length;
  const lifecycleOut = {
    statuses: lc.lifecycleStatuses, stages: lc.stages, stage_of_state: lc.stageOfState, always_actions: lc.alwaysActions,
    state_machine: resolve(lc.stateMachine, vars, "lifecycle.state_machine"), matrix: matrixOut,
    decisions: Object.fromEntries([...usedDecision].sort((x, y) => Number(x.slice(1)) - Number(y.slice(1))).map((d) => [d, lc.decisions[d]])),
    summary: Object.fromEntries(Object.keys(lc.stages).map((l) => [l, Object.fromEntries(Object.keys(lc.lifecycleStatuses).map((st) => [st, count((r) => r.lifecycle === l && r.status === st)]))])),
    gap_summary: { gateway_only: matrixOut.filter((r) => r.status === "GAP" && r.solve === "gateway_only").map((r) => r.id), game_change: matrixOut.filter((r) => r.status === "GAP" && r.solve === "game_change").map((r) => r.id) },
    faq: faqStage, playbook_ids: lc.lifecyclePlaybooks.map((p) => p.id),
  };

  if (problems.length) throw Object.assign(new Error("GENERATION FAILED:\n - " + problems.join("\n - ")), { problems });

  // ---------------------------------------------------------------- common (cross-game) action list
  const common = {};
  for (const a of actions) { (common[a.common] ??= { common: a.common, support: "api", actions: [] }).actions.push(a.id); }
  for (const [k, v] of Object.entries(notes)) common[k] = { common: k, support: v.support, note: resolve(v.note, vars, `commonNotes.${k}`) , actions: [] };

  const game = {
    id: gid, title: adapter.title, readiness: adapter.readiness,
    credentials: adapter.credentials, states: adapter.states, status_map: adapter.statusMap, state_actions: adapter.stateActions,
    routes, actions, common_actions: Object.values(common).sort((a, b) => a.common.localeCompare(b.common)),
    do_not: [...content.doNot], do_not_by_state: content.doNotByState,
    game_rules: { ...globals, inventory: classified, status_strings: statuses, constants: { max_invites_per_person: facts.max_invites_per_person, max_rounds: facts.max_rounds, demo_cap: facts.demo_cap, max_drafts: facts.max_drafts, draft_days: facts.draft_days, max_ahead_days: facts.max_ahead_days, paylink_ttl_days: facts.paylink_ttl_days, free_cap: facts.free_cap, grace_rounds: facts.grace_rounds, cohost_limit_default: facts.cohost_limit_default, pause_max_participants: facts.pause_max_participants, gst_on: facts.gst_on, payer_roles: facts.payer_roles }, packs, prize_houses: facts.prize_houses, invite_categories: facts.invite_categories },
    facts: facts.facts.map((f) => ({ ...f, say: plain(f.say) })), fact_rules: facts.fact_rules, fact_conflicts: detected.map((c) => ({ ...c, decision: content.knownFactConflicts.find((k) => key(k) === key(c)).decision })),
    playbooks, faq, lifecycle: lifecycleOut,
  };
  return { schema_version: 1, generator_version: GENERATOR_VERSION, api_base: "/api/ai/v1", limits, do_not_global: doNotGlobal, hand_over_rule: handOverRule, error_catalog: errorCatalog, envelope_fields: envelopeFields, games: { [gid]: game } };
}

export { inr, normalize };
