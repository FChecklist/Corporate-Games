// RENDER the lifecycle parts (state machine, coverage matrix, FAQ per stage) from the registry. Used by the /ai page and by the generated blocks in docs/.
const md = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
const who = (x) => (Array.isArray(x) ? x.join(" or ") : x);
const tick = (x) => "`" + x + "`";

export function renderMatrixTable(g, lifecycle) {
  const rows = g.lifecycle.matrix.filter((r) => !lifecycle || r.lifecycle === lifecycle);
  const L = ["| Id | Stage | Step | Who | Game route(s) | Status | Gap: who solves it, decision |", "|---|---|---|---|---|---|---|"];
  for (const r of rows) {
    const route = r.routes.length ? r.routes.map((x) => tick(x)).join("<br>") : r.via ? r.via : "(none)";
    const gap = r.status === "GAP" ? `${r.solve === "gateway_only" ? "inside the gateway only" : "needs a game change"}, ${r.decision}` : r.decision ? r.decision : "";
    L.push(`| ${r.id} | ${r.stage} | ${md(r.step)} | ${r.roles.join(", ")} | ${md(route)} | ${r.status} | ${gap} |`);
  }
  return L;
}

export function renderStateMachine(g) {
  const L = ["| State | Stage | What can happen next (by whom, through what) |", "|---|---|---|"];
  for (const [st, sm] of Object.entries(g.lifecycle.state_machine)) {
    const next = sm.transitions.map((t) => `${who(t.by)}: ${t.via.replace(/^(human|system): /, "")} -> ${t.to}${t.new_game ? " (new game id)" : ""}`).join("; ");
    L.push(`| ${tick(st)}${sm.terminal ? " (final)" : ""} | ${g.lifecycle.stage_of_state[st]} | ${md(next)} |`);
  }
  return L;
}

export function renderLifecycle(g, { level = 3 } = {}) {
  const H = "#".repeat(level), lc = g.lifecycle, L = [];
  L.push(`${H} The lifecycles: game, organizer and Host`, "",
    `Three linked playbooks walk the whole life: ${tick("game_lifecycle")}, ${tick("organizer_lifecycle")} and ${tick("host_lifecycle")}. Machine-readable: ${tick("/api/ai/v1/" + g.id + "/lifecycle")}. Every answer also carries ${tick("lifecycle")} (the stage, whether the state is final, what may happen next).`, "");
  L.push(`${H}# Statuses used below`, "", ...Object.entries(lc.statuses).map(([k, v]) => `- **${k}**: ${v}`), "");
  L.push(`${H}# State machine`, "", ...renderStateMachine(g), "");
  for (const l of Object.keys(lc.stages)) {
    L.push(`${H}# Coverage matrix: ${l} lifecycle`, "", "Stages: " + lc.stages[l].map((s) => `${s.id} (${s.title})`).join(", ") + ".", "", ...renderMatrixTable(g, l), "");
  }
  L.push(`${H}# Questions at each stage`, "");
  for (const l of Object.keys(lc.stages)) for (const s of lc.stages[l]) {
    const q = lc.faq.filter((f) => f.lifecycle === l && f.stage === s.id);
    if (!q.length) continue;
    L.push(`**${l} lifecycle, ${s.title}**`, "");
    for (const f of q) L.push(`- (${f.role}) ${f.q} ${f.a}`);
    L.push("");
  }
  return L;
}

/** The block that goes into docs/GAME_READINESS.md. */
export function renderReadinessBlock(g) {
  const lc = g.lifecycle, L = [], keys = Object.keys(lc.statuses);
  L.push("## Lifecycle coverage matrix (Corporate Tambola)", "",
    "Stage x role x route x status, for the whole game, the organizer and the Host. Generated from the adapter and the game's code by `npm run generate`; do not edit by hand. Every route shown exists in the game; the gateway only calls routes that already exist.", "");
  L.push("| Lifecycle | " + keys.join(" | ") + " |", "|---|" + keys.map(() => "---").join("|") + "|");
  for (const [l, c] of Object.entries(lc.summary)) L.push(`| ${l} | ${keys.map((k) => c[k]).join(" | ")} |`);
  L.push("", `**Gaps that can be solved inside the gateway only (the game already has the route; the owner still decides):** ${lc.gap_summary.gateway_only.length ? lc.gap_summary.gateway_only.join(", ") + "." : "none left. The six that were open (G08, G50, G53, O04, O20, H05) were approved by the owner and are READY."}`, "",
    `**Gaps that need a change in the game's code (owner decision; the engine is frozen):** ${lc.gap_summary.game_change.join(", ")}.`, "");
  L.push(...Object.entries(lc.statuses).map(([k, v]) => `- **${k}**: ${v}`), "", "### State machine", "", ...renderStateMachine(g), "");
  for (const l of Object.keys(lc.stages)) L.push(`### Matrix: ${l} lifecycle`, "", ...renderMatrixTable(g, l), "");
  return L.join("\n");
}

/** The block that goes into docs/OWNER_DECISIONS_AND_RISKS.md. */
export function renderDecisionsBlock(g) {
  const lc = g.lifecycle, L = [];
  L.push("## Lifecycle decisions (generated from the coverage matrix)", "",
    "Kinds: **done** = made inside the gateway on a route the game already has (the owner may veto); **gateway_only** = the game already has the route, only the gateway changes (owner decision); **game_change** = needs a change in the game's code (owner decision, the engine is frozen); **existing** = decided or recorded earlier in this document.", "");
  L.push("| Id | Kind | Decision | Question for the owner | Matrix rows |", "|---|---|---|---|---|");
  for (const [id, d] of Object.entries(lc.decisions)) L.push(`| ${id} | ${d.kind} | ${md(d.title)} | ${md(d.question)} | ${lc.matrix.filter((r) => r.decision === id).map((r) => r.id).join(", ")} |`);
  return L.join("\n");
}
