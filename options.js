// 設定画面。値は chrome.storage.local（この端末だけ）に置く
const $ = (id) => document.getElementById(id);
let sayTimer = 0;
const say = (t) => { $("saved").textContent = t; clearTimeout(sayTimer); sayTimer = setTimeout(() => { $("saved").textContent = ""; }, 6000); };
const feedLabel = (f) => shzT(f === "for-you" ? "feedForYou" : "feedFollowing");
const SESSION_TARGET = 50; // 測定モードで、それぞれの feed について集める件数

// 文言に差し込む線の数（data-i18n の文で使う。x-counts.js の値）
const LINE_VARS_I18N = { r: SHZ_HEAT.replyMin };
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
  for (const el of document.querySelectorAll("[data-i18n]")) setRich(el, shzT(el.dataset.i18n, LINE_VARS_I18N));
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
// 温度の欄の「測り始める」（D29）。記録の欄のチェックと同じ設定をオンにする（測定中は記録がオンなので、このボタンは出ない）
$("startRec").addEventListener("click", async () => {
  rec.checked = true;
  await chrome.storage.local.set({ recordEnabled: true });
  say(shzT("recOnMsg"));
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

// おすすめとフォロー中の差（見下し・排除のどれかに当てはまる割合。ひとまとめの見下しは見下しに含まれる。D18）の文。比べられないときは理由
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

// ---- 温度をひと目で見る部分（D22）。数字の文と表は今までどおり下に残す ----
const svgNS = "http://www.w3.org/2000/svg";
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const pct1 = (x) => `${(x * 100).toFixed(x > 0 && x < 0.1 ? 1 : 0)}%`;
const pctAxis = (x) => `${+(x * 100).toFixed(1)}%`; // 目盛り（12.5% を 13% と書かない）
const FEEDVAR = { "for-you": "fy", following: "fl" };
const LV_KEY = ["", "thContempt", "thLump", "thExclusion"];

// 見出し: おすすめはフォロー中より熱いか。はっきりした差でなければ、そう書く
function renderHeadline(t) {
  const h = $("heroHeadline"), sub = $("heroSub");
  h.className = "headline";
  if (!t) { h.textContent = shzT("heroEmpty"); sub.textContent = ""; return; }
  const c = shzCompare(t);
  h.textContent = shzT({ need: "heroNeed", higher: "heroHigher", lower: "heroLower", unclear: "heroUnclear" }[c.verdict]);
  if (c.verdict === "higher" || c.verdict === "lower") h.classList.add(c.verdict);
  if (c.verdict === "need") { sub.textContent = shzT("heroNeedSub", { min: SHZ_MIN_N }); return; }
  const d = Math.round(Math.abs(c.diff) * 1000) / 10;
  // 倍率は、はっきり高いときだけ出す（はっきりしない差の倍率は、件数が少ないと大きく揺れて、強く見えすぎる）
  sub.textContent = (c.verdict === "higher" && c.ratio !== null ? shzT("heroRatio", { r: c.ratio.toFixed(1) }) + " · " : "") + (d === 0 ? shzT("diffSame") : shzT(c.diff > 0 ? "heroDiffUp" : "heroDiffDown", { d }));
}

// 2 本の温度計。塗りは段ごと（排除・ひとまとめの見下し・見下し）、細い線は 90% の幅。目盛りは 2 本で共通
function renderGauges(t) {
  const box = $("gauges");
  box.replaceChildren();
  $("legend").hidden = !t;
  if (!t) return;
  const iv = Object.fromEntries(SHZ_FEEDS.map((f) => [f, shzInterval(t[f].any, t[f].judged)]));
  const top = Math.max(0.05, ...SHZ_FEEDS.map((f) => (iv[f] && t[f].judged >= SHZ_MIN_N ? iv[f][1] : 0)));
  const max = Math.ceil(top * 20) / 20; // 5% 刻みで切り上げ
  const W = (x) => `${Math.min(100, (x / max) * 100)}%`;
  for (const f of SHZ_FEEDS) {
    const row = el("div", "gauge");
    row.append(el("span", "name", feedLabel(f)));
    const track = el("div", "track");
    const n = t[f].judged, ok = n >= SHZ_MIN_N;
    if (ok) {
      let x = 0;
      for (const lv of [3, 2, 1]) { // 重い段を左に
        const w = t[f][`lv${lv}`] / n;
        if (!w) continue;
        const s = el("span", "seg");
        s.style.left = W(x); s.style.width = W(w); s.style.background = `var(--${FEEDVAR[f]}${lv})`;
        s.title = `${shzT(LV_KEY[lv])} ${pct1(w)}`;
        track.append(s);
        x += w;
      }
      const b = el("span", "band");
      b.style.left = W(iv[f][0]); b.style.width = `calc(${W(iv[f][1])} - ${W(iv[f][0])})`;
      b.title = `${pct1(iv[f][0])}〜${pct1(iv[f][1])}`;
      track.append(b);
    }
    const val = el("span", "val", ok ? pct1(t[f].any / n) : "—");
    val.append(el("small", "", shzT("gaugeN", { n })));
    row.append(track, val);
    box.append(row);
  }
  const scale = el("div", "scale");
  const ticks = el("span");
  for (const v of [0, max / 2, max]) ticks.append(el("span", "", pctAxis(v)));
  scale.append(el("span"), ticks, el("span"));
  box.append(scale);
}

// 比べる材料がどれだけそろったか（判定済みの件数。SHZ_GOOD_N で「十分」）
function readyRow(label, n, goal) {
  const row = el("div", "ready"), track = el("div", "track"), fill = el("span", n >= goal ? "fill full" : "fill");
  fill.style.width = `${Math.min(100, (n / goal) * 100)}%`;
  track.append(fill);
  row.append(el("span", "", label), track, el("span", n >= goal ? "" : "muted", `${Math.min(n, goal)} / ${goal}`));
  return row;
}
function renderReady(t) {
  const box = $("readyBox"), bars = $("readyBars");
  bars.replaceChildren();
  box.hidden = !t;
  if (!t) return;
  $("readyH").textContent = shzT("readyH", { n: SHZ_GOOD_N });
  for (const f of SHZ_FEEDS) bars.append(readyRow(feedLabel(f), t[f].judged, SHZ_GOOD_N));
}

// 日ごとの推移の線（直近 14 日）。その日の判定済みが CHART_MIN 件に満たない feed は点を打たない（少ない日の割合は大きくぶれる）
const CHART_MIN = 10;
function renderChart(recs) {
  const svg = $("dayChart");
  svg.replaceChildren();
  const days = shzTallyByDay(recs);
  const keys = [];
  for (let i = 13; i >= 0; i--) keys.push(shzDay(Date.now() - i * 86_400_000));
  const pts = Object.fromEntries(SHZ_FEEDS.map((f) => [f, keys.map((d, i) => { const t = days[d]?.[f]; return t && t.judged >= CHART_MIN ? { i, v: t.any / t.judged } : null; }).filter(Boolean)]));
  const any = SHZ_FEEDS.some((f) => pts[f].length);
  $("chartNote").textContent = shzT(any ? "chartNote" : "chartEmpty", { n: CHART_MIN });
  svg.style.display = any ? "" : "none";
  if (!any) return;
  const L = 40, R = 630, T = 10, B = 140;
  const top = Math.max(0.05, ...SHZ_FEEDS.flatMap((f) => pts[f].map((p) => p.v)));
  const max = Math.ceil(top * 20) / 20;
  const X = (i) => L + ((R - L) * i) / 13, Y = (v) => B - ((B - T) * v) / max;
  const add = (tag, attrs, text, parent = svg) => { const e = document.createElementNS(svgNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text !== undefined) e.textContent = text; parent.append(e); return e; };
  for (const v of [0, max / 2, max]) {
    add("line", { x1: L, x2: R, y1: Y(v), y2: Y(v), class: "grid" });
    add("text", { x: L - 6, y: Y(v) + 3, "text-anchor": "end" }, pctAxis(v));
  }
  for (const i of [0, 7, 13]) add("text", { x: X(i), y: B + 16, "text-anchor": i === 0 ? "start" : i === 13 ? "end" : "middle" }, keys[i].slice(5).replace("-", "/"));
  SHZ_FEEDS.forEach((f, k) => {
    const color = `var(--${FEEDVAR[f]})`;
    if (pts[f].length > 1) add("polyline", { points: pts[f].map((p) => `${X(p.i)},${Y(p.v)}`).join(" "), fill: "none", stroke: color, "stroke-width": 2 });
    for (const p of pts[f]) add("title", {}, `${feedLabel(f)} ${keys[p.i]} ${pct1(p.v)}`, add("circle", { cx: X(p.i), cy: Y(p.v), r: 3.5, fill: color }));
    add("rect", { x: L + k * 120, y: B + 28, width: 12, height: 3, fill: color });
    add("text", { x: L + k * 120 + 16, y: B + 32 }, feedLabel(f));
  });
}

// 話題の重なり（D23）。話題ごとに、おすすめとフォロー中の割合を 2 本の棒で並べる。差が偶然で説明しにくい話題に印を付ける
const topicMemo = { sig: "", ov: null };
function renderTopics(recs) {
  const h = $("topicHeadline"), sub = $("topicSub"), rows = $("topicRows");
  rows.replaceChildren();
  h.className = "headline";
  const tt = shzTopicTally(recs, Date.now() - 14 * 86_400_000);
  const sig = JSON.stringify(tt); // 引き直しは件数が多いと 0.1 秒ほどかかるので、数が変わらなければ前の結果を使う（判定が進むたびに描き直すため）
  if (sig !== topicMemo.sig) Object.assign(topicMemo, { sig, ov: shzTopicOverlap(tt) });
  const ov = topicMemo.ov;
  $("topicLegend").hidden = !ov;
  if (!ov) {
    h.textContent = shzT("topicNeed");
    sub.textContent = shzT("topicNeedSub", { min: SHZ_TOPIC_MIN, a: tt["for-you"].n, b: tt.following.n });
    return;
  }
  const o = Math.round(ov.overlap * 100);
  h.textContent = shzT("topicOverlap", { o });
  sub.textContent = shzT(ov.same ? "topicSame" : "topicDiff", { base: Math.round(ov.base * 100) });
  const max = Math.max(...ov.rows.map((r) => Math.max(r.a, r.b)));
  for (const r of ov.rows) {
    const row = el("div", "topic"), pair = el("div", "pair");
    for (const [f, v] of [["for-you", r.a], ["following", r.b]]) {
      const track = el("div", "track"), fill = el("span", "fill");
      fill.style.width = `${(v / max) * 100}%`;
      fill.style.background = `var(--${FEEDVAR[f]})`;
      fill.title = `${feedLabel(f)} ${pct1(v)}`;
      track.append(fill);
      pair.append(track);
    }
    const num = el("span", "num");
    num.append(el("b", "", pct1(r.a)), ` / ${pct1(r.b)}`);
    if (r.mark) num.append(el("div", r.mark > 0 ? "more" : "less", shzT(r.mark > 0 ? "topicMore" : "topicLess")));
    row.append(el("span", "", shzT(`tp_${r.tp}`)), pair, num);
    rows.append(row);
  }
}

// 目立たされる投稿（D25）。返信が多め・大きく広まった投稿の割合を、おすすめとフォロー中で並べる。差がはっきりした行に印を付ける
const ageText = (m) => (m === null ? "—" : m < 60 ? shzT("ageMin", { n: m }) : m < 1440 ? shzT("ageHour", { n: Math.round(m / 60) }) : shzT("ageDay", { n: Math.round(m / 1440) }));
function renderHeat(recs) {
  const h = $("heatHeadline"), sub = $("heatSub"), rows = $("heatRows"), hostile = $("heatHostile"), age = $("heatAge");
  rows.replaceChildren();
  h.className = "headline";
  hostile.textContent = age.textContent = "";
  $("heatRowsNote").textContent = shzT("heatRowsNote", { ...LINE_VARS, v: SHZ_HEAT.reach.toLocaleString() });
  const t = shzHeatTally(recs, Date.now() - 14 * 86_400_000), A = t["for-you"], B = t.following;
  const c = shzCompareCounts(A.heat, A.n, B.heat, B.n);
  $("heatLegend").hidden = c.verdict === "need";
  if (c.verdict === "need") {
    h.textContent = shzT("heatNeed");
    sub.textContent = shzT("heatNeedSub", { min: SHZ_MIN_N, a: A.n, b: B.n });
    return;
  }
  h.textContent = shzT({ higher: "heatHigher", lower: "heatLower", unclear: "heatUnclear" }[c.verdict]);
  if (c.verdict !== "unclear") h.classList.add(c.verdict);
  sub.textContent = shzT("heatSub", { a: pct1(c.a), b: pct1(c.b) });
  const lines = ["heavy", "wide", "heat"].map((k) => ({ k, ...shzCompareCounts(A[k], A.n, B[k], B.n) }));
  const max = Math.max(0.01, ...lines.map((r) => Math.max(r.a, r.b)));
  for (const r of lines) {
    const row = el("div", "topic"), pair = el("div", "pair");
    for (const [f, v] of [["for-you", r.a], ["following", r.b]]) {
      const track = el("div", "track"), fill = el("span", "fill");
      fill.style.width = `${(v / max) * 100}%`;
      fill.style.background = `var(--${FEEDVAR[f]})`;
      fill.title = `${feedLabel(f)} ${pct1(v)}`;
      track.append(fill);
      pair.append(track);
    }
    const num = el("span", "num");
    num.append(el("b", "", pct1(r.a)), ` / ${pct1(r.b)}`);
    if (r.verdict === "higher" || r.verdict === "lower") num.append(el("div", r.verdict === "higher" ? "more" : "less", shzT(r.verdict === "higher" ? "topicMore" : "topicLess")));
    row.append(el("span", "", shzT(`heat_${r.k}`)), pair, num);
    rows.append(row);
  }
  // 目立つ投稿の中の、見下し・排除（2 つの feed を合わせて数える）
  const hj = A.heatJudged + B.heatJudged, ha = A.heatAny + B.heatAny;
  const oj = A.judged + B.judged - hj, oa = A.any + B.any - ha;
  const hc = shzCompareCounts(ha, hj, oa, oj);
  hostile.textContent = hc.verdict === "need" ? shzT("heatHostileNeed", { min: SHZ_MIN_N, a: hj, b: oj }) : shzT("heatHostile", { a: pct1(hc.a), b: pct1(hc.b) }) + shzT(`heatHostile_${hc.verdict}`);
  age.textContent = shzT("heatAge", { a: ageText(A.age), b: ageText(B.age) });
}

// ---- タイムライン温度（D27）。反応の形だけで数え、「学ぶ前の X」の基準（baseline.js）と並べる ----
const DAY = 86_400_000;
const LINE_VARS = { r: SHZ_HEAT.replyMin, p: Math.round(SHZ_TEMP_LINE * 100), n: SHZ_RUN_FIRST, gap: SHZ_RUN_GAP_MS / 60_000 }; // 返信が多めの線の数（文に直書きしない）
const acctName = (a) => (a === null ? shzT("acctUnknown") : `@${a}`);
let tempNow = null; // 共有に使う、いま出しているおすすめの温度 { a, b, n }。比べられないときは null

// 1 本の温度計（塗り 1 色と、90% の幅）。件数が足りなければ「—」。showN が false なら件数を添えない（基準の件数はヘルプにだけ書く。D30）
function tempRow(box, name, hot, n, color, max, showN = true) {
  const row = el("div", "gauge"), track = el("div", "track"), ok = n >= SHZ_MIN_N;
  row.append(el("span", "name", name));
  const W = (x) => `${Math.min(100, (x / max) * 100)}%`;
  if (ok) {
    const s = el("span", "seg");
    s.style.left = "0"; s.style.width = W(hot / n); s.style.background = color;
    track.append(s);
    const iv = shzInterval(hot, n), b = el("span", "band");
    b.style.left = W(iv[0]); b.style.width = `calc(${W(iv[1])} - ${W(iv[0])})`;
    b.title = `${pct1(iv[0])}〜${pct1(iv[1])}`;
    track.append(b);
  }
  const val = el("span", "val", ok ? pct1(hot / n) : "—");
  val.append(el("small", "", showN ? shzT("tempN", { n }) : " ")); // 件数を出さない棒も、行の高さをそろえる
  row.append(track, val);
  box.append(row);
}

// おすすめの温度を「およそ何件に 1 件」で言い換える（割合だけではピンと来ないので）
function tempPlainText(a) {
  if (!(a > 0)) return shzT("tempPlainNone");
  const k = Math.round(1 / a);
  return k <= 1 ? shzT("tempPlainMost") : shzT("tempPlain", { k });
}
// この 7 日と、その前の 7 日のおすすめの温度を比べる（記録は 14 日で消えるので、その中で比べる）
function renderTempWeek(recs) {
  const now = Date.now(), p = $("tempWeek");
  const cur = shzTempTally(recs, now - 7 * DAY)["for-you"], prev = shzTempTally(recs, now - 14 * DAY, now - 7 * DAY - 1)["for-you"];
  const c = shzCompareCounts(cur.hot, cur.n, prev.hot, prev.n);
  p.className = `week ${c.verdict}`;
  p.textContent = c.verdict === "need"
    ? shzT("tempWeekNeed", { min: SHZ_MIN_N, a: cur.n, b: prev.n })
    : shzT({ higher: "tempWeekUp", lower: "tempWeekDown", unclear: "tempWeekSame" }[c.verdict], { a: pct1(c.a), b: pct1(c.b) });
}

function renderTemp(recs, allRecs, accts, recording) {
  const B = shzBaseline(), from = Date.now() - 14 * DAY;
  const t = shzTempTally(recs, from), A = t["for-you"], F = t.following;
  const h = $("tempHeadline"), sub = $("tempSub"), box = $("tempGauges");
  h.className = "headline";
  setRich($("tempFoot"), shzT("tempFoot"));
  // 基準のデータ（どこで数えたかと件数）は、ヘルプにだけ書く（D30。温度の欄は「目安」と「押し上げた量ではない」だけ）
  setRich($("helpBase"), shzT("helpBase", { n: B.n }));
  $("tempDef").textContent = shzT("tempDef", LINE_VARS);
  const c = shzCompareCounts(A.hot, A.n, B.hot, B.n);
  tempNow = c.verdict === "need" ? null : { a: c.a, b: c.b, n: A.n };
  $("shareX").disabled = $("shareImg").disabled = !tempNow;
  $("tempPlain").hidden = !tempNow;
  if (tempNow) $("tempPlain").textContent = tempPlainText(tempNow.a);
  renderTempWeek(recs);
  // 温度がまだ出ないとき: 記録がオフなら「測り始める」を出し、オンなら、あと何件かと X を開くリンクを出す（D29）
  $("tempStart").hidden = c.verdict !== "need" || recording;
  $("tempGo").hidden = c.verdict !== "need" || !recording;
  $("tempWeek").hidden = c.verdict === "need"; // 14 日で足りないうちは、7 日ずつの比べも出せない（件数の行が並ぶだけになる）
  if (c.verdict === "need") {
    h.textContent = shzT(recording ? "tempNeed" : "tempNeedOff");
    sub.textContent = recording ? shzT("tempNeedSub", { left: SHZ_MIN_N - A.n, n: A.n }) : "";
  } else {
    h.textContent = shzT({ higher: "tempHigher", lower: "tempLower", unclear: "tempUnclear" }[c.verdict]);
    if (c.verdict !== "unclear") h.classList.add(c.verdict);
    sub.textContent = shzT("tempSub", { a: pct1(c.a), b: pct1(c.b) }) + (F.n >= SHZ_MIN_N ? shzT("tempSubFl", { c: pct1(F.hot / F.n) }) : "");
  }
  // 目盛りは 3 本（おすすめ・基準・フォロー中）と、アカウントどうしの行で共通。幅の上の端まで入るよう、10% 刻みで切り上げる
  const rows = [[shzT("feedForYou"), A.hot, A.n, "var(--fy)"], [shzT("tempBase"), B.hot, B.n, "var(--base)", false], [shzT("feedFollowing"), F.hot, F.n, "var(--fl)"]];
  const others = shzManyAccts(accts) ? accts.map(({ acct }) => [acctName(acct), shzTempTally(shzOfAcct(allRecs, acct), from)["for-you"]]) : [];
  const tops = [...rows.map(([, k, n]) => (n >= SHZ_MIN_N ? shzInterval(k, n)[1] : 0)), ...others.map(([, o]) => (o.n >= SHZ_MIN_N ? shzInterval(o.hot, o.n)[1] : 0))];
  const max = Math.max(0.1, Math.ceil(Math.max(...tops) * 10) / 10);
  box.replaceChildren();
  for (const [name, k, n, color, showN] of rows) tempRow(box, name, k, n, color, max, showN);
  const scale = el("div", "scale"), ticks = el("span");
  for (const v of [0, max / 2, max]) ticks.append(el("span", "", pctAxis(v)));
  scale.append(el("span"), ticks, el("span"));
  box.append(scale);
  const list = $("tempAcctRows");
  list.replaceChildren();
  $("tempAccts").hidden = !others.length;
  for (const [name, o] of others) tempRow(list, name, o.hot, o.n, "var(--fy)", max);
}

// X で共有（D27）: 文は X の投稿画面に入れるだけ。投稿は本人が押す。アカウント名は入れない
$("shareX").addEventListener("click", () => {
  if (!tempNow) return;
  const text = shzT("shareText", { a: pct1(tempNow.a), b: pct1(tempNow.b) });
  window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  say(shzT("shareOpened"));
});
// 画像（1200×630）: おすすめの温度と基準の 2 本の棒。アカウント名は入れない
function shareImage() {
  const B = shzBaseline(), W = 1200, H = 630, cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d"), font = (px, bold) => `${bold ? 700 : 400} ${px}px system-ui, sans-serif`;
  g.fillStyle = "#f4f6f8"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#1d2a35"; g.font = font(44, true); g.fillText(shzT("imgTitle"), 72, 110);
  g.fillStyle = "#66727e"; g.font = font(26); g.fillText(shzT("imgSub", { n: tempNow.n }), 72, 156);
  g.fillStyle = "#c9533d"; g.font = font(140, true); g.fillText(pct1(tempNow.a), 72, 320);
  const max = Math.max(0.1, Math.ceil(Math.max(tempNow.a, tempNow.b) * 10) / 10);
  const bar = (y, label, v, color) => {
    g.fillStyle = "#1d2a35"; g.font = font(26, true); g.fillText(label, 72, y - 12);
    g.fillStyle = "#eceff2"; g.fillRect(72, y, 900, 36);
    g.fillStyle = color; g.fillRect(72, y, (900 * v) / max, 36);
    g.fillStyle = "#1d2a35"; g.font = font(30, true); g.fillText(pct1(v), 996, y + 30);
  };
  bar(400, shzT("imgForYou"), tempNow.a, "#c9533d");
  bar(490, shzT("imgBase"), tempNow.b, "#8b939b");
  g.fillStyle = "#66727e"; g.font = font(22);
  g.fillText(shzT("imgDef", LINE_VARS), 72, 560);
  g.fillText(shzT("imgBaseNote"), 72, 590);
  g.fillText(`Timeline Checker for X · ${shzDay(Date.now())}`, 72, 620);
  return cv;
}
$("shareImg").addEventListener("click", () => {
  if (!tempNow) return;
  shareImage().toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `timeline-temperature-${shzDay(Date.now())}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    say(shzT("shareSaved"));
  }, "image/png");
});

function renderHero(t) {
  renderHeadline(t);
  renderGauges(t);
  renderReady(t);
}

function renderTrend(recs) {
  const note = $("trendNote");
  renderChart(recs);
  renderTopics(recs);
  renderHeat(recs);
  if (!Object.keys(recs).length) {
    note.textContent = shzT("trendEmpty");
    $("trendTable").hidden = $("dayTable").hidden = true;
    renderHero(null);
    return;
  }
  renderDays(recs); // 日ごとの表は、直近 14 日の外の記録も含めて出す（最近の 14 日分）
  const from = Date.now() - 14 * 86_400_000;
  const t = shzTally(recs, from);
  if (!SHZ_FEEDS.some((f) => t[f].seen)) {
    note.textContent = shzT("trendNone14");
    $("trendTable").hidden = true;
    renderHero(null);
    return;
  }
  renderHero(t);
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
  $("sessBars").replaceChildren();
  if (!session) { prog.textContent = ""; return; }
  const { tally, done } = shzSessionProgress(recs, session);
  if (active) for (const f of SHZ_FEEDS) $("sessBars").append(readyRow(feedLabel(f), tally[f].seen, session.targetEach)); // 集まり具合の棒
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

// アカウント（D27）。いま見ているアカウント（undefined = まだ選んでいない。X で最後に見たアカウント acctLast を初めに選ぶ）
let viewAcct;
let acctList = [];
// @名の分かるアカウントが 2 つ以上あるときだけ、そのアカウントの記録に絞る。1 つ以下なら、アカウント不明（0.16.0 より前と、@名を読めなかったもの）の記録も一緒に数える
// （前の版から上げた人の記録を、上げた直後から「不明」に分けて見えなくしない。2 つ以上なら、不明は選び欄の 1 つになる）
const shzManyAccts = (accts) => accts.filter((a) => a.acct !== null).length > 1;
const acctFilter = (recs) => (shzManyAccts(acctList) ? shzOfAcct(recs, viewAcct) : recs);
function renderAcct(accts, last) {
  acctList = accts;
  if (!accts.some((a) => a.acct === viewAcct)) viewAcct = accts.some((a) => a.acct === last) ? last : accts[0]?.acct ?? null;
  const many = shzManyAccts(accts), sel = $("acctSel");
  $("acctBar").hidden = !many;
  sel.replaceChildren(...accts.map(({ acct, count }) => { const o = document.createElement("option"); o.value = acct ?? ""; o.textContent = `${acctName(acct)}（${count}）`; o.selected = acct === viewAcct; return o; }));
  const del = $("recAcctDelete");
  del.hidden = !many;
  del.textContent = shzT("recAcctDelete", { acct: acctName(viewAcct) });
}
$("acctSel").addEventListener("change", () => {
  viewAcct = $("acctSel").value || null;
  render();
  drawSample();
});

let renderSeq = 0, renderTimer = 0;
function scheduleRender() { // 判定が進むたびに書き換えが続くので、まとめて描く
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 250);
}
async function render() {
  const my = ++renderSeq;
  const all = await chrome.storage.local.get(null);
  if (my !== renderSeq) return; // 後から始めた読み出しがあるので、古いほうは描かない
  const allRecs = Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith("rec:")));
  const accts = shzAccounts(allRecs);
  renderAcct(accts, all.acctLast ?? null);
  const recs = acctFilter(allRecs);
  renderCount(allRecs);
  renderTemp(recs, allRecs, accts, all.recordEnabled === true);
  renderTrend(recs);
  renderSession(all.session ?? null, recs);
  renderFoldToday(all.heatFoldDay);
}

// たたむ（D25）。設定と、今日たたんだ件数
const foldOn = $("heatFoldEnabled"), foldRowdy = $("foldRowdy"), foldWide = $("foldWide"), foldLine = $("foldLine");
function showFoldSettings(v) {
  foldOn.checked = v.heatFoldEnabled === true;
  foldRowdy.checked = v.heatFoldRules?.rowdy !== false; // fold.js と同じ初期値（荒れているはオン、大きく広まったはオフ）
  foldWide.checked = v.heatFoldRules?.wide === true;
  foldLine.value = String(SHZ_FOLD_LINES.includes(v.heatFoldRules?.line) ? v.heatFoldRules.line : SHZ_FOLD_LINES[0]); // 初めは 3%（D27）
}
chrome.storage.local.get({ heatFoldEnabled: false, heatFoldRules: null }, showFoldSettings);
foldOn.addEventListener("change", async () => {
  await chrome.storage.local.set({ heatFoldEnabled: foldOn.checked });
  say(shzT(foldOn.checked ? "foldOnMsg" : "foldOffMsg"));
});
for (const box of [foldRowdy, foldWide, foldLine]) box.addEventListener("change", () => chrome.storage.local.set({ heatFoldRules: { rowdy: foldRowdy.checked, wide: foldWide.checked, line: Number(foldLine.value) } }));
function renderFoldToday(v) {
  const today = shzDay(Date.now());
  const d = v?.d === today ? v : { n: 0, o: 0 };
  $("foldToday").textContent = shzT("foldToday", { n: d.n || 0, o: d.o || 0 });
}

$("recDelete").addEventListener("click", async () => {
  // 開いている X のタブにも伝える（まだ保存していない分と「記録済み」の覚えを捨てさせる）。先に伝えてから消す
  await chrome.storage.local.set({ recordClearedAt: Date.now() });
  const all = await chrome.storage.local.get(null);
  await chrome.storage.local.remove([...Object.keys(all).filter((k) => k.startsWith("rec:")), "acctLast", "acctClearedAt"]); // @名の残る印も消す（D27）
  await render();
  await drawSample(); // 消した本文を見本の欄（とコピー）に残さない
  say(shzT("deleted"));
});
$("recAcctDelete").addEventListener("click", async () => {
  const acct = viewAcct ?? null;
  // 開いている X のタブと、判定の最中の書き込みにも伝える（先に伝えてから消す。「すべて消す」と同じ順）
  await chrome.storage.local.set({ acctClearedAt: { acct, at: Date.now() } });
  const all = await chrome.storage.local.get(null);
  await chrome.storage.local.remove(Object.keys(all).filter((k) => k.startsWith("rec:") && shzAcctOf(all[k]) === acct));
  viewAcct = undefined;
  await render();
  await drawSample();
  say(shzT("acctDeleted", { acct: acctName(acct) }));
});
$("recStrip").addEventListener("click", async () => {
  await chrome.storage.local.set({ textClearedAt: Date.now() }); // 先に伝える（開いている X のタブの保存待ちと、判定の最中の書き込みが、本文を戻さないように）
  await shzApplyPurge(0); // 判定済みは本文を消して点を残す。未判定は記録ごと消える
  await render();
  await drawSample(); // 消した本文を見本の欄（とコピー）に残さない
  say(shzT("stripped"));
});

// 本文の書き出し（本人の判断。2026-10-24）: 実際の投稿で判定の精度を測るため。押したときだけ、この端末にファイルを保存する
$("recExport").addEventListener("click", async () => {
  const all = await chrome.storage.local.get(null);
  const rows = shzExportRows(Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith("rec:"))));
  if (!rows.length) { say(shzT("recExportNone")); return; }
  const body = { app: "osusume-kenon", version: chrome.runtime?.getManifest?.().version ?? "?", exported: shzDay(Date.now()), rows };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(body, null, 1)], { type: "application/json" }));
  a.download = `osusume-kenon-${body.exported}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  say(shzT("recExported").replace("{n}", rows.length));
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
// ひとまとめの見下しは見下しを含むので、両方そろったら「ひとまとめの見下し」だけを出す（D18）
const sampleHits = (r) => [[shzLumpHit(r), "thLump"], [r.c && !shzLumpHit(r), "thContempt"], [r.x, "thExclusion"]].filter(([on]) => on).map(([, key]) => shzT(key));
async function drawSample(repick = true) {
  const box = $("sampleBox");
  $("sampleHit").textContent = shzT(sampleHit ? "sampleRandom" : "sampleHitOnly");
  if (!box.open) return;
  if (repick || !samplePicks) {
    const all = await chrome.storage.local.get(null);
    const recs = Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith("rec:")));
    samplePicks = shzSample(acctFilter(recs), { n: 10, hitOnly: sampleHit, fromTs: Date.now() - SHZ_KEEP_DAYS * 86_400_000 });
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
    meta.append(`${sampleHead(r)}${r.au ? ` · @${r.au}` : ""} · `); // 投稿者は表示だけ（コピーには入れない。D27）
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
