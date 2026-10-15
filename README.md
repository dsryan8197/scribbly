# Scribbly — web highlighter

Highlight and annotate text on any web page. Highlights last as long as the tab is open, so you can read an article over several days, and they're cleared when you close the tab.

## Install (Chrome, Brave, Edge or Arc)

1. Unzip this folder somewhere permanent, such as `~/Documents/scribbly`. The browser loads it from there, so don't delete it.
2. Open `chrome://extensions` (in Brave use `brave://extensions`; in Edge use `edge://extensions`).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the `scribbly` folder.
5. Pin the extension: click the puzzle-piece icon in the toolbar, then the pin next to Scribbly.
6. Reload any tabs that were already open.

## Use

- **Select text**: a small bar appears. Click a colour to highlight, or **+ Note** to highlight and write a note.
- **Click a highlight** to change its colour, edit the note, copy it or delete it. On a link, Alt+click instead.
- **Shortcuts**: `⌥⇧H` highlights the selection, `⌥⇧N` highlights it and adds a note. You can change them at `chrome://extensions/shortcuts`.
- **Toolbar icon**: lists this page's highlights. Click one to jump to it. **Copy as Markdown** copies them all, to paste into Notes, Notion or a study doc before you close the tab.

## Good to know

- Highlights are kept in the tab's own session storage. They survive reloads and a Chrome restart that reopens your tabs, and they're gone once the tab is closed (⌘⇧T to reopen a just-closed tab brings them back).
- Each tab has its own highlights: the same article open in two tabs won't share them.
- Highlights are matched by their text and surrounding context, so they survive most page changes. If a page's text changes a lot, the popup lists the highlight as "not found".
- Highlights belong to the page's URL, so on claude.ai each chat keeps its own.
- After reloading the extension at `chrome://extensions`, reload open tabs to get the new version. Their highlights come back.
- Browser-built PDF viewers and pages like the Chrome Web Store can't be highlighted (browsers block extensions there).
