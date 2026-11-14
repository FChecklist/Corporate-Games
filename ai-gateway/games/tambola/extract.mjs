// Static reader of the Corporate Tambola source (read only). Pure Node, no game runtime needed.
// It finds the exact handler of every game route the gateway uses, boils it down to a fingerprint plus readable facts
// (who may call it, which status codes and error sentences it can answer, which body fields it reads), and pulls out the
// game-wide rules (the list of routes, what a Host may do through an AI link, limits, the "an AI may never" pattern).
// If the game renames or removes a route the gateway uses, the block is "not found" and generation fails loudly: that is the point.
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";

export const SOURCE_FILES = {
  worker: "apps/edge/src/worker.ts",
  pay: "apps/edge/src/pay.ts",
  paylink: "apps/edge/src/paylink.ts",
  audit: "apps/edge/src/audit.ts",
  cancel: "apps/edge/src/cancel.ts",
  winners: "apps/edge/src/winners.ts",
  lifecycle: "apps/edge/src/lifecycle.ts",
};

export function gameRoot(env = process.env, here = import.meta.dirname) {
  return resolve(env.CT_GAME_TAMBOLA ?? resolve(here, "../../../tambola"));
}

export function loadSources(root) {
  const out = {};
  for (const [k, rel] of Object.entries(SOURCE_FILES)) {
    const p = join(root, rel);
    if (!existsSync(p)) throw new Error(`Game source missing: ${p}. Set CT_GAME_TAMBOLA to the Corporate Tambola checkout.`);
    out[k] = readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  }
  return out;
}

export const sha16 = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

const indentOf = (l) => l.length - l.trimStart().length;

/** Finds the one line containing `start` and returns the code block that begins there (see the rule in the comment below). */
export function extractBlock(src, start, { back = 0 } = {}) {
  const lines = src.split("\n");
  const hits = lines.map((l, i) => (l.includes(start) ? i : -1)).filter((i) => i >= 0);
  if (hits.length === 0) throw new Error(`BLOCK NOT FOUND: ${start}`);
  if (hits.length > 1) throw new Error(`BLOCK NOT UNIQUE (${hits.length} lines): ${start}`);
  const first = hits[0] - back;
  const base = indentOf(lines[first]);
  const out = [lines[first]];
  // A handler is one statement at its own indent. It ends before the next line at the same or a smaller indent,
  // except a closing brace/paren line, which belongs to it.
  for (let i = first + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === "") { out.push(l); continue; }
    const ind = indentOf(l);
    if (ind > base) { out.push(l); continue; }
    if (ind === base && /^[}\])]/.test(l.trim())) { out.push(l); continue; }
    break;
  }
  return { text: out.join("\n"), line: first + 1, lines: out.length };
}

/** Whitespace and comments do not matter; everything else does. */
export function normalize(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/(^|\s)\/\/\s.*$/, "$1").replace(/\/\*[\s\S]*?\*\//g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/[ \t]+/g, " ");
}

