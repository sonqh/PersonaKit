# Set up PersonaKit on your computer

This guide takes you from a clone to a first accepted record. Do the steps in order. Each step tells you what to check before you continue.

The steps use your real data. Your records stay in `~/.personakit/`, outside this repository. Do not copy records, briefs, or exports into the repository, an issue, or a pull request.

## 1. Install the command

You need Node.js 22.18 or newer, and git.

1. Run `node --version`. Make sure that the version is 22.18 or newer.
2. Clone the repository and go into it:

   ```bash
   git clone https://github.com/sonqh/PersonaKit.git
   cd PersonaKit
   ```

3. Run `npm link`. This puts the `personakit` command on your path.
4. Run `personakit --help`. Make sure that the command list shows.

## 2. Create your store

1. Run `personakit init`. The command creates the store in `~/.personakit/`.
2. Run `personakit doctor`. Make sure that the last line is `No errors found.`

To use a different folder, set `PERSONAKIT_HOME` before `init`, or give `--store PATH` to each command. Do not put the store in a folder that syncs to a public place.

## 3. Install the agent skill

1. Run `personakit skill install`. The command copies the skill to `~/.claude/skills/` for Claude Code and to `~/.agents/skills/` for Codex.
2. To install for one agent only, add `--target claude` or `--target codex`.
3. Start a new agent session. The skill loads only in sessions that start after the install.

## 4. Connect the MCP server (optional)

The skill runs the CLI. The MCP server lets an AI app read the brief and propose records without the CLI. Claude Desktop needs the server. For Claude Code and Codex, the server is optional, because the skill is enough.

1. Run `which node`. Write down the full path.
2. Find the full path to `bin/personakit.mjs` in your clone.
3. Add the server to your AI app:
   - Claude Code: run `claude mcp add personakit -- NODE_PATH CLONE_PATH/bin/personakit.mjs mcp`.
   - Claude Desktop: follow [Use PersonaKit with claude.ai](claude-ai.md).
   - Codex: add the `[mcp_servers.personakit]` block from the [README](../README.md#connect-an-app-through-mcp) to `~/.codex/config.toml`.
4. Restart the AI app. Ask it to read your PersonaKit brief. The first brief is empty, because no record is accepted yet.

The server has no tool to accept, reject, retire, or change visibility. You do those steps in your own terminal.

## 5. Add your first records

1. Ask an agent to remember one fact about you. For example: "Remember that I prefer short answers with bullets."
2. Run `personakit list --state proposed`. Make sure that a proposal shows.
3. Run `personakit review` in your own terminal. For each proposal, type one letter:
   - `a`: accept with visibility `ai`. Agents can read the record in the brief.
   - `p`: accept with visibility `public`. The record can also go into a CV and a JSON Resume export.
   - `k`: accept with visibility `private`. Only you see the record.
   - `r`: reject the proposal.
   - `s`: skip the proposal for now. `q`: stop the review.
4. Run `personakit brief`. Make sure that the accepted `ai` and `public` records show.

You can also start from an existing CV:

- A Word file: `personakit import docx cv.docx`
- Plain text: `personakit import text cv.txt`
- A JSON Resume file: `personakit import json-resume resume.json`

Each import makes private proposals. Review them with `personakit review`.

If you prefer a browser, run `personakit serve --open`. The PersonaKit web app reads and writes the same store.

## 6. Make a backup

1. Run `personakit export --out ~/personakit-backup.json`. Use a path outside the clone, because the file holds your private records too.
2. Keep the file in a private place. Do not put it in this repository.
3. To restore it, use an empty store. Run `personakit import archive ~/personakit-backup.json --store NEW_FOLDER`. You can also set `PERSONAKIT_HOME` to the new folder.

To keep history or use two computers, make `~/.personakit/` a private git repository. Run `personakit doctor` after each merge.

## Update PersonaKit

1. In your clone, run `git pull`.
2. Run `personakit skill install` again. The installed skill does not update itself.
3. Run `personakit doctor`.

## If something fails

- The shell cannot find `personakit`: run `npm link` again in the clone. Check that the npm global `bin` folder is on your path.
- `review is interactive`: run `personakit review` in your own terminal, not through an agent.
- The AI app does not show PersonaKit tools: check the full paths in the MCP configuration. Desktop apps do not read your shell `PATH`.
- `doctor` reports errors: run `personakit doctor --fix`. If errors stay, open an issue with [the bug process](bug-reporting.md). Remove all personal data from the report.
