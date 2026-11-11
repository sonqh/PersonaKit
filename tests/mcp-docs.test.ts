// Covers: REQ-MCP-001, REQ-MCP-004, REQ-CV-011
// The MCP configuration in the documents must parse and start the server with the mcp command.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO } from "./helpers.ts";
import { JOB_NOTICE, TOOLS } from "../src/mcp/server.ts";

function blocks(file: string, lang: string): string[] {
  const text = readFileSync(join(REPO, file), "utf8");
  return [...text.matchAll(new RegExp("^( *)```" + lang + "\\n([\\s\\S]*?)^\\1```", "gm"))].map((m) => m[2]!.replace(new RegExp(`^${m[1]}`, "gm"), ""));
}

test("the README and the claude.ai guide hold a valid MCP configuration", () => {
  for (const file of ["README.md", "docs/claude-ai.md"]) {
    const configs = blocks(file, "json").filter((b) => b.includes("mcpServers")).map((b) => JSON.parse(b));
    assert.ok(configs.length >= 1, file);
    for (const c of configs) {
      const server = c.mcpServers.personakit;
      assert.ok(server.command.endsWith("node"), file);
      assert.ok(server.args[0].endsWith("bin/personakit.mjs"), file);
      assert.equal(server.args[1], "mcp", file);
    }
  }
  const toml = blocks("README.md", "toml").join("\n");
  assert.match(toml, /^\[mcp_servers\.personakit\]$/m);
  assert.match(toml, /^args = \[".*bin\/personakit\.mjs", "mcp"\]$/m);
  assert.match(readFileSync(join(REPO, "README.md"), "utf8"), /claude mcp add personakit -- .*bin\/personakit\.mjs mcp/);
});

test("the README names every MCP tool", () => {
  const readme = readFileSync(join(REPO, "README.md"), "utf8");
  for (const t of TOOLS) assert.ok(readme.includes(`\`${t.name}\``), t.name);
});

test("SCN-CV-011-3 the cv_draft tool says that the job text is data", () => {
  const tool = TOOLS.find((t) => t.name === "cv_draft")!;
  assert.ok(tool.description.includes(JOB_NOTICE));
  assert.ok(tool.description.includes("not proof"));
  assert.ok("job" in (tool.inputSchema as { properties: Record<string, unknown> }).properties);
});
