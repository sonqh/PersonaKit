// A small JSON Schema draft-04 checker for the JSON Resume 1.0.0 schema copy. Tests use it only.
// It fails closed: a keyword that it does not implement throws, so a new schema cannot pass by accident.

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type SchemaNode = Record<string, Json>;

const ANNOTATIONS = new Set(["$schema", "description", "title", "definitions"]);
const IMPLEMENTED = new Set(["type", "properties", "additionalProperties", "items", "additionalItems", "pattern", "format", "$ref"]);

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

function formatOk(format: string, v: string): boolean {
  switch (format) {
    case "date": return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
    case "uri": return /^[a-zA-Z][a-zA-Z0-9+.-]*:\S*$/.test(v);
    case "email": return /^[^\s@]+@[^\s@]+$/.test(v);
    default: throw new Error(`schema-check: format ${format} is not implemented`);
  }
}

export function checkSchema(root: SchemaNode, value: unknown): string[] {
  const errors: string[] = [];
  const resolveRef = (ref: string): SchemaNode => {
    const m = /^#\/definitions\/([^/]+)$/.exec(ref);
    const defs = root.definitions as Record<string, SchemaNode> | undefined;
    if (!m || !defs || !defs[m[1]!]) throw new Error(`schema-check: $ref ${ref} is not implemented`);
    return defs[m[1]!]!;
  };
  const walk = (schema: SchemaNode, v: unknown, path: string): void => {
    for (const key of Object.keys(schema)) {
      if (!ANNOTATIONS.has(key) && !IMPLEMENTED.has(key)) throw new Error(`schema-check: keyword ${key} is not implemented`);
    }
    if (typeof schema.$ref === "string") return walk(resolveRef(schema.$ref), v, path);
    const t = schema.type;
    if (t !== undefined) {
      const types = Array.isArray(t) ? t : [t];
      const actual = typeOf(v);
      if (!types.some((x) => x === actual || (x === "number" && actual === "integer"))) {
        errors.push(`${path} must be ${types.join(" or ")}`);
        return;
      }
    }
    if (typeof v === "string") {
      if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(v)) errors.push(`${path} does not match the pattern`);
      if (typeof schema.format === "string" && !formatOk(schema.format, v)) errors.push(`${path} is not a ${schema.format}`);
    }
    if (Array.isArray(v)) {
      if (Array.isArray(schema.items)) throw new Error("schema-check: tuple items are not implemented");
      if (schema.items && typeof schema.items === "object") v.forEach((x, i) => walk(schema.items as SchemaNode, x, `${path}/${i}`));
      // additionalItems has no effect when items is one schema (draft-04 section 5.3.1).
    }
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const props = (schema.properties ?? {}) as Record<string, SchemaNode>;
      for (const [k, x] of Object.entries(v)) {
        if (Object.hasOwn(props, k)) walk(props[k]!, x, `${path}/${k}`);
        else if (schema.additionalProperties === false) errors.push(`${path}/${k} is not allowed`);
        else if (schema.additionalProperties && typeof schema.additionalProperties === "object") walk(schema.additionalProperties as SchemaNode, x, `${path}/${k}`);
      }
    }
  };
  walk(root, value, "");
  return errors;
}
