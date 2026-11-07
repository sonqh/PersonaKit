// PersonaKit web app. Plain JavaScript, no build step, no framework.
// REQ-WEB-002 REQ-WEB-004 REQ-WEB-005 REQ-WEB-006 REQ-WEB-007 REQ-WEB-008 REQ-WEB-010
// REQ-ONB-001 REQ-ONB-003 REQ-ONB-005 REQ-ONB-006 REQ-ARC-003
// Record text goes into the page with textContent and form values only. Never as markup.

import {
  EXPORT_WARNING, START_TEXT, VISIBILITY_CHOICES, buildInterviewBatch, clearToken, emptyResultHint,
  errorMessage, exportAllowed, loadToken, parseFragment, printEnabled, saveToken, startScreen,
} from "./logic.js";

const KINDS = ["identity", "experience", "capability", "preference", "intent"];
const $ = (id) => document.getElementById(id);

/** Make an element. Text goes in with textContent only. */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "text") node.textContent = value;
    else if (key === "class") node.className = value;
    else if (key === "value") node.value = value;
    else if (key === "checked") node.checked = Boolean(value);
    else if (key === "disabled") node.disabled = Boolean(value);
    else node.setAttribute(key, value);
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

function say(text, isError = false) {
  const box = $("message");
  box.textContent = text || "";
  box.className = isError ? "error" : "";
}

// ---------- API ----------

async function api(method, path, body) {
  const headers = {};
  const token = loadToken();
  if (token) headers["X-PersonaKit-Token"] = token;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: "omit", cache: "no-store" });
  } catch {
    throw { network: true };
  }
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!res.ok) {
    const err = data && data.error ? data.error : {};
    throw { status: res.status, message: err.message, details: err.details, code: err.code, raw: text };
  }
  return { data, text };
}

function fail(err) {
  if (err && err.status === 401) clearToken();
  say(errorMessage(err), true);
}

// ---------- navigation ----------

const loaders = {};

function show(view) {
  for (const section of document.querySelectorAll(".view")) section.classList.toggle("active", section.id === `view-${view}`);
  for (const button of document.querySelectorAll("#nav button")) button.classList.toggle("current", button.dataset.view === view);
  if (loaders[view]) loaders[view]().catch(fail);
}

for (const button of document.querySelectorAll("[data-view]")) {
  button.addEventListener("click", () => { say(""); show(button.dataset.view); });
}

// ---------- start and interview ----------

$("start-text").textContent = START_TEXT;
let questions = [];

loaders.interview = async () => {
  if (questions.length === 0) {
    const res = await fetch("/questions.json", { cache: "no-store" });
    questions = await res.json();
  }
  const form = $("interview-form");
  form.replaceChildren();
  for (const q of questions) {
    const id = `q-${q.id}`;
    form.append(el("label", { for: id, text: q.text }), el("p", { class: "help", text: q.hint || "" }), el("textarea", { id, rows: "2", "data-question": q.id }));
  }
  const submit = el("button", { type: "submit", class: "primary", text: "Propose my answers" });
  form.append(el("p", {}, submit));
};

$("interview-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const answers = {};
  for (const area of $("interview-form").querySelectorAll("textarea")) answers[area.dataset.question] = area.value;
  const items = buildInterviewBatch(questions, answers);
  if (items.length === 0) return say("The interview has no answers. Write at least one answer.", true);
  try {
    const { data } = await api("POST", "/api/propose", { items });
    say(`Proposed ${data.proposed.length} records. Review them now.`);
    show("review");
  } catch (err) { fail(err); }
});

// ---------- paste ----------

let drafts = [];

function kindSelect(value) {
  const select = el("select", { "aria-label": "Kind" });
  for (const kind of KINDS) select.append(el("option", { value: kind, text: kind }));
  select.value = value;
  return select;
}

function renderDrafts() {
  const box = $("paste-drafts");
  box.replaceChildren();
  if (drafts.length === 0) return;
  drafts.forEach((draft, i) => {
    const area = el("textarea", { rows: "2", value: draft.statement, "aria-label": `Draft ${i + 1}` });
    area.addEventListener("input", () => { draft.statement = area.value; });
    const select = kindSelect(draft.kind);
    select.addEventListener("change", () => { draft.kind = select.value; });
    const remove = el("button", { type: "button", text: "Remove" });
    remove.addEventListener("click", () => { drafts.splice(i, 1); renderDrafts(); });
    const card = el("div", { class: "card" }, el("div", { class: "row" }, el("strong", { text: `Draft ${i + 1}` }), select, remove), area);
    for (const p of draft.problems || []) card.append(el("p", { class: "problem", text: p }));
    box.append(card);
  });
  const propose = el("button", { type: "button", class: "primary", text: `Propose ${drafts.length} drafts` });
  propose.addEventListener("click", async () => {
    try {
      const items = drafts.map((d) => ({ kind: d.kind, statement: d.statement, source: "cv" }));
      const { data } = await api("POST", "/api/propose", { items });
      drafts = [];
      $("paste-text").value = "";
      renderDrafts();
      say(`Proposed ${data.proposed.length} records. Review them now.`);
      show("review");
    } catch (err) { fail(err); }
  });
  box.append(el("p", {}, propose));
}

