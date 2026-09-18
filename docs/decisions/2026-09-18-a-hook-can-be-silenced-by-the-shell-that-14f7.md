# A hook can be silenced by the shell that starts it, and that is written down rather than defended

Kind: Living. Decision entry.

- **ID:** 2026-09-18-a-hook-can-be-silenced-by-the-shell-that-14f7
- **Status:** accepted
- **Date:** 2026-09-18

## Decision

A session that can set the environment a hook is started with can stop that hook running at all, and this project
says so instead of claiming otherwise. Bash runs the file `BASH_ENV` names, applies the options `SHELLOPTS` names,
and imports any exported shell function, all before the first line of a hook script. A file that says `exit 0`, or
`SHELLOPTS=noexec`, ends the guardrails hook before it begins, and a client reads the silence as an allow.

What the hook does about it: it asks for confirmation when it sees `BASH_ENV` set or a function imported (both are
visible from inside), and it can do nothing at all about `SHELLOPTS=noexec`. `docs/IT-ALLOWLIST.md` names all three
beside `PATH`, and `scripts/guardrails.test.sh` measures every case, including the two that cannot be defended.

## Why

The alternative is a claim that does not survive contact with anyone who looks. The harness block in a prepared
project's CLAUDE.md marks the guardrails as enforced, and that word has to mean something narrower than "cannot be
got past": it means a hook of an installed plugin runs on a supported client event. A limit that is written down and
measured is a limit a reader can work with; a limit that is discovered by an outside reviewer after publication is a
claim that was wrong.

`ENV` was in this list for one round and was taken out, because only an interactive shell reads it. Leaving it in
cost something real: setting it to any string turned every refusal in the hook into a question a person can approve,
and under Codex, where a question becomes a refusal, it blocked every git command instead. A defence against a
variable that cannot do anything is not free.

## Alternatives rejected

**Refusing every command while one of these is set.** Too blunt: `BASH_ENV` is occasionally set for real reasons, and
a hook that refuses everything is a hook people turn off.

**Saying nothing.** It is the current behaviour of most hooks anywhere, and it is what makes a demonstration of the
hole embarrassing rather than uninteresting.

**Trying to detect the silencing from outside the hook.** Nothing in a plugin runs outside the hook; the client
starts the shell. A second process to watch the first is a bigger promise than this project can keep.

## Risk

A careful attacker unsets `BASH_ENV` inside the file it names, and the hook never sees it. The check catches
carelessness and misconfiguration, not a deliberate attempt, and the document says exactly that.

## Reversibility

The two checks are a few lines each in `packs/base/plugins/guardrails/hooks/guard-bash.sh`, and the document
paragraph is one bullet. Removing them is caught by `scripts/guardrails.test.sh`.

## Evidence

`scripts/guardrails.test.sh`, the section "the shell's own startup file": `BASH_ENV` naming an ordinary file turns
a refusal into a question; `BASH_ENV` naming a file that ends the shell produces no output at all; `SHELLOPTS=noexec`
does the same; an exported function turns a refusal into a question; and `ENV`, which cannot reach a script, leaves a
refusal a refusal. 502 checks in that file pass.
