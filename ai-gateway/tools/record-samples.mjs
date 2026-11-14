// Records a real run of the scripted organizer and host (local in-memory game, TEST mode) as readable samples in samples/.
//   node tools/record-samples.mjs
// Keys and the payment link token are replaced by <organizer key>, <host key> and <payment link>.
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { startHarness, makeGateway, makeAccount, startAtIn, ROOT } from "../test/helpers.mjs";
import { ScriptedAgent } from "../test/agent.mjs";

const H = await startHarness();
try {
  const G = makeGateway(H.origin);
  const acct = await makeAccount(H);
  const steps = [];
  const mask = (s) => String(s).split(acct.orgKey).join("<organizer key>").split(acct.hostKey).join("<host key>").replace(/paylink\.html\?t=[0-9a-f]{48}/g, "paylink.html?t=<payment link token>").replace(/\bct[kahc]_[0-9a-f]{24,}/g, "<key>");
  const call = async (method, path, o = {}) => {
    const r = await G.call(method, path, o);
    const j = r.json ? { ...r.json } : null;
    if (j) { j.allowed_next_actions = (j.allowed_next_actions ?? []).map((a) => a.action); delete j.docs; }
    steps.push({ who: o.key === acct.hostKey ? "host" : "organizer", request: `${method} ${path}${o.query && Object.keys(o.query).length ? "?" + new URLSearchParams(o.query) : ""}`, headers: o.headers && Object.keys(o.headers).length ? o.headers : undefined, body: o.body, status: r.status, response: j ?? r.text.slice(0, 200) });
    return r;
  };
  const person = (answers) => ({ answers, ask: async (f, ask) => { throw new Error(`asked ${f}: ${ask}`); }, confirm: async (p) => p });
  const org = new ScriptedAgent({ call, key: acct.orgKey, name: "ChatGPT", person: person({ name: "Annual Day Game", start_at: startAtIn(3 * 3600_000), max_players: 100, calling_speed_seconds: 12, tickets: 1, rounds: 1, prizes: [{ house: "early5", place: 1, text: "Gift voucher worth Rs 500" }, { house: "full", place: 1, text: "Gift voucher worth Rs 1000" }], on: true, per_guest: 2, categories: ["colleagues"], text: "Welcome everyone. The game starts soon.", step: "start" }) });
  await org.runPlaybook("organizer_create_and_share_payment", { hooks: { 11: async (a) => { steps.push({ note: "A PERSON (for example finance) opens the payment link and pays on the game's payment page. The AI never does this." }); await H.h("pay", { url: a.results.create_payment_link.payment_link_url }); } } });
  const gameId = org.last.game_id;
  await H.h("join", { eid: gameId, count: 3 }); await H.h("clock", { advanceMs: 3 * 3600_000 + 10 * 60_000 + 120_000 });
  steps.push({ note: "Time passes: the paid game starts by itself. Three guests have joined on their phones." });
  const host = new ScriptedAgent({ call, key: acct.hostKey, name: "Gemini", person: person({ game_id: gameId, text: "The next round starts in 5 minutes.", step: "pause", given: true, round: 1, house: "early5", place: 1, ticket: 1 }) });
  await host.runPlaybook("host_runs_the_game", { answersByStep: { 2: { game_id: gameId } }, expect: { 8: "game_refused" } });
  const md = ["# Sample: a real run of the scripted assistant", "", "Recorded against a local, in-memory copy of Corporate Tambola in TEST mode. The assistant is a script (no paid AI model): it only follows `allowed_next_actions` and the served playbooks. Keys and the payment link token are masked. `allowed_next_actions` is shortened to the action names.", ""];
  let n = 0;
  for (const s of steps) {
    if (s.note) { md.push(`> ${s.note}`, ""); continue; }
    md.push(`### ${++n}. ${s.who}: \`${s.request}\` -> ${s.status}`, "");
    if (s.headers) md.push(`Headers: \`${mask(JSON.stringify(s.headers))}\``, "");
    if (s.body !== undefined) md.push("Body:", "```json", mask(JSON.stringify(s.body, null, 2)), "```", "");
    md.push("Answer:", "```json", mask(JSON.stringify(s.response, null, 2)).slice(0, 2600), "```", "");
  }
  mkdirSync(resolve(ROOT, "samples"), { recursive: true });
  writeFileSync(resolve(ROOT, "samples/organizer-and-host-run.md"), md.join("\n"));
  console.log(`Wrote samples/organizer-and-host-run.md (${n} calls)`);
} finally { H.stop(); setTimeout(() => process.exit(0), 300); }