export function blockFacts(text) {
  const t = normalize(text);
  const uniq = (a) => [...new Set(a)];
  const auth = uniq([
    ...[...t.matchAll(/\bcan\(a, e(, true)?\)/g)].map((m) => (m[1] ? "can(person: organizer or console Host, never an AI key)" : "can(team: organizer, AI key, console Host)")),
    ...[...t.matchAll(/\bcanAi\(/g)].map(() => "canAi"),
    ...[...t.matchAll(/\bmayPay\(/g)].map(() => "mayPay(organizer, Host, Co-host of the game)"),
    ...[...t.matchAll(/a\.kind ?(===|!==|!=) ?"(\w+)"/g)].map((m) => `kind ${m[1] === "===" ? "is" : "is not"} ${m[2]}`),
    ...[...t.matchAll(/\ba\.plat\b/g)].map(() => "platform key"),
    ...[...t.matchAll(/!a\.org/g)].map(() => "needs a signed-in account"),
    ...[...t.matchAll(/return deny\(a\)/g)].map(() => "deny(a)"),
  ]).sort();
  const statuses = uniq([...t.matchAll(/(?:json\(|\}, ?)(\d{3})\)/g)].map((m) => Number(m[1]))).sort((a, b) => a - b);
  const errors = uniq([...t.matchAll(/error: ?"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1])).sort();
  const fields = uniq([...t.matchAll(/\b(?:b|pb|body|bb)\??\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1])).sort();
  const codes = uniq([...t.matchAll(/code: ?"([a-z0-9-]+)"/g)].map((m) => m[1])).sort();
  return { auth, statuses, errors, codes, body_fields: fields };
}

export function fingerprintRoute(src, spec) {
  const b = extractBlock(src, spec.start, { back: spec.back ?? 0 });
  const norm = normalize(b.text);
  return { fingerprint: sha16(norm), lines: b.lines, ...blockFacts(b.text) };
}

const must = (m, what) => { if (!m) throw new Error(`GAME FACT NOT FOUND: ${what}`); return m; };

export function extractGlobals(S) {
  const w = S.worker;
  const actionList = must(w.match(/const m = p\.match\(\/\^\\\/api\\\/z\\\/\(\[A-Za-z0-9_-\]\{4,40\}\)\\\/\(([^)]*)\)\$\/\);/), "engagement action list")[1].split("|");
  const hostActions = must(w.match(/const HOST_ACTIONS = new Set\(\[([^\]]*)\]\)/), "HOST_ACTIONS")[1].split(",").map((s) => s.trim().replace(/"/g, ""));
  const maxHosts = Number(must(w.match(/const MAX_HOSTS = (\d+)/), "MAX_HOSTS")[1]);
  const gaps = JSON.parse(must(w.match(/const GAPS = (\[[^\]]*\])/), "GAPS")[1]);
  const idRegex = must(w.match(/const ID = (\/[^;]+\/);/), "ID regex")[1];
  const brandBody = must(w.match(/const BRAND_BODY_MAX = ([\d_]+)/), "BRAND_BODY_MAX")[1];
  const aiForbidden = must(S.audit.match(/const AI_FORBIDDEN = (\/.+\/);/), "AI_FORBIDDEN")[1];
  const gapMsg = must(w.match(/const GAP_MSG = "([^"]*)"/), "GAP_MSG")[1];
  // the one gate that narrows a Host who arrives through an AI link
  const linkGate = must(w.split("\n").find((l) => l.includes('req.headers.get("x-ct-link") === "1" && !HOST_ACTIONS.has(action!)')), "Host link gate");
  // the deny sentences a caller can see
  const denyLine = must(w.split("\n").find((l) => l.startsWith("const deny = (a: Auth)")), "deny()");
  const denyTexts = [...denyLine.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).filter((s) => s.length > 20);
  return {
    action_list: actionList,
    host_actions: hostActions,
    max_hosts: maxHosts,
    call_gaps_seconds: gaps,
    game_id_regex: idRegex,
    brand_body_max: Number(brandBody.replace(/_/g, "")),
    ai_forbidden_regex: aiForbidden,
    gap_message: gapMsg,
    host_link_gate_fingerprint: sha16(normalize(linkGate)),
    deny_texts: denyTexts,
  };
}

export function statusStrings(summaryBlockText) {
  return [...new Set([...summaryBlockText.matchAll(/"((?:draft|published|cancelled|did not start)[^"]*)"/g)].map((m) => m[1]))].sort();
}

/** Every route the game's code defines: exact "METHOD path" pairs, and the regex-matched route patterns (written with / not \/). */
export function extractRouteInventory(S) {
  const exact = new Set(), patterns = new Set();
  const BS = String.fromCharCode(92);
  const MARK = "p.match(/^" + BS + "/api";
  for (const file of ["worker", "pay"]) {
    for (const line of S[file].split("\n")) {
      const m = line.match(/req\.method === "(GET|POST|PATCH|PUT|DELETE)"/);
      if (m) for (const p of line.matchAll(/\bp === "(\/api\/[^"]*)"/g)) exact.add(`${m[1]} ${p[1]}`);
      let at = line.indexOf(MARK);
      while (at >= 0) {
        const start = at + "p.match(".length, end = line.indexOf("$/", start);
        if (end > 0) patterns.add(line.slice(start, end + 2).split(BS + "/").join("/"));
        at = line.indexOf(MARK, end > 0 ? end : start + 1);
      }
    }
  }
  return { exact: [...exact].sort(), patterns: [...patterns].sort() };
}

/** A route pattern such as /^/api/z/([A-Za-z0-9_-]{4,40})/paylink$/ becomes /api/z/{id}/paylink ; any other group becomes {x}. */
export function canonicalPattern(p) {
  const s = p.slice(2, p.endsWith("$/") ? -2 : -1); // drop the leading /^ and the trailing $/
  let out = "", depth = 0, group = "";
  for (const ch of s) {
    if (ch === "(") { depth++; if (depth === 1) { group = ""; continue; } }
    if (ch === ")") { depth--; if (depth === 0) { out += group.startsWith("[A-Za-z0-9_-]{") ? "{id}" : "{x}"; continue; } }
    if (depth > 0) group += ch; else out += ch;
  }
  return out.split("?").join("").split("{x}{x}").join("{x}");
}

