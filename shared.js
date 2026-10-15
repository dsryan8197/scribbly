// Shared helpers used by the content script and popup.
// Highlights are kept per tab in the page's sessionStorage (see content.js):
//   "scribbly:pages" -> { "<url>": { url, title, highlights: [Highlight] } }
//   Highlight         = { id, exact, prefix, suffix, pos, color, note, createdAt }

const MARGIN_COLORS = {
  yellow: { label: "Yellow", bg: "rgba(250, 204, 21, 0.45)", solid: "#facc15" },
  green: { label: "Green", bg: "rgba(74, 222, 128, 0.40)", solid: "#4ade80" },
  blue: { label: "Blue", bg: "rgba(96, 165, 250, 0.40)", solid: "#60a5fa" },
  pink: { label: "Pink", bg: "rgba(244, 114, 182, 0.40)", solid: "#f472b6" },
  purple: { label: "Purple", bg: "rgba(167, 139, 250, 0.42)", solid: "#a78bfa" },
};

// Ignore the #fragment so jump links and in-page anchors don't split a page's highlights.
function normalizeUrl(href) {
  try {
    const u = new URL(href);
    u.hash = "";
    return u.toString();
  } catch {
    return href;
  }
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function pageToMarkdown(page) {
  const lines = [`## [${page.title || page.url}](${page.url})`, ""];
  for (const h of page.highlights) {
    const quote = h.exact.replace(/\s+/g, " ").trim();
    lines.push(`> ${quote}`);
    if (h.note) lines.push("", `**Note:** ${h.note}`);
    lines.push("");
  }
  return lines.join("\n");
}
