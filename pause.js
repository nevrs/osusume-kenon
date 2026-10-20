// 送る前の一呼吸（DESIGN.md D5 の a・D7）。
// 入力が止まったら下書きを判定しておき、送信（ボタン・Ctrl+Enter）の時点で、今の下書きが「攻撃」と分かっているときだけ、その 1 回を止める。
// 拡張は送信しない。本人がもう一度押せば X がふつうに送る（D3）。

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

// 送信ボタンに対応する入力欄: 窓の中ならその窓の、そうでなければボタンから上にたどって最初に見つかる入力欄
function shzComposerFor(button) {
  for (let el = button.parentElement; el; el = el.parentElement) {
    const c = el.querySelector(X_DOM.composer);
    if (c) return c;
  }
  return null;
}

function shzMaybePause(e, composer, anchor) {
  const current = shzText(composer);
  const s = shzStates.get(composer);
  if (!shzShouldPause(s, current)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  s.passed = current;
  shzShowPause(anchor, composer);
}

document.addEventListener("click", (e) => {
  const button = e.target.closest?.(X_DOM.sendButton);
  if (!button) return;
  const composer = shzComposerFor(button);
  if (composer) shzMaybePause(e, composer, button);
}, true);

document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey)) return;
  const composer = e.target.closest?.(X_DOM.composer);
  if (composer) shzMaybePause(e, composer, composer);
}, true);

// 一呼吸の表示。止める言い方はせず、仕組みを伝えて、送るかどうかは本人に任せる（D7）
function shzShowPause(anchor, composer) {
  document.getElementById("shizume-pause")?.remove();
  const box = document.createElement("div");
  box.id = "shizume-pause";
  box.setAttribute("role", "alertdialog");
  box.setAttribute("aria-label", "送る前に一呼吸");
  box.innerHTML = `
    <strong>送る前に一呼吸</strong>
    <p>この下書きには、相手を攻撃していると読める言葉があります（端末の中の AI の判定です。誤ることもあります）。</p>
    <p>X は、返信や引用を「いいね」よりずっと重く数えます。怒りの返信も同じように数えられ、相手の投稿を広げます。</p>
    <p>このまま送るなら、もう一度送信を押してください。</p>
    <button type="button" data-act="edit">書き直す</button>`;
  Object.assign(box.style, {
    position: "fixed", zIndex: 2147483647, maxWidth: "360px", padding: "12px 14px", borderRadius: "12px",
    background: "#1d2a35", color: "#fff", font: "14px/1.6 system-ui, sans-serif", boxShadow: "0 4px 16px rgba(0,0,0,.35)",
  });
  const r = anchor.getBoundingClientRect();
  box.style.left = `${Math.max(8, Math.min(r.right - 360, innerWidth - 368))}px`;
  box.style.bottom = `${Math.max(8, innerHeight - r.top + 8)}px`;
  box.querySelector("[data-act=edit]").addEventListener("click", () => {
    box.remove();
    composer.focus();
  });
  for (const p of box.querySelectorAll("p")) p.style.margin = "6px 0";
  Object.assign(box.querySelector("button").style, { marginTop: "4px", padding: "4px 12px", borderRadius: "999px", border: "0", cursor: "pointer" });
  document.body.append(box);
  // 下書きを書き換えたら、表示は古いので消す
  composer.addEventListener("input", () => box.remove(), { once: true });
}
