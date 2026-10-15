(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const list = document.getElementById("list");
  const url = tab && tab.url ? normalizeUrl(tab.url) : "";
  document.getElementById("title").textContent = tab ? tab.title : "";

  document.getElementById("library").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("library.html") });
    window.close();
  });

  const page = url ? await getPage(url) : null;
  const highlights = page ? [...page.highlights].sort((a, b) => a.pos - b.pos) : [];
  document.getElementById("count").textContent = highlights.length ? `· ${highlights.length}` : "";

  let status = null;
  try {
    status = await chrome.tabs.sendMessage(tab.id, { type: "status" });
  } catch {}

  const copyBtn = document.getElementById("copy");
  copyBtn.disabled = !highlights.length;
  copyBtn.addEventListener("click", async () => {
    await navigator.clipboard.writeText(pageToMarkdown({ ...page, highlights }));
    copyBtn.textContent = "Copied!";
    setTimeout(() => (copyBtn.textContent = "Copy as Markdown"), 1200);
  });

  if (!status) {
    list.innerHTML = `<div class="empty">${
      /^https?:|^file:/.test(tab.url || "")
        ? "Reload this page to start highlighting."
        : "Highlighting isn't available on this page."
    }</div>`;
    if (!highlights.length) return;
  } else if (!highlights.length) {
    list.innerHTML = `<div class="empty">
      Select text on the page to highlight it.
      <div class="tips" style="margin-top:10px">
        <kbd>⌥</kbd><kbd>⇧</kbd><kbd>H</kbd> highlight &nbsp; <kbd>⌥</kbd><kbd>⇧</kbd><kbd>N</kbd> highlight + note
      </div></div>`;
    return;
  }

  const placed = new Set(status ? status.anchored : []);
  for (const h of highlights) {
    const item = document.createElement("div");
    item.className = "item";
    const quote = document.createElement("div");
    quote.className = "quote";
    quote.style.setProperty("--c", MARGIN_COLORS[h.color]?.solid);
    quote.textContent = h.exact.replace(/\s+/g, " ").trim();
    item.appendChild(quote);
    if (h.note) {
      const note = document.createElement("div");
      note.className = "note";
      note.textContent = h.note;
      item.appendChild(note);
    }
    if (status && !placed.has(h.id)) {
      item.classList.add("missing");
      const tag = document.createElement("div");
      tag.className = "tag muted";
      tag.textContent = "Not found on the page right now";
      item.appendChild(tag);
    }
    item.addEventListener("click", async () => {
      try {
        const res = await chrome.tabs.sendMessage(tab.id, { type: "scroll-to", id: h.id });
        if (res && res.ok) window.close();
      } catch {}
    });
    list.appendChild(item);
  }
})();
