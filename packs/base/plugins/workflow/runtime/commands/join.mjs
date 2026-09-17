// commands/join.mjs: `skilliton join`, which sets up this machine for a company's Skilliton in one previewable command
// and takes that setup back out with --undo. The engine is lib/join.mjs; the contract is docs/CONTRACTS.md section 13.

import { Refused, backupFile, newStamp, parseArgs, refuse, resolveSkillsRepo, say, selfCommand, tilde } from "../lib/core.mjs";
import { applyJoin, applyUndo, planJoin, planUndo } from "../lib/join.mjs";
import { reportLines, runPreflight } from "../lib/preflight.mjs";
import { planTrustAdd, writeTrustFile } from "../lib/trust.mjs";
import { runVerify } from "../lib/verify.mjs";

export const help = `join: set up this machine for a company's Skilliton, then verify it.

  join --company <name> --signers <allowed_signers file> [--client all|claude-code|codex] [--marketplace <owner>/<repo>|<folder>]
       [--plugins <a,b>] [--bin-dir <folder> | --no-launcher] [--claude <path>] [--codex <path>] [--repo <clone>] [--apply]
  join --undo --company <name> [--claude <path>] [--codex <path>] [--apply]

Run it from a full clone of the company skills repository:
  git clone https://github.com/<owner>/<repo> && node <repo>/scripts/skilliton.mjs join --company <name> --signers <file>

For each coding client found (Claude Code, Codex; --client picks one) join adds the company marketplace and installs
the plugins the team settings template enables (--plugins overrides; workflow is required; verify expects every
plugin of the newest approved release, so installing fewer ends with NOT INSTALLED and exit 1). It trusts the release
signers from --signers, a file the company gives you through a channel other than the repository. It writes a
skilliton launcher into --bin-dir (default ~/.local/bin) that runs the clone's command line, and says so when that
folder is not on PATH; it never edits a shell profile. Then it runs verify for each client against the clone.

--marketplace defaults to the GitHub repository in templates/project-settings.json. A marketplace of the same name
from a different source, a different signers file already trusted for the company, a shallow clone, or a catalog and
template that disagree are refused before anything is written. Anything already in place is left as it is.

Everything join adds is recorded in $SKILLITON_JOIN_DIR/<company>.json (default ~/.config/skilliton/joined/), updated
after each step, so a failure part way can be undone. join --undo uninstalls the plugins join installed, removes the
marketplace when join added it and nothing else was installed from it, and removes the signers file and launcher when
they are unchanged; it keeps what was there before join and says what it kept. Measured limits: Claude Code leaves
empty enabledPlugins and extraKnownMarketplaces entries in its settings and keeps downloaded plugins under
plugins/cache/; Codex deletes each removed plugin's cache but keeps the empty plugins/cache/<marketplace>/ folder; and
a Codex home folder join created is kept, because Codex writes its own files there.

Preview by default; --apply makes the changes.
Exit codes: 0 complete and every plugin VERIFIED (undo: everything join added is gone); 1 attention (verify found a
plugin not VERIFIED, the launcher was not written, or undo kept something that changed); 2 refused, nothing changed;
3 a client command failed part way (the output and the receipt say what completed).`;

export async function run(argv) {
  const o = parseArgs(argv, {
    flags: ["apply", "undo", "no-launcher"],
    options: ["company", "signers", "client", "marketplace", "plugins", "bin-dir", "claude", "codex", "repo"],
  }, "join");
  if (o._.length) refuse(`join takes no plain arguments (got "${o._[0]}"); see: ${selfCommand()} join --help`);
  if (o.company === undefined) refuse("join needs --company <name>, the company's short name");
  return o.undo ? undo(o) : await join(o);
}

