// Covers: REQ-ONB-007
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readdirSync } from "node:fs";
import { openStore, proposeBatch, readAll, type ProposeInput } from "../src/core/store.ts";
import { PersonaKitError } from "../src/core/errors.ts";
import { createUlidFactory } from "../src/core/ulid.ts";
import { tempStore } from "./helpers.ts";

const label = { actor: "web" as const };
const input = (statement: string, kind: ProposeInput["kind"] = "experience"): ProposeInput => ({
  kind, statement, sources: [{ kind: "manual" }], user_stated: true,
});

test("SCN-ONB-007-1 the batch keeps the input order", () => {
  const { store } = tempStore();
  const results = proposeBatch(store, [input("Ran a market stall."), input("Taught swimming."), input("Drove a delivery van.")], label);
  const ids = results.map((r) => r.record.id);
  assert.deepEqual([...ids].sort(), ids);
  assert.deepEqual(results.map((r) => r.record.statement), ["Ran a market stall.", "Taught swimming.", "Drove a delivery van."]);
  assert.equal(readAll(store).records.length, 3);
});

test("SCN-ONB-007-2 one input that is not valid stops the batch", () => {
  const { store, root } = tempStore();
  const bad = { ...input("Third."), kind: "hobby" as unknown as ProposeInput["kind"] };
  assert.throws(() => proposeBatch(store, [input("First."), input("Second."), bad], label), (err: unknown) => {
    assert.ok(err instanceof PersonaKitError);
    assert.equal(err.exitCode, 6);
    assert.match(err.message, /item 3/);
    return true;
  });
  assert.equal(readdirSync(join(root, "records")).length, 0);
  assert.equal(readdirSync(join(root, "events")).length, 0);
});

test("SCN-ONB-007-3 a write error lists the IDs written so far", () => {
  const { root, cwd } = tempStore();
  const real = createUlidFactory(() => Date.now());
  let calls = 0;
  // Each proposal takes two IDs (record and event). The fifth call is the third input.
  const store = openStore(root, { cwd, ulid: () => { calls += 1; if (calls === 5) throw new Error("disk full (synthetic)"); return real(); } });
  assert.throws(() => proposeBatch(store, [input("One."), input("Two."), input("Three.")], label), (err: unknown) => {
    assert.ok(err instanceof PersonaKitError);
    assert.equal(err.code, "unexpected");
    const written = err.details.written as string[];
    assert.equal(written.length, 2);
    assert.deepEqual([...written].sort(), readAll(store).records.map((r) => r.id).sort());
    return true;
  });
});

test("an empty batch is a usage error", () => {
  const { store } = tempStore();
  assert.throws(() => proposeBatch(store, [], label), /no records/);
});
