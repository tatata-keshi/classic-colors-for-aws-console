// Classic Colors for AWS Console - content script
// 設定(chrome.storage.sync)に応じて <style> を差し込み/更新/削除する。

const DEFAULTS = {
  enabled: true,
  header: true,
  links: true,
  buttons: true,
  navColor: "#232f3e",
  linkColor: "#295eff",
  primaryColor: "#ec7211"
};

const STYLE_ID = "aws-console-classic-colors";
// プライマリボタン。Cloudscape のリンク(Link)も内部で awsui_button_ と
// awsui_variant-primary_ を持つため、リンク側のクラス(先頭の awsui_link_ と
// フォントサイズ指定)が付いているものは除外して誤爆を防ぐ。
const PRIMARY_BUTTON = ':is(button, a)[class*="awsui_button_"][class*="awsui_variant-primary_"]' +
  ':not([class^="awsui_link_"], [class*="awsui_font-size-"])';
const HEADER_ID = "awsc-nav-header";
// ヘッダー内で背景が明るい領域(ツールチップ等)に付ける目印。
const LIGHT_ATTR = "data-acc-light";
// 明るい領域で使う本文色(AWS コンソールのライトテーマの文字色)。
const LIGHT_AREA_TEXT = "#0f141a";

function buildCss(s) {
  const parts = [`
:root {
  --acc-nav: ${s.navColor};
  --acc-nav-input: color-mix(in srgb, ${s.navColor} 55%, black);
  --acc-link: ${s.linkColor};
  --acc-link-hover: color-mix(in srgb, ${s.linkColor} 60%, black);
  --acc-primary: ${s.primaryColor};
  --acc-primary-hover: color-mix(in srgb, ${s.primaryColor} 88%, black);
  --acc-primary-active: color-mix(in srgb, ${s.primaryColor} 78%, black);
}`];

  if (s.header) parts.push(`
/* ヘッダー: 背景を塗っているのは header 内の <nav> */
#awsc-nav-header nav:not([class*="dropdown-content"] nav, [class*="search-"] nav) {
  background-color: var(--acc-nav) !important;
}
#awsc-nav-header nav :is(span, a, button, div, p, kbd, label):not(
  [class*="dropdown-content"], [class*="dropdown-content"] *,
  [class*="search-"], [class*="search-"] *,
  [class*="globalNav-0262"], [class*="globalNav-0262"] *,
  [${LIGHT_ATTR}], [${LIGHT_ATTR}] *,
  [class*="phdNotificationDot"],
  [class*="awsui_button-trigger"], [class*="awsui_segment"]
) {
  color: #ffffff !important;
}
/* 背景が明るい領域(ツールチップ・ポップオーバーなど)は文字を白にしない。
   親から白を継承しないよう、ここで本文色を指定し直す。 */
#awsc-nav-header [${LIGHT_ATTR}] {
  color: ${LIGHT_AREA_TEXT} !important;
}
/* ロゴ: 色相を保ったまま明暗だけ反転 */
#awsc-nav-header a[href*="/console/home"] :is(img, svg),
#awsc-nav-header [class*="logo" i] :is(img, svg),
#awsc-nav-header :is(img, svg)[class*="logo" i],
#awsc-nav-header img[alt*="AWS"] {
  filter: invert(1) hue-rotate(180deg) !important;
}
/* 検索ボックス(入力欄のみ) */
#awsc-nav-header input[class*="search-"] {
  background-color: var(--acc-nav-input) !important;
  color: #ffffff !important;
  border-color: #545b64 !important;
}
#awsc-nav-header input[class*="search-"]::placeholder {
  color: #95a5a6 !important;
}`);

  if (s.links) parts.push(`
a[class*="awsui_link_"],
a[class*="awsui_link_"] *,
main a:not([class*="awsui_button_"]):not([role="button"]) {
  color: var(--acc-link) !important;
}
a[class*="awsui_link_"]:hover,
main a:not([class*="awsui_button_"]):not([role="button"]):hover {
  color: var(--acc-link-hover) !important;
}`);

  if (s.buttons) parts.push(`
${PRIMARY_BUTTON} {
  background-color: var(--acc-primary) !important;
  border-color: var(--acc-primary) !important;
  color: #ffffff !important;
}
${PRIMARY_BUTTON}:hover {
  background-color: var(--acc-primary-hover) !important;
  border-color: var(--acc-primary-hover) !important;
}
${PRIMARY_BUTTON}:active {
  background-color: var(--acc-primary-active) !important;
  border-color: var(--acc-primary-active) !important;
}
${PRIMARY_BUTTON} * {
  color: #ffffff !important;
}
${PRIMARY_BUTTON}:is([class*="awsui_disabled_"], :disabled) {
  background-color: #e9ebed !important;
  border-color: #e9ebed !important;
  color: #9ba7b6 !important;
}`);

  return parts.join("\n");
}

