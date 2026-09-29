const $ = (id) => document.getElementById(id);
const state = { base: "", visit: null, bundle: null, host: "", mapping: {}, rec: null, phase: "idle", tick: null };

async function load() {
  const { base } = await chrome.storage.sync.get("base");
  state.base = base || "";
  $("base").value = state.base;
  $("open").href = state.base || "#";
  if (!state.base) return showSetup(true);
  showSetup(false);
  renderRec();
  await listVisits();
}

function showSetup(on) {
  $("setup").hidden = !on;
}

async function api(path) {
  const r = await fetch(`${state.base}/api${path}`, { credentials: "include" });
  if (r.status === 401) throw new Error("signin");
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Request failed (${r.status})`);
  return r.json();
}

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "onclick") e.addEventListener("click", v);
    else if (k === "class") e.className = v;
    else e.setAttribute(k, v);
  }
  for (const k of kids) e.append(k);
  return e;
}

async function listVisits() {
  const box = $("list");
  box.replaceChildren(el("p", { class: "muted" }, "Loading today's visits…"));
  $("detail").hidden = true;
  box.hidden = false;
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 86400000);
    const { encounters } = await api(`/encounters?from=${start.toISOString()}&to=${end.toISOString()}`);
    box.replaceChildren(el("p", { class: "muted" }, `${encounters.length} visits today`));
    for (const e of encounters) {
      const t = new Date(e.scheduledAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      box.append(el("div", { class: "visit", onclick: () => openVisit(e.id) }, el("b", {}, t), el("span", {}, e.patient ? e.patient.name : "Unassigned"), el("span", { class: "pill" }, e.status)));
    }
  } catch (err) {
    box.replaceChildren(el("div", { class: "card" }, el("p", {}, err.message === "signin" ? "Sign in to Chartside in a browser tab, then come back." : err.message), el("button", { onclick: listVisits }, "Retry")));
  }
}

function renderRec(error) {
  const box = $("rec");
  box.hidden = !state.base;
  const r = state.rec;
  if (state.phase === "idle") {
    box.replaceChildren(el("button", { class: "big", id: "rec-start", onclick: () => { state.phase = "consent"; renderRec(); } }, "Record visit"), el("p", { class: "muted" }, "Chartside listens beside your EHR and fills the note in when you're done."));
  } else if (state.phase === "consent") {
    box.replaceChildren(el("p", {}, el("b", {}, "Did your patient agree to be recorded?")), el("p", { class: "row" }, el("button", { class: "primary", id: "rec-yes", onclick: startRec }, "They agreed"), el("button", { id: "rec-no", onclick: () => { state.phase = "idle"; renderRec(); } }, "They declined")));
  } else if (state.phase === "recording" || state.phase === "paused") {
    box.replaceChildren(
      el("p", {}, state.phase === "recording" ? el("span", { class: "dot" }) : "", state.phase === "recording" ? "Recording" : "Paused"),
      el("div", { class: "timer", id: "rec-timer" }, fmt(r ? r.seconds() : 0)),
      el("p", { class: "row", style: "justify-content:center" },
        state.phase === "recording" ? el("button", { id: "rec-pause", onclick: () => r.pause() }, "Pause") : el("button", { id: "rec-resume", onclick: () => r.resume() }, "Resume"),
        el("button", { class: "primary", id: "rec-end", onclick: endRec }, "End visit")),
    );
  } else if (state.phase === "finishing") {
    box.replaceChildren(el("p", {}, "Writing your note…"), el("p", { class: "muted" }, "Usually under a minute."));
  } else if (state.phase === "failed") {
    box.replaceChildren(el("p", { class: "warn" }, error || "Something went wrong."), el("button", { onclick: () => { state.phase = "idle"; renderRec(); } }, "Start over"));
  }
}

function fmt(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

async function startRec() {
  const r = new globalThis.ChartsideRecorder(state.base, (st) => {
    state.phase = st.phase;
    if (st.phase === "failed") renderRec(st.error === "signin" ? "Sign in to Chartside in a browser tab, then record again." : st.error);
    else renderRec();
  });
  state.rec = r;
  try {
    await r.start();
  } catch (err) {
    state.phase = "idle";
    if (err && err.name === "NotAllowedError") {
      chrome.tabs.create({ url: chrome.runtime.getURL("permission.html") });
      renderRec();
      return;
    }
    state.phase = "failed";
    renderRec(err.message);
    return;
  }
  clearInterval(state.tick);
  state.tick = setInterval(() => {
    const t = $("rec-timer");
    if (t && state.rec) t.textContent = fmt(state.rec.seconds());
  }, 500);
}

async function endRec() {
  clearInterval(state.tick);
  try {
    const id = await state.rec.stop();
    state.phase = "idle";
    renderRec();
    await openVisit(id, true);
  } catch (err) {
    state.phase = "failed";
    renderRec(err.message === "signin" ? "Sign in to Chartside in a browser tab, then record again." : err.message);
  }
}

async function activeHost() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    return { tab, host: new URL(tab.url).host };
  } catch {
    return { tab, host: "" };
  }
}

function sectionText(s) {
  const xs = s.sentences.filter((x) => !x.pending);
  return s.format === "paragraph" ? xs.map((x) => x.text).join(" ") : xs.map((x) => `${x.indent ? "   - " : x.heading ? "" : "- "}${x.text}`).join("\n");
}

async function openVisit(id, fresh = false) {
  state.bundle = await api(`/encounters/${id}`);
  state.fresh = fresh;
  const { tab, host } = await activeHost();
  state.host = host;
  const stored = await chrome.storage.sync.get(`map:${host}`);
  state.mapping = stored[`map:${host}`] || {};
  render(tab);
}

function render(tab) {
  const b = state.bundle;
  const d = $("detail");
  $("list").hidden = true;
  d.hidden = false;
  const sections = (b.note?.content.sections || []).filter((s) => !s.key.startsWith("__") && s.sentences.length);
  const head = el("div", { class: "row" }, el("button", { onclick: listVisits }, "← Visits"), el("b", {}, b.patient ? b.patient.name : "Visit"), el("span", { class: "pill" }, b.encounter.status));
  const mappedCount = Object.keys(state.mapping).length;
  const pushAll = el("button", { class: "primary", id: "fill-ehr", onclick: () => push(tab, sections) }, state.fresh && mappedCount ? `Fill the EHR now (${mappedCount} fields)` : `Push to ${state.host || "page"}`);
  const review = el("a", { class: "muted", target: "_blank", href: `${state.base}/go/stack?focus=${encodeURIComponent(b.encounter.id)}` }, "Review and sign in Chartside");
  const status = el("p", { class: "muted", id: "push-status" }, Object.keys(state.mapping).length ? `${Object.keys(state.mapping).length} fields mapped for ${state.host}` : `No fields mapped for ${state.host} yet. Use "Pick field" on each section.`);
  const list = sections.map((s) => {
    const text = sectionText(s);
    const mapped = state.mapping[s.key];
    return el("div", { class: "card sec" },
      el("h3", {}, el("span", {}, s.title), mapped ? el("i", { class: "ok" }, "mapped") : el("i", { class: "muted" }, ""),
        el("button", { onclick: async () => { await navigator.clipboard.writeText(`${s.title}\n${text}`); } }, "Copy"),
        el("button", { onclick: () => teach(tab, s.key) }, "Pick field")),
      el("pre", {}, text));
  });
  d.replaceChildren(head, el("p", { class: "row" }, pushAll, review), status, ...list);
  if (!b.note) d.append(el("p", { class: "muted" }, "No note has been drafted for this visit yet."));
}

async function inject(tab) {
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["lib.js"] });
}

async function teach(tab, key) {
  await inject(tab);
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => globalThis.ChartsideExt.pick() });
  if (!result) return;
  state.mapping[key] = result;
  await chrome.storage.sync.set({ [`map:${state.host}`]: state.mapping });
  render(tab);
}

async function push(tab, sections) {
  await inject(tab);
  const payload = sections.map((s) => ({ key: s.key, title: s.title, text: sectionText(s) }));
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: (m, s) => globalThis.ChartsideExt.fill(m, s, "replace"), args: [state.mapping, payload] });
  const filled = result.filter((r) => r.status === "filled").length;
  const missing = result.filter((r) => r.status === "missing").length;
  $("push-status").textContent = `Filled ${filled} of ${result.length} sections${missing ? `; ${missing} mapped fields weren't found on this page` : ""}. Review in the EHR before signing there.`;
}

$("settings").addEventListener("click", () => showSetup($("setup").hidden));
$("save").addEventListener("click", async () => {
  const v = $("base").value.trim().replace(/\/$/, "");
  if (!/^https?:\/\//.test(v)) return;
  await chrome.storage.sync.set({ base: v });
  load();
});
load();
