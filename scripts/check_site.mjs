import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const html = readFileSync("index.html", "utf8");
const problems = [];

for (const [label, re] of [
  ["<!DOCTYPE html>", /^<!DOCTYPE html>/i],
  ["<title>", /<title>[^<]+<\/title>/],
  ["lang attribute", /<html[^>]*\slang=/],
  ["viewport meta", /<meta[^>]*name="viewport"/],
  ["description meta", /<meta[^>]*name="description"/],
]) {
  if (!re.test(html)) problems.push(`missing ${label}`);
}

const attrs = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]);

const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
for (const a of attrs) {
  if (a.startsWith("#") && a.length > 1 && !ids.has(a.slice(1))) {
    problems.push(`anchor target missing: ${a}`);
  }
}

for (const a of attrs) {
  if (/^(https?:)?\/\//.test(a) || a.startsWith("#") || /^(mailto|data):/.test(a)) continue;
  const path = a.split("#")[0].split("?")[0];
  if (path && !existsSync(resolve(path))) problems.push(`local reference missing: ${a}`);
}

const ext = [...new Set(attrs.filter((a) => /^https?:\/\//.test(a)))];
for (const u of ext) {
  let ok = false;
  let note = "";
  for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
    try {
      const res = await fetch(u, {
        redirect: "follow",
        headers: { "user-agent": "portfolio-ci-linkcheck" },
      });
      const isImg = /\.(png|jpe?g|gif|webp|svg)$/i.test(new URL(u).pathname);
      const type = res.headers.get("content-type") || "";
      if (res.ok && (!isImg || type.startsWith("image/"))) {
        ok = true;
      } else {
        note = `HTTP ${res.status} ${type}`;
      }
    } catch (e) {
      note = String(e).slice(0, 120);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  console.log(`  ${ok ? "ok " : "BAD"} ${u}${ok ? "" : ` (${note})`}`);
  if (!ok) problems.push(`external URL unhealthy: ${u} (${note})`);
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`\nsite integrity ok — ${attrs.length} references checked (${ext.length} external)`);
