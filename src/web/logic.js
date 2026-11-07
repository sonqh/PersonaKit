// Decisions of the web app, with no DOM access. node --test imports this module.
// REQ-WEB-002 REQ-WEB-004 REQ-WEB-007 REQ-WEB-009 REQ-ONB-001 REQ-ONB-006 REQ-ARC-003

/** The only browser storage key. Session storage holds the token and nothing else. */
export const TOKEN_KEY = "personakit.token";

/** Read the token or the one-time code from the URL fragment. */
export function parseFragment(hash) {
  const out = {};
  const text = typeof hash === "string" ? hash.replace(/^#/, "") : "";
  for (const part of text.split("&")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(value)) continue;
    if (key === "token") out.token = value;
    if (key === "code") out.code = value;
  }
  return out;
}

export function saveToken(token, storage = globalThis.sessionStorage) {
  if (storage && typeof token === "string") storage.setItem(TOKEN_KEY, token);
}

export function loadToken(storage = globalThis.sessionStorage) {
  return storage ? storage.getItem(TOKEN_KEY) ?? undefined : undefined;
}

export function clearToken(storage = globalThis.sessionStorage) {
  if (storage) storage.removeItem(TOKEN_KEY);
}

/** Interview answers become one proposal each. Empty answers are skipped. */
export function buildInterviewBatch(questions, answers) {
  const items = [];
  for (const q of questions) {
    const raw = answers[q.id];
    if (typeof raw !== "string") continue;
    const statement = raw.trim();
    if (statement === "") continue;
    items.push({ kind: q.kind, statement, source: "interview" });
  }
  return items;
}

/** The print view is on only when the checked text is the current text and that check had no error. */
export function printEnabled(currentText, checked) {
  return Boolean(checked && checked.check && checked.check.ok === true && checked.text === currentText);
}

export const EXPORT_WARNING = "The archive holds every record, private records too. Keep the file private. Do not upload it or share it.";

/** The download starts only after the owner selects Continue on the warning. */
export function exportAllowed(confirmed) {
  return confirmed === true;
}

export const START_TEXT = "Start with a short interview, or paste the text of your CV. PersonaKit turns your answers into proposals. No output uses a record before you review it.";

/** Pick the first screen from /api/state. */
export function startScreen(state) {
  if (!state || state.total === 0) return "start";
  if (state.counts && state.counts.proposed > 0) return "review";
  return "result";
}

/** Explain an empty brief or CV, and name the review page. */
export function emptyResultHint(result) {
  if (!result || !result.counts) return undefined;
  const { brief, cv } = result.counts;
  if (brief === 0 && cv === 0) return "The brief and the CV are empty. They use accepted records only. Open Review and accept records with the visibility ai or public.";
  if (brief === 0) return "The brief is empty. It uses accepted records with the visibility ai or public. Open Review to accept records.";
  if (cv === 0) return "The CV is empty. It uses accepted records with the visibility public only. Open Review to accept records as public.";
  return undefined;
}

export const VISIBILITY_CHOICES = [
  { value: "private", label: "Private", help: "Only you see it. It never goes into the AI brief or the CV.", default: true },
  { value: "ai", label: "AI", help: "Your AI assistants can see it in the brief. It never goes into the CV." },
  { value: "public", label: "Public", help: "It can go into the brief and into your CV." },
];

/** A clear message for a stopped server or a session that is not valid. */
export function errorMessage(err) {
  if (!err) return "Something went wrong.";
  if (err.network) return "PersonaKit stopped, or the connection failed. Start PersonaKit again, then open the new URL.";
  if (err.status === 401) return "This session is not valid. Open the URL that PersonaKit printed, or start PersonaKit again.";
  if (typeof err.message === "string" && err.message !== "") return err.message;
  return "Something went wrong.";
}
