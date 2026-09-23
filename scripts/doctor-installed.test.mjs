#!/usr/bin/env node
// doctor-installed.test.mjs: `skilliton doctor` run from an installed copy of the workflow plugin (N36).
//
// Measured in the rehearsal: on a correct `claude plugin marketplace add` plus the four base plugin installs, doctor
// exited 1 with "UNVERIFIED base plugins: not checked from an installed copy", and it read only ~/.claude, so a custom
// CLAUDE_CONFIG_DIR got MISSING for the marketplace. Here the same machine is built in a temporary folder the way
// Claude Code 2.1.278 lays it out (measured): the installed copy at <config>/plugins/cache/<marketplace>/workflow/<v>,
// the records in <config>/plugins/*.json, the enabled state in <config>/settings.json, and the marketplace's catalog
// either in its clone under <config>/plugins/marketplaces/<marketplace>/ or in the folder known_marketplaces.json names.
// There is no .claude.json, so doctor reads the files and never asks the fake claude for anything but its version.
//
// scripts/skilliton.test.mjs holds the doctor tests run from a checkout; they pass unedited.
//
//   node --test scripts/doctor-installed.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG = JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "marketplace.json"), "utf8"));
const BASE = CATALOG.plugins.filter((p) => typeof p.source === "string" && p.source.startsWith("./packs/base/")).map((p) => p.name);
const MARKET = "acme-skills";
const versionOf = (name) => JSON.parse(readFileSync(join(ROOT, "packs", "base", "plugins", name, ".claude-plugin", "plugin.json"), "utf8")).version;
const hasJq = spawnSync("bash", ["-c", "command -v jq"]).status === 0;

const writeJson = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); };

// A machine with the marketplace added and every base plugin installed and enabled. `config` is where Claude Code's
// files are; `clone` false puts the catalog in a folder of its own, as a marketplace added from a folder has it.
function machine(t, { custom, clone = true, installed = (name) => versionOf(name) }) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "skilliton-doctor-installed-")));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const home = join(base, "home");
  const config = custom ? join(base, "claude-config") : join(home, ".claude");
  mkdirSync(home, { recursive: true });

  // The marketplace: its catalog and each base plugin's manifest, where Claude Code keeps it.
  const market = clone ? join(config, "plugins", "marketplaces", MARKET) : join(base, "company-skills");
  writeJson(join(market, ".claude-plugin", "marketplace.json"), { ...CATALOG, name: MARKET });
  for (const name of BASE) writeJson(join(market, "packs", "base", "plugins", name, ".claude-plugin", "plugin.json"), { name, version: versionOf(name) });
  const source = clone ? { source: "github", repo: "acme/skills" } : { source: "directory", path: market };
  writeJson(join(config, "plugins", "known_marketplaces.json"), { [MARKET]: { source, installLocation: market, lastUpdated: "2026-09-22T00:00:00.000Z" } });

  // The installs, and the one this doctor runs from.
  const cache = (name) => join(config, "plugins", "cache", MARKET, name, installed(name));
  writeJson(join(config, "plugins", "installed_plugins.json"), { version: 2, plugins: Object.fromEntries(BASE.map((name) => [`${name}@${MARKET}`, [{ scope: "user", installPath: cache(name), version: installed(name) }]])) });
  writeJson(join(config, "settings.json"), { enabledPlugins: Object.fromEntries(BASE.map((name) => [`${name}@${MARKET}`, true])), extraKnownMarketplaces: { [MARKET]: { source } } });
  const runtime = cache("workflow");
  cpSync(join(ROOT, "packs", "base", "plugins", "workflow"), runtime, { recursive: true });

  // A claude that answers --version only: with no .claude.json doctor must not ask it anything else.
  const bin = join(base, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "claude"), '#!/usr/bin/env bash\ncase "$*" in\n  "--version") echo "9.9.9 (Claude Code)";;\n  *) echo "fake claude: unexpected arguments: $*" >&2; exit 64;;\nesac\n');
  chmodSync(join(bin, "claude"), 0o755);

  const env = { PATH: `${bin}${delimiter}${dirname(process.execPath)}${delimiter}${process.env.PATH}`, HOME: home, LANG: "C.UTF-8", SKILLITON_BACKUPS: join(base, "backups"), GIT_CONFIG_NOSYSTEM: "1" };
  if (custom) env.CLAUDE_CONFIG_DIR = config;

  // A project with the harness block, so the only required lines are the ones this test is about.
  const project = join(base, "project");
  mkdirSync(project);
  execFileSync("git", ["init", "-q"], { cwd: project, env });
  const cli = (args) => {
    const r = spawnSync(process.execPath, [join(runtime, "runtime", "skilliton.mjs"), ...args], { cwd: project, env, encoding: "utf8" });
    return { code: r.status, out: r.stdout, all: `${r.stdout}${r.stderr}` };
  };
  const harness = cli(["harness", "--apply", "--dir", project]);
  assert.equal(harness.code, 0, harness.all);
  return { config, market, doctor: () => cli(["doctor", "--dir", project]) };
}

