// Shared helpers used by the content script, popup and library page.
// Storage layout (chrome.storage.local):
//   "page:<url>" -> { url, title, updatedAt, highlights: [Highlight] }
//   Highlight     = { id, exact, prefix, suffix, pos, color, note, createdAt }

const MARGIN_COLORS = {
  yellow: { label: "Yellow", bg: "rgba(250, 204, 21, 0.45)", solid: "#facc15" },
  green: { label: "Green", bg: "rgba(74, 222, 128, 0.40)", solid: "#4ade80" },
  blue: { label: "Blue", bg: "rgba(96, 165, 250, 0.40)", solid: "#60a5fa" },
  pink: { label: "Pink", bg: "rgba(244, 114, 182, 0.40)", solid: "#f472b6" },
  purple: { label: "Purple", bg: "rgba(167, 139, 250, 0.42)", solid: "#a78bfa" },
};

const PAGE_PREFIX = "page:";

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

function pageKey(url) {
  return PAGE_PREFIX + normalizeUrl(url);
}

async function getPage(url) {
  const key = pageKey(url);
  const data = await chrome.storage.local.get(key);
  return data[key] || null;
}

async function savePage(page) {
  const key = pageKey(page.url);
  if (!page.highlights.length) {
    await chrome.storage.local.remove(key);
    return;
  }
  page.updatedAt = Date.now();
  await chrome.storage.local.set({ [key]: page });
}

async function getAllPages() {
  const data = await chrome.storage.local.get(null);
  return Object.entries(data)
    .filter(([k]) => k.startsWith(PAGE_PREFIX))
    .map(([, v]) => v)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// A link that makes Chrome scroll to (and flash) the highlighted text.
function textFragmentUrl(url, exact) {
  const enc = (s) => encodeURIComponent(s).replace(/-/g, "%2D");
  const words = exact.replace(/\s+/g, " ").trim().split(" ");
  let directive;
  if (words.length <= 8) {
    directive = enc(words.join(" "));
  } else {
    directive = enc(words.slice(0, 4).join(" ")) + "," + enc(words.slice(-4).join(" "));
  }
  return normalizeUrl(url) + "#:~:text=" + directive;
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
