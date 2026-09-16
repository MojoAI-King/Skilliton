#!/usr/bin/env node
// Tests scripts/setup.mjs (show / --apply / --undo) in temp folders only; the real ~/.claude is never touched.
//   node scripts/setup.test.mjs                 test the shipped setup.mjs
//   node scripts/setup.test.mjs --setup FILE    test another copy (used to prove the regression test fails on old code)
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const SETUP = argv.includes("--setup") ? resolve(argv[argv.indexOf("--setup") + 1]) : join(here, "setup.mjs");
let fails = 0, oks = 0;
const ok = (cond, label) => { if (cond) { oks++; console.log(`ok   ${label}`); } else { fails++; console.log(`FAIL ${label}`); } };

function sandbox(initial) {
  const dir = mkdtempSync(join(tmpdir(), "setup-test-"));
  const settings = join(dir, "claude", "settings.json");
  const backups = join(dir, "claude", "backups", "skillgate");
  mkdirSync(dirname(settings), { recursive: true });
  if (initial != null) writeFileSync(settings, initial);
  const run = (...args) => {
    try {
      const out = execFileSync("node", [SETUP, ...args], { env: { ...process.env, HOME: dir, SKILLGATE_SETTINGS: settings, SKILLGATE_BACKUPS: backups }, stdio: ["ignore", "pipe", "pipe"] }).toString();
      return { code: 0, out };
    } catch (e) { return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
  };
  // json() is null for a missing or unparsable file, so a check reports FAIL instead of the test crashing.
  const json = () => { try { return JSON.parse(readFileSync(settings, "utf8")); } catch { return null; } };
  return { dir, settings, backups, run, json, read: () => readFileSync(settings, "utf8") };
}

console.log(`setup under test: ${SETUP === join(here, "setup.mjs") ? "scripts/setup.mjs (shipped)" : `override: ${SETUP} (NOT the shipped file)`}`);

console.log("\n== show writes nothing");
{
  const original = '{\n  "model": null,\n  "statusLine": { "type": "command", "command": "node old-statusline.mjs" },\n  "permissions": { "allow": ["Bash(ls:*)"] }\n}\n';
  const s = sandbox(original);
  const r = s.run();
  ok(r.code === 0, "show exits 0");
  ok(r.out.includes("an existing statusLine will be replaced"), "show warns that an existing statusLine would be replaced");
  ok(s.read() === original, "settings.json is byte-identical after show");
  ok(!existsSync(s.backups), "show makes no backup");

  console.log("\n== apply, then undo, is byte-identical");
  const a = s.run("--apply");
  ok(a.code === 0, "apply exits 0");
  const after = JSON.parse(s.read());
  ok(typeof after.statusLine?.command === "string" && after.statusLine.command.endsWith("statusline-quota.sh"), "apply sets statusLine to the pack's quota status line");
  ok(JSON.stringify(after.permissions) === JSON.stringify({ allow: ["Bash(ls:*)"] }) && after.model === null, "apply keeps every other key");
  const stamps = existsSync(s.backups) ? readdirSync(s.backups) : [];
  ok(stamps.length === 1 && readFileSync(join(s.backups, stamps[0], "settings.json"), "utf8") === original, "apply made one backup holding the original bytes");
  const again = s.run("--apply");
  ok(again.code === 0 && again.out.includes("already applied"), "a second apply changes nothing and says so");
  const u = s.run("--undo");
  ok(u.code === 0, "undo exits 0");
  ok(s.read() === original, "undo restores settings.json byte for byte");
  rmSync(s.dir, { recursive: true, force: true });
}

console.log("\n== regression: another tool's folder in the shared backup root does not break undo");
{
  // Found 2026-09-16: skillgate harness writes backups under <root>/harness/. "harness" sorts after every
  // ISO timestamp, and setup.mjs took the last name as its newest backup, then refused: "backup .../harness/settings.json missing".
  const original = '{ "theme": "dark" }\n';
  const s = sandbox(original);
  ok(s.run("--apply").code === 0, "apply exits 0");
  mkdirSync(join(s.backups, "harness", "2026-09-16T00-00-00-000Z"), { recursive: true });
  writeFileSync(join(s.backups, "harness", "2026-09-16T00-00-00-000Z", "CLAUDE.md"), "unrelated backup\n");
  const u = s.run("--undo");
  ok(u.code === 0, `undo still exits 0 with a harness/ folder present (got ${u.code}: ${u.out.trim().split("\n").pop()})`);
  ok(s.read() === original, "undo still restores settings.json byte for byte");
  rmSync(s.dir, { recursive: true, force: true });
}

console.log("\n== undo keeps edits made after apply (O5)");
{
  const original = '{\n  "statusLine": { "type": "command", "command": "node old-statusline.mjs" },\n  "theme": "dark"\n}\n';
  const s = sandbox(original);
  ok(s.run("--apply").code === 0, "apply exits 0");
  const applied = s.json();
  writeFileSync(s.settings, JSON.stringify({ ...applied, theme: "light", permissions: { allow: ["Bash(git status:*)"] } }, null, 2) + "\n");
  const u = s.run("--undo");
  const now = s.json();
  ok(u.code === 0 && /put back only statusLine/.test(u.out), `undo after later edits exits 0 and says it kept them (got ${u.code}: ${u.out.trim().split("\n").pop()})`);
  ok(now?.statusLine?.command === "node old-statusline.mjs", "the statusLine from before apply is back");
  ok(now?.theme === "light" && JSON.stringify(now?.permissions) === JSON.stringify({ allow: ["Bash(git status:*)"] }), "the edits made after apply are kept");
  const again = s.run("--undo");
  ok(again.code === 0 && /nothing to undo/.test(again.out), "a second undo changes nothing and says so");
  rmSync(s.dir, { recursive: true, force: true });
}

console.log("\n== undo removes a settings file that apply created (O5)");
{
  const s = sandbox(null);
  ok(s.run("--apply").code === 0 && existsSync(s.settings), "apply creates settings.json when there was none");
  const u = s.run("--undo");
  ok(u.code === 0 && !existsSync(s.settings), `undo removes the file it created instead of leaving an empty one (got ${u.code}: ${u.out.trim().split("\n").pop()})`);
  ok(s.run("--undo").code === 0, "a second undo exits 0");
  const t = sandbox(null);
  t.run("--apply");
  writeFileSync(t.settings, JSON.stringify({ ...t.json(), theme: "dark" }, null, 2) + "\n");
  const tu = t.run("--undo");
  ok(tu.code === 0 && existsSync(t.settings) && JSON.stringify(t.json()) === JSON.stringify({ theme: "dark" }), "with a key added after apply, undo keeps the file and removes only statusLine");
  rmSync(s.dir, { recursive: true, force: true });
  rmSync(t.dir, { recursive: true, force: true });
}

console.log("\n== undo refuses when statusLine changed after apply, and handles a backup without a receipt (O5)");
{
  const original = '{ "theme": "dark" }\n';
  const s = sandbox(original);
  s.run("--apply");
  const changed = JSON.stringify({ ...s.json(), statusLine: { type: "command", command: "node someone-else.mjs" } }, null, 2) + "\n";
  writeFileSync(s.settings, changed);
  const u = s.run("--undo");
  ok(u.code === 1 && /not the one --apply wrote/.test(u.out), "undo refuses to overwrite a statusLine changed after apply");
  ok(s.read() === changed, "the file is untouched after the refusal");
  rmSync(s.dir, { recursive: true, force: true });

  const old = sandbox(original);
  old.run("--apply");
  const [stamp] = readdirSync(old.backups);
  rmSync(join(old.backups, stamp, "receipt.json"), { force: true });
  writeFileSync(old.settings, JSON.stringify({ ...old.json(), fontSize: 14 }, null, 2) + "\n");
  const ou = old.run("--undo");
  const now = old.json();
  ok(ou.code === 0 && now !== null && now.statusLine === undefined && now.theme === "dark" && now.fontSize === 14, "a backup made before receipts still undoes only statusLine and keeps later edits");
  rmSync(old.dir, { recursive: true, force: true });
}

console.log("\n== refusals");
{
  const broken = '{ "model": "x", }\n';
  const s = sandbox(broken);
  const r = s.run("--apply");
  ok(r.code !== 0 && /not valid JSON/.test(r.out), "invalid JSON is refused with the reason");
  ok(s.read() === broken, "the invalid file is untouched");
  ok(!existsSync(s.backups), "nothing was backed up");
  const u = sandbox('{}\n');
  const nu = u.run("--undo");
  ok(nu.code === 0 && /nothing to undo/.test(nu.out), "undo with no backups says there is nothing to undo");
  rmSync(s.dir, { recursive: true, force: true });
  rmSync(u.dir, { recursive: true, force: true });
}

console.log(fails ? `\nRESULT: FAIL (${fails} of ${fails + oks} checks failed)` : `\nRESULT: PASS (all ${oks} checks ok)`);
process.exit(fails ? 1 : 0);
