// commands/verify.mjs: `skillgate verify`, installed plugins against approved company releases. Writes nothing.
// The engine is lib/verify.mjs; the contract is docs/CONTRACTS.md section 13 and releases/SCHEMA.md.

import { Refused, SKILLS_REPO, parseArgs, say, selfCommand } from "../lib/core.mjs";
import { joinedSource } from "../lib/join.mjs";
import { runVerify } from "../lib/verify.mjs";

export const help = `verify: check the plugins a client has installed from the company marketplace against approved releases.
Writes nothing.

  verify [--client claude-code|codex] [--config-dir <dir>] [--source <skills repo path>] [--company <name>] [--json]

Approved releases are read from --source, a clone of the company skills repository with its tags (default: the
skills repository this copy of skillgate runs from, when there is one; otherwise the clone recorded by
skillgate join for --company, or for the only company that joined this machine). A release counts only when its tag
skillgate-release/<version> carries an SSH signature that git verify-tag accepts against the company's trust file
(see: skillgate trust --help), and the manifest at the tagged commit has the signed manifest-sha256.

Each installed plugin gets one line:
  VERIFIED         its version is in an approved, unwithdrawn release and every file matches
  TAMPERED         its version is released but files differ; the files are named
  UNKNOWN VERSION  no approved release has its version (for example, a marketplace branch that moved past a release)
  WITHDRAWN        its files match a release withdrawn by a signed skillgate-withdrawn/<version> tag
  NOT INSTALLED    a plugin of the newest approved release that this client has not installed

--client claude-code (default) reads <config dir>/plugins/installed_plugins.json, where the config dir is
--config-dir, else $CLAUDE_CONFIG_DIR, else ~/.claude. --client codex reads the folders
<config dir>/plugins/cache/<marketplace>/<plugin>/<version>/, where the config dir is --config-dir, else $CODEX_HOME,
else ~/.codex. Neither format is documented by its client; both are labelled as read as observed.
--company picks the trust file; without it, the only trusted company is used.
--json prints exactly one JSON object (schema skillgate.result/1) and nothing else.

Exit codes: 0 every company plugin install is VERIFIED; 1 anything else (including nothing to verify); 2 trust is
not configured, a release or withdrawal tag does not verify, a manifest or a client record is invalid, or the
invocation is wrong; 3 the check itself failed.`;

function printJson(result, summary, details) {
  process.stdout.write(`${JSON.stringify({ schema: "skillgate.result/1", command: "verify", result, summary, details }, null, 2)}\n`);
}

export async function run(argv) {
  const json = argv.includes("--json");
  try {
    const o = parseArgs(argv, { flags: ["json"], options: ["client", "config-dir", "source", "company"] }, "verify");
    if (o.help) { say(help); return 0; }
    if (o._.length) throw new Refused(`verify takes no plain arguments (got "${o._[0]}"); see: ${selfCommand()} verify --help`);
    let defaultSource = SKILLS_REPO ?? undefined, sourceHint;
    if (o.source === undefined && !SKILLS_REPO) ({ source: defaultSource, reason: sourceHint } = joinedSource(o.company));
    const report = runVerify({ client: o.client, configDir: o["config-dir"], source: o.source, company: o.company, defaultSource, sourceHint });
    if (json) printJson(report.result, report.summary, report.details);
    else {
      say("skillgate verify (writes nothing)");
      for (const line of report.text) say(line);
    }
    return report.exitCode;
  } catch (e) {
    if (!json) throw e;
    if (e instanceof Refused) { printJson("invalid", `refused: ${e.message}`, {}); return 2; }
    printJson("operation-failed", `verify could not complete: ${e?.message ?? e}. Nothing was verified.`, {});
    return 3;
  }
}