$("paste-split").addEventListener("click", async () => {
  try {
    const { data } = await api("POST", "/api/split", { text: $("paste-text").value });
    drafts = data.drafts;
    say(drafts.length ? `Made ${drafts.length} drafts. Edit them, then propose them.` : "The text gave no drafts.");
    renderDrafts();
  } catch (err) { fail(err); }
});

// ---------- records ----------

let editing;

function renderRecordForm() {
  const form = $("record-form");
  form.replaceChildren();
  const statement = el("textarea", { id: "rf-statement", rows: "3", value: editing ? editing.statement : "" });
  const kind = kindSelect(editing ? editing.kind : "experience");
  kind.id = "rf-kind";
  kind.disabled = Boolean(editing);
  form.append(
    el("h3", { text: editing ? `Edit record ${editing.id}` : "Add a record" }),
    el("label", { for: "rf-kind", text: "Kind" }), kind,
    el("label", { for: "rf-statement", text: "Statement" }), statement,
  );
  const save = el("button", { type: "submit", class: "primary", text: editing ? "Save the edit" : "Propose" });
  const row = el("p", {}, save);
  if (editing) {
    const cancel = el("button", { type: "button", text: "Cancel" });
    cancel.addEventListener("click", () => { editing = undefined; renderRecordForm(); });
    row.append(" ", cancel);
    if (editing.state === "accepted") form.append(el("p", { class: "help", text: "An accepted record does not change. Your edit becomes a new proposal that replaces it after you accept it." }));
  }
  form.append(row);
}

$("record-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const statement = $("rf-statement").value;
  try {
    if (editing) {
      const { data } = await api("POST", "/api/update", { id: editing.id, revision: editing.revision, statement });
      say(data.outcome === "updated" ? "Saved the edit." : `The edit is in the new proposal ${data.id}. Review it.`);
    } else {
      await api("POST", "/api/propose", { items: [{ kind: $("rf-kind").value, statement, source: "manual" }] });
      say("Proposed the record. Review it to accept it.");
    }
    editing = undefined;
    await loaders.records();
  } catch (err) {
    if (err && err.status === 409 && err.details && err.details.id) {
      say(`The record changed after you opened it. Your edit is in the new proposal ${err.details.id}. Review it.`, true);
      editing = undefined;
      await loaders.records().catch(fail);
    } else fail(err);
  }
});

function recordCard(r) {
  const card = el("div", { class: "card" },
    el("p", { class: "meta", text: `${r.kind} | ${r.state} | ${r.visibility} | revision ${r.revision}` }),
    el("p", { text: r.statement }));
  return card;
}

loaders.records = async () => {
  renderRecordForm();
  const { data } = await api("GET", "/api/records");
  const list = $("record-list");
  list.replaceChildren();
  const active = data.records.filter((r) => r.state === "proposed" || r.state === "accepted");
  if (active.length === 0) list.append(el("p", { class: "hint", text: "No records yet. Use the interview, paste your CV, or add a record above." }));
  for (const r of active) {
    const card = recordCard(r);
    const edit = el("button", { type: "button", text: "Edit" });
    edit.addEventListener("click", () => { editing = r; renderRecordForm(); $("rf-statement").focus(); });
    card.append(edit);
    list.append(card);
  }
};

// ---------- review ----------

