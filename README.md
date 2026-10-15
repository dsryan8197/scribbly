# Margin — web highlighter

Highlight and annotate text on any web page. Highlights reappear when you come back, and every highlight is searchable in one library.

## Install (Chrome, Brave, Edge or Arc)

1. Unzip this folder somewhere permanent, such as `~/Documents/margin`. The browser loads it from there, so don't delete it.
2. Open `chrome://extensions` (in Brave use `brave://extensions`; in Edge use `edge://extensions`).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the `margin` folder.
5. Pin the extension: click the puzzle-piece icon in the toolbar, then the pin next to Margin.
6. Reload any tabs that were already open.

## Use

- **Select text**: a small bar appears. Click a colour to highlight, or **+ Note** to highlight and write a note.
- **Click a highlight** to change its colour, edit the note, copy it or delete it. On a link, Alt+click instead.
- **Shortcuts**: `⌥⇧H` highlights the selection, `⌥⇧N` highlights it and adds a note. You can change them at `chrome://extensions/shortcuts`.
- **Toolbar icon**: lists this page's highlights. Click one to jump to it. There's also **Copy as Markdown**.
- **Library** (from the popup, or right-click the icon): search everything, filter by colour, edit notes, and **Open ↗** to jump straight to the passage. You can export to Markdown (for Notion, Obsidian or a study doc) and back up or restore as JSON.

## Good to know

- Highlights are stored only in this browser, on this computer. Use **Export → Back up everything** now and then.
- Highlights are matched by their text and surrounding context, so they survive most page changes. If a page's text changes a lot, the highlight stays in the library but can't be shown on the page.
- Highlights belong to the page's URL, so on claude.ai each chat keeps its own.
- Browser-built PDF viewers and pages like the Chrome Web Store can't be highlighted (browsers block extensions there).
