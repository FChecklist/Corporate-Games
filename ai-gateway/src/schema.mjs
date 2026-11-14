// A small, strict JSON-Schema checker (the subset the registry uses). No dependencies: runs in Node and in a Cloudflare Worker.
// Strict by design: an unknown field is an error, so a field for personal data can never be sent by accident.

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Returns a list of problems: [{ field, problem, expected? }]. Empty list = valid. */
export function validate(schema, value, path = "") {
  const problems = [];
  const at = path || "(body)";
  const bad = (problem, expected) => problems.push({ field: at, problem, ...(expected !== undefined ? { expected } : {}) });
  if (schema.enum && !schema.enum.some((e) => e === value)) { bad("not one of the allowed values", schema.enum); return problems; }
  switch (schema.type) {
    case "string": {
      if (typeof value !== "string") { bad("must be text", "string"); return problems; }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) bad(`too long (at most ${schema.maxLength} characters)`);
      if (schema.minLength !== undefined && value.length < schema.minLength) bad(`too short (at least ${schema.minLength} characters)`);
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) bad("wrong format", schema.pattern);
      if (schema.format === "date-time") {
        const ok = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(value) && !Number.isNaN(Date.parse(value));
        if (!ok) bad("must be a date and time WITH a time zone", "2026-12-05T16:00:00+05:30");
      }
      break;
    }
    case "integer":
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value) || (schema.type === "integer" && !Number.isInteger(value))) { bad(`must be a ${schema.type === "integer" ? "whole number" : "number"}`, schema.type); return problems; }
      if (schema.minimum !== undefined && value < schema.minimum) bad(`must be at least ${schema.minimum}`);
      if (schema.maximum !== undefined && value > schema.maximum) bad(`must be at most ${schema.maximum}`);
      break;
    }
    case "boolean":
      if (typeof value !== "boolean") bad("must be true or false", "boolean");
      break;
    case "array": {
      if (!Array.isArray(value)) { bad("must be a list", "array"); return problems; }
      if (schema.maxItems !== undefined && value.length > schema.maxItems) bad(`too many items (at most ${schema.maxItems})`);
      if (schema.minItems !== undefined && value.length < schema.minItems) bad(`too few items (at least ${schema.minItems})`);
      if (schema.items) value.forEach((v, i) => problems.push(...validate(schema.items, v, `${path}[${i}]`)));
      break;
    }
    case "object": {
      if (!isObj(value)) { bad("must be an object", "object"); return problems; }
      const props = schema.properties ?? {};
      for (const k of Object.keys(value)) if (!(k in props)) problems.push({ field: path ? `${path}.${k}` : k, problem: "unknown field: it is not accepted (this API takes no other data)", expected: Object.keys(props) });
      for (const k of schema.required ?? []) if (!(k in value) || value[k] === undefined) problems.push({ field: path ? `${path}.${k}` : k, problem: "required", ...(props[k]?.ask ? { ask: props[k].ask } : {}) });
      for (const [k, v] of Object.entries(value)) if (k in props && v !== undefined) problems.push(...validate(props[k], v, path ? `${path}.${k}` : k));
      if (schema.atLeastOneOf && !schema.atLeastOneOf.some((k) => value[k] !== undefined)) problems.push({ field: at, problem: "give at least one of these", expected: schema.atLeastOneOf });
      break;
    }
    default:
      break;
  }
  return problems;
}

/** Query-string values arrive as text: turn them into the types the schema wants (only for flat inputs). */
export function coerceQuery(schema, query) {
  const out = {};
  for (const [k, v] of Object.entries(query)) {
    const t = schema.properties?.[k]?.type;
    if (t === "integer" || t === "number") out[k] = v === "" ? v : Number(v);
    else if (t === "boolean") out[k] = v === "true" ? true : v === "false" ? false : v;
    else out[k] = v;
  }
  return out;
}

/** Applies a "shape" (allow-list) to a value: keeps only listed fields. `true` keeps; "text" keeps and records the path as untrusted text. */
export function shape(spec, value, path, untrusted) {
  if (spec === true || spec === "text") {
    if (spec === "text") untrusted.add(path);
    return value;
  }
  if (Array.isArray(spec)) {
    if (!Array.isArray(value)) return undefined;
    return value.map((v) => shape(spec[0], v, path + "[]", untrusted));
  }
  if (isObj(spec)) {
    if (!isObj(value)) return undefined;
    const out = {};
    for (const [k, s] of Object.entries(spec)) {
      if (!(k in value)) continue;
      const v = shape(s, value[k], path ? `${path}.${k}` : k, untrusted);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return undefined;
}
