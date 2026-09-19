// stack.test.mjs: what prepare reads from a repository (packs/base/plugins/workflow/runtime/lib/stack.mjs): the test
// command from the build files in the documented order, a malformed package.json counting as absent, and the
// hotspots from a synthetic history that proves the share threshold, the skip list, the maximum and the ordering.
// Nothing is run; every repository is a temporary folder removed at the end.
//   node --test scripts/stack.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const { DEFAULT_SKIP, NO_STACK, detectStack, hotspots } = await import(join(REPO, "packs", "base", "plugins", "workflow", "runtime", "lib", "stack.mjs"));

const base = mkdtempSync(join(tmpdir(), "skilliton-stack-"));
process.on("exit", () => rmSync(base, { recursive: true, force: true }));
const ENV = {
  ...process.env, HOME: join(base, "home"), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid",
};
mkdirSync(ENV.HOME);
let count = 0;
function folder(files = {}) {
  const dir = join(base, `r${++count}`);
  mkdirSync(dir);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}
const git = (dir, ...args) => execFileSync("git", ["-C", dir, ...args], { env: ENV, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
function commit(dir, files, message = "change") {
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "--allow-empty", "-m", message);
}

test("each detector row, in the documented order", () => {
  const rows = [
    [{ "package.json": JSON.stringify({ scripts: { test: "node --test", verify: "npm test" } }) }, "npm test", ["npm", "test"], "package.json scripts.test"],
    [{ "package.json": JSON.stringify({ scripts: { verify: "node scripts/verify.mjs" } }) }, "npm run verify", ["npm", "run", "verify"], "package.json scripts.verify"],
    [{ "pyproject.toml": "[project]\nname = \"a\"\n[tool.pytest.ini_options]\ntestpaths = [\"tests\"]\n" }, "pytest", ["pytest"], "pyproject.toml [tool.pytest]"],
    [{ "pytest.ini": "[pytest]\n" }, "pytest", ["pytest"], "pytest.ini"],
    [{ "conftest.py": "" }, "pytest", ["pytest"], "conftest.py"],
    [{ "go.mod": "module example.test/a\n\ngo 1.22\n" }, "go test ./...", ["go", "test", "./..."], "go.mod"],
    [{ "Cargo.toml": "[package]\nname = \"a\"\n" }, "cargo test", ["cargo", "test"], "Cargo.toml"],
    [{ Makefile: "build:\n\techo build\n\ntest:\n\techo test\n" }, "make test", ["make", "test"], "Makefile test target"],
  ];
  for (const [files, lane, argv, source] of rows) {
    const r = detectStack(folder(files));
    assert.deepEqual(r, { test: { lane, argv, source }, reason: null }, source);
  }
});

test("precedence: package.json wins over pytest, pytest over go.mod, and scripts.test over scripts.verify", () => {
  const both = folder({ "package.json": JSON.stringify({ scripts: { test: "x", verify: "y" } }), "pyproject.toml": "[tool.pytest.ini_options]\n", "go.mod": "module a\n" });
  assert.equal(detectStack(both).test.source, "package.json scripts.test");
  const py = folder({ "pyproject.toml": "[tool.pytest.ini_options]\n", "go.mod": "module a\n", "Cargo.toml": "" });
  assert.equal(detectStack(py).test.source, "pyproject.toml [tool.pytest]");
});

test("nothing detected: an empty folder, a package.json without scripts, a Makefile without a test target, a pyproject without pytest", () => {
  for (const files of [
    {},
    { "package.json": JSON.stringify({ name: "a" }) },
    { "package.json": JSON.stringify({ scripts: { test: "" } }) },
    { Makefile: "build:\n\techo build\n# test: not a target\n" },
    { "pyproject.toml": "[project]\nname = \"a\"\n" },
  ]) {
    assert.deepEqual(detectStack(folder(files)), { test: null, reason: NO_STACK }, JSON.stringify(files));
  }
  assert.match(NO_STACK, /package\.json scripts, pytest, go\.mod, Cargo\.toml, Makefile/);
});

test("a malformed package.json counts as absent and does not stop the later detectors", () => {
  const dir = folder({ "package.json": "{ not json", "go.mod": "module a\n" });
  assert.deepEqual(detectStack(dir).test, { lane: "go test ./...", argv: ["go", "test", "./..."], source: "go.mod" });
  assert.deepEqual(detectStack(folder({ "package.json": "[1, 2]" })), { test: null, reason: NO_STACK });
});

test("hotspots: the share threshold, the skip list, the maximum and the ordering, on 20 commits", () => {
  const dir = folder();
  git(dir, "init", "-q", "-b", "main");
  // 20 commits: src/core.mjs in every one (20), src/api.mjs in 10, docs/GUIDE.md in 10 (skipped), DECISIONS.md in 20
  // (skipped), src/b.mjs and src/a.mjs in 2 each (the threshold at 10 percent of 20), src/once.mjs in 1 (below).
  for (let i = 0; i < 20; i++) {
    const files = { "src/core.mjs": `// ${i}\n`, "DECISIONS.md": `# ${i}\n` };
    if (i % 2 === 0) files["src/api.mjs"] = `// ${i}\n`;
    if (i % 2 === 1) files["docs/GUIDE.md"] = `# ${i}\n`;
    if (i === 3 || i === 7) { files["src/b.mjs"] = `// ${i}\n`; files["src/a.mjs"] = `// ${i}\n`; }
    if (i === 5) files["src/once.mjs"] = "// once\n";
    commit(dir, files, `commit ${i}`);
  }
  const all = hotspots(dir);
  assert.equal(all.commitsSeen, 20);
  assert.equal(all.reason, null);
  assert.deepEqual(all.paths, ["src/core.mjs", "src/api.mjs", "src/a.mjs", "src/b.mjs"], "by count, then by path; the skipped and the below-threshold paths are out");
  assert.deepEqual(hotspots(dir, { max: 2 }).paths, ["src/core.mjs", "src/api.mjs"]);
  assert.deepEqual(hotspots(dir, { minShare: 0.5 }).paths, ["src/core.mjs", "src/api.mjs"], "at 50 percent only the two frequent paths stay");
  assert.deepEqual(hotspots(dir, { skip: [] }).paths, ["DECISIONS.md", "src/core.mjs", "docs/GUIDE.md", "src/api.mjs", "src/a.mjs"], "without the skip list the records come back, at most five");
  assert.deepEqual(hotspots(dir, { commits: 4 }).paths, ["src/core.mjs", "src/api.mjs"], "the window bounds the history read: the last four commits only");
  assert.equal(hotspots(dir, { commits: 4 }).commitsSeen, 4);
  assert.deepEqual(DEFAULT_SKIP, ["docs/", "DECISIONS.md"]);
});

test("hotspots: no commits, and a folder that is not a repository, return an empty list with the reason", () => {
  const empty = folder();
  git(empty, "init", "-q", "-b", "main");
  const r = hotspots(empty);
  assert.deepEqual(r.paths, []);
  assert.equal(r.commitsSeen, 0);
  assert.match(r.reason, /no commits yet/);
  const plain = hotspots(folder());
  assert.deepEqual(plain.paths, []);
  assert.ok(plain.reason && plain.reason.length > 0, "a reason is given");
});
