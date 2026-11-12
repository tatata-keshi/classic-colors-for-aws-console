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
  [class*="phdNotificationDot"],
  [class*="awsui_button-trigger"], [class*="awsui_segment"]
) {
  color: #ffffff !important;
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
:is(button, a)[class*="awsui_button_"][class*="awsui_variant-primary_"] {
  background-color: var(--acc-primary) !important;
  border-color: var(--acc-primary) !important;
  color: #ffffff !important;
}
:is(button, a)[class*="awsui_button_"][class*="awsui_variant-primary_"]:hover {
  background-color: var(--acc-primary-hover) !important;
  border-color: var(--acc-primary-hover) !important;
}
:is(button, a)[class*="awsui_button_"][class*="awsui_variant-primary_"]:active {
  background-color: var(--acc-primary-active) !important;
  border-color: var(--acc-primary-active) !important;
}
:is(button, a)[class*="awsui_button_"][class*="awsui_variant-primary_"] * {
  color: #ffffff !important;
}
button[class*="awsui_button_"][class*="awsui_variant-primary_"]:is([class*="awsui_disabled_"], :disabled) {
  background-color: #e9ebed !important;
  border-color: #e9ebed !important;
  color: #9ba7b6 !important;
}`);

  return parts.join("\n");
}

function apply(settings) {
  const s = { ...DEFAULTS, ...settings };
  let el = document.getElementById(STYLE_ID);
  if (!s.enabled) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    (document.head || document.documentElement).appendChild(el);
  }
  el.textContent = buildCss(s);
}

function load() {
  chrome.storage.sync.get(DEFAULTS, apply);
}

load();
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "sync") load();
});

// CI gate test: intentionally broken
var unusedTestValue = 1
