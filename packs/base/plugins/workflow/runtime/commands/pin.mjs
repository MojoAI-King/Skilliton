// commands/pin.mjs: `skilliton pin`, which pins a clone of the company skills repository to a signed release and
// moves it between releases. The engine is lib/pin.mjs; the contract is docs/CONTRACTS.md section 13.

import { parseArgs, refuse, resolveSkillsRepo, say, selfCommand, tilde } from "../lib/core.mjs";
import { applyPin, pinLine, planPin, readPinState, releaseLines } from "../lib/pin.mjs";

export const help = `pin: pin this clone of the company skills repository to a signed release.

  pin [--company <name>] [--repo <clone>]                            show the pin and every release the clone knows
  pin --release <x.y.z> [--company <name>] [--repo <clone>] [--apply] move to that release
  pin --latest [--company <name>] [--repo <clone>] [--apply]          move to the newest approved release

A release is approved when its tag skilliton-release/<x.y.z> carries an SSH signature that verifies against the
company signers file this machine trusts, its signed message names the manifest, and that manifest is the one at the
commit the tag points at. pin checks out the commit the verified tag object names, not the tag name: the tag name
follows wherever that ref points now, the commit is what the signer put their key behind.

pin moves between approved release tags and nothing else. --release takes a MAJOR.MINOR.PATCH version; there is no
way to name a branch, a commit or another ref, and an unapproved, withdrawn or unknown version is refused. Without
--release or --latest it changes nothing and prints where the clone stands.

It refuses a release tag that has moved. Each pin records the object id of every release tag the clone held; a later
run that finds one of them pointing somewhere else, or gone, stops rather than installing something nobody signed.
It also refuses when git tracks a changed file in the clone, because the clone would then not hold what was signed.

What this pins is the clone: the runtime the skilliton command runs, and the catalog and manifest that verify checks
an installed plugin against. A coding client downloads a plugin from the marketplace itself and takes no tag when it
does (measured: claude plugin marketplace add has no ref option), so the download is not pinned from here; verify is
what reports an installed plugin that does not match the approved release.

The record is kept at <git dir>/skilliton-pin.json inside the clone, so removing the clone removes the pin.
Pinning leaves the clone on a detached HEAD, which is what stops a later pull moving it; move it again with pin, or
put it back on its branch with git -C <clone> checkout <branch>.

Preview by default; --apply makes the change.
Exit codes: 0 done or nothing to do; 1 attention (releases the clone knows that do not verify); 2 refused, nothing
changed; 3 git failed part way.`;

export function run(argv) {
  const o = parseArgs(argv, { flags: ["apply", "latest"], options: ["company", "repo", "release"] }, "pin");
  if (o._.length) refuse(`pin takes no plain arguments (got "${o._[0]}"); see: ${selfCommand()} pin --help`);
  if (o.release !== undefined && o.latest) refuse("pass --release <x.y.z> or --latest, not both");
  // --apply with nothing to apply to would read as a status view that quietly did nothing.
  if (o.apply && o.release === undefined && !o.latest) refuse(`--apply needs to know which release to move to: pass --release <x.y.z> or --latest. Run ${selfCommand()} pin on its own to see what this clone knows.`);
  const repo = resolveSkillsRepo(o.repo);
  const state = readPinState(repo, { company: o.company });

  say(`skilliton pin${o.apply ? "" : " (preview; nothing is changed)"}`);
  say(`clone: ${tilde(state.repo)}`);
  say(`signers: ${tilde(state.trust.path)}${state.trust.company ? ` (company ${state.trust.company})` : ""}`);
  say(state.pin
    ? `pinned: ${state.pin.version} at ${state.pin.tag}, commit ${state.pin.commit.slice(0, 12)}, pinned ${state.pin.pinnedAt}`
    : `pinned: not yet (${state.branch ? `on branch ${state.branch}` : `detached at ${state.head.slice(0, 12)}`})`);
  if (state.untracked) say(`note: ${state.untracked} untracked file(s) in the clone. They are not part of any release and no manifest names them, so they do not stop a pin.`);
  say("");
  say(`releases ${tilde(state.repo)} knows:`);
  const lines = releaseLines(state);
  if (lines.length) for (const line of lines) say(line);
  else say("  none. Fetch the tags (git -C " + tilde(state.repo) + " fetch --tags), or ask your company to sign a release.");
  say("");

  if (o.release === undefined && !o.latest) {
    const approved = state.versions.find((v) => v.state === "approved");
    say(approved
      ? `Next: ${selfCommand()} pin --release ${approved.version} --apply`
      : `Nothing to pin to: no release in this clone is approved.`);
    return state.problems.length ? 1 : 0;
  }

  const plan = planPin(state, { version: o.release });
  say(pinLine(state, plan));
  if (plan.action === "already") { say(""); say(`Already pinned there; nothing to do.`); return state.problems.length ? 1 : 0; }
  if (!o.apply) { say(""); say("Next: run the same command with --apply."); return 0; }

  say("");
  const result = applyPin(state, plan, { say });
  if (result.failed) { say(""); say(`FAILED: ${result.failed}`); say("Nothing was recorded; fix the cause and run pin again."); return 3; }
  say("");
  say(`Done: ${tilde(state.repo)} is pinned to release ${plan.version}. It is on a detached HEAD, which is what keeps it there; to go back to a branch, run git -C ${tilde(state.repo)} checkout ${state.branch ?? "<branch>"}.`);
  return state.problems.length ? 1 : 0;
}
