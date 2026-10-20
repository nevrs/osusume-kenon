// 設定画面。値は chrome.storage.local（この端末だけ）に置く
const box = document.getElementById("pauseEnabled");
chrome.storage.local.get({ pauseEnabled: false }, (v) => { box.checked = v.pauseEnabled === true; });
const rec = document.getElementById("recordEnabled");
chrome.storage.local.get({ recordEnabled: false }, (v) => { rec.checked = v.recordEnabled === true; });
rec.addEventListener("change", () => {
  chrome.storage.local.set({ recordEnabled: rec.checked }, () => {
    document.getElementById("saved").textContent = rec.checked ? "記録をオンにしました" : "記録をオフにしました（すでにある記録は残っています）";
  });
});
async function showCount() {
  const all = await chrome.storage.local.get(null);
  const recs = Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith("rec:")));
  const s = shzSummarize(recs);
  document.getElementById("recCount").textContent = s.total ? `${s.total} 件（おすすめ ${s.byFeed["for-you"] || 0}・フォロー中 ${s.byFeed["following"] || 0}）` : "なし";
}
document.getElementById("recDelete").addEventListener("click", async () => {
  const all = await chrome.storage.local.get(null);
  await chrome.storage.local.remove(Object.keys(all).filter((k) => k.startsWith("rec:")));
  await showCount();
  document.getElementById("saved").textContent = "記録をすべて消しました";
});
chrome.storage.onChanged.addListener((c, area) => { if (area === "local") showCount(); });
showCount();
box.addEventListener("change", () => {
  chrome.storage.local.set({ pauseEnabled: box.checked }, () => {
    document.getElementById("saved").textContent = box.checked ? "一呼吸をオンにしました" : "一呼吸をオフにしました";
  });
});
