// 初めて入れたときだけ、設定画面を開く（DESIGN.md D29。更新・Chrome の更新では開かない）。X には触らない
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) chrome.runtime.openOptionsPage();
});
