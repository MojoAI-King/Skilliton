// write-sites.test.mjs: B88. Every call in the shipped plugins that writes a file is listed here with the reason it
// cannot land outside where it means to, so a new write fails this test until someone says why it is safe. On
// 2026-09-24 three writers followed a committed symbolic link out of the repository: the fix of 1.2.0 had hardened the
// writers a review named and put the rule nowhere shared, so later writers kept the plain call
// (docs/lessons/2026-09-24-a-fix-that-hardens-the-writers-it-names-772e.md). The shared check is linkedWriteProblem
// in runtime/lib/core.mjs; a write into a repository path goes through it or through a writer that checks each path
// component the same way.
//
// A row is a file and how many write calls it holds. More calls than the row says fails, naming the file; fewer fails
// too, so a row never promises a reason for a call that is gone. Comment lines are not counted.
//   node scripts/write-sites.test.mjs             exit 0 when every file matches its row, 1 when one does not
//   node scripts/write-sites.test.mjs --self-test  proves an unlisted write and a stale count each fail
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOTS = ["packs/base/plugins/workflow/runtime", "packs/base/plugins/context-hygiene/hooks", "packs/base/plugins/guardrails/hooks"];
const CALL = /\b(writeFileSync|appendFileSync|renameSync|createWriteStream|copyFileSync|cpSync|symlinkSync|linkSync|writeSync|writeBytes)\(/g;
const W = "packs/base/plugins/workflow/runtime";

export const SITES = [
  [`${W}/commands/company.mjs`, 2, "company init's catalog files, each checked with linkedFileProblem before any is written; the join file goes to the path the person names with --out"],
  [`${W}/commands/harness.mjs`, 1, "CLAUDE.md and AGENTS.md, checked with linkedWriteProblem when the change is planned (lib/harness.mjs planHarnessFile)"],
  [`${W}/commands/import.mjs`, 2, "a skill copied into a plugin: every component of the destination is checked from the repository root down (workflow 0.23.0), copies are exclusive"],
  [`${W}/commands/join.mjs`, 1, "the signers from a join file, written into a folder mkdtemp just made"],
  [`${W}/commands/new-plugin.mjs`, 2, "the new plugin's files and the catalog, each checked with linkedFileProblem before any is written"],
  [`${W}/commands/new-skill.mjs`, 1, "an exclusive create of SKILL.md after every component of the destination is checked (workflow 0.23.0)"],
  [`${W}/commands/project-settings.mjs`, 1, ".claude/settings.json, checked with linkedWriteProblem before it is read"],
  [`${W}/commands/propose.mjs`, 2, "exclusive creates of a proposal in a folder the command checks for links"],
  [`${W}/commands/release.mjs`, 1, "an exclusive create of releases/<version>.json, checked with linkedWriteProblem"],
  [`${W}/lib/audit-install.mjs`, 2, "a temporary file renamed onto .git/hooks/pre-push; the command refuses core.hooksPath and a hook it did not write"],
  [`${W}/lib/core.mjs`, 1, "a backup copied with COPYFILE_EXCL into the backups folder outside the repository"],
  [`${W}/lib/delivery-install.mjs`, 2, "a temporary file renamed onto the gate's hook in the shared repository's own hooks folder"],
  [`${W}/lib/delivery-policy.mjs`, 1, "the draft renamed onto .skilliton/delivery.json after linkedWriteProblem on both"],
  [`${W}/lib/dispatch-brief.mjs`, 1, "the lane report's cost section, never through a link or a second hard link (lstat first; the caller says why)"],
  [`${W}/lib/dispatch.mjs`, 4, "the lane brief and task record, refused when the base commit holds a link there and checked again in the worktree; .git/info/exclude; records brought back by dispatch merge, checked with linkedWriteProblem"],
  [`${W}/lib/fork.mjs`, 1, "not a write: the text of a command a refusal suggests to the person"],
  [`${W}/lib/gate.mjs`, 1, "the gate's log, opened with O_NOFOLLOW after each folder is checked (workflow 0.23.0)"],
  [`${W}/lib/join.mjs`, 4, "the machine's receipt and command shims outside any repository, each an exclusive create or a temporary file renamed"],
  [`${W}/lib/journal.mjs`, 1, "the journal inside the git folder, which a repository cannot commit into"],
  [`${W}/lib/pin.mjs`, 2, "the pin record in the clone's git folder, which a repository cannot commit into, a temporary file renamed"],
  [`${W}/lib/preflight.mjs`, 1, "a probe file made with wx and removed again"],
  [`${W}/lib/prepare.mjs`, 4, "prepared files through checked paths, temporary files renamed, the lock, backups made with wx"],
  [`${W}/lib/security-io.mjs`, 3, "security records through checkedPath, which refuses a path through a symbolic link, temporary files with O_NOFOLLOW"],
  [`${W}/lib/security-propose.mjs`, 1, "the applicability proposal through a descriptor opened with O_NOFOLLOW"],
  [`${W}/lib/security.mjs`, 1, "evidence appended through a descriptor opened with O_EXCL and O_NOFOLLOW"],
  [`${W}/lib/skills-repo.mjs`, 1, "a plugin's version bump in the skills repository, whose plugin folder the command checks for links"],
  [`${W}/lib/tasks.mjs`, 4, "task records and indexes: a record folder or file reached through a link is refused before any write (reproduced 2026-09-24), temporary files renamed"],
  [`${W}/lib/trust.mjs`, 1, "an exclusive create in the trust folder outside any repository"],
  [`${W}/lib/usage-ledger.mjs`, 1, "the usage ledger, refused through a link or a second hard link and appended through an O_NOFOLLOW descriptor"],
  ["packs/base/plugins/context-hygiene/hooks/read-guard.mjs", 1, "the refusal log in Claude Code's own folder, or an absolute .log path that is not a link"],
];

// Write calls per file, comment lines left out; the one-line writeBytes definition in core.mjs is the primitive, not a call.
export function countCalls(text) {
  let n = 0;
  for (const line of text.split("\n")) {
    if (/^\s*\/\//.test(line) || /^const writeBytes = /.test(line)) continue;
    n += (line.match(CALL) ?? []).length;
  }
  return n;
}

export function check(found, sites = SITES) {
  const problems = [];
  const rows = new Map(sites.map(([file, count, why]) => [file, { count, why }]));
  for (const [file, n] of found) {
    const row = rows.get(file);
    if (!row) problems.push(`${file}: ${n} file write(s) with no row here. Check the path with linkedWriteProblem (runtime/lib/core.mjs) and add a row saying why it cannot land outside`);
    else if (row.count !== n) problems.push(`${file}: ${n} write call(s), the row says ${row.count}. A new write needs its reason in the row; a removed one lowers the count`);
  }
  for (const [file] of rows) if (!found.has(file)) problems.push(`${file}: listed here, but it holds no write call now; remove the row`);
  for (const [file, { why }] of rows) if (!why || why.length < 20) problems.push(`${file}: the row has no reason`);
  return problems;
}

function scan() {
  const found = new Map();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(mjs|js)$/.test(name)) {
        const n = countCalls(readFileSync(path, "utf8"));
        if (n) found.set(relative(REPO, path).split("\\").join("/"), n);
      }
    }
  };
  for (const root of ROOTS) walk(join(REPO, root));
  return found;
}

