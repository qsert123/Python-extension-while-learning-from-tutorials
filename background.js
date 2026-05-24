const TUTORIAL_ORIGINS = [
  'https://www.youtube.com',
  'https://www.coursera.org',
  'https://www.udemy.com'
];

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.url && !tab.url) return;
  const url = changeInfo.url || tab.url;
  if (!url) return;

  try {
    const urlObj = new URL(url);
    const isTutorial = TUTORIAL_ORIGINS.includes(urlObj.origin);
    
    await chrome.sidePanel.setOptions({
      tabId,
      path: 'sidepanel.html',
      enabled: isTutorial
    });
  } catch (error) {
    console.error('Failed to set side panel:', error);
  }
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch(error => console.error('Panel behavior error:', error));