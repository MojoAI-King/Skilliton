// commands/preflight.mjs: `skilliton preflight`, the checks that run before a machine is set up. Writes nothing
// except one small file it removes again in each folder it tests. The engine is lib/preflight.mjs.

import { Refused, SKILLS_REPO, parseArgs, resolveSkillsRepo, say, selfCommand } from "../lib/core.mjs";
import { TEAM_TEMPLATE, templateMarketplace } from "../lib/fork.mjs";
import { readJsonObject } from "../lib/core.mjs";
import { reportLines, runPreflight } from "../lib/preflight.mjs";
import { join } from "node:path";

export const help = `preflight: check that this machine lets Skilliton work, before anything is set up.

  preflight [--client all|claude-code|codex] [--marketplace <owner>/<repo>|<folder>] [--bin-dir <folder>]
            [--no-network] [--repo <clone>] [--wide] [--json]

For a laptop with endpoint security (application allowlisting, ringfencing, an inspecting proxy), this says which of
the things Skilliton needs are allowed on this machine, and names what IT would have to allow for each one that is
not. It changes nothing: every program is started once with --version and its output thrown away, each folder is
tested by writing one small file and removing it again, and the company repository is asked for its branch list with
prompts turned off.

The programs hooks use are started by the plugin's own probe script, run by its path the way Claude Code runs a hook,
so a policy that stops scripts running from the plugin folder shows up here. The programs the runtime starts are
started the same way it starts them.

--marketplace defaults to the GitHub repository in ${TEAM_TEMPLATE} when this runs from a company skills repository
clone. --no-network skips the repository check, which is the only check that contacts anything. --client picks which
coding tools to check for (default: both, and a tool that is not installed is reported, not assumed).
--wide also prints what each item is for. --json prints one JSON object and nothing else.

\`skilliton join\` runs these checks first and stops before it changes anything when one of them would stop setup.

Exit codes: 0 nothing is in the way; 1 something is missing or blocked (each one says what to allow); 2 the
invocation was refused; 3 the check itself failed.`;

function marketplaceFrom(o) {
  if (o.marketplace !== undefined) return o.marketplace;
  let repo;
  try { repo = resolveSkillsRepo(o.repo); } catch (e) { if (e instanceof Refused) return undefined; throw e; }
  if (!repo) return undefined;
  try {
    const template = readJsonObject(join(repo, TEAM_TEMPLATE), TEAM_TEMPLATE);
    return templateMarketplace({ value: template }).repo ?? undefined;
  } catch { return undefined; }
}

export function run(argv) {
  const json = argv.includes("--json");
  try {
    const o = parseArgs(argv, { flags: ["json", "no-network", "wide"], options: ["client", "marketplace", "bin-dir", "repo"] }, "preflight");
    if (o._.length) throw new Refused(`preflight takes no plain arguments (got "${o._[0]}"); see: ${selfCommand()} preflight --help`);
    const clients = o.client === undefined || o.client === "all" ? ["claude", "codex"]
      : o.client === "claude-code" ? ["claude"] : o.client === "codex" ? ["codex"]
        : (() => { throw new Refused(`--client must be all, claude-code or codex (got "${o.client}")`); })();

    const report = runPreflight({ clients, marketplace: marketplaceFrom(o), binDir: o["bin-dir"], network: !o["no-network"] });
    if (json) {
      process.stdout.write(`${JSON.stringify({
        schema: "skilliton.result/1", command: "preflight",
        result: report.blocking.length ? "attention" : "complete",
        summary: summaryLine(report),
        details: { items: report.items, blocking: report.blocking.map((i) => i.name) },
      }, null, 2)}\n`);
      return report.exitCode;
    }
    say("skilliton preflight (checks only; it writes one small file in each folder it tests and removes it again)");
    say("");
    for (const line of reportLines(report, { wide: o.wide })) say(line);
    say("");
    say(summaryLine(report));
    if (report.blocking.length) {
      say("");
      say("Give the lines above to whoever manages these laptops, with docs/IT-ALLOWLIST.md. Nothing here has been tested under a security product, so a block it makes may look different (docs/BACKLOG.md B29).");
    } else if (!SKILLS_REPO) say("Next: run the company's setup command from a clone of its skills repository.");
    return report.exitCode;
  } catch (e) {
    if (!json) throw e;
    if (e instanceof Refused) { process.stdout.write(`${JSON.stringify({ schema: "skilliton.result/1", command: "preflight", result: "invalid", summary: `refused: ${e.message}`, details: {} }, null, 2)}\n`); return 2; }
    process.stdout.write(`${JSON.stringify({ schema: "skilliton.result/1", command: "preflight", result: "operation-failed", summary: `preflight could not complete: ${e?.message ?? e}`, details: {} }, null, 2)}\n`);
    return 3;
  }
}

function summaryLine(report) {
  const { counts, blocking } = report;
  const parts = [`${counts.ok} ok`];
  for (const key of ["blocked", "missing", "not checked"]) if (counts[key]) parts.push(`${counts[key]} ${key}`);
  const setup = blocking.filter((i) => i.blocks === "setup").map((i) => i.name);
  const sessions = blocking.filter((i) => i.blocks === "sessions").map((i) => i.name);
  if (!blocking.length) return `${parts.join(", ")}; nothing is in the way.`;
  const said = [];
  if (setup.length) said.push(`setting this machine up would stop at: ${setup.join(", ")}`);
  if (sessions.length) said.push(`setup would finish, but in a session these would not work: ${sessions.join(", ")}`);
  return `${parts.join(", ")}; ${said.join("; ")}.`;
}