// --- ヘッダー内の「明るい背景の領域」を探して目印を付ける ------------------
// ヘッダーの文字は白く塗り替えるが、ツールチップのように白い背景を持つ要素が
// ヘッダーの中に描画されると白地に白文字になってしまう。クラス名は AWS 側の
// 変更で変わるため、実際の背景色を見て判定する。

let headerObserver = null;
let headerWatcher = null;
const pendingRoots = new Set();
let scanScheduled = false;

function parseRgb(value) {
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(value);
  if (!m) return null;
  let alpha = 1;
  if (m[4] !== undefined) {
    alpha = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  }
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: alpha };
}

function hasLightBackground(el) {
  const c = parseRgb(getComputedStyle(el).backgroundColor);
  if (!c || c.a < 0.5) return false;
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255 > 0.6;
}

function markLightAreas(root) {
  const header = document.getElementById(HEADER_ID);
  if (!header || !header.contains(root)) return;
  for (const el of [root, ...root.querySelectorAll("*")]) {
    if (el === header) continue;
    // 既に印の付いた祖先の中なら、その時点で白文字の対象外になっている。
    if (el.parentElement && el.parentElement.closest(`[${LIGHT_ATTR}]`)) {
      el.removeAttribute(LIGHT_ATTR);
      continue;
    }
    if (hasLightBackground(el)) {
      el.setAttribute(LIGHT_ATTR, "");
    } else {
      el.removeAttribute(LIGHT_ATTR);
    }
  }
}

function scheduleScan(root) {
  pendingRoots.add(root);
  if (scanScheduled) return;
  scanScheduled = true;
  requestAnimationFrame(() => {
    scanScheduled = false;
    const roots = [...pendingRoots];
    pendingRoots.clear();
    for (const root of roots) {
      if (root.isConnected) markLightAreas(root);
    }
  });
}

function watchForHeader() {
  if (headerWatcher || !document.documentElement) return;
  headerWatcher = new MutationObserver(() => {
    if (!document.getElementById(HEADER_ID)) return;
    headerWatcher.disconnect();
    headerWatcher = null;
    startLightTracking();
  });
  headerWatcher.observe(document.documentElement, { childList: true, subtree: true });
}

function startLightTracking() {
  if (headerObserver) return;
  const header = document.getElementById(HEADER_ID);
  if (!header) {
    watchForHeader();
    return;
  }
  headerObserver = new MutationObserver((records) => {
    for (const rec of records) {
      if (rec.type === "childList") {
        for (const node of rec.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) scheduleScan(node);
        }
      } else if (rec.target.nodeType === Node.ELEMENT_NODE) {
        scheduleScan(rec.target);
      }
    }
  });
  headerObserver.observe(header, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style"]
  });
  markLightAreas(header);
}

function stopLightTracking() {
  if (headerObserver) {
    headerObserver.disconnect();
    headerObserver = null;
  }
  if (headerWatcher) {
    headerWatcher.disconnect();
    headerWatcher = null;
  }
  pendingRoots.clear();
  for (const el of document.querySelectorAll(`[${LIGHT_ATTR}]`)) {
    el.removeAttribute(LIGHT_ATTR);
  }
}

function apply(settings) {
  const s = { ...DEFAULTS, ...settings };
  let el = document.getElementById(STYLE_ID);
  if (!s.enabled) {
    if (el) el.remove();
    stopLightTracking();
    return;
  }
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    (document.head || document.documentElement).appendChild(el);
  }
  el.textContent = buildCss(s);
  if (s.header) {
    startLightTracking();
  } else {
    stopLightTracking();
  }
}

function load() {
  chrome.storage.sync.get(DEFAULTS, apply);
}

load();
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "sync") load();
});