const esc = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

function assertPasses(r, { config, market }, configLine) {
  assert.match(r.out, new RegExp(`^claude config: ${esc(configLine)}$`, "m"), "doctor says which configuration folder it read");
  assert.match(r.out, /^skills repo: none \(this is an installed copy of the runtime\)$/m, "the fixture really is an installed copy");
  assert.match(r.out, new RegExp(`^OK +marketplace catalog: read from .*${esc(join(market, ".claude-plugin", "marketplace.json").slice(-60))}, the ${MARKET} marketplace this copy was installed from$`, "m"));
  assert.match(r.out, new RegExp(`^OK +marketplace ${MARKET}: added`, "m"), `the marketplace is found in ${config}`);
  for (const name of BASE) assert.match(r.out, new RegExp(`^OK +${esc(name)}@${MARKET}: installed ${esc(versionOf(name))} \\(user scope\\), enabled; the ${MARKET} marketplace has ${esc(versionOf(name))}$`, "m"));
  assert.doesNotMatch(r.out, /not checked from an installed copy/);
  assert.doesNotMatch(r.all, /fake claude: unexpected arguments/, "with no .claude.json, doctor asks claude for nothing but its version");
  const required = r.out.split("\n").filter((l) => l.endsWith("[required]"));
  if (hasJq) {
    assert.deepEqual(required, [], "no required check fails on a correct install");
    assert.equal(r.code, 0, r.all);
    assert.match(r.out, /^Summary: everything required is in place\./m);
  } else {
    // A shipped hook calls jq, so without it the jq line is required; nothing else may be.
    assert.deepEqual(required.filter((l) => !/^MISSING +jq:/.test(l)), [], `only jq may be missing here:\n${r.out}`);
  }
}

test("N36: from an installed copy with CLAUDE_CONFIG_DIR set, doctor reads that folder and passes a correct install", (t) => {
  assert.ok(BASE.length >= 4, `the catalog lists the base plugins (${BASE.join(", ")})`);
  const m = machine(t, { custom: true });
  const r = m.doctor();
  assertPasses(r, m, `${m.config} (from CLAUDE_CONFIG_DIR)`);
  assert.doesNotMatch(r.out, /CLAUDE_CONFIG_DIR: is set; doctor reads ~\/\.claude/, "the old warning that the folder was not read is gone");
  assert.match(r.out, new RegExp(`Claude Code has not run with this configuration folder yet \\(no ${esc(join(m.config, ".claude.json"))}\\)`), "the .claude.json that matters is the one in CLAUDE_CONFIG_DIR");
});

test("N36: without CLAUDE_CONFIG_DIR, doctor reads ~/.claude and says so", (t) => {
  const m = machine(t, { custom: false });
  assertPasses(m.doctor(), m, "~/.claude (CLAUDE_CONFIG_DIR is not set)");
});

test("N36: a marketplace added from a folder has no clone, and its catalog is read where known_marketplaces.json says", (t) => {
  const m = machine(t, { custom: true, clone: false });
  assertPasses(m.doctor(), m, `${m.config} (from CLAUDE_CONFIG_DIR)`);
});

test("N36: an installed base plugin older than the marketplace's is a required finding with the update command", (t) => {
  const stale = BASE[0];
  const m = machine(t, { custom: true, installed: (name) => (name === stale ? "0.0.1" : versionOf(name)) });
  const r = m.doctor();
  assert.equal(r.code, 1, r.all);
  assert.match(r.out, new RegExp(`^WARN +${esc(stale)}@${MARKET}: installed 0\\.0\\.1, enabled, but the ${MARKET} marketplace has ${esc(versionOf(stale))} \\[required\\]$`, "m"));
  assert.match(r.out, new RegExp(`Next: update the base plugins to the marketplace's versions: claude plugin update <plugin>@${MARKET}`));
});

test("N36: an installed copy whose marketplace catalog is gone says what it could not read", (t) => {
  const m = machine(t, { custom: true });
  rmSync(join(m.market, ".claude-plugin"), { recursive: true });
  writeJson(join(m.config, "plugins", "known_marketplaces.json"), {});
  const r = m.doctor();
  assert.equal(r.code, 1, r.all);
  assert.match(r.out, new RegExp(`^UNVERIFIED +base plugins: not checked: the ${MARKET} marketplace this copy was installed from has no catalog at .*\\[required\\]$`, "m"));
});
