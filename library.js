const state = { pages: [], query: "", colors: new Set() };
const $ = (id) => document.getElementById(id);

function el(tag, props = {}, children = []) {
  const n = Object.assign(document.createElement(tag), props);
  for (const c of [].concat(children)) if (c != null) n.append(c);
  return n;
}

// Wrap search matches in <mark> without using innerHTML on stored text.
function withMatches(text, query) {
  const frag = document.createDocumentFragment();
  if (!query) {
    frag.append(text);
    return frag;
  }
  const lower = text.toLowerCase();
  let i = 0;
  let j;
  while ((j = lower.indexOf(query, i)) !== -1) {
    frag.append(text.slice(i, j), el("mark", { className: "q", textContent: text.slice(j, j + query.length) }));
    i = j + query.length;
  }
  frag.append(text.slice(i));
  return frag;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const fmtDate = (t) =>
  new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function filtered() {
  const q = state.query;
  const out = [];
  for (const page of state.pages) {
    const pageHit = q && (page.title || "").toLowerCase().includes(q);
    const hs = page.highlights
      .filter((h) => !state.colors.size || state.colors.has(h.color))
      .filter((h) => !q || pageHit || h.exact.toLowerCase().includes(q) || (h.note || "").toLowerCase().includes(q))
      .sort((a, b) => a.pos - b.pos);
    if (hs.length) out.push({ ...page, highlights: hs });
  }
  return out;
}

async function editHighlight(url, id, fn) {
  const page = await getPage(url);
  if (!page) return;
  fn(page, page.highlights.find((h) => h.id === id));
  await savePage(page);
}

function renderHighlight(page, h) {
  const q = state.query;
  const quote = el("div", { className: "quote" }, withMatches(h.exact.replace(/\s+/g, " ").trim(), q));
  quote.style.setProperty("--c", MARGIN_COLORS[h.color]?.solid);
  const box = el("div", { className: "hl" }, quote);
  let noteEl = h.note ? el("div", { className: "note" }, withMatches(h.note, q)) : null;
  if (noteEl) box.append(noteEl);

  const editBtn = el("button", { className: "link", textContent: h.note ? "Edit note" : "Add note" });
  editBtn.addEventListener("click", () => {
    const ta = el("textarea", { value: h.note || "", placeholder: "Add a note…" });
    noteEl ? noteEl.replaceWith(ta) : quote.after(ta);
    ta.focus();
    const save = () =>
      editHighlight(page.url, h.id, (_p, x) => x && (x.note = ta.value.trim()));
    ta.addEventListener("blur", save);
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ta.blur();
    });
  });

  const copyBtn = el("button", { className: "link", textContent: "Copy" });
  copyBtn.addEventListener("click", async () => {
    const text = `"${h.exact.replace(/\s+/g, " ").trim()}"` + (h.note ? `\n\nNote: ${h.note}` : "") + `\n— ${page.title || page.url}`;
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = "Copied";
    setTimeout(() => (copyBtn.textContent = "Copy"), 1000);
  });

  const openLink = el("a", { className: "link", textContent: "Open ↗", href: textFragmentUrl(page.url, h.exact), target: "_blank" });
  openLink.style.cssText = "color: var(--muted); padding: 2px 4px; text-decoration: none;";

  const delBtn = el("button", { className: "link danger", textContent: "Delete" });
  delBtn.addEventListener("click", () => {
    if (!confirm("Delete this highlight?")) return;
    editHighlight(page.url, h.id, (p) => (p.highlights = p.highlights.filter((x) => x.id !== h.id)));
  });

  box.append(
    el("div", { className: "hl-actions" }, [
      el("span", { className: "date muted", textContent: fmtDate(h.createdAt) }),
      editBtn, copyBtn, openLink, delBtn,
    ])
  );
  return box;
}