async function join(o) {
  if (o.signers === undefined) refuse("join needs --signers <allowed_signers file>, the release signers file your company gives you");
  if (o["bin-dir"] !== undefined && o["no-launcher"]) refuse("pass --bin-dir or --no-launcher, not both");
  const repo = resolveSkillsRepo(o.repo);
  const trustPlan = planTrustAdd(o.company, o.signers);
  const plan = planJoin({
    repo, company: o.company, client: o.client, marketplace: o.marketplace, plugins: o.plugins,
    binDir: o["bin-dir"], noLauncher: o["no-launcher"], claude: o.claude, codex: o.codex, trustPlan,
  });

  say(`skilliton join${o.apply ? "" : " (preview; nothing is set up)"}`);
  say(`company: ${plan.company}`);
  say(`skills repository: ${tilde(plan.repo)} (commit ${plan.clone.head ?? "unknown"}, ${plan.clone.releaseTags} release tag(s))`);
  say(`marketplace: ${plan.market.name} from ${plan.market.source.kind === "github" ? `GitHub ${plan.market.source.location}` : `folder ${tilde(plan.market.source.location)}`}`);
  say(`plugins: ${plan.plugins.join(", ")}`);
  say("");

  // The machine checks come before anything is written, so a laptop that cannot run or write what setup needs says so
  // instead of failing half way. Items that would only stop a hook in a later session are printed, not refused.
  const pre = await runPreflight({
    clients: plan.clients.map((c) => ({ name: c.driver.binaryName, path: c.binary.path })),
    marketplace: plan.market.source.location,
    binDir: plan.launcher.action === "none" ? undefined : plan.launcher.dir,
    scope: "setup",
  });
  const attention = pre.items.filter((i) => i.state !== "ok" && i.state !== "not checked");
  say(`machine checks: ${pre.counts.ok} ok${attention.length ? `, ${attention.length} needing attention` : ""} (each folder was tested with one file, removed again; ${selfCommand()} preflight shows them all)`);
  for (const line of reportLines({ items: attention }, { wide: false })) say(`  ${line}`);
  if (pre.blocking.length) {
    say("");
    say(`Refused, and nothing was changed: this machine cannot be set up until the item(s) above marked as stopping setup are cleared (${pre.blocking.map((i) => i.name).join(", ")}). Run ${selfCommand()} preflight for the full list, and give it with docs/IT-ALLOWLIST.md to whoever manages these laptops.`);
    return 2;
  }
  say("");
  const work = [];
  const step = (done, text) => { say(`  ${done ? "already in place" : "will add        "}  ${text}`); if (!done) work.push(text); };
  say("release signers:");
  step(plan.trust.present, `${tilde(plan.trust.dest)} (${plan.trust.parsed.signers.length} signer(s), sha256 ${plan.trust.sha256.slice(0, 12)})`);
  for (const c of plan.clients) {
    say(`${c.driver.label} (${tilde(c.binary.path)}, home ${tilde(c.home)}):`);
    if (c.createHome) step(false, `the home folder ${tilde(c.home)}, which ${c.driver.label} needs to exist`);
    step(!c.addMarketplace, `marketplace ${plan.market.name}`);
    for (const i of c.installs) step(i.present, `plugin ${i.plugin}@${plan.market.name}`);
  }
  const l = plan.launcher;
  say("terminal command:");
  if (l.action === "none") say("  skipped (--no-launcher)");
  else if (l.action === "skip") say(`  not written: ${l.reason}`);
  else step(l.action === "present", `${tilde(l.path)}, which runs ${tilde(plan.repo)}/scripts/skilliton.mjs`);
  if (l.action !== "none" && !l.onPath) say(`  note: ${tilde(l.dir)} is not on PATH. To use skilliton in new terminals, add this line to your shell profile: export PATH="${l.dir}:$PATH"`);
  if (!plan.clone.releaseTags) say(`note: ${tilde(plan.repo)} has no release tags yet, so verify will not find an approved release until your company signs one and you fetch its tags (git -C ${tilde(plan.repo)} fetch --tags).`);
  say("");

  if (!o.apply) {
    say(work.length ? `${work.length} change(s) to make, then verify for ${plan.clients.map((c) => c.driver.label).join(" and ")}. Next: run the same command with --apply.` : "Everything is already in place; --apply only runs verify.");
    return 0;
  }
  if (work.length) {
    const result = applyJoin(plan, { say, writeTrust: writeTrustFile });
    if (result.failed) {
      say("");
      say(`FAILED: ${result.failed.step}: ${result.failed.detail}`);
      say(`What completed is recorded in ${tilde(plan.receipt)}. Fix the cause and run join again, or take it back out with: ${selfCommand()} join --undo --company ${plan.company} --apply`);
      return 3;
    }
    say("");
  }

  let allVerified = true;
  for (const c of plan.clients) {
    let report;
    try {
      report = runVerify({ client: c.id, configDir: c.home, source: plan.repo, company: plan.company });
    } catch (e) {
      if (!(e instanceof Refused)) throw e;
      say(`verify, ${c.driver.label}: could not run (${e.message})`);
      allVerified = false;
      continue;
    }
    say(`verify, ${c.driver.label}: ${report.summary}`);
    for (const p of report.details.plugins) say(`  ${p.state.padEnd(16)}${p.plugin}${p.version ? ` ${p.version}` : ""}`);
    if (report.exitCode !== 0) allVerified = false;
  }
  const launcherOk = l.action !== "skip";
  say("");
  say(allVerified && launcherOk
    ? `Done: this machine is set up for ${plan.company}. Start a new session in any project; to prepare one, run skilliton prepare --dir <project>.`
    : `Set up, with attention needed above${launcherOk ? "" : " (the terminal command was not written)"}. To take it back out: ${selfCommand()} join --undo --company ${plan.company} --apply`);
  return allVerified && launcherOk ? 0 : 1;
}

