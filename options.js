// 設定画面。値は chrome.storage.local（この端末だけ）に置く
const $ = (id) => document.getElementById(id);
const say = (t) => { $("saved").textContent = t; };
const feedLabel = (f) => shzT(f === "for-you" ? "feedForYou" : "feedFollowing");
const SESSION_TARGET = 50; // 測定モードで、それぞれの feed について集める件数

// 文言を言語に合わせて入れる。**…** は太字（DOM で組む）
function setRich(el, text) {
  el.replaceChildren();
  text.split("**").forEach((part, i) => {
    if (!part) return;
    if (i % 2) { const b = document.createElement("strong"); b.textContent = part; el.append(b); } else el.append(part);
  });
}
function applyLang() {
  document.documentElement.lang = shzLang;
  for (const el of document.querySelectorAll("[data-i18n]")) setRich(el, shzT(el.dataset.i18n));
  document.title = shzT("title");
  chrome.storage.local.get({ debugLog: [] }, (v) => showLog(v.debugLog));
  drawSample(false);
  render();
}
const langSel = $("lang");
chrome.storage.local.get({ lang: "auto" }, (v) => { langSel.value = v.lang; });
langSel.addEventListener("change", () => chrome.storage.local.set({ lang: langSel.value }));
shzLoadLang(applyLang);

// 削除した機能の設定が残っていれば消す（一呼吸: D11、たたむ: D13）
chrome.storage.local.remove(["pauseEnabled", "foldEnabled", "foldDay", "foldDiag", "foldThreshold"]);
const rec = $("recordEnabled");
chrome.storage.local.get({ recordEnabled: false }, (v) => { rec.checked = v.recordEnabled === true; });
rec.addEventListener("change", async () => {
  const { session } = await chrome.storage.local.get({ session: null });
  if (session && !session.end) {
    // 測定中に本人が切り替えた。オフなら測定をここで終える。オンなら、終えたあともオンのままにする（本人の選んだ設定を、終了時に上書きしない）
    await chrome.storage.local.set(rec.checked ? { recordEnabled: true, session: { ...session, prev: true } } : { recordEnabled: false, session: { ...session, end: Date.now() } });
    say(shzT(rec.checked ? "recOnSession" : "recOffSession"));
    return;
  }
  await chrome.storage.local.set({ recordEnabled: rec.checked });
  say(shzT(rec.checked ? "recOnMsg" : "recOffMsg"));
});
chrome.storage.onChanged.addListener((c, area) => {
  if (area === "local" && c.recordEnabled) rec.checked = c.recordEnabled.newValue === true; // 測定モードの開始・終了で変わる
});

function cell(tr, text, cls) {
  const td = document.createElement("td");
  td.textContent = text;
  if (cls) td.className = cls;
  tr.append(td);
  return td;
}
function header(table, labels) {
  const tr = document.createElement("tr");
  for (const l of labels) { const th = document.createElement("th"); th.textContent = l; tr.append(th); }
  table.append(tr);
}
const pct = (share) => (share === null ? null : `${Math.round(share * 100)}%`);

// 割合のセル。件数が足りなければ「—」。bar があれば棒を付ける
function shareCell(tr, count, judged, barClass) {
  const share = shzShare(count, judged);
  const td = cell(tr, share === null ? shzT("judgedN", { n: judged }) : pct(share), share === null ? "muted" : "");
  if (share !== null && barClass) {
    const bar = document.createElement("span");
    bar.className = `bar ${barClass}`;
    bar.style.width = `${Math.max(1, Math.round(share * 100))}%`;
    td.append(bar);
  }
}

// おすすめとフォロー中の差（ひとまとめ・見下し・排除のどれかに当てはまる割合）の文。比べられないときは理由
function diffText(t) {
  const a = shzShare(t["for-you"].any, t["for-you"].judged), b = shzShare(t.following.any, t.following.judged);
  if (a === null || b === null) return shzT("diffNeed", { min: SHZ_MIN_N, a: t["for-you"].judged, b: t.following.judged });
  const d = Math.round((a - b) * 100);
  const word = d > 0 ? shzT("diffHigher", { d }) : d < 0 ? shzT("diffLower", { d: -d }) : shzT("diffSame");
  return shzT("diffText", { a: pct(a), b: pct(b), word });
}

function tallyTable(table, t, withBar) {
  table.replaceChildren();
  header(table, ["", shzT("thSeen"), shzT("thJudged"), shzT("thAny"), shzT("thLump"), shzT("thContempt"), shzT("thExclusion")]);
  for (const f of SHZ_FEEDS) {
    const tr = document.createElement("tr");
    cell(tr, feedLabel(f));
    cell(tr, String(t[f].seen));
    cell(tr, String(t[f].judged));
    shareCell(tr, t[f].any, t[f].judged, withBar ? f : "");
    shareCell(tr, t[f].lump, t[f].judged);
    shareCell(tr, t[f].contempt, t[f].judged);
    shareCell(tr, t[f].exclusion, t[f].judged);
    table.append(tr);
  }
  table.hidden = false;
}

