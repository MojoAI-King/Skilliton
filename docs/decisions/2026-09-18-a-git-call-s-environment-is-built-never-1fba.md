# A git call's environment is built, never inherited

Kind: Living. Decision entry.

- **ID:** 2026-09-18-a-git-call-s-environment-is-built-never-1fba
- **Status:** accepted
- **Date:** 2026-09-18

## Decision

Every git call the runtime makes is given an environment this code builds, rather than the one it happens to
be started with. `gitEnvironment()` in `runtime/lib/journal.mjs` is the only way that environment is made. It removes
the variables that would choose a different repository (`GIT_DIR`, `GIT_INDEX_FILE` and the rest), hand git settings
from outside a configuration file (`GIT_CONFIG*`), name a program for git to run (`GIT_PROXY_COMMAND`,
`GIT_SSH_COMMAND`, `GIT_ASKPASS`, `SSH_ASKPASS`, the editor and pager pair, `GIT_TEMPLATE_DIR`), decide whether the
certificate on the other end is checked (`GIT_SSL_*`), change what a pathspec means (`GIT_LITERAL_PATHSPECS` and its
family), or decide where git writes and what it prints (`GIT_TRACE*`, `GIT_CURL_VERBOSE`, `GIT_REDIRECT_*`).

Two variables are treated differently, and only on the one call that reaches a network: `GIT_CONFIG_NOSYSTEM` and
`GIT_ATTR_NOSYSTEM` are removed there and left alone everywhere else. That one call also takes its home folder from
the system's record of this user rather than from `HOME`, and ignores `XDG_CONFIG_HOME`.

What this machine's own configuration says is followed on purpose, on every call: `~/.gitconfig` and `/etc/gitconfig`
are where a company keeps its proxy and its certificate authority, and the clone the reachability check is a promise
about would use them too.

## Why

A repository is data. A copied working folder carries its own `.git/config`, and a prepared project's settings file
can put variables into a session's environment, so both are inputs from the thing being examined. Three holes of this
exact shape were found and closed while this was being written: a secret scan that read zero of twenty tracked files
because `GIT_INDEX_FILE` was set; a password-helper program that ran because `GIT_ASKPASS` survived; and a
reachability check that reported an attacker's server as ok because the certificate variables did.

The two exceptions have reasons of their own. `GIT_CONFIG_NOSYSTEM` is left in place on a local read because every
test in this repository sets it to isolate itself from the machine it runs on, and taking it away would make what
those tests measure depend on whose laptop runs them. It is removed on the network call because switching
`/etc/gitconfig` off is the same act as redirecting it, and that file is where the company proxy lives. `HOME` is
pinned on that call for the same reason and nowhere else, because pinning it everywhere would put the developer's own
signing configuration into what the tests measure.

## Alternatives rejected

**Pointing `GIT_CONFIG_GLOBAL` at `/dev/null`.** Suggested once in review. It does not leave git with no
configuration; it leaves git with none at all, including the proxy and the certificate authority a company machine
needs, so a working machine would be reported as blocked. It is also not a path git takes on Windows.

**Deleting `GIT_CONFIG_GLOBAL` and letting git fall back.** Tried, and reversed: deleting a pointer promotes a
default, and the default here is a file chosen by `HOME`, which is reachable by the same route the deletion was
guarding against.

**Keeping `GIT_TRACE` for a person debugging.** Tried, and reversed within one round: `GIT_TRACE=<path>` makes git
create that file and append to it, which is a way to write a file through a tool whose allow list is meant to name
every place it writes. Their trace goes to the error stream, which these calls discard anyway.

**Letting each call assemble its own environment.** That is what the code did before, and it is how the third git
runner kept `process.env` for months without anyone noticing.

## Risk

`PATH` still chooses which `git` runs, and nothing in this decision changes that; it is named in
`docs/IT-ALLOWLIST.md` so the list does not read as complete. A machine whose own `~/.gitconfig` redirects the company
repository will have that followed, by design, and the reachability line says which home folder it read. A proxy set
in the machine's own configuration is used and is not named in that line, which the line says.

## Reversibility

Easy. The lists are two exported constants in one file, and `scripts/preflight.test.mjs` names every variable
explicitly rather than walking the constant, so shortening the list fails a test rather than quietly checking less.

## Evidence

`scripts/git-config.test.mjs` (8 tests: every git call in the runtime reads from `gitEnvironment()`, proved against
seven spellings of the same call and three ways of handing variables to the wrapper), `scripts/preflight.test.mjs`
(the named list, the pinned home, a decoy index, a planted askpass program and a certificate the environment asks to
skip, each with the positive control that proves plain git falls for it), and `scripts/guardrails.test.sh` (the hook
scrubs the same variables, proved by a decoy index that hides a staged secret from plain git).