function undo(o) {
  for (const option of ["signers", "client", "marketplace", "plugins", "bin-dir", "repo"]) {
    if (o[option] !== undefined) refuse(`join --undo takes no --${option}: it removes what the receipt records`);
  }
  if (o["no-launcher"]) refuse("join --undo takes no --no-launcher: it removes what the receipt records");
  const plan = planUndo({ company: o.company, claude: o.claude, codex: o.codex });

  say(`skilliton join --undo${o.apply ? "" : " (preview; nothing written)"}`);
  say(`company: ${plan.company}, joined from ${tilde(plan.receipt.source)} (receipt ${tilde(plan.path)})`);
  for (const c of plan.clients) {
    say(`${c.driver.label} (${tilde(c.home)}):`);
    for (const p of c.uninstall) say(`  will uninstall ${p}@${plan.receipt.marketplace.name}`);
    for (const p of c.gone) say(`  already gone: ${p}@${plan.receipt.marketplace.name}`);
    if (c.removeMarketplace) say(`  will remove marketplace ${plan.receipt.marketplace.name}`);
    if (c.keepReason) say(`  will keep marketplace ${plan.receipt.marketplace.name}: ${c.keepReason}`);
    if (!c.uninstall.length && !c.removeMarketplace && !c.keepReason) say("  nothing join added is still there");
  }
  const describe = { remove: "will remove", gone: "already gone:", changed: "will keep (changed since join):" };
  if (plan.trust.action !== "none") say(`release signers: ${describe[plan.trust.action]} ${tilde(plan.trust.path)}`);
  if (plan.launcher.action !== "none") say(`terminal command: ${describe[plan.launcher.action]} ${tilde(plan.launcher.path)}`);
  say(`receipt: will back up and remove ${tilde(plan.path)}`);
  say("");
  if (!o.apply) { say("Next: run the same command with --apply."); return 0; }

  const stamp = newStamp();
  const result = applyUndo(plan, { say, backup: (path) => backupFile("join-undo", path, stamp) });
  if (result.failed) {
    say("");
    say(`FAILED: ${result.failed.step}: ${result.failed.detail}`);
    say(`The receipt ${tilde(plan.path)} is kept; fix the cause and run join --undo again.`);
    return 3;
  }
  say("");
  if (result.kept.length) {
    say("Kept:");
    for (const k of result.kept) say(`  ${k}`);
    return 1;
  }
  say(`Done: everything join added for ${plan.company} is removed.`);
  return 0;
}
