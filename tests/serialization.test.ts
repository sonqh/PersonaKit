// Covers: REQ-PER-004
import { test } from "node:test";
import assert from "node:assert/strict";
import { stringifyCanonical } from "../src/core/canonical.ts";
import { createUlidFactory, isUlid } from "../src/core/ulid.ts";

test("SCN-PER-004-1 the same value gives the same bytes", () => {
  const a = stringifyCanonical({ b: 1, a: { d: 2, c: [3, { f: 1, e: 2 }] } });
  assert.equal(a, '{\n  "a": {\n    "c": [\n      3,\n      {\n        "e": 2,\n        "f": 1\n      }\n    ],\n    "d": 2\n  },\n  "b": 1\n}\n');
  assert.equal(stringifyCanonical({ a: 1, b: 2 }), stringifyCanonical({ b: 2, a: 1 }));
});

test("SCN-PER-004-2 IDs stay in order within one millisecond", () => {
  const next = createUlidFactory(() => 1_700_000_000_000);
  const ids = Array.from({ length: 1000 }, () => next());
  assert.ok(ids.every(isUlid));
  assert.deepEqual([...ids].sort(), ids);
  assert.equal(new Set(ids).size, ids.length);
});
