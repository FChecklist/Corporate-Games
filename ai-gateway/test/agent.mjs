// A SCRIPTED, DETERMINISTIC "AI agent" (no paid model, no network except the local gateway). It behaves like a careful assistant:
//  - it knows NO endpoint paths and NO field names of any game: it reads them from the gateway's own answers;
//  - it runs the playbook the gateway serves (GET .../playbooks) step by step;
//  - it only ever calls an address that an earlier answer offered to it (`allowed_next_actions`) or the documented entry points;
//  - every value it sends comes from a person's answer to the question the API itself supplied (`ask`).
// The "person" is the test: it answers questions, types confirmation sentences and does human things (pays) between steps.
import { API } from "./helpers.mjs";

export class Stuck extends Error {}

export class ScriptedAgent {
  constructor({ call, key, person, name = "ScriptAI" }) {
    this.call = call; this.key = key; this.person = person; this.name = name;
    this.offered = new Set([API, "/openapi.json", "/ai", "/llms.txt"]); // entry points a human gives the AI
    this.last = null; this.log = []; this.asked = []; this.said = []; this.memory = {}; this.results = {};
  }

  record(link, res, extra = {}) { this.log.push({ action: link.action, status: res.status, code: res.json?.error?.code ?? null, ...extra }); }

  absorb(res) {
    const j = res.json;
    if (!j) return;
    for (const a of j.allowed_next_actions ?? []) this.offered.add(a.endpoint);
    for (const g of j.games ?? []) this.offered.add(g.url);
    if (j.first_step?.endpoint) this.offered.add(j.first_step.endpoint);
    for (const k of ["actions", "faq", "playbooks"]) if (typeof j[k] === "string") this.offered.add(j[k]);
    if (j.say_to_organizer) this.said.push(j.say_to_organizer);
    if (j.state) this.last = j;
    if (j.ok && j.result && typeof j.result === "object") { this.results[j.action] = j.result; for (const [k, v] of Object.entries(j.result)) if (typeof v === "string" || typeof v === "number") this.memory[k] = v; }
  }

  async get(path) {
    if (!this.offered.has(path)) throw new Stuck(`agent refuses to call ${path}: no earlier answer offered it`);
    const res = await this.call("GET", path, { key: this.key, agent: this.name });
    this.absorb(res); return res;
  }

  /** Make a request from a link of `allowed_next_actions`, asking the person for every input the link needs. */
  async follow(link, { answers = {}, extra = {}, confirmWith = this.person.confirm } = {}) {
    if (!this.offered.has(link.endpoint)) throw new Stuck(`agent refuses to call ${link.endpoint}: not offered`);
    const input = {};
    for (const f of [...link.required_inputs, ...link.optional_inputs]) {
      const isReq = link.required_inputs.includes(f);
      if (answers[f.name] === null) continue; // the person decided to leave this optional field out
      let v = f.prefilled ?? (f.name === "game_id" ? this.last?.game_id : undefined) ?? answers[f.name] ?? this.person.answers?.[f.name] ?? (f.name === "payment_link_url" ? this.memory[f.name] : undefined);
      if (v === undefined && isReq) { this.asked.push({ field: f.name, ask: f.ask ?? null }); v = await this.person.ask(f.name, f.ask); }
      if (v !== undefined) input[f.name] = v;
    }
    Object.assign(input, extra);
    const headers = {};
    if (link.idempotency_key?.required) headers["idempotency-key"] = link.idempotency_key.suggested;
    const send = (body) => this.call(link.method, link.endpoint, { key: this.key, agent: this.name, headers, ...(link.method === "GET" ? { query: input } : { body }) });
    let res = await send(input);
    this.absorb(res);
    if (res.json?.error?.code === "confirmation_required") {
      const d = res.json.error.details;
      this.record(link, res, { asked_confirmation: true });
      this.asked.push({ field: "confirm", ask: d.confirm_phrase });
      const typed = await confirmWith(d.confirm_phrase);
      if (typed == null) { this.record(link, res, { person_declined: true }); return res; }
      res = await send({ ...input, confirm: { phrase: typed, token: d.confirmation_token } });
      this.absorb(res);
    }
    this.record(link, res);
    return res;
  }

  async ensureStarted() { if (!this.started) await this.start(); }

