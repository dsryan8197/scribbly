(() => {
  if (window.__marginLoaded) return;
  window.__marginLoaded = true;

  // ---------------------------------------------------------------------------
  // Text index: every visible text node in <body>, concatenated, so a highlight
  // can be stored as plain text + surrounding context and found again later.
  // ---------------------------------------------------------------------------

  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION",
    "IFRAME", "OBJECT", "CANVAS", "VIDEO", "AUDIO", "svg", "math", "TEMPLATE",
  ]);

  function acceptNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
    if (SKIP_TAGS.has(node.tagName)) return NodeFilter.FILTER_REJECT;
    if (node.isContentEditable) return NodeFilter.FILTER_REJECT;
    return NodeFilter.FILTER_SKIP;
  }

  function buildIndex() {
    const nodes = [];
    let text = "";
    if (!document.body) return { nodes, text };
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      { acceptNode }
    );
    let n;
    while ((n = walker.nextNode())) {
      nodes.push({ node: n, start: text.length });
      text += n.data;
    }
    return { nodes, text };
  }

  // Whitespace-collapsed copy of the text, with a map back to raw offsets.
  // Pages often re-render with different whitespace, so matching is done here.
  function normalizeIndex(index) {
    const map = [];
    let norm = "";
    let prevSpace = false;
    const t = index.text;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (/\s/.test(c)) {
        if (prevSpace) continue;
        norm += " ";
        prevSpace = true;
      } else {
        norm += c;
        prevSpace = false;
      }
      map.push(i);
    }
    return { norm, map };
  }

  const squash = (s) => s.replace(/\s+/g, " ");

  function rangeToOffsets(range, index) {
    let start = null;
    let end = null;
    for (const { node, start: s } of index.nodes) {
      if (!range.intersectsNode(node)) continue;
      if (start === null) start = s + (node === range.startContainer ? range.startOffset : 0);
      end = s + (node === range.endContainer ? range.endOffset : node.data.length);
    }
    if (start === null || end <= start) return null;
    while (start < end && /\s/.test(index.text[start])) start++;
    while (end > start && /\s/.test(index.text[end - 1])) end--;
    return end > start ? { start, end } : null;
  }

  function commonSuffixLen(a, b) {
    let n = 0;
    while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
    return n;
  }

  function commonPrefixLen(a, b) {
    let n = 0;
    while (n < a.length && n < b.length && a[n] === b[n]) n++;
    return n;
  }

  function findOffsets(h, index, normed) {
    const { norm, map } = normed;
    const exact = squash(h.exact);
    const prefix = squash(h.prefix || "");
    const suffix = squash(h.suffix || "");
    let best = null;
    let bestScore = -Infinity;
    let i = norm.indexOf(exact);
    let guard = 0;
    while (i !== -1 && guard++ < 2000) {
      const before = norm.slice(Math.max(0, i - prefix.length), i);
      const after = norm.slice(i + exact.length, i + exact.length + suffix.length);
      const ctx = commonSuffixLen(before, prefix) + commonPrefixLen(after, suffix);
      const dist = Math.abs(map[i] - (h.pos || 0)) / Math.max(1, index.text.length);
      const score = ctx - dist;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
      i = norm.indexOf(exact, i + 1);
    }
    if (best === null) return null;
    return { start: map[best], end: map[best + exact.length - 1] + 1 };
  }

  function wrapOffsets(index, start, end, h) {
    const segs = [];
    for (const { node, start: s } of index.nodes) {
      const e = s + node.data.length;
      if (e <= start) continue;
      if (s >= end) break;
      segs.push({ node, from: Math.max(0, start - s), to: Math.min(node.data.length, end - s) });
    }
    const marks = [];
    for (const { node, from, to } of segs) {
      if (!node.data.slice(from, to).trim()) continue;
      let target = node;
      if (from > 0) target = target.splitText(from);
      if (to - from < target.data.length) target.splitText(to - from);
      const mark = document.createElement("mark");
      mark.className = "margin-hl";
      mark.dataset.marginId = h.id;
      target.parentNode.insertBefore(mark, target);
      mark.appendChild(target);
      marks.push(mark);
    }
    styleMarks(marks, h);
    return marks;
  }

  function styleMarks(marks, h) {
    marks.forEach((m, i) => {
      m.dataset.marginColor = h.color;
      m.classList.toggle("margin-has-note", !!h.note && i === marks.length - 1);
      m.title = h.note ? h.note : "";
    });
  }

  function unwrap(mark) {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
  }

  // ---------------------------------------------------------------------------
  // Page state
  // ---------------------------------------------------------------------------

  let currentUrl = normalizeUrl(location.href);
  let highlights = []; // highlights stored for this page
  const anchored = new Map(); // id -> [mark elements]
  // Each search rescans the whole page, so give up on a highlight that keeps failing
  // (its text was edited away) instead of searching on every DOM change forever.
  const MAX_TRIES = 5;
  const failures = new Map(); // id -> failed search count
  let lastColor = "yellow";

  chrome.storage.local.get("settings:lastColor").then((d) => {
    if (d["settings:lastColor"]) lastColor = d["settings:lastColor"];
  });

  function removeMarks(id) {
    for (const m of anchored.get(id) || []) unwrap(m);
    anchored.delete(id);
  }

  function anchorPending() {
    // Drop anchors whose marks the page threw away (e.g. a re-render).
    for (const [id, marks] of anchored) {
      if (!marks.length || !marks.every((m) => m.isConnected)) {
        for (const m of marks) if (m.isConnected) unwrap(m);
        anchored.delete(id);
      }
    }
    const pending = highlights.filter((h) => !anchored.has(h.id) && (failures.get(h.id) || 0) < MAX_TRIES);
    if (!pending.length) return;
    observer.disconnect();
    try {
      for (const h of pending) {
        const index = buildIndex();
        const off = findOffsets(h, index, normalizeIndex(index));
        if (off) anchored.set(h.id, wrapOffsets(index, off.start, off.end, h));
        else failures.set(h.id, (failures.get(h.id) || 0) + 1);
      }
    } finally {
      observe();
    }
  }

  async function loadPage() {
    const page = await getPage(currentUrl);
    highlights = page ? page.highlights : [];
    failures.clear();
    syncMarks();
  }

  // Bring the DOM in line with `highlights` (after a load or a storage change).
  function syncMarks() {
    const ids = new Set(highlights.map((h) => h.id));
    observer.disconnect();
    for (const id of [...anchored.keys()]) if (!ids.has(id)) removeMarks(id);
    for (const h of highlights) if (anchored.has(h.id)) styleMarks(anchored.get(h.id), h);
    observe();
    anchorPending();
  }

  async function mutatePage(fn) {
    const page = (await getPage(currentUrl)) || {
      url: currentUrl,
      title: document.title,
      highlights: [],
    };
    page.title = document.title || page.title;
    fn(page);
    highlights = page.highlights;
    await savePage(page);
  }

  function checkUrlChange() {
    const url = normalizeUrl(location.href);
    if (url === currentUrl) return;
    currentUrl = url;
    observer.disconnect();
    for (const id of [...anchored.keys()]) removeMarks(id);
    observe();
    hideUi();
    loadPage();
  }

  // Single-page apps (claude.ai, docs sites) load content late and re-render,
  // so keep trying to place highlights as the DOM changes.
  let mutationTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(() => {
      checkUrlChange();
      anchorPending();
    }, 500);
  });
  // Only pages with saved highlights need watching; URL changes are caught by the interval.
  function observe() {
    if (document.body && highlights.length) observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  observe();
  setInterval(checkUrlChange, 1000);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const change = changes[pageKey(currentUrl)];
    if (!change) return;
    highlights = change.newValue ? change.newValue.highlights : [];
    syncMarks();
  });

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  function selectionRange() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!sel.toString().trim()) return null;
    const anc = range.commonAncestorContainer;
    const el = anc.nodeType === Node.ELEMENT_NODE ? anc : anc.parentElement;
    if (!el || el.isContentEditable || el.closest("input, textarea")) return null;
    if (!document.body.contains(el)) return null;
    return range;
  }

  async function highlightSelection(color, withNote) {
    const range = selectionRange();
    if (!range) return;
    color = color || lastColor;
    lastColor = color;
    chrome.storage.local.set({ "settings:lastColor": color });

    observer.disconnect();
    let h;
    try {
      const index = buildIndex();
      const off = rangeToOffsets(range, index);
      if (!off) return;
      h = {
        id: newId(),
        exact: index.text.slice(off.start, off.end),
        prefix: index.text.slice(Math.max(0, off.start - 40), off.start),
        suffix: index.text.slice(off.end, off.end + 40),
        pos: off.start,
        color,
        note: "",
        createdAt: Date.now(),
      };
      anchored.set(h.id, wrapOffsets(index, off.start, off.end, h));
    } finally {
      observe();
    }
    window.getSelection().removeAllRanges();
    hideUi();
    await mutatePage((p) => p.highlights.push(h));
    if (withNote) openEditor(h.id, true);
  }

  async function updateHighlight(id, patch) {
    await mutatePage((p) => {
      const h = p.highlights.find((x) => x.id === id);
      if (h) Object.assign(h, patch);
    });
    const h = highlights.find((x) => x.id === id);
    if (h && anchored.has(id)) styleMarks(anchored.get(id), h);
  }

  async function deleteHighlight(id) {
    observer.disconnect();
    removeMarks(id);
    observe();
    hideUi();
    await mutatePage((p) => {
      p.highlights = p.highlights.filter((x) => x.id !== id);
    });
  }

  function scrollToHighlight(id) {
    const marks = anchored.get(id);
    if (!marks || !marks.length) return false;
    marks[0].scrollIntoView({ behavior: "smooth", block: "center" });
    for (const m of marks) {
      m.classList.remove("margin-flash");
      void m.offsetWidth;
      m.classList.add("margin-flash");
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Floating UI (in a shadow root so page CSS can't touch it)
  // ---------------------------------------------------------------------------

  const host = document.createElement("div");
  host.setAttribute("data-margin-ui", "");
  host.style.cssText = "all: initial; position: fixed; top: 0; left: 0; z-index: 2147483647;";
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .panel {
        position: fixed; display: none; align-items: center; gap: 6px;
        padding: 6px 8px; border-radius: 10px;
        background: #202124; color: #f1f1f1;
        box-shadow: 0 6px 24px rgba(0,0,0,.28), 0 0 0 1px rgba(255,255,255,.06);
        font: 13px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .panel.show { display: flex; }
      .editor { flex-direction: column; align-items: stretch; width: 280px; gap: 8px; padding: 10px; }
      .row { display: flex; align-items: center; gap: 6px; }
      .dot {
        width: 18px; height: 18px; border-radius: 50%; border: 2px solid transparent;
        cursor: pointer; padding: 0; flex: none;
      }
      .dot:hover { transform: scale(1.12); }
      .dot.active { border-color: #fff; }
      .sep { width: 1px; height: 18px; background: rgba(255,255,255,.18); margin: 0 2px; }
      button.txt {
        all: unset; cursor: pointer; padding: 3px 7px; border-radius: 6px; color: #e8e8e8;
        font: inherit;
      }
      button.txt:hover { background: rgba(255,255,255,.12); }
      button.danger:hover { background: rgba(239,68,68,.3); }
      .spacer { flex: 1; }
      textarea {
        all: unset; box-sizing: border-box; width: 100%; min-height: 64px; max-height: 200px;
        padding: 7px 8px; border-radius: 6px; background: #2d2e31; color: #f1f1f1;
        font: inherit; white-space: pre-wrap; overflow-y: auto;
      }
      textarea::placeholder { color: #8a8b8e; }
      .hint { color: #8a8b8e; font-size: 11px; }
    </style>
    <div class="panel toolbar" part="toolbar"></div>
    <div class="panel editor">
      <div class="row colors"></div>
      <textarea placeholder="Add a note…"></textarea>
      <div class="row">
        <span class="hint">Esc to close</span>
        <span class="spacer"></span>
        <button class="txt copy">Copy</button>
        <button class="txt danger delete">Delete</button>
      </div>
    </div>`;
  const toolbar = shadow.querySelector(".toolbar");
  const editor = shadow.querySelector(".editor");
  const editorColors = editor.querySelector(".colors");
  const noteBox = editor.querySelector("textarea");
  let editingId = null;

  function dot(color, onClick) {
    const b = document.createElement("button");
    b.className = "dot";
    b.title = MARGIN_COLORS[color].label;
    b.style.background = MARGIN_COLORS[color].solid;
    b.dataset.color = color;
    b.addEventListener("click", onClick);
    return b;
  }

  for (const c of Object.keys(MARGIN_COLORS)) {
    toolbar.appendChild(dot(c, () => highlightSelection(c, false)));
    editorColors.appendChild(dot(c, () => {
      if (!editingId) return;
      lastColor = c;
      updateHighlight(editingId, { color: c });
      editorColors.querySelectorAll(".dot").forEach((d) => d.classList.toggle("active", d.dataset.color === c));
    }));
  }
  toolbar.appendChild(Object.assign(document.createElement("span"), { className: "sep" }));
  const noteBtn = document.createElement("button");
  noteBtn.className = "txt";
  noteBtn.textContent = "+ Note";
  noteBtn.addEventListener("click", () => highlightSelection(null, true));
  toolbar.appendChild(noteBtn);

  // Keep the page selection alive while clicking toolbar buttons.
  shadow.addEventListener("mousedown", (e) => {
    if (e.target.tagName !== "TEXTAREA") e.preventDefault();
    e.stopPropagation();
  });

  let noteTimer = null;
  noteBox.addEventListener("input", () => {
    const id = editingId;
    const note = noteBox.value;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => updateHighlight(id, { note: note.trim() }), 300);
  });
  noteBox.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      closeEditor();
    }
  });
  // Stop sites with global keyboard shortcuts from hijacking typing in the note.
  ["keyup", "keypress"].forEach((t) => noteBox.addEventListener(t, (e) => e.stopPropagation()));

  editor.querySelector(".copy").addEventListener("click", async () => {
    const h = highlights.find((x) => x.id === editingId);
    if (!h) return;
    const text = h.note ? `"${squash(h.exact)}"\n\nNote: ${h.note}` : squash(h.exact);
    await navigator.clipboard.writeText(text).catch(() => {});
    const btn = editor.querySelector(".copy");
    btn.textContent = "Copied";
    setTimeout(() => (btn.textContent = "Copy"), 1000);
  });
  editor.querySelector(".delete").addEventListener("click", () => {
    if (editingId) deleteHighlight(editingId);
  });

  function mountHost() {
    if (!host.isConnected) document.documentElement.appendChild(host);
  }

  function place(panel, rect, width) {
    const margin = 8;
    const h = panel.offsetHeight || 36;
    let top = rect.top - h - margin;
    if (top < margin) top = rect.bottom + margin;
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    panel.style.top = `${Math.min(top, window.innerHeight - h - margin)}px`;
    panel.style.left = `${left}px`;
  }

  function showToolbar(range) {
    mountHost();
    closeEditor();
    toolbar.classList.add("show");
    const rects = range.getClientRects();
    const rect = rects.length ? rects[0] : range.getBoundingClientRect();
    place(toolbar, rect, toolbar.offsetWidth);
  }

  function openEditor(id, focusNote) {
    const h = highlights.find((x) => x.id === id);
    const marks = anchored.get(id);
    if (!h || !marks || !marks.length) return;
    mountHost();
    toolbar.classList.remove("show");
    editingId = id;
    noteBox.value = h.note || "";
    editorColors.querySelectorAll(".dot").forEach((d) => d.classList.toggle("active", d.dataset.color === h.color));
    editor.classList.add("show");
    place(editor, marks[0].getBoundingClientRect(), editor.offsetWidth);
    if (focusNote) setTimeout(() => noteBox.focus(), 0);
  }

  function closeEditor() {
    if (editingId && noteTimer) {
      clearTimeout(noteTimer);
      noteTimer = null;
      updateHighlight(editingId, { note: noteBox.value.trim() });
    }
    editingId = null;
    editor.classList.remove("show");
  }

  function hideUi() {
    toolbar.classList.remove("show");
    closeEditor();
  }

  document.addEventListener("mouseup", (e) => {
    if (e.composedPath().includes(host)) return;
    setTimeout(() => {
      const range = selectionRange();
      if (range) showToolbar(range);
      else toolbar.classList.remove("show");
    }, 10);
  });

  document.addEventListener("mousedown", (e) => {
    if (!e.composedPath().includes(host)) hideUi();
  });

  document.addEventListener("click", (e) => {
    const mark = e.target.closest && e.target.closest("mark.margin-hl");
    if (!mark) return;
    if (!window.getSelection().isCollapsed) return;
    if (mark.closest("a") && !e.altKey) return; // let links work; Alt+click to edit
    openEditor(mark.dataset.marginId, false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideUi();
  });
  window.addEventListener("scroll", () => toolbar.classList.remove("show"), { passive: true });

  // ---------------------------------------------------------------------------
  // Messages from the popup / background (keyboard shortcuts, context menu)
  // ---------------------------------------------------------------------------

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "highlight-selection") highlightSelection(null, false);
    else if (msg.type === "note-selection") highlightSelection(null, true);
    else if (msg.type === "scroll-to") sendResponse({ ok: scrollToHighlight(msg.id) });
    else if (msg.type === "status") {
      sendResponse({ url: currentUrl, anchored: [...anchored.keys()] });
    }
  });

  loadPage();
})();