function renderCount(recs) {
  const s = shzSummarize(recs);
  const judged = Object.values(recs).filter(shzIsJudged).length;
  $("recCount").textContent = s.total
    ? shzT("recCount", { total: s.total, fy: s.byFeed["for-you"] || 0, fl: s.byFeed.following || 0, judged })
    : shzT("recNone");
}

function renderDays(recs) {
  const days = shzTallyByDay(recs);
  const dt = $("dayTable");
  dt.replaceChildren();
  header(dt, [shzT("thDay"), shzT("thDayForYou"), shzT("thDayFollowing")]);
  for (const d of Object.keys(days).sort().reverse().slice(0, 14)) {
    const tr = document.createElement("tr");
    cell(tr, d);
    for (const f of SHZ_FEEDS) shareCell(tr, days[d][f].any, days[d][f].judged, f);
    dt.append(tr);
  }
  dt.hidden = false;
}

function renderTrend(recs) {
  const note = $("trendNote");
  if (!Object.keys(recs).length) {
    note.textContent = shzT("trendEmpty");
    $("trendTable").hidden = $("dayTable").hidden = true;
    return;
  }
  renderDays(recs); // 日ごとの表は、直近 14 日の外の記録も含めて出す（最近の 14 日分）
  const from = Date.now() - 14 * 86_400_000;
  const t = shzTally(recs, from);
  if (!SHZ_FEEDS.some((f) => t[f].seen)) {
    note.textContent = shzT("trendNone14");
    $("trendTable").hidden = true;
    return;
  }
  const versions = shzVersions(Object.fromEntries(Object.entries(recs).filter(([, r]) => r.ts >= from)));
  const legacy = SHZ_FEEDS.reduce((n, f) => n + t[f].legacy, 0);
  note.textContent = diffText(t) + (versions.length > 1 ? shzT("versions", { v: versions.join(", ") }) : "") + (legacy ? shzT("legacyNote", { n: legacy }) : "");
  tallyTable($("trendTable"), t, false);
}

function renderSession(session, recs) {
  const start = $("sessStart"), end = $("sessEnd"), prog = $("sessProgress"), table = $("sessTable"), diff = $("sessDiff");
  const active = !!(session && !session.end);
  start.hidden = active;
  end.hidden = !active;
  table.hidden = true;
  diff.textContent = "";
  if (!session) { prog.textContent = ""; return; }
  const { tally, done } = shzSessionProgress(recs, session);
  const line = SHZ_FEEDS.map((f) => shzT("sessLine", { feed: feedLabel(f), seen: tally[f].seen, target: session.targetEach, judged: tally[f].judged })).join(" / ");
  if (active) {
    prog.textContent = shzT("sessRunning", { line, tail: shzT(done ? "sessDone" : "sessLook") });
  } else {
    const unjudged = SHZ_FEEDS.reduce((n, f) => n + tally[f].seen - tally[f].judged, 0);
    prog.textContent = shzT("sessPrev", { line, tail: unjudged ? shzT("sessUnjudged", { n: unjudged }) : "" });
  }
  if (tally["for-you"].seen + tally.following.seen) {
    tallyTable(table, tally, true);
    diff.textContent = diffText(tally);
  }
}

let renderSeq = 0, renderTimer = 0;
function scheduleRender() { // 判定が進むたびに書き換えが続くので、まとめて描く
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 250);
}
async function render() {
  const my = ++renderSeq;
  const all = await chrome.storage.local.get(null);
  if (my !== renderSeq) return; // 後から始めた読み出しがあるので、古いほうは描かない
  const recs = Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith("rec:")));
  renderCount(recs);
  renderTrend(recs);
  renderSession(all.session ?? null, recs);
}

$("recDelete").addEventListener("click", async () => {
  // 開いている X のタブにも伝える（まだ保存していない分と「記録済み」の覚えを捨てさせる）。先に伝えてから消す
  await chrome.storage.local.set({ recordClearedAt: Date.now() });
  const all = await chrome.storage.local.get(null);
  await chrome.storage.local.remove(Object.keys(all).filter((k) => k.startsWith("rec:")));
  await render();
  await drawSample(); // 消した本文を見本の欄（とコピー）に残さない
  say(shzT("deleted"));
});
$("recStrip").addEventListener("click", async () => {
  await chrome.storage.local.set({ textClearedAt: Date.now() }); // 先に伝える（開いている X のタブの保存待ちと、判定の最中の書き込みが、本文を戻さないように）
  await shzApplyPurge(0); // 判定済みは本文を消して点を残す。未判定は記録ごと消える
  await render();
  await drawSample(); // 消した本文を見本の欄（とコピー）に残さない
  say(shzT("stripped"));
});

$("sessStart").addEventListener("click", async () => {
  const { recordEnabled } = await chrome.storage.local.get({ recordEnabled: false });
  await chrome.storage.local.set({ session: { start: Date.now(), targetEach: SESSION_TARGET, prev: recordEnabled === true }, recordEnabled: true });
  say(shzT("sessStarted"));
});
$("sessEnd").addEventListener("click", async () => {
  const { session } = await chrome.storage.local.get({ session: null });
  if (!session || session.end) return;
  await chrome.storage.local.set({ session: { ...session, end: Date.now() }, recordEnabled: session.prev === true });
  say(shzT(session.prev === true ? "sessEndedKeep" : "sessEndedOff"));
});

