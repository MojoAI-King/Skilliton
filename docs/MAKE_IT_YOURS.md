# Making Skilliton a company's own

Kind: Living. Written to the coding assistant a tech lead hands this repository to with "make this ours", and readable by the tech lead too. Moved here from the README on 2026-09-22.

The skills, hooks and checks are the same for every company; what differs is a short list of decisions, each of which lives in one file or one command. Nothing below is detected for you yet: ask the person for each answer you do not have, then make the change where it is named, previewing every writing command before adding `--apply`.

| What is particular to a company | Where it lives | How it is changed |
|---|---|---|
| The company's name and the marketplace its machines install from | `.claude-plugin/marketplace.json`, `packs/base/plugins/workflow/templates/project-settings.json` | `node scripts/skilliton.mjs company init --name <company> --marketplace-repo <owner>/<repo> --apply` |
| Who may approve a release | An `allowed_signers` file the company keeps outside the repository, one SSH public key per approver | `trust add` on each machine, or the join file below, which carries it |
| The one file a machine joins with | Written outside every working tree, handed out by device management or an internal page, never through the repository | `company join-file --name <company> --signers <file> --out <path> --apply`; add `--prepare offer` for a company that wants to be asked before a repository is prepared |
| Where developers keep their repositories | Nowhere: a repository is prepared at its first session start wherever it is. For repositories already on a machine, one sweep of that folder | The loop in "Preparing everything already on a machine" below, with the folder changed |
| A repository that must carry none of this | An empty `.skilliton-off` at its root, or a `skilliton-off` file inside its `.git` folder | Create the file; the session-start block says the repository was left alone |
| What the assistant is told in every session | `packs/base/plugins/workflow/templates/harness.md`, the one file in the base pack a fork edits | Edit it, then `skilliton migrate --apply` in each prepared project (the migration replaces only the text between the markers) |
| Where a project keeps its records, and its integration branches | `prepare.artifacts`, `prepare.directories`, `prepare.integrationBranches` in `.skilliton/config.json` | Edit the file; `prepare` adopts an existing record wherever it already is |
| Which guardrails are on and which branches are protected | The `guardrails` keys in `.skilliton/config.json` | Only `false` turns a rule off; the session-start line names what is off |
| What a shared branch checks before it accepts a merge | `.skilliton/delivery.json` in each project, signed by an approver | `delivery confirm --apply` from the draft `prepare` writes; [docs/DELIVERY.md](DELIVERY.md) for the gate |
| The company's own skills | `packs/<company>/plugins/<plugin>/skills/`, never inside `packs/base/` | `new-plugin`, then `new-skill`; an eval case before a skill ships ([docs/RELEASING.md](RELEASING.md)) |
| Rolling it out to every laptop | `join --from <join file> --apply` at first login | Designed for device management (Intune, Jamf); the design is [docs/PHASE-3.md](PHASE-3.md), the work is B22 in [docs/BACKLOG.md](BACKLOG.md), and it is not yet built |

## Preparing everything already on a machine

A machine that has joined prepares a repository the first time a session opens it. For the repositories already on a machine, run the preview first: it lists what `prepare` would do in each repository and writes nothing. Change `~/Desktop` to wherever that person keeps them.

```bash
find ~/Desktop -maxdepth 3 -name .git -type d -print0 | sort -z | while IFS= read -r -d '' g; do d=$(dirname "$g"); echo "== $d"; skilliton prepare --dir "$d" | tail -3; done
```

Then the same sweep with `--apply`, which stops at the first repository that fails:

```bash
find ~/Desktop -maxdepth 3 -name .git -type d -print0 | sort -z | while IFS= read -r -d '' g; do d=$(dirname "$g"); echo "== $d"; skilliton prepare --dir "$d" --apply > /dev/null && skilliton migrate --dir "$d" --apply > /dev/null && echo "   ok" || { echo "   STOPPED here; run: skilliton status --dir \"$d\""; break; }; done; echo "sweep finished"
```

Each repository is left with its new files uncommitted, on purpose: commit them one repository at a time, so nothing unrelated rides along. Measured on 2026-09-22 across 26 repositories on one machine.

## What is not automatic yet

Detecting a company's conventions and filling the table above from them; the device-management rollout; a machine that has not joined (it is offered preparation and nothing is written). Each is stated as such here rather than implied.
