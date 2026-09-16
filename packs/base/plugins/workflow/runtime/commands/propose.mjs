// commands/propose.mjs: `skillgate propose`, a project lesson copied into the company skills repository as an
// improvement proposal, after the proposal text passes the repository's scrub check and a secret scan.
// Contract: docs/CONTRACTS.md sections 7 and 11 (a lesson proposes; review and a tested release decide).

import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { parseArgs, refuse, resolveSkillsRepo, say, scanSecrets, tilde } from "../lib/core.mjs";
import { isId, localDate } from "../lib/ids.mjs";

export const help = `propose: turn a lesson entry into an improvement proposal in the company skills repository.

  propose <lesson file> [--repo <skills repo>] [--apply]

<lesson file> is one lesson entry (docs/lessons/<id>.md, written by record lesson). Its id comes from its
"- **ID:** <id>" line, else from a file name shaped like an entry id (YYYY-MM-DD-<slug>-<hex4>).
The proposal is proposals/<id>.md in --repo (default: the skills repository this copy of skillgate runs from): a
header with the source lesson id, the date, and "status: proposed; needs a regression scenario, review and an
approved release", followed by the lesson exactly as written.

Before anything is written, the full proposal text is copied to a temporary folder and scanned there by
<repo>/scripts/scrub-check.sh --path (denylisted names, em or en dashes, home-directory paths; the name scan needs a
denylist, SKILLGATE_DENYLIST, default ~/.config/skillgate/denylist) and by the secret-shape scan import uses. A hit,
or a scan that cannot run or complete, refuses the proposal (exit 2) and says why; matched text is never printed.

A proposal is not a change to company defaults: it needs a reproducible regression scenario, review, and an approved
release first. Previews by default; --apply writes the file.
Exit codes: 0 complete; 2 refused (nothing written); 3 an operation failed.`;

const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const MAX_LESSON_BYTES = 256 * 1024;
const STATUS_LINE = "status: proposed; needs a regression scenario, review and an approved release";

function readLesson(input) {
  const path = resolve(input);
  let st;
  try { st = lstatSync(path); } catch { refuse(`${tilde(path)} does not exist`); }
  if (st.isSymbolicLink()) refuse(`${tilde(path)} is a symbolic link; pass the lesson file itself`);
  if (!st.isFile()) refuse(`${tilde(path)} is not a regular file`);
  if (st.size > MAX_LESSON_BYTES) refuse(`${tilde(path)} is larger than ${MAX_LESSON_BYTES / 1024} KB, which is not one lesson entry`);
  const bytes = readFileSync(path);
  if (bytes.includes(0)) refuse(`${tilde(path)} is a binary file, not a lesson entry`);
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { refuse(`${tilde(path)} is not valid UTF-8 text`); }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const idLine = /^\s*[-*]\s+\*\*ID:\*\*\s*(\S+)\s*$/m.exec(text);
  const stem = basename(path).replace(/\.md$/i, "");
  let id;
  if (idLine) {
    id = idLine[1];
    if (!SAFE_ID_RE.test(id)) refuse(`the lesson's ID "${id.slice(0, 80)}" is not a plain id (letters, digits, . _ -), so it cannot name a proposal file`);
  } else if (isId(stem)) id = stem;
  else refuse(`${tilde(path)} is not a lesson entry: it has no "- **ID:** <id>" line and its file name is not an entry id (YYYY-MM-DD-<slug>-<hex4>). Create entries with: skillgate record lesson "<title>"`);
  const heading = /^#[ \t]+(.+?)[ \t]*$/m.exec(text);
  const title = heading ? heading[1].replace(/^Lesson:\s*/i, "") : id;
  return { path, text, id, title };
}

