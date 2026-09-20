# A command held in a variable is one word in zsh, so a loop of checks can run nothing and still report success

Kind: Living. Lesson entry.

- **ID:** 2026-09-20-a-command-held-in-a-variable-is-one-word-5d82
- **Status:** accepted
- **Date:** 2026-09-20

## What broke

During the wave 4 maintenance pass, six checks were run in one loop of the shape

```sh
for c in "node scripts/docs.test.mjs" "node scripts/names.test.mjs" ...; do
  out=$($c 2>&1 | tail -3); echo "exit $? $c"
done
```

Every iteration printed a "no such file or directory" line and `exit 0`. Six gates reported success and none of them had run. The same session then repeated the smaller half of the mistake once more, on `node scripts/packs.test.mjs 2>&1 | tail -3; echo "exit $?"`, where the printed status belonged to `tail`.

## The mechanism

Two independent faults, each sufficient on its own.

**One. zsh does not word-split an unquoted parameter expansion; bash does.** The loop was written from bash habits. In zsh the whole string is one word, so the shell looks for a program whose name is `node scripts/docs.test.mjs`. Measured on this machine on 2026-09-20:

```
$ zsh -c 'c="node --version"; $c'
zsh:1: command not found: node --version
$ bash -c 'c="node --version"; $c'
v25.8.1
```

This repository's sessions run zsh, and scripts run bash, so the same line behaves differently depending on where it is typed.

**Two. A pipeline's exit status is its last command's.** `$?` after `$c 2>&1 | tail -3` is `tail`'s, and `tail` succeeds on an empty stream. That is the 2026-09-16 lesson "A piped gate let a failing commit through", whose rule was already written into docs/MAINTAIN.md. It was broken here twice in one session, which is the more useful half of this entry: a rule that lives only in prose is a rule that gets re-broken under time pressure.

Together they produce the worst possible output, which is a clean one: six PASS lines from six programs that were never started.

## The fix

Each check on its own line, unpiped, its status read immediately:

```sh
node scripts/docs.test.mjs > /dev/null
echo "exit $? docs"
```

Where a loop is genuinely wanted, the command is passed as separate arguments and the status is taken from the command substitution, not from a pipe. The offline suite already does this and was never affected:

```sh
run() { local name="$1"; shift; if out=$("$@" 2>&1); then echo "PASS $name"; else echo "FAIL $name (exit $?)"; fi; }
run docs node scripts/docs.test.mjs
```

`"$@"` keeps each word a word in both shells, and `if out=$(...)` branches on the command's own status.

## The rule

1. Never put a command in a string and run the string. Put it in an array or pass it as arguments. In zsh the string is one word; in bash it splits on spaces and glob-expands, which is a different bug, not a fix.
2. Never pipe a gate whose result decides anything, and never read `$?` after a pipeline. One gate, one line, one status read.
3. A gate that prints nothing and passes has not passed. Output is part of the evidence: a check with no output is a check that did not run.

## What now enforces it

Nothing automatic, and that is worth saying plainly: this repository still has no hook that refuses a piped gate. What exists is `skilliton gate`, which is the product's own answer to the whole class. It runs a project's checks as its own step, keeps the full output in a log under the Git folder, and prints the verdict from the exit status. Use it in preference to hand-written loops (`scripts/gate.test.mjs` covers its behavior), and where a loop is unavoidable, copy the `run()` helper above rather than writing a new one.

Supersedes nothing: it extends the 2026-09-16 entry "A piped gate let a failing commit through", which still holds.
