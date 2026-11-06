// Worker for the lock test: update one proposed record many times from one process.
// Usage: node tests/workers/update-loop.ts <store> <record-id> <count> <actor>
import { getRecord, openStore, update } from "../../src/core/store.ts";
import type { Actor } from "../../src/core/schema.ts";

const [root, id, count, actor] = process.argv.slice(2) as [string, string, string, Actor];
const store = openStore(root, { cwd: "/" });
let inPlace = 0;
for (let i = 0; i < Number(count); i++) {
  const current = getRecord(store, id);
  const r = update(store, id, current.revision, { statement: `${actor} edit ${i}` }, { actor });
  if (r.outcome === "updated") inPlace++;
}
process.stdout.write(JSON.stringify({ inPlace }));