// The scrub check and the secret scan, run on a temporary copy of exactly the text that would be written.
function scanProposal(repo, name, text) {
  const script = join(repo, "scripts", "scrub-check.sh");
  let st;
  try { st = lstatSync(script); } catch { st = null; }
  if (!st?.isFile()) refuse(`the scrub check ${tilde(script)} was not found, so the proposal cannot be scanned. Nothing was written.`);
  const dir = mkdtempSync(join(tmpdir(), "skillgate-propose-"));
  try {
    writeFileSync(join(dir, name), text, { flag: "wx" });
    const r = spawnSync("bash", [script, "--path", dir], { encoding: "utf8", timeout: 120000, stdio: ["ignore", "pipe", "pipe"] });
    const output = `${r.stdout ?? ""}${r.stderr ?? ""}`.trimEnd();
    const scanned = /^scanned files: (\d+)$/m.exec(output);
    const secrets = scanSecrets(dir, [name]);
    return { error: r.error, status: r.status, output, scanned: scanned ? Number(scanned[1]) : null, secrets };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function run(argv) {
  const o = parseArgs(argv, { flags: ["apply"], options: ["repo"] }, "propose");
  if (o._.length !== 1) refuse(`propose needs exactly one lesson file: propose <lesson file> --repo <skills repo> (got ${o._.length})`);
  const lesson = readLesson(o._[0]);
  const repo = resolveSkillsRepo(o.repo);
  const rel = `proposals/${lesson.id}.md`;
  let dirStat;
  try { dirStat = lstatSync(join(repo, "proposals")); } catch { dirStat = null; }
  if (dirStat && (dirStat.isSymbolicLink() || !dirStat.isDirectory())) refuse(`${tilde(join(repo, "proposals"))} is not a plain folder (a file or a symbolic link). Nothing was written.`);
  let exists = false;
  try { lstatSync(join(repo, rel)); exists = true; } catch { exists = false; }
  if (exists) refuse(`${rel} already exists in ${tilde(repo)}: lesson ${lesson.id} has already been proposed. Nothing was written.`);

  const date = localDate();
  const proposal = [
    `# Proposal: ${lesson.title}`,
    "",
    "Kind: Living. Improvement proposal.",
    "",
    `- source lesson: ${lesson.id}`,
    `- date: ${date}`,
    `- ${STATUS_LINE}`,
    "",
    "---",
    "",
    lesson.text.endsWith("\n") ? lesson.text : `${lesson.text}\n`,
  ].join("\n");

  say(`skillgate propose${o.apply ? "" : " (preview; nothing written)"}`);
  say(`lesson: ${tilde(lesson.path)} (id ${lesson.id})`);
  say(`proposal: ${rel} in ${tilde(repo)}`);
  say("scanning the proposal text in a temporary copy before anything is written");
  const scan = scanProposal(repo, `${lesson.id}.md`, proposal);
  if (scan.output) for (const line of scan.output.split("\n")) say(`  scrub: ${line}`);
  if (scan.secrets.hits.length) {
    say(`  secret and home-path patterns: ${scan.secrets.hits.length} hit(s); the matched text is not shown`);
    for (const h of scan.secrets.hits) say(`    line ${h.line}  ${h.rule}`);
  } else say("  secret and home-path patterns: 0 hits");

  const reasons = [];
  if (scan.error) reasons.push(`the scrub check could not run (${scan.error.code === "ENOENT" ? "bash was not found" : scan.error.message})`);
  else if (scan.status === 1) reasons.push("the scrub check found lines to fix (listed above)");
  else if (scan.status === 2) reasons.push("the scrub check did not complete, so names were not scanned; set SKILLGATE_DENYLIST to a denylist file (one name pattern per line; a file of only comments means no names to block)");
  else if (scan.status !== 0) reasons.push(`the scrub check failed (exit ${scan.status ?? "by signal"})`);
  else if (scan.scanned !== 1) reasons.push(`the scrub check reported scanning ${scan.scanned ?? "an unknown number of"} file(s) instead of the one proposal, so its result cannot be trusted`);
  if (scan.secrets.hits.length) reasons.push(`${scan.secrets.hits.length} secret-shaped or home-path line(s) (listed above)`);
  if (scan.secrets.binary.length) reasons.push("the proposal text was treated as binary, so the secret scan did not read it");
  if (reasons.length) refuse(`propose stopped before writing anything: ${reasons.join("; ")}. Fix the lesson, then run again.`);

  say("");
  for (const line of proposal.split("\n").slice(0, 8)) say(`  | ${line}`);
  say(`  | ... (${proposal.split("\n").length} lines in all)`);
  if (!o.apply) {
    say(`would write ${rel}`);
    say("Next: run the same command with --apply.");
    return 0;
  }
  mkdirSync(join(repo, "proposals"), { recursive: true });
  writeFileSync(join(repo, rel), proposal, { flag: "wx" });
  say(`wrote ${rel}`);
  say("Next: add a regression scenario that shows the problem, get it reviewed, and ship the change only in an approved release. This file changes nothing by itself.");
  return 0;
}
