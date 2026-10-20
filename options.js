// 設定画面。値は chrome.storage.local（この端末だけ）に置く
const box = document.getElementById("pauseEnabled");
chrome.storage.local.get({ pauseEnabled: false }, (v) => { box.checked = v.pauseEnabled === true; });
box.addEventListener("change", () => {
  chrome.storage.local.set({ pauseEnabled: box.checked }, () => {
    document.getElementById("saved").textContent = box.checked ? "一呼吸をオンにしました" : "一呼吸をオフにしました";
  });
});
