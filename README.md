# PersonaKit

PersonaKit helps people keep a personal profile they own. The same profile can produce an AI brief and a draft CV. People can review the facts and choose what each output may include.

The project is in early development. A CLI and a local web app work from a clone. There is no released package yet.

## First experience

1. Paste an existing CV or answer a short interview.
2. Review the extracted facts, skills, preferences, and goals.
3. Export an AI context pack and a CV draft from the accepted records.

The goal is that a person can use PersonaKit without knowing how to code. The CLI serves the owner and AI agents. The local web app serves people who do not use a terminal.

## Design rules

- Keep the data model useful across professions.
- Give each record a stable ID and record its source.
- Treat a user's statement as user-attested. Do not claim that an external party verified it.
- Ask the user to approve proposed facts before using them.
- Check disclosure permissions before preparing an export.
- Keep the data portable. A browser copy must not be the only copy.
- Keep AI model calls optional. Show people when data will leave their device.

## Design documents

- [Product and architecture](docs/architecture.md)
- [Delivery plan](docs/roadmap.md)
- [Specification workflow with spec-ctx](docs/spec-workflow.md)
- [Bug reports and learning loop](docs/bug-reporting.md)

## Use the web app

You need Node.js 22.18 or newer. Install it once:

1. Install Node.js 22.
2. Clone this repository and run `npm link` in it. This puts the `personakit` command on your path.

After this one-time install, you need no terminal:

- On macOS, double-click `scripts/personakit-web.command`.
- On Windows, double-click `scripts/personakit-web.bat`.

The launcher runs `personakit serve --open`. Your browser opens the app. Keep the launcher window open while you use the app. Close it to stop PersonaKit.

You can also run `personakit serve` yourself and open the URL that it prints. The app runs on this computer only, at an address that starts with `http://127.0.0.1`. It reads and writes the same store as the CLI, `~/.personakit/` by default.

In the app you can:

1. Answer a short interview, or paste the text of your CV. Each answer or draft becomes a proposal.
2. Review each proposal. Accept it as private, ai, or public, or reject it.
3. Open Result to see the AI brief and the CV draft. Check the CV, then print it.
4. Open Your data to see where the store is and to export a backup.

The app keeps no record data in browser storage. The browser keeps only the session key for one tab. Each start of `personakit serve` makes a new secret key, and the server answers no API call without it. The server also checks the Host and Origin headers, so other web pages cannot read your records. The token and the host checks are a safeguard, not a security boundary. Programs that run as your user can read the store files.

## Back up and move your records

- `personakit export --out FILE` writes every record and event to one file. The Export button in the app does the same. The file holds private records too. Keep it private.
- `personakit import archive FILE` restores an export into an empty store. Restore in the app comes in M3.
- `personakit import text FILE` turns the text of a CV into proposals, like the paste page of the app.

## Use it with Claude Code and Codex

You need Node.js 22.18 or newer.

1. Clone this repository and run `npm link` in it. This puts the `personakit` command on your path.
2. Run `personakit init`. This creates your store in `~/.personakit/`. Your data stays outside this repository.
3. Run `personakit skill install`. Claude Code and Codex can now use the `personakit` skill in any project.
4. Ask an agent to remember a fact about you. The agent proposes a record.
5. Run `personakit review` in your own terminal. Accept or reject each proposal. Choose `ai` visibility for facts that assistants may use.
6. Run `personakit brief`. Give the brief to any assistant.
7. For a CV, run `personakit cv draft --out cv.md`. Ask an agent to rewrite it and keep the `[pk:...]` markers. Run `personakit cv check cv.md`, read the text, then run `personakit cv strip cv.md`. Only records with visibility `public` enter a CV.

Agents can only propose. You decide what is accepted. This step protects against agent mistakes. It does not stop a program that has full access to your files.

claude.ai on the web cannot run commands. Move the brief and proposals by hand, or use Claude Desktop with the MCP server below. [Use PersonaKit with claude.ai](docs/claude-ai.md) has the steps and a prompt to paste.

After you update this repository, run `personakit skill install` again.

To back up your store or use it on two machines, make `~/.personakit/` a private git repository. Run `personakit doctor` after a merge.

## Connect an app through MCP

Claude Desktop, Claude Code, and Codex can start PersonaKit as a local MCP server. The app then reads the brief and proposes records directly, with no copy and paste. The server has the same rules as the CLI. It offers the tools `brief`, `propose`, `list`, `show`, `cv_draft`, and `cv_check`. It has no tool to accept, reject, retire, or change visibility. You still run `personakit review` in your own terminal.

Desktop apps can start without your shell `PATH`. So give the full path to `node` and to `bin/personakit.mjs` in your clone. Run `which node` to find the path to `node`.

For Claude Desktop, add this to `claude_desktop_config.json`. For Claude Code, put the same `mcpServers` object in `.mcp.json`, or run `claude mcp add personakit -- /usr/local/bin/node /path/to/PersonaKit/bin/personakit.mjs mcp`.

```json
{
  "mcpServers": {
    "personakit": {
      "command": "/usr/local/bin/node",
      "args": ["/path/to/PersonaKit/bin/personakit.mjs", "mcp"]
    }
  }
}
```

For Codex, add this to `~/.codex/config.toml`:

```toml
[mcp_servers.personakit]
command = "/usr/local/bin/node"
args = ["/path/to/PersonaKit/bin/personakit.mjs", "mcp"]
```

The server uses the store in `PERSONAKIT_HOME`, or `~/.personakit/`. To use another store, add `"--store", "/path/to/store"` after `"mcp"`. PersonaKit records the app name as the actor of each proposal. That name is a label, not proof of who wrote the record.

## JSON Resume

- `personakit export json-resume --out resume.json` writes a [JSON Resume](https://jsonresume.org) 1.0.0 file. It holds only accepted `public` records, as a CV draft does. It has no name or contact details. Add them in the file yourself.
- `personakit import json-resume resume.json` turns a JSON Resume file into proposals. Each proposal is `private` until you accept it in `personakit review`. The import skips contact details, references, awards, publications, and interests. If one field is not valid, PersonaKit proposes nothing and names the field.

## Current status

- M1: the record schema, the store, the CLI, the agent skill, the cited CV draft, and the CV fact checks.
- M2: the local web app, paste import, and the portable archive.
- M3: the MCP server and JSON Resume export and import.
- Not started: PDF and DOCX import, optional LLM extraction, role packs, and web restore. Each one needs an owner decision. The M0 user research is still open.

See the [M1 design](docs/m1-design.md) and the [delivery plan](docs/roadmap.md).

## Related tools

- [spec-ctx](https://github.com/sonqh/spec-ctx) provides stable requirement IDs, task context, verification evidence, and handoffs for OpenSpec work.
- [ste-humanize](https://github.com/sonqh/ste-humanize-skill) sets the writing rules for human-facing Markdown and agent instructions.

## Contributions

Use a GitHub issue to describe a bug or propose a change. Remove private personal data from examples and logs before you post them.

## License

PersonaKit uses the [MIT License](LICENSE).
