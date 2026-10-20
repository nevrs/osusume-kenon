// 送る前の一呼吸（DESIGN.md D5 の a・D7）。
// 入力が止まったら下書きを判定しておき、送信（ボタン・Ctrl+Enter）の時点で、今の下書きが「攻撃」と分かっているときだけ、その 1 回を止める。
// 拡張は送信しない。本人がもう一度押せば X がふつうに送る（D3）。
// 設定でオンにしたときだけ動く（初期値はオフ。DESIGN.md D7）。オフのあいだは下書きを読まず、判定もしない。

let shzPauseOn = false;
chrome.storage.local.get({ pauseEnabled: false }, (v) => { shzPauseOn = v.pauseEnabled === true; });
chrome.storage.onChanged.addListener((c, area) => {
  if (area === "local" && c.pauseEnabled) shzPauseOn = c.pauseEnabled.newValue === true;
  if (!shzPauseOn) shzClosePause?.();
});

const SHZ_IDLE_MS = 1200; // 入力が止まってから判定するまで
const shzStates = new WeakMap(); // 入力欄 → {text, result, passed, timer}

const shzText = (composer) => (composer.innerText ?? composer.textContent).replace(/\s+/g, " ").trim();

function shzStateOf(composer) {
  let s = shzStates.get(composer);
  if (!s) shzStates.set(composer, (s = { text: null, result: null, passed: null, timer: 0 }));
  return s;
}

// 入力が止まったら判定する。結果が返ったときに下書きが変わっていれば捨てる
document.addEventListener("input", (e) => {
  if (!shzPauseOn) return;
  const composer = e.target.closest?.(X_DOM.composer);
  if (!composer) return;
  const s = shzStateOf(composer);
  clearTimeout(s.timer);
  s.timer = setTimeout(async () => {
    const text = shzText(composer);
    if (!text) return;
    const result = await shzJudge(text);
    if (shzText(composer) !== text) return;
    s.text = text;
    s.result = result;
  }, SHZ_IDLE_MS);
}, true);

// 送信ボタンに対応する入力欄: ボタンから上にたどって、入力欄を含む最初の要素の中の入力欄すべて（スレッドで複数ある）
function shzComposersFor(button) {
  for (let el = button.parentElement; el; el = el.parentElement) {
    const cs = el.querySelectorAll(X_DOM.composer);
    if (cs.length) return [...cs];
  }
  return [];
}

// 止めるべき入力欄があれば、表示を出せたときだけ止める（表示を出せずに止めると、理由の分からないまま送れなくなる）
function shzMaybePause(e, composers, anchor) {
  if (!shzPauseOn) return;
  const target = composers.find((c) => shzShouldPause(shzStates.get(c), shzText(c)));
  if (!target) {
    shzClosePause(); // 止めずに送る押下。前の表示は役目を終えた
    return;
  }
  let box;
  try {
    box = shzShowPause(anchor, target);
  } catch {
    return;
  }
  e.preventDefault();
  e.stopImmediatePropagation();
  shzStates.get(target).passed = shzText(target);
  box.focus();
}

document.addEventListener("click", (e) => {
  const button = e.target.closest?.(X_DOM.sendButton);
  if (button) shzMaybePause(e, shzComposersFor(button), button);
}, true);

document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey)) return;
  const composer = e.target.closest?.(X_DOM.composer);
  if (composer) shzMaybePause(e, [composer], composer);
}, true);

let shzWatch = 0; // 入力欄が消えた（送信して窓が閉じた等）ら表示も消す

function shzClosePause() {
  clearInterval(shzWatch);
  document.getElementById("shizume-pause")?.remove();
}

// 一呼吸の表示。止める言い方はせず、仕組みを伝えて、送るかどうかは本人に任せる（D7）。
// innerHTML は使わない（ページが Trusted Types を強制していても作れるように）
function shzShowPause(anchor, composer) {
  shzClosePause();
  const el = (tag, text, style) => {
    const n = document.createElement(tag);
    if (text) n.textContent = text;
    if (style) Object.assign(n.style, style);
    return n;
  };
  const box = el("div", null, {
    position: "fixed", zIndex: 2147483647, width: "min(360px, calc(100vw - 16px))", boxSizing: "border-box", padding: "12px 14px",
    borderRadius: "12px", background: "#1d2a35", color: "#fff", font: "14px/1.6 system-ui, sans-serif", boxShadow: "0 4px 16px rgba(0,0,0,.35)",
  });
  box.id = "shizume-pause";
  box.tabIndex = -1;
  box.setAttribute("role", "alertdialog");
  box.setAttribute("aria-label", "送る前に一呼吸");
  const p = { margin: "6px 0" };
  box.append(
    el("strong", "送る前に一呼吸"),
    el("p", "この下書きには、相手を攻撃していると読める言葉があります（端末の中の AI の判定です。誤ることもあります）。", p),
    el("p", "X は、返信や引用を「いいね」よりずっと重く数えます。怒りの返信も同じように数えられ、相手の投稿を広げます。", p),
    el("p", "このまま送るなら、もう一度送信を押してください。", p),
  );
  const edit = el("button", "書き直す", { marginTop: "4px", padding: "4px 12px", borderRadius: "999px", border: "0", cursor: "pointer" });
  edit.type = "button";
  edit.dataset.act = "edit";
  edit.addEventListener("click", () => {
    shzClosePause();
    composer.focus();
  });
  box.append(edit);
  document.body.append(box);

  // 置き場所: 押した場所の上。上に入らなければ下。どちらにしても画面の中に収める
  const r = anchor.getBoundingClientRect();
  const h = box.offsetHeight, w = box.offsetWidth;
  let top = r.top - h - 8;
  if (top < 8) top = r.bottom + 8;
  box.style.top = `${Math.max(8, Math.min(top, innerHeight - h - 8))}px`;
  box.style.left = `${Math.max(8, Math.min(r.right - w, innerWidth - w - 8))}px`;

  composer.addEventListener("input", shzClosePause, { once: true }); // 書き換えたら表示は古い
  shzWatch = setInterval(() => { if (!composer.isConnected) shzClosePause(); }, 1000);
  return box;
}
