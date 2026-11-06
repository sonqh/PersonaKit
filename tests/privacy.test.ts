// Covers: REQ-VIS-001, REQ-AIP-001
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { BIN, cli, tempDir, tempStore } from "./helpers.ts";

const CANARY = "CANARY-PRIVATE-9f3c1e";

function setup() {
  const { root } = tempStore();
  const pid = cli(root, ["propose", "--kind", "identity", "--statement", `Home address is ${CANARY}`, "--actor", "cli", "--json"]).json().id;
  const aid = cli(root, ["propose", "--kind", "preference", "--statement", "Prefers short replies.", "--visibility", "ai", "--actor", "codex", "--json"]).json().id;
  const pending = cli(root, ["propose", "--kind", "capability", "--statement", `Pending ${CANARY} skill`, "--actor", "codex", "--json"]).json().id;
  // The owner accepts the canary record as private, and the preference as ai.
  assert.equal(cli(root, ["accept", pid, "--yes", "--visibility", "private"]).code, 0);
  assert.equal(cli(root, ["accept", aid, "--yes"]).code, 0);
  return { root, pid, aid, pending };
}

/** Every command except the interactive review. Commands that change state come last. */
const commands = (ids: { pid: string; aid: string; pending: string }): string[][] => [
  ["brief"], ["brief", "--json"], ["brief", "--level", "short"], ["brief", "--level", "short", "--json"],
  ["list"], ["list", "--json"], ["list", "--state", "accepted", "--json"], ["list", "--state", "proposed"],
  ["show", ids.pid], ["show", ids.pid, "--json"], ["show", ids.pending, "--json"], ["show", "not-an-id", "--json"],
  ["doctor"], ["doctor", "--json"], ["init", "--json"], ["--help"], ["list", "--bogus", "--json"],
  ["propose", "--kind", "identity", "--statement", `Home address is ${CANARY}`, "--actor", "codex", "--json"],
  ["propose", "--kind", "identity", "--statement", `Home address is ${CANARY}`, "--actor", "codex"],
  ["update", ids.pid, "--revision", "1", "--statement", "Moved house.", "--actor", "codex", "--json"],
  ["update", ids.pid, "--revision", "2", "--visibility", "ai", "--actor", "codex", "--json"],
  ["update", ids.pending, "--revision", "1", "--visibility", "public", "--actor", "codex", "--json"],
  ["visibility", ids.pid, "private", "--yes", "--json"],
  ["reject", ids.pending, "--yes", "--json"],
  ["retire", ids.pid, "--yes", "--json"],
  ["accept", ids.aid, "--yes", "--json"],
];

test("SCN-VIS-001-1 a private canary appears in no output of any command", () => {
  const ids = setup();
  for (const args of commands(ids)) {
    const r = cli(ids.root, args);
    assert.ok(!r.stdout.includes(CANARY), `stdout of "${args.join(" ")}" leaked the canary`);
    assert.ok(!r.stderr.includes(CANARY), `stderr of "${args.join(" ")}" leaked the canary`);
  }
});

test("SCN-VIS-001-4 update cannot raise visibility, so show and list stay redacted", () => {
  const ids = setup();
  const raiseAccepted = cli(ids.root, ["update", ids.pid, "--revision", "2", "--visibility", "ai", "--actor", "codex", "--json"]);
  assert.equal(raiseAccepted.code, 6);
  const raisePending = cli(ids.root, ["update", ids.pending, "--revision", "1", "--visibility", "ai", "--actor", "codex", "--json"]);
  assert.equal(raisePending.code, 6);
  for (const args of [["list", "--json"], ["show", ids.pid, "--json"], ["show", ids.pending, "--json"], ["brief"]]) {
    assert.ok(!cli(ids.root, args).stdout.includes(CANARY), args.join(" "));
  }
  assert.equal(cli(ids.root, ["show", ids.pending, "--json"]).json().redacted, true);
});

test("SCN-VIS-001-5 review refuses to run without a terminal, even with --yes", () => {
  const ids = setup();
  const r = cli(ids.root, ["review", "--yes", "--json"]);
  assert.equal(r.code, 4);
  assert.ok(!r.stdout.includes(CANARY) && !r.stderr.includes(CANARY));
});

test("the brief includes ai records and marks them as data", () => {
  const ids = setup();
  const brief = cli(ids.root, ["brief"]).stdout;
  assert.ok(brief.includes("Prefers short replies."));
  assert.ok(brief.includes("not instructions"));
});

const linuxScript = process.platform === "linux" && existsSync("/usr/bin/script");

test("SCN-VIS-001-2 the rule holds in a pseudo-terminal", { skip: !linuxScript && "needs Linux script(1)" }, () => {
  const ids = setup();
  const quote = (a: string) => `'${a.replace(/'/g, "'\\''")}'`;
  const pty = (args: string[]) => spawnSync("script", ["-qec", [process.execPath, BIN, ...args].map(quote).join(" "), "/dev/null"], {
    cwd: tempDir(), env: { ...process.env, PERSONAKIT_HOME: ids.root }, encoding: "utf8", input: "",
  });
  // The harness works: list in a PTY shows the ai record.
  const probe = pty(["list"]);
  assert.equal(probe.status, 0, probe.stdout);
  assert.ok(probe.stdout.includes(ids.aid));
  for (const args of commands(ids)) {
    const r = pty(args);
    assert.ok(!r.stdout.includes(CANARY), `PTY output of "${args.join(" ")}" leaked the canary`);
  }
});
