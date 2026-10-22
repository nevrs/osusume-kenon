// 動作ログ（デバッグ用）。設定画面でオンにしたときだけ残す（初期値はオフ）。端末の中（chrome.storage.local の debugLog）にだけ置き、外へは送らない。
// 残すのは、時刻・どのタブか・どの部品か・何が起きたか・数やエラーの文だけ。投稿の本文・ID・投稿者名は入れない。
// 開発者ツールのコンソールにも [osusume-kenon] を付けて出す。

const SHZ_LOG = { max: 500, flushMs: 2000 };
const shzLogTab = Math.random().toString(36).slice(2, 6); // どのタブのログか見分ける印
let shzLogOn = false;
const shzLogBuf = [];
let shzLogTimer = 0;

chrome.storage.local.get({ debugEnabled: false }, (v) => { shzLogOn = v.debugEnabled === true; });
chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && c.debugEnabled) shzLogOn = c.debugEnabled.newValue === true; });

// src: 部品（fold / judge / record）、ev: 出来事、detail: 数やエラーの文（本文は渡さない）
function shzLog(src, ev, detail) {
  if (!shzLogOn) return;
  const e = { t: Date.now(), tab: shzLogTab, src, ev, ...(detail === undefined ? {} : { d: detail }) };
  console.debug("[osusume-kenon]", src, ev, detail ?? "");
  shzLogBuf.push(e);
  if (!shzLogTimer) shzLogTimer = setTimeout(shzLogFlush, SHZ_LOG.flushMs);
}

async function shzLogFlush() {
  shzLogTimer = 0;
  if (!shzLogBuf.length) return;
  const add = shzLogBuf.splice(0);
  const { debugLog } = await chrome.storage.local.get({ debugLog: [] });
  await chrome.storage.local.set({ debugLog: [...debugLog, ...add].slice(-SHZ_LOG.max) });
}
