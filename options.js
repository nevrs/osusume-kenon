// 設定画面。値は chrome.storage.local（この端末だけ）に置く
const $ = (id) => document.getElementById(id);
const say = (t) => { $("saved").textContent = t; };
const FEED_LABEL = { "for-you": "おすすめ", following: "フォロー中" };
const SESSION_TARGET = 50; // 測定モードで、それぞれの feed について集める件数

const box = $("pauseEnabled");
chrome.storage.local.get({ pauseEnabled: false }, (v) => { box.checked = v.pauseEnabled === true; });
box.addEventListener("change", () => {
  chrome.storage.local.set({ pauseEnabled: box.checked }, () => say(box.checked ? "一呼吸をオンにしました" : "一呼吸をオフにしました"));
});

const rec = $("recordEnabled");
chrome.storage.local.get({ recordEnabled: false }, (v) => { rec.checked = v.recordEnabled === true; });
rec.addEventListener("change", async () => {
  const { session } = await chrome.storage.local.get({ session: null });
  if (session && !session.end) {
    // 測定中に本人が切り替えた。オフなら測定をここで終える。オンなら、終えたあともオンのままにする（本人の選んだ設定を、終了時に上書きしない）
    await chrome.storage.local.set(rec.checked ? { recordEnabled: true, session: { ...session, prev: true } } : { recordEnabled: false, session: { ...session, end: Date.now() } });
    say(rec.checked ? "記録をオンにしました（測定を終えても、オンのままにします）" : "記録と判定をオフにしました。測定もここで終えました（すでにある記録は残っています）");
    return;
  }
  await chrome.storage.local.set({ recordEnabled: rec.checked });
  say(rec.checked ? "記録と判定をオンにしました" : "記録と判定をオフにしました（すでにある記録は残っています）");
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
  const td = cell(tr, share === null ? `— (${judged}件)` : pct(share), share === null ? "muted" : "");
  if (share !== null && barClass) {
    const bar = document.createElement("span");
    bar.className = `bar ${barClass}`;
    bar.style.width = `${Math.max(1, Math.round(share * 100))}%`;
    td.append(bar);
  }
}

// おすすめとフォロー中の差（敵意が強い割合）の文。比べられないときは理由
function diffText(t) {
  const a = shzShare(t["for-you"].hostile, t["for-you"].judged), b = shzShare(t.following.hostile, t.following.judged);
  if (a === null || b === null) return `比べるには、おすすめとフォロー中の判定済みがそれぞれ ${SHZ_MIN_N} 件以上要ります（いま ${t["for-you"].judged} 件・${t.following.judged} 件）。`;
  const d = Math.round((a - b) * 100);
  const word = d > 0 ? `おすすめのほうが ${d} ポイント高い` : d < 0 ? `おすすめのほうが ${-d} ポイント低い` : "差はありません";
  return `敵意が強い投稿の割合: おすすめ ${pct(a)}・フォロー中 ${pct(b)}。${word}（目安。フォロー中との差であって、アルゴリズムが押し上げた量ではありません）。`;
}

function tallyTable(table, t, withBar) {
  table.replaceChildren();
  header(table, ["", "記録", "判定済み", "敵意が強い", "怒りが強い"]);
  for (const f of SHZ_FEEDS) {
    const tr = document.createElement("tr");
    cell(tr, FEED_LABEL[f]);
    cell(tr, String(t[f].seen));
    cell(tr, String(t[f].judged));
    shareCell(tr, t[f].hostile, t[f].judged, withBar ? f : "");
    shareCell(tr, t[f].angry, t[f].judged);
    table.append(tr);
  }
  table.hidden = false;
}

function renderCount(recs) {
  const s = shzSummarize(recs);
  const judged = Object.values(recs).filter(shzIsJudged).length;
  $("recCount").textContent = s.total
    ? `${s.total} 件（おすすめ ${s.byFeed["for-you"] || 0}・フォロー中 ${s.byFeed.following || 0}）、うち判定済み ${judged} 件`
    : "なし";
}

function renderDays(recs) {
  const days = shzTallyByDay(recs);
  const dt = $("dayTable");
  dt.replaceChildren();
  header(dt, ["日", "おすすめ（敵意が強い）", "フォロー中（敵意が強い）"]);
  for (const d of Object.keys(days).sort().reverse().slice(0, 14)) {
    const tr = document.createElement("tr");
    cell(tr, d);
    for (const f of SHZ_FEEDS) shareCell(tr, days[d][f].hostile, days[d][f].judged, f);
    dt.append(tr);
  }
  dt.hidden = false;
}

function renderTrend(recs) {
  const note = $("trendNote");
  if (!Object.keys(recs).length) {
    note.textContent = "まだ記録がありません。記録と判定をオンにして、X の「おすすめ」「フォロー中」を普通に眺めると、ここに出ます。";
    $("trendTable").hidden = $("dayTable").hidden = true;
    return;
  }
  renderDays(recs); // 日ごとの表は、直近 14 日の外の記録も含めて出す（最近の 14 日分）
  const from = Date.now() - 14 * 86_400_000;
  const t = shzTally(recs, from);
  if (!SHZ_FEEDS.some((f) => t[f].seen)) {
    note.textContent = "直近 14 日の記録がありません。";
    $("trendTable").hidden = true;
    return;
  }
  const versions = shzVersions(Object.fromEntries(Object.entries(recs).filter(([, r]) => r.ts >= from)));
  note.textContent = diffText(t) + (versions.length > 1 ? ` 判定の版が混ざっています（${versions.join("・")}）。点の付き方が違う記録を一緒に数えています。` : "");
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
  const line = SHZ_FEEDS.map((f) => `${FEED_LABEL[f]} ${tally[f].seen}/${session.targetEach}（判定済み ${tally[f].judged}）`).join("・");
  if (active) {
    prog.textContent = `測定中: ${line}。${done ? "そろいました。「終了して結果を見る」を押してください。" : "X の「おすすめ」「フォロー中」を、それぞれ眺めてください。"}`;
  } else {
    const unjudged = SHZ_FEEDS.reduce((n, f) => n + tally[f].seen - tally[f].judged, 0);
    prog.textContent = `前回の測定: ${line}。${unjudged ? `判定されていない記録が ${unjudged} 件あります（組み込み AI が使えなかったか、判定の前に終えました）。記録をオンにすると、X のページを開いている間に続きを判定します。` : ""}`;
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
  say("記録をすべて消しました（判定済みの点も消えました）");
});
$("recStrip").addEventListener("click", async () => {
  await chrome.storage.local.set({ textClearedAt: Date.now() }); // 先に伝える（開いている X のタブの保存待ちと、判定の最中の書き込みが、本文を戻さないように）
  await shzApplyPurge(0); // 判定済みは本文を消して点を残す。未判定は記録ごと消える
  await render();
  say("本文を消しました（判定済みの点は残っています。判定前の記録は消えました）");
});

$("sessStart").addEventListener("click", async () => {
  const { recordEnabled } = await chrome.storage.local.get({ recordEnabled: false });
  await chrome.storage.local.set({ session: { start: Date.now(), targetEach: SESSION_TARGET, prev: recordEnabled === true }, recordEnabled: true });
  say("測定を始めました。X の「おすすめ」「フォロー中」を、それぞれ眺めてください");
});
$("sessEnd").addEventListener("click", async () => {
  const { session } = await chrome.storage.local.get({ session: null });
  if (!session || session.end) return;
  await chrome.storage.local.set({ session: { ...session, end: Date.now() }, recordEnabled: session.prev === true });
  say(session.prev === true ? "測定を終えました（記録は引き続きオンです）" : "測定を終えました（記録は元どおりオフに戻しました）");
});

chrome.storage.onChanged.addListener((c, area) => { if (area === "local") scheduleRender(); });
shzApplyPurge().then(render); // 期限の来た記録を片付ける。オフのままでも、設定画面を開いたときに行う
