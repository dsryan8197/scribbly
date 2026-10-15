chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "highlight", title: "Highlight", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "note", title: "Highlight with note", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "library", title: "Open highlight library", contexts: ["action"] });
});

function send(tabId, type) {
  chrome.tabs.sendMessage(tabId, { type }).catch(() => {});
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "highlight") send(tab.id, "highlight-selection");
  else if (info.menuItemId === "note") send(tab.id, "note-selection");
  else if (info.menuItemId === "library") chrome.tabs.create({ url: chrome.runtime.getURL("library.html") });
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (tab && tab.id) send(tab.id, command);
});
