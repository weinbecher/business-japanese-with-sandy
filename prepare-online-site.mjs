import assert from "node:assert/strict";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A separate Sites checkout keeps the existing private GitHub history intact.
// Only these website files may be copied; never copy the project recursively.
const root = path.dirname(fileURLToPath(import.meta.url));
const checkout = path.join(root, "online-site");
const dist = path.join(checkout, "dist");
const pages = [
  "home.html", "index.html", "conversations.html", "vocab.html", "grammar.html",
  "grammar-quiz.html", "mistakes.html", "shadow-words.html", "tag.html",
  "textbook.html", "login.html",
];
const assets = [
  "app.js", "app.css", "data.js", "vocab.js", "dialogues.js", "traps.js",
  "mic-worklet.js", "sandy-green-eyes.png", "sandy-meow-1.wav", "sandy-purr-1.wav",
].map(name => `assets/${name}`);
const files = [...pages, ...assets];
const allowed = new Set(files);
const manifest = JSON.parse(readFileSync(path.join(checkout, ".openai/hosting.json"), "utf8"));
assert.ok(manifest.project_id, "Register and persist the Site identity before preparing it.");
assert.equal(manifest.static?.directory, "dist");

function checkExisting(directory, prefix = "") {
  if (!existsSync(directory)) return;
  assert.ok(lstatSync(directory).isDirectory(), "Static output must be a real directory.");
  for (const name of readdirSync(directory)) {
    const relative = prefix + name;
    const absolute = path.join(directory, name);
    const info = lstatSync(absolute);
    assert.ok(!info.isSymbolicLink(), `Refusing to publish a symlink: ${relative}`);
    if (info.isDirectory()) {
      assert.equal(relative, "assets", `Unexpected output directory: ${relative}`);
      checkExisting(absolute, "assets/");
    } else {
      assert.ok(info.isFile() && allowed.has(relative), `Unexpected output file: ${relative}`);
    }
  }
}
checkExisting(dist);
mkdirSync(path.join(dist, "assets"), { recursive: true });
for (const relative of files) {
  const source = path.join(root, relative);
  assert.ok(lstatSync(source).isFile(), `Website source must be a regular file: ${relative}`);
  copyFileSync(source, path.join(dist, relative));
}

// Catch broken local links before an upload. The original route names stay intact.
for (const page of pages) {
  const html = readFileSync(path.join(dist, page), "utf8");
  for (const [, reference] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (/^(?:https?:|data:|#)/i.test(reference)) continue;
    const file = reference.split(/[?#]/)[0];
    assert.ok(allowed.has(file), `${page}: unlisted or missing local link ${reference}`);
  }
}
console.log(`Prepared ${pages.length} pages and ${assets.length} assets. No PDF, model, recordings, backups or secrets were copied.`);
