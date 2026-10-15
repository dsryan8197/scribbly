chrome.runtime.onInstalled.addListener(() => {
  // Menus persist across updates, so clear the old ones (including the retired "library" item).
  chrome.contextMenus.removeAll();
  chrome.contextMenus.create({ id: "highlight", title: "Highlight", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "note", title: "Highlight with note", contexts: ["selection"] });
});

function send(tabId, type) {
  chrome.tabs.sendMessage(tabId, { type }).catch(() => {});
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "highlight") send(tab.id, "highlight-selection");
  else if (info.menuItemId === "note") send(tab.id, "note-selection");
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (tab && tab.id) send(tab.id, command);
});