function render() {
  const pages = filtered();
  const total = state.pages.reduce((n, p) => n + p.highlights.length, 0);
  const shown = pages.reduce((n, p) => n + p.highlights.length, 0);
  $("summary").textContent =
    total === 0 ? "" :
    shown === total ? `${total} highlight${total === 1 ? "" : "s"} across ${state.pages.length} page${state.pages.length === 1 ? "" : "s"}` :
    `Showing ${shown} of ${total} highlights`;

  const root = $("pages");
  root.replaceChildren();
  if (!total) {
    root.append(el("div", { className: "empty", innerHTML:
      "No highlights yet.<br>Select text on any page and pick a colour, or press <kbd>⌥</kbd><kbd>⇧</kbd><kbd>H</kbd>." }));
    return;
  }
  if (!pages.length) {
    root.append(el("div", { className: "empty", textContent: "Nothing matches." }));
    return;
  }
  for (const page of pages) {
    const link = el("a", { href: page.url, target: "_blank" }, withMatches(page.title || page.url, state.query));
    root.append(
      el("section", { className: "page" }, [
        el("div", { className: "page-head" }, link),
        el("div", { className: "page-meta muted", textContent: `${hostOf(page.url)} · ${page.highlights.length} highlight${page.highlights.length === 1 ? "" : "s"} · updated ${fmtDate(page.updatedAt)}` }),
        ...page.highlights.map((h) => renderHighlight(page, h)),
      ])
    );
  }
}

function download(name, text, type) {
  const a = el("a", { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function load() {
  state.pages = await getAllPages();
  // Don't wipe a note someone is typing in.
  if (document.activeElement?.tagName === "TEXTAREA") return;
  render();
}

// Colour filter chips
for (const [key, c] of Object.entries(MARGIN_COLORS)) {
  const chip = el("button", { className: "chip on", title: c.label });
  chip.style.setProperty("--c", c.solid);
  chip.addEventListener("click", () => {
    if (state.colors.has(key)) state.colors.delete(key);
    else state.colors.add(key);
    document.querySelectorAll(".chip").forEach((ch, i) => {
      const k = Object.keys(MARGIN_COLORS)[i];
      ch.classList.toggle("on", !state.colors.size || state.colors.has(k));
    });
    render();
  });
  $("chips").append(chip);
}

$("search").addEventListener("input", (e) => {
  state.query = e.target.value.trim().toLowerCase();
  render();
});

$("menuBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  $("menu").classList.toggle("open");
});
document.addEventListener("click", () => $("menu").classList.remove("open"));

$("menu").addEventListener("click", async (e) => {
  const act = e.target.dataset.act;
  const stamp = new Date().toISOString().slice(0, 10);
  if (act === "md") {
    const md = `# Highlights (${stamp})\n\n` + filtered().map(pageToMarkdown).join("\n");
    download(`highlights-${stamp}.md`, md, "text/markdown");
  } else if (act === "json") {
    const all = await chrome.storage.local.get(null);
    const pages = Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith(PAGE_PREFIX)));
    download(`scribbly-backup-${stamp}.json`, JSON.stringify({ app: "margin", version: 1, pages }, null, 2), "application/json");
  } else if (act === "import") {
    $("importFile").click();
  }
});

$("importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== "margin" || !data.pages) throw new Error("Not a Scribbly backup file.");
    // Merge: keep existing highlights, add any from the backup that aren't present.
    let added = 0;
    for (const incoming of Object.values(data.pages)) {
      const page = (await getPage(incoming.url)) || { ...incoming, highlights: [] };
      const ids = new Set(page.highlights.map((h) => h.id));
      for (const h of incoming.highlights) if (!ids.has(h.id)) { page.highlights.push(h); added++; }
      await savePage(page);
    }
    alert(`Restored ${added} highlight${added === 1 ? "" : "s"}.`);
  } catch (err) {
    alert(`Couldn't restore: ${err.message}`);
  }
  e.target.value = "";
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && Object.keys(changes).some((k) => k.startsWith(PAGE_PREFIX))) load();
});

load();