loaders.review = async () => {
  const { data } = await api("GET", "/api/records");
  const byId = new Map(data.records.map((r) => [r.id, r]));
  const pending = data.records.filter((r) => r.state === "proposed");
  const list = $("review-list");
  list.replaceChildren();
  if (pending.length === 0) {
    list.append(el("p", { class: "hint", text: "No proposals wait for review. Open Result to see your brief and CV." }));
    return;
  }
  for (const r of pending) {
    const card = recordCard(r);
    const sources = r.sources.map((s) => [s.kind, s.label].filter(Boolean).join(": ")).join(", ");
    card.append(el("p", { class: "meta", text: `Source: ${sources}. Written by ${r.provenance.actor}${r.provenance.user_stated ? ", stated by you" : ", not confirmed by you"}.` }));
    for (const id of r.possible_duplicate_of || []) {
      const other = byId.get(id);
      card.append(el("p", { class: "problem", text: `Possible duplicate of ${id}${other ? ` (${other.state}): ${other.statement}` : ""}` }));
    }
    for (const id of r.supersedes || []) {
      const old = byId.get(id);
      card.append(el("p", { class: "meta", text: `Replaces ${id}${old ? `: ${old.statement}` : ""}` }));
    }
    const fieldset = el("fieldset", {}, el("legend", { text: "Who may see it after you accept it?" }));
    for (const choice of VISIBILITY_CHOICES) {
      const id = `vis-${r.id}-${choice.value}`;
      const input = el("input", { type: "radio", class: "radio", name: `vis-${r.id}`, id, value: choice.value, checked: choice.default === true });
      fieldset.append(el("div", {}, input, el("label", { for: id, text: ` ${choice.label}`, class: "inline" }), el("span", { class: "help", text: ` ${choice.help}` })));
    }
    const accept = el("button", { type: "button", class: "primary", text: "Accept" });
    const reject = el("button", { type: "button", text: "Reject" });
    accept.addEventListener("click", async () => {
      const picked = fieldset.querySelector("input:checked");
      try {
        await api("POST", "/api/accept", { id: r.id, revision: r.revision, visibility: picked ? picked.value : "private" });
        say("Accepted.");
        await loaders.review();
      } catch (err) {
        if (err && err.status === 409) { say("The proposal changed after the page loaded. Review it again.", true); await loaders.review().catch(fail); } else fail(err);
      }
    });
    reject.addEventListener("click", async () => {
      try {
        await api("POST", "/api/reject", { id: r.id, revision: r.revision });
        say("Rejected.");
        await loaders.review();
      } catch (err) {
        if (err && err.status === 409) { say("The proposal changed after the page loaded. Review it again.", true); await loaders.review().catch(fail); } else fail(err);
      }
    });
    card.append(fieldset, el("p", {}, accept, " ", reject));
    list.append(card);
  }
};

// ---------- result and print ----------

let checked;

function updatePrintButton() {
  $("cv-print").disabled = !printEnabled($("result-cv").value, checked);
}

function renderFindings(check) {
  const list = $("cv-findings");
  list.replaceChildren();
  if (check.ok) list.append(el("li", { text: `No errors. ${check.cited_ids.length} records cited.` }));
  for (const f of check.findings) list.append(el("li", { class: f.level === "error" ? "problem" : "", text: `Line ${f.line}: ${f.level} ${f.code}: ${f.message}` }));
  if (check.owner_lines.length) list.append(el("li", { text: `Lines that you state yourself: ${check.owner_lines.join(", ")}.` }));
}

loaders.result = async () => {
  const { data } = await api("GET", "/api/result");
  $("result-brief").textContent = data.brief;
  $("result-cv").value = data.cv;
  $("result-hint").textContent = emptyResultHint(data) || "";
  checked = { text: data.cv, check: data.check };
  renderFindings(data.check);
  updatePrintButton();
};

$("result-cv").addEventListener("input", updatePrintButton);

$("cv-check").addEventListener("click", async () => {
  const text = $("result-cv").value;
  try {
    const { data } = await api("POST", "/api/cv/check", { text });
    checked = { text, check: data };
    renderFindings(data);
    updatePrintButton();
  } catch (err) { fail(err); }
});

$("cv-print").addEventListener("click", async () => {
  const text = $("result-cv").value;
  if (!printEnabled(text, checked)) return;
  try {
    const { data } = await api("POST", "/api/cv/strip", { text });
    $("print-text").textContent = data.text;
    window.print();
  } catch (err) { fail(err); }
});

// ---------- data and export ----------

loaders.data = async () => {
  const { data } = await api("GET", "/api/state");
  $("data-store").textContent = data.store;
};

let exportConfirmed = false;
$("export-start").addEventListener("click", () => {
  exportConfirmed = false;
  $("export-warning-text").textContent = EXPORT_WARNING;
  $("export-warning").hidden = false;
});
$("export-cancel").addEventListener("click", () => { exportConfirmed = false; $("export-warning").hidden = true; });
$("export-continue").addEventListener("click", async () => {
  exportConfirmed = true;
  $("export-warning").hidden = true;
  if (!exportAllowed(exportConfirmed)) return;
  try {
    const { text } = await api("GET", "/api/export");
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = el("a", { href: url, download: "personakit-export.json" });
    document.body.append(link);
    link.click();
    link.remove();
    // Some browsers start the download after the click handler returns. Revoke the URL later.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say("Saved the export. Keep the file private.");
  } catch (err) { fail(err); } finally { exportConfirmed = false; }
});

// ---------- start ----------

async function boot() {
  const fragment = parseFragment(location.hash);
  if (location.hash) history.replaceState(null, "", location.pathname);
  try {
    if (fragment.code) {
      const { data } = await api("POST", "/api/session", { code: fragment.code });
      saveToken(data.token);
    } else if (fragment.token) {
      saveToken(fragment.token);
    }
    if (!loadToken()) throw { status: 401 };
    const { data } = await api("GET", "/api/state");
    show(startScreen(data));
  } catch (err) {
    fail(err);
    show("start");
  }
}

boot();
