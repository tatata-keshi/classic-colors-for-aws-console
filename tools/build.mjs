#!/usr/bin/env node
// ストアにアップロードする ZIP を作る。
// 同梱するファイルは SHIP に明示する。manifest が参照しているのに
// SHIP に無いファイルがあれば失敗するので、アイコン追加時の入れ忘れを防げる。
// 実行: node tools/build.mjs

import { readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** ZIP に入れるファイル。ここに無いものは配布物に含まれない。 */
const SHIP = [
  "manifest.json",
  "content.js",
  "popup.html",
  "popup.js",
  "icons/icon16.png",
  "icons/icon32.png",
  "icons/icon48.png",
  "icons/icon128.png",
];

const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));

// SHIP のファイルが実在するか
const missing = SHIP.filter((p) => !existsSync(join(ROOT, p)));
if (missing.length > 0) {
  console.error(`✗ 同梱対象のファイルがありません:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}

// manifest と popup.html が参照しているファイルが SHIP に入っているか
const referenced = new Set([
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
  ...(manifest.action?.default_popup ? [manifest.action.default_popup] : []),
  ...(manifest.content_scripts ?? []).flatMap((cs) => [...(cs.js ?? []), ...(cs.css ?? [])]),
]);

const popup = manifest.action?.default_popup;
if (popup && existsSync(join(ROOT, popup))) {
  const html = readFileSync(join(ROOT, popup), "utf8");
  for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
    if (/^(https?:|data:|#|mailto:)/.test(m[1])) continue;
    referenced.add(normalize(join(dirname(popup), m[1])));
  }
}

const unshipped = [...referenced].filter((p) => !SHIP.includes(p));
if (unshipped.length > 0) {
  console.error(
    `✗ 参照されているのに SHIP に入っていません。tools/build.mjs に追加してください:\n  ${unshipped.join("\n  ")}`,
  );
  process.exit(1);
}

// --- ZIP 作成 ---------------------------------------------------------------

const outDir = join(ROOT, "dist");
const name = `classic-colors-for-aws-console-${manifest.version}.zip`;
const outPath = join(outDir, name);

rmSync(outPath, { force: true });
mkdirSync(outDir, { recursive: true });

execFileSync("zip", ["-q", "-X", "-9", outPath, ...SHIP], { cwd: ROOT, stdio: "inherit" });

// 中身が SHIP と完全に一致するか確認する
const listed = execFileSync("zip", ["-sf", outPath], { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.endsWith(":") && !l.startsWith("Total"));

const extra = listed.filter((p) => !SHIP.includes(p));
if (extra.length > 0) {
  console.error(`✗ 想定外のファイルが ZIP に含まれています:\n  ${extra.join("\n  ")}`);
  process.exit(1);
}
if (listed.length !== SHIP.length) {
  console.error(`✗ ZIP の中身が ${listed.length} 件で、想定の ${SHIP.length} 件と一致しません`);
  process.exit(1);
}

console.log(`✓ dist/${name} (${SHIP.length} ファイル)`);
