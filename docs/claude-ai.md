# Use PersonaKit with claude.ai

claude.ai cannot run commands on your computer. In M1 you move data between claude.ai and PersonaKit by hand.

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
