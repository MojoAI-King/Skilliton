// commands/pin.mjs: `skilliton pin`, which pins a clone of the company skills repository to a signed release and
// moves it between releases, together with this machine's Claude Code marketplace. The engines are lib/pin.mjs and
// lib/marketplace-pin.mjs; the contract is docs/CONTRACTS.md section 13.

import { parseArgs, refuse, resolveSkillsRepo, say, selfCommand, tilde } from "../lib/core.mjs";
import { applyMarketplacePin, manualLines, marketplaceStatus, planMarketplacePin, readMarketplacePin, releaseTag } from "../lib/marketplace-pin.mjs";
import { applyPin, pinLine, planPin, readPinState, releaseLines } from "../lib/pin.mjs";

export const help = `pin: pin this clone of the company skills repository, and this machine's marketplace, to a signed release.

  pin [--company <name>] [--repo <clone>]                   show the pin and every release the clone knows
  pin --release <x.y.z> [--company <name>] [--repo <clone>] [--claude <path>] [--apply]   move to that release
  pin --latest [--company <name>] [--repo <clone>] [--claude <path>] [--apply]            move to the newest approved one

A release is approved when its tag skilliton-release/<x.y.z> carries an SSH signature that verifies against the
company signers file this machine trusts, its signed message names the manifest, and that manifest is the one at the
commit the tag points at. pin checks out the commit the verified tag object names, not the tag name: the tag name
follows wherever that ref points now, the commit is what the signer put their key behind.

pin moves between approved release tags and nothing else. --release takes a MAJOR.MINOR.PATCH version; there is no
way to name a branch, a commit or another ref, and an unapproved, withdrawn or unknown version is refused. Without
--release or --latest it changes nothing and prints where the clone and the marketplace stand.

It refuses a release tag that has moved. Each pin records the object id of every release tag the clone held; a later
run that finds one of them pointing somewhere else, or gone, stops rather than installing something nobody signed.
It also refuses when git tracks a changed file in the clone, because the clone would then not hold what was signed.

What this pins. First the clone: the runtime the skilliton command runs, and the catalog and manifest that verify
checks an installed plugin against. Then Claude Code's company marketplace on this machine, when it comes from a git
source (GitHub owner/repo, or a git URL): pin removes it and adds it again at <source>#skilliton-release/<x.y.z>,
reads the client's own list back to check that it reports that ref, and updates each plugin installed from it at
user scope. Every client command runs from a new empty temporary folder, because the client's marketplace remove
also empties the plugin settings of a project it runs in. The preview shows the commands; only --apply runs them.
--claude <path> names the client to run, as join takes it; otherwise the claude on PATH.

What it does not pin. A tag is a name, not a commit: the client cannot follow a commit, and whoever can move the tag
on the remote moves every machine that follows it, so verify, against the signed manifest, stays the check. A
marketplace added from a folder cannot be pinned and is named as such; Codex's marketplace is not moved; a plugin
installed at project scope is named, not updated. With no client found, the clone is pinned and the client commands
are printed to run by hand.

The record is kept at <git dir>/skilliton-pin.json inside the clone, so removing the clone removes the pin.
Pinning leaves the clone on a detached HEAD, which is what stops a later pull moving it; move it again with pin, or
put it back on its branch with git -C <clone> checkout <branch>.

Preview by default; --apply makes the change.
Exit codes: 0 done or nothing to do; 1 attention (releases the clone knows that do not verify, or a marketplace that
could not be moved: a folder source, no client, unreadable records); 2 refused, nothing changed; 3 git or a client
command failed part way, or the client did not report the tag after the add.`;