// 判定の見本（D14）。開いたとき・ボタンを押したときだけ選び直す（判定が進むたびに入れ替えない）。当てはまったものを先に並べない。
// 判定の当たり外れを確かめるため、出ている見本をそのままコピーできる（本人の判断。2026-10-24）
let sampleHit = false;
let samplePicks = null; // いま出している見本（言語を変えたときは、選び直さずに描き直す）
const sampleHead = (r) => `${feedLabel(r.feed)} · ${new Date(r.ts).toLocaleDateString()}`;
const sampleHits = (r) => [["g", "thLump"], ["c", "thContempt"], ["x", "thExclusion"]].filter(([k]) => r[k]).map(([, key]) => shzT(key));
async function drawSample(repick = true) {
  const box = $("sampleBox");
  $("sampleHit").textContent = shzT(sampleHit ? "sampleRandom" : "sampleHitOnly");
  if (!box.open) return;
  if (repick || !samplePicks) {
    const all = await chrome.storage.local.get(null);
    const recs = Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith("rec:")));
    samplePicks = shzSample(recs, { n: 10, hitOnly: sampleHit, fromTs: Date.now() - SHZ_KEEP_DAYS * 86_400_000 });
  }
  const picks = samplePicks;
  const list = $("sampleList"), empty = $("sampleEmpty");
  list.replaceChildren();
  empty.hidden = picks.length > 0;
  empty.textContent = shzT(sampleHit ? "sampleNoneHit" : "sampleNone");
  $("sampleCopy").disabled = !picks.length;
  for (const r of picks) {
    const item = document.createElement("div");
    item.className = "sample";
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.append(`${sampleHead(r)} · `);
    const hits = sampleHits(r);
    const tag = document.createElement(hits.length ? "b" : "span");
    tag.textContent = hits.length ? hits.join("・") : shzT("sampleNoHit");
    meta.append(tag);
    const text = document.createElement("p");
    text.className = "text";
    text.textContent = r.text;
    item.append(meta, text);
    list.append(item);
  }
}
$("sampleBox").addEventListener("toggle", () => drawSample());
$("sampleMore").addEventListener("click", () => drawSample());
$("sampleHit").addEventListener("click", () => { sampleHit = !sampleHit; drawSample(); });
$("sampleCopy").addEventListener("click", async () => {
  if (!samplePicks?.length) return;
  const jvs = [...new Set(samplePicks.map((r) => r.jv || "?"))].join(", ");
  const head = `osusume-kenon ${chrome.runtime?.getManifest?.().version ?? "?"} / ${jvs}`; // 判定の版（どの問いで判定したか）を添える
  const items = samplePicks.map((r) => `${sampleHead(r)} · ${sampleHits(r).join("・") || shzT("sampleNoHit")}\n${r.text}`);
  try { await navigator.clipboard.writeText([head, ...items].join("\n\n")); } catch { say(shzT("copyFailed")); return; }
  say(shzT("sampleCopied"));
});

// 動作ログ（log.js が X のタブで書く）。表示・コピー・消去
const dbg = $("debugEnabled");
const logLine = (e) => `${new Date(e.t).toLocaleTimeString()} [${e.tab}] ${e.src} ${e.ev}${e.d === undefined ? "" : " " + JSON.stringify(e.d)}`;
function showLog(log) {
  const lines = (log || []).map(logLine);
  $("logCount").textContent = shzT("logCount", { n: lines.length });
  const view = $("logView");
  view.textContent = lines.slice(-100).join("\n");
  view.hidden = !lines.length;
  view.scrollTop = view.scrollHeight;
}
chrome.storage.local.get({ debugEnabled: false, debugLog: [] }, (v) => { dbg.checked = v.debugEnabled === true; showLog(v.debugLog); });
dbg.addEventListener("change", () => chrome.storage.local.set({ debugEnabled: dbg.checked }));
chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && c.debugLog) showLog(c.debugLog.newValue); });
$("logCopy").addEventListener("click", async () => {
  const { debugLog } = await chrome.storage.local.get({ debugLog: [] });
  const head = `osusume-kenon ${chrome.runtime?.getManifest?.().version ?? "?"} / ${navigator.userAgent}`;
  try { await navigator.clipboard.writeText([head, ...debugLog.map(logLine)].join("\n")); } catch { say(shzT("copyFailed")); return; }
  say(shzT("logCopied"));
});
$("logClear").addEventListener("click", async () => {
  await chrome.storage.local.remove("debugLog");
  showLog([]);
  say(shzT("logCleared"));
});

chrome.storage.onChanged.addListener((c, area) => { // ログの書き込みだけなら、表は描き直さない
  if (area === "local" && Object.keys(c).some((k) => k !== "debugLog")) scheduleRender();
});
shzApplyPurge().then(render); // 期限の来た記録を片付ける。オフのままでも、設定画面を開いたときに行う