  /** One step of a served playbook: find the offered link (re-read the status once if time has passed), ask the person, call. */
  async runStep(s, { answers = {}, expect } = {}) {
    await this.ensureStarted();
    let link = (this.last?.allowed_next_actions ?? []).find((l) => l.action === s.action);
    if (!link) {
      const st = (this.last?.allowed_next_actions ?? []).find((l) => l.action === "game_status");
      if (st) { await this.follow(st); link = (this.last?.allowed_next_actions ?? []).find((l) => l.action === s.action); }
    }
    if (!link) throw new Stuck(`step ${s.n} (${s.action}) is not among allowed_next_actions in state '${this.last?.state}': ${(this.last?.allowed_next_actions ?? []).map((l) => l.action).join(", ")}`);
    const res = await this.follow(link, { answers: typeof answers === "function" ? answers(this) : answers });
    const code = res.json?.error?.code;
    if (code && expect !== code) throw new Stuck(`step ${s.n} (${s.action}) failed with ${code}: ${res.json.error.message}`);
    return res;
  }

  async start() {
    this.started = true;
    const root = await this.get(API); if (!root.json?.games?.length) throw new Stuck("no games offered");
    const g = await this.get(root.json.games[0].url);
    return g;
  }

  async playbook(id) {
    const res = await this.get(`${API}/${this.last?.game ?? "tambola"}/playbooks`);
    const pb = res.json.playbooks.find((p) => p.id === id);
    if (!pb) throw new Stuck("no playbook " + id);
    return pb;
  }

  /** Runs every step of a served playbook. `hooks[n]` = what a human does BEFORE step n; `skip` = optional steps the person declines; `expect[n]` = an error code the step is allowed to end with. */
  async runPlaybook(id, { hooks = {}, skip = new Set(), expect = {}, answersByStep = {} } = {}) {
    await this.start();
    const pb = await this.playbook(id);
    const done = [];
    for (const s of pb.steps) {
      if (hooks[s.n]) await hooks[s.n](this);
      if (!s.action || skip.has(s.n)) continue;
      const res = await this.runStep(s, { answers: answersByStep[s.n] ?? {}, expect: expect[s.n] });
      done.push({ n: s.n, action: s.action, ok: res.json?.ok, state: res.json?.state });
    }
    return done;
  }
}

/** A person has a game made and paid (done by the scripted organizer agent + the human step of paying). Returns { gameId, agent, payUrl }. */
export async function paidGame({ H, call, key, name = "Fixture Game", startInMs = 3 * 3600_000, startAtIn }) {
  const person = {
    answers: { name, start_at: startAtIn(startInMs), max_players: 100, calling_speed_seconds: 12, tickets: 1, rounds: 1,
      prizes: [{ house: "early5", place: 1, text: "Gift voucher worth Rs 500" }, { house: "full", place: 1, text: "Gift voucher worth Rs 1000" }],
      on: true, per_guest: 2, categories: ["colleagues"], text: "Welcome everyone.", step: "start" },
    ask: async (f, ask) => { throw new Error(`asked ${f}: ${ask}`); }, confirm: async (p) => p,
  };
  const agent = new ScriptedAgent({ call, key, person, name: "Fixture" });
  let payUrl;
  await agent.runPlaybook("organizer_create_and_share_payment", { hooks: { 11: async (a) => { payUrl = a.results.create_payment_link.payment_link_url; const r = await H.h("pay", { url: payUrl }); if (r.status !== 200) throw new Error("pay failed " + JSON.stringify(r)); } } });
  return { gameId: agent.last.game_id, agent, payUrl };
}

/**
 * Walks a served LIFECYCLE playbook (game, organizer or host): every step is done by the agent named in `by` (organizer or host),
 * or by a person / the system (a hook, keyed by the step's `key`). An agent only ever calls an address its own latest answer offered.
 * Returns one record per step: { n, stage, by, key, action, ok, state, game_id, code }.
 */
export async function runLifecycle(id, { agents, hooks = {}, answers = {}, expect = {}, skip = new Set() }) {
  const first = Object.values(agents)[0];
  await first.ensureStarted();
  const pb = await first.playbook(id);
  const done = [];
  for (const s of pb.steps) {
    const hook = hooks[s.key ?? ""] ?? hooks[s.n];
    if (hook) await hook(s, agents);
    if (skip.has(s.n)) continue;
    if (!s.action) { done.push({ n: s.n, stage: s.stage, by: s.by, key: s.key, action: null }); continue; }
    const agent = agents[s.by];
    if (!agent) throw new Stuck(`step ${s.n} needs the ${s.by}'s agent`);
    const res = await agent.runStep(s, { answers: answers[s.n] ?? {}, expect: expect[s.n] });
    done.push({ n: s.n, stage: s.stage, by: s.by, key: s.key, action: s.action, ok: res.json?.ok, state: res.json?.state, game_id: res.json?.game_id, code: res.json?.error?.code ?? null, result: res.json?.result });
  }
  return done;
}
