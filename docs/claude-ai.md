# Use PersonaKit with claude.ai

claude.ai on the web cannot run commands on your computer. There you move data between claude.ai and PersonaKit by hand. The steps below show how.

## Connect Claude Desktop directly

The Claude Desktop app can start PersonaKit as a local MCP server. Then you do not need the manual steps.

1. Find the path to `node` with `which node`.
2. Open the Claude Desktop settings, then Developer, then Edit Config. This opens `claude_desktop_config.json`.
3. Add the `personakit` server. Use the full path to `node` and to `bin/personakit.mjs` in your clone:

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

4. Restart Claude Desktop. Ask Claude to read your PersonaKit brief.
5. When Claude proposes a record, run `personakit review` in your own terminal. Claude cannot accept records.

The tools return the same data as the CLI. Private records stay redacted.

## Give claude.ai your brief

1. Run `personakit brief > brief.md`.
2. Add `brief.md` to the knowledge of a claude.ai project.
3. Run the two steps again after you accept new records. The copy in claude.ai does not update itself.

## Get proposals from claude.ai

1. Paste the prompt below into a claude.ai chat, after you talk about the facts you want to keep.
2. Save the reply as `proposals.jsonl`. Keep only the JSON lines.
3. Run `personakit propose --from proposals.jsonl --actor claude-ai`.
4. Run `personakit review` and accept or reject each proposal.

If one line is not valid, PersonaKit proposes nothing and names the line. Fix the line and run the command again.

## Write a CV with claude.ai

1. Run `personakit cv draft --out cv.md`.
2. Paste the content of `cv.md` into a claude.ai chat with the CV prompt below.
3. Save the reply as `cv.md`. Keep the `[pk:...]` markers.
4. Run `personakit cv check cv.md`. Fix each line that it names.
5. Read the text. Then run `personakit cv strip cv.md --out cv-final.md`.

For your name, contact details, or a link, add a line that ends with `[pk:self]`. The check lists these lines so you can review them.

## CV prompt for claude.ai

```text
Rewrite this CV draft so that it reads well for a reader who hires.
Rules:
- Keep the [pk:...] marker at the end of each line that uses that record.
- If a line uses two records, end it with [pk:ID1,ID2].
- Do not add a fact, number, date, title, or organization that is not in the cited line.
- Do not make my role larger. Keep words such as "contributed" or "supported".
- Keep the section headings. Do not add [pk:self].
- Output only the CV text.
```

## Prompt for claude.ai

```text
Write the facts about me from this conversation as PersonaKit proposals.
Output JSON Lines only: one JSON object on each line, with no other text.
Each object has these fields:
- "kind": one of "identity", "experience", "capability", "preference", "intent"
- "statement": one fact in one sentence, in my words where possible
- "user_stated": true if I said it, false if you inferred it
- "sources": [{"kind": "chat", "label": "claude.ai"}]
- "visibility": "ai" only if I said assistants may use it, else "private"
Optional "facets" object: "organization", "role", "location", "level",
"period" {"start": "YYYY-MM", "end": "YYYY-MM"} or {"start": "YYYY-MM", "ongoing": true},
"issued_on", "expires_on" (YYYY-MM-DD), "tags" (list of words).
Do not include health, religion, politics, sexual orientation, ethnicity,
immigration status, or finances unless I stated them and asked you to keep them.
```