export function run(argv) {
  const o = parseArgs(argv, { flags: ["apply", "latest"], options: ["company", "repo", "release", "claude"] }, "pin");
  if (o._.length) refuse(`pin takes no plain arguments (got "${o._[0]}"); see: ${selfCommand()} pin --help`);
  if (o.release !== undefined && o.latest) refuse("pass --release <x.y.z> or --latest, not both");
  // --apply with nothing to apply to would read as a status view that quietly did nothing.
  if (o.apply && o.release === undefined && !o.latest) refuse(`--apply needs to know which release to move to: pass --release <x.y.z> or --latest. Run ${selfCommand()} pin on its own to see what this clone knows.`);
  const repo = resolveSkillsRepo(o.repo);
  const state = readPinState(repo, { company: o.company });
  const mp = readMarketplacePin(state.repo, { claude: o.claude });
  printState(o, state, mp);

  if (o.release === undefined && !o.latest) {
    const approved = state.versions.find((v) => v.state === "approved");
    // Already there: the clone is pinned to the newest approved release and the marketplace has nothing to move, so
    // a Next line would only suggest the command that changes nothing.
    const onNewest = approved && state.pin?.version === approved.version && state.head === approved.approval?.commit
      && planMarketplacePin(mp, releaseTag(approved.version)).state !== "move";
    say(!approved ? `Nothing to pin to: no release in this clone is approved.`
      : onNewest ? `already on the newest approved release (${approved.version})`
      : `Next: ${selfCommand()} pin --release ${approved.version} --apply`);
    return state.problems.length ? 1 : 0;
  }

  const plan = planPin(state, { version: o.release });
  const tag = releaseTag(plan.version);
  const market = planMarketplacePin(mp, tag);
  say(pinLine(state, plan));
  for (const line of market.lines) say(line);
  const attention = state.problems.length > 0 || marketAttention(mp, market);
  if (plan.action === "already" && market.state !== "move") {
    say("");
    say(`Already pinned there; nothing to do.`);
    return attention ? 1 : 0;
  }
  if (!o.apply) {
    say("");
    if (market.state === "move" && !mp.binary) say("Claude Code was not found (pass --claude <path>): --apply pins the clone and prints these commands.");
    say("Next: run the same command with --apply.");
    return attention ? 1 : 0;
  }
  return applyAll(state, plan, mp, market, tag);
}

// The header, the clone's pin, its untracked files, every release it knows, and where the marketplace stands.
function printState(o, state, mp) {
  say(`skilliton pin${o.apply ? "" : " (preview; nothing is changed)"}`);
  say(`clone: ${tilde(state.repo)}`);
  say(`signers: ${tilde(state.trust.path)}${state.trust.company ? ` (company ${state.trust.company})` : ""}`);
  say(state.pin
    ? `pinned: ${state.pin.version} at ${state.pin.tag}, commit ${state.pin.commit.slice(0, 12)}, pinned ${state.pin.pinnedAt}`
    : `pinned: not yet (${state.branch ? `on branch ${state.branch}` : `detached at ${state.head.slice(0, 12)}`})`);
  if (state.untracked) say(`note: ${state.untracked} untracked file(s) in the clone. They are not part of any release and no manifest names them, so they do not stop a pin.`);
  say(marketplaceStatus(mp));
  say("");
  say(`releases ${tilde(state.repo)} knows:`);
  const lines = releaseLines(state);
  if (lines.length) for (const line of lines) say(line);
  else say("  none. Fetch the tags (git -C " + tilde(state.repo) + " fetch --tags), or ask your company to sign a release.");
  say("");
}

// A marketplace that has to move and cannot, or cannot be read, is attention; one that is absent or already there is not.
const marketAttention = (mp, market) => market.state === "unreadable" || market.state === "not-pinnable" || (market.state === "move" && !mp.binary);

// Pins the clone, then moves the marketplace. The clone goes first, so a marketplace that cannot move still leaves the
// clone pinned. Returns the exit code: the worse of the two.
function applyAll(state, plan, mp, market, tag) {
  say("");
  if (plan.action !== "already") {
    const result = applyPin(state, plan, { say });
    if (result.failed) { say(""); say(`FAILED: ${result.failed}`); say("Nothing was recorded; fix the cause and run pin again."); return 3; }
  say(`Done: ${tilde(state.repo)} is pinned to release ${plan.version}. It is on a detached HEAD, which is what keeps it there; to go back to a branch, run git -C ${tilde(state.repo)} checkout ${state.branch ?? "<branch>"}.`);
  }
  const moved = moveMarketplace(mp, market, tag);
  if (moved !== 3) say(`Next: ${selfCommand()} verify reads the installed plugins against the signed manifest; a tag is a name, and verify is the check.`);
  return Math.max(moved, state.problems.length ? 1 : 0);
}

// Returns 0 moved or nothing to move, 1 attention, 3 a client command failed or the ref did not land.
function moveMarketplace(mp, market, tag) {
  if (market.state === "absent" || market.state === "already") return 0;
  if (market.state !== "move") {
    say(`NOT PINNED: the marketplace was not moved (${market.state === "not-pinnable" ? "it is not a git source" : "its records cannot be read"}).`);
    return 1;
  }
  if (!mp.binary) {
    say(`NOT PINNED: Claude Code was not found on PATH, so its marketplace ${mp.name} still follows where it was added from.`);
    for (const line of manualLines(mp, market)) say(line);
    return 1;
  }
  say(`moving Claude Code's marketplace ${mp.name} to ${tag}:`);
  const r = applyMarketplacePin(mp, market, tag, { say });
  for (const line of r.lines) say(line);
  if (!r.code) say(`Done: Claude Code's marketplace ${mp.name} is at ${tag}, and the plugins installed from it are updated.`);
  return r.code;
}
