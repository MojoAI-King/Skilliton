# The demonstration: what to run, what to say, and what not to claim

Kind: Living. For the person giving the demonstration. The five steps come from [PHASE-3.md](PHASE-3.md); this page is
how to run them in front of people, in about fifteen minutes, without claiming anything that has not been measured.

Rehearse with `node scripts/demo-day.mjs` (about a minute, no model, no network beyond a local clone). It runs all
five steps on disposable folders and stops with the exact output if a step does not behave. Run it the morning of the
demonstration on the machine you will use.

## Before the room

- `node scripts/demo-day.mjs --claude "$(command -v claude)" --keep`, and keep the folder it prints: the live run can
  use it if the network or anything else lets you down.
- Open two terminals: one in the company skills repository, one in the sample application.
- Have [IT-ALLOWLIST.md](IT-ALLOWLIST.md) open in a tab. It is the first question a technical audience asks.
- Decide who the audience is. A team lead wants step 5. A security or IT person wants step 2 and the allow list. A
  developer wants step 4.

## The five steps

### 1. The company package (2 minutes)

Show the fork with its own marketplace name, one company plugin and skill, and a signed release.

> "This is their copy. Everything a developer's machine runs comes from here, and a release is approved by a
> signature, not by a message in a chat."

Show `skilliton release list`: 1.0.0, approved. Then open the signers file and say who holds that key at their
company.

### 2. A new laptop (3 minutes)

> "A machine that has never seen any of this. One command."

Run `skilliton join` without `--apply` first: it lists what it would add and writes nothing. Then with `--apply`. It
ends with VERIFIED for every plugin.

> "VERIFIED means every file of every installed plugin matches the release their approver signed. If someone edits a
> file on their laptop, this says TAMPERED."

If asked about endpoint security, run `skilliton preflight` and show the lines. Say plainly: **nothing has been tested
under ThreatLocker or any other product**; the check is proved against blocks made on purpose (a program taken off the
path, a folder that cannot be written, a refused connection).

If asked about device management: say the plan (a managed settings file pushed by Intune or Jamf), say it is measured
on Linux in a container and not yet on a real tenant, and move on.

### 3. The product repository (2 minutes)

> "Now their own codebase. This is a sample application I wrote for this; I will not touch your code."

`skilliton prepare` preview, then apply, then `git show --stat`: one commit, reviewable line by line. Records, an
instruction block, settings, a security register.

> "Nothing is hidden, and nothing runs that they have not read."

### 4. A developer session (4 minutes)

Open Claude Code in the sample application.

- The session starts with the project state: branch, current task, what the last session left.
- Ask it for something real: "add a telephone field to the form". It writes a task record with acceptance criteria
  before it writes code.
- Ask it to force-push to main. The guardrails hook blocks it, with the reason.

> "Nobody asked it to be careful. The rule is in the plugin the company released, so it is the same rule on every
> machine."

If the session misbehaves, say so and move on; the offline run in step 5 does not depend on it.

### 5. The merge check (4 minutes)

This is the one to end on.

> "Two developers. Each change passes on its own."

One renames a field's wording and updates the tests; the other adds a test that uses the old wording. Both pass alone.
The first merges the other's work, the merge is clean, and the push is rejected by the shared repository with the
failing check named.

> "Neither change is wrong. Together they break the build, and the shared branch is what noticed. This is the part
> that does not depend on anyone being careful, or on anyone using an AI tool at all."

## What not to claim

Say these plainly if they come up, rather than being caught by them:

- **No time or cost saving.** Nothing has been measured (PLAN.md M14). Do not say "faster" or "cheaper".
- **Endpoint security:** not tested under any product (B29).
- **Windows:** the approach is decided and nothing has been run there yet (B30, [WINDOWS.md](WINDOWS.md)).
- **Device management:** the Claude Code half is measured in a container, with no login; a real Intune or Jamf tenant
  is untested (B22).
- **Other tools:** Claude Code and Codex are measured; Cursor and the rest are documented, not run (docs/CLIENTS.md).
- **The merge check on GitHub:** the gate is proved on a real shared repository locally; the hosted adapter is
  documented, not rehearsed (B4).
- **Security:** the audit checks named things. Never say "secure" or "compliant".

If someone asks a question you cannot answer with something you have run, say "I have not measured that", and say
what would measure it. That answer is the product's argument: everything it claims, it shows.

## The two questions that always come

**"What stops us building this ourselves?"** Nothing, and that is the honest answer. Then: the parts that took the
longest are the ones nobody budgets for, and they are all here (the refusals, the merge check that reads the combined
result, the verification of an installed copy against a signed release, the records that survive a compaction). See
[POSITIONING.md](POSITIONING.md).

**"If we still have to write the skills, where is the value?"** The skills are theirs and should be. What ships is the
harness around them: distribution, approval, verification, enforcement, and the records. [POSITIONING.md](POSITIONING.md)
has the long answer.

## If something fails live

- A step fails: say what it did, and show the output. A demonstration of a tool whose whole argument is "it does not
  hide anything" can survive a failure, and cannot survive a cover-up.
- The network is gone: everything except the GitHub marketplace step works offline; use the kept workspace.
- Claude Code misbehaves: skip to step 5, which needs no model.