if (process.argv.includes("--self-test")) {
  const base = new Map([["a.mjs", 1]]);
  const rows = [["a.mjs", 1, "a reason long enough to count"]];
  const cases = [
    ["a clean match passes", check(base, rows).length === 0],
    ["an unlisted file fails", check(new Map([...base, ["b.mjs", 1]]), rows).some((p) => p.startsWith("b.mjs: 1 file write(s) with no row"))],
    ["a new call in a listed file fails", check(new Map([["a.mjs", 2]]), rows).some((p) => p.includes("the row says 1"))],
    ["a stale row fails", check(new Map(), rows).some((p) => p.includes("holds no write call now"))],
    ["a comment line is not counted", countCalls("// writeFileSync(x)\nwriteFileSync(y)") === 1],
  ];
  const failed = cases.filter(([, ok]) => !ok);
  for (const [name, ok] of cases) console.log(`${ok ? "ok  " : "FAIL"} self-test: ${name}`);
  process.exit(failed.length ? 1 : 0);
}

const problems = check(scan());
for (const p of problems) console.log(`FAIL ${p}`);
console.log(problems.length ? `write-sites FAILED: ${problems.length} problem(s)` : `write-sites: every file write in the shipped plugins has its row (${SITES.length} files)`);
process.exit(problems.length ? 1 : 0);
