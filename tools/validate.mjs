#!/usr/bin/env node
// 拡張機能の静的検証。manifest の妥当性と、manifest / popup.html が
// 参照しているファイルが実在するかを確認する。
// 実行: node tools/validate.mjs

import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const warnings = [];

const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

const abs = (p) => join(ROOT, p);
const exists = (p) => existsSync(abs(p)) && statSync(abs(p)).isFile();

/** PNG の IHDR から幅と高さを読む。 */
function pngSize(path) {
  const buf = readFileSync(abs(path));
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(sig)) return null;
  if (buf.subarray(12, 16).toString("latin1") !== "IHDR") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// --- manifest.json ---------------------------------------------------------

let manifest;
try {
  manifest = JSON.parse(readFileSync(abs("manifest.json"), "utf8"));
} catch (e) {
  console.error(`✗ manifest.json をパースできません: ${e.message}`);
  process.exit(1);
}

if (manifest.manifest_version !== 3) {
  fail(`manifest_version は 3 である必要があります (現在: ${manifest.manifest_version})`);
}

if (!manifest.name) fail("name が空です");
else if (manifest.name.length > 75) fail(`name が 75 文字を超えています (${manifest.name.length})`);

if (!manifest.description) fail("description が空です");
else if (manifest.description.length > 132) {
  fail(`description が 132 文字を超えています (${manifest.description.length})`);
}

// Chrome のバージョン表記は 1〜4 個の 0〜65535 の整数をドットで繋いだもの。
if (!/^\d{1,5}(\.\d{1,5}){0,3}$/.test(manifest.version ?? "")) {
  fail(`version の形式が不正です: ${JSON.stringify(manifest.version)}`);
} else if (manifest.version.split(".").some((n) => Number(n) > 65535)) {
  fail(`version の各要素は 65535 以下である必要があります: ${manifest.version}`);
}

// --- 参照ファイルの実在確認 -------------------------------------------------

/** manifest 内の相対パスを集める。 */
const referenced = new Set();
const addIconSet = (icons, where) => {
  for (const [size, path] of Object.entries(icons ?? {})) {
    referenced.add(path);
    if (!exists(path)) {
      fail(`${where}["${size}"] が指すファイルがありません: ${path}`);
      continue;
    }
    const dim = pngSize(path);
    if (!dim) fail(`${path} が PNG として読めません`);
    else if (dim.width !== Number(size) || dim.height !== Number(size)) {
      fail(`${where}["${size}"] の実寸が ${dim.width}x${dim.height} です: ${path}`);
    }
  }
};

addIconSet(manifest.icons, "icons");
addIconSet(manifest.action?.default_icon, "action.default_icon");

if (manifest.action?.default_popup) {
  referenced.add(manifest.action.default_popup);
  if (!exists(manifest.action.default_popup)) {
    fail(`action.default_popup が指すファイルがありません: ${manifest.action.default_popup}`);
  }
}

for (const [i, cs] of (manifest.content_scripts ?? []).entries()) {
  for (const path of [...(cs.js ?? []), ...(cs.css ?? [])]) {
    referenced.add(path);
    if (!exists(path)) fail(`content_scripts[${i}] が指すファイルがありません: ${path}`);
  }
  for (const pattern of cs.matches ?? []) {
    if (pattern === "<all_urls>" || /^(\*|https?):\/\/\*\/\*$/.test(pattern)) {
      fail(`content_scripts[${i}].matches が広すぎます: ${pattern}`);
    } else if (!pattern.startsWith("https://")) {
      warn(`content_scripts[${i}].matches が https 以外です: ${pattern}`);
    }
  }
}

// popup.html が参照しているローカルファイル
const popup = manifest.action?.default_popup;
if (popup && exists(popup)) {
  const html = readFileSync(abs(popup), "utf8");
  const base = dirname(popup);
  for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
    const ref = m[1];
    if (/^(https?:|data:|#|mailto:)/.test(ref)) continue;
    const resolved = normalize(join(base, ref));
    referenced.add(resolved);
    if (!exists(resolved)) fail(`${popup} が参照するファイルがありません: ${ref}`);
  }
}

// --- プロジェクト固有の検査 -------------------------------------------------

// content.js は color-mix() を使っている。これは Chrome 111 以降の機能なので、
// それ未満でインストールできてしまうと色が一切適用されない。
const contentScripts = (manifest.content_scripts ?? []).flatMap((cs) => cs.js ?? []);
const usesColorMix = contentScripts.some(
  (p) => exists(p) && readFileSync(abs(p), "utf8").includes("color-mix("),
);
if (usesColorMix) {
  const min = Number.parseInt(manifest.minimum_chrome_version ?? "", 10);
  if (!Number.isFinite(min)) {
    fail("color-mix() を使っているので minimum_chrome_version に 111 以上を指定してください");
  } else if (min < 111) {
    fail(`color-mix() は Chrome 111 以降が必要です (minimum_chrome_version: ${min})`);
  }
}

// 権限は最小限か
const KNOWN_PERMISSIONS = new Set(["storage"]);
for (const p of manifest.permissions ?? []) {
  if (!KNOWN_PERMISSIONS.has(p)) {
    warn(`想定外の permission です。審査で理由を問われます: ${p}`);
  }
}
if (manifest.host_permissions?.length) {
  warn("host_permissions が宣言されています。content_scripts.matches で足りるか確認してください");
}

// --- 結果 -------------------------------------------------------------------

for (const w of warnings) console.warn(`⚠ ${w}`);
for (const e of errors) console.error(`✗ ${e}`);

if (errors.length > 0) {
  console.error(`\n${errors.length} 件のエラーがあります。`);
  process.exit(1);
}
console.log(`✓ manifest の検証を通過しました (参照ファイル ${referenced.size} 件を確認)`);
if (warnings.length > 0) console.log(`  警告 ${warnings.length} 件`);
