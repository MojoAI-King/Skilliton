# guardrails reads a sourced or executed script only when nothing earlier in the command can change it

Kind: Living. Decision entry.

- **ID:** 2026-09-24-guardrails-reads-a-sourced-or-executed-s-3445
- **Status:** proposed
- **Date:** 2026-09-24

## Decision

The guardrails hook (0.11.0, N8, B84) reads a file given to `source`, `.`, `sh`, `bash` or `zsh` through its own deny and ask rules, one level deep, instead of asking every time. Beyond the conditions the lane brief named (inside the project, a regular file, no symbolic link at any step below the project folder, at most 64 KB, readable), it also asks when the file holds bytes that are not text, when the file is named a second time in the same command, and when an earlier part of the command runs a program other than a short list that only prints, searches, declares or changes folder (`cd`, `echo`, `cat`, `ls`, `export` and the like). A committed, unchanged check script under `scripts/` keeps its earlier allow without being read.

## Why

The hook reads the file as it is before the command runs. A file named twice (`cp x run.sh && bash run.sh`), or one after a program that may rewrite it (`make && bash out.sh`, `git pull && bash deploy.sh`), could hold other text by the time it runs, and reading the old text would turn a question into a silent allow. The common case the item was written for, `source .venv/bin/activate` at the start of a command or after `cd`, still goes through.

## Alternatives rejected

Reading the file whatever came before it in the command (simpler, and what the brief's wording alone would give): rejected because it allows a file an earlier step can replace. Reading a script nested inside the file: rejected by the brief, one level deep. Reading for `dash` and `ksh` too: left out because the brief names five spellings; they still ask.

## Risk

A command such as `npm ci && source .venv/bin/activate` still asks where a person might expect it to go through. A program on the short list writes a file only through a redirection, which names the file, so the named-twice check asks. A write by a program the hook does not see (a daemon, another terminal) between the read and the run is not caught, the same limit the rest of the hook states.

## Reversibility

One function (`read_script` in guard-bash.sh) and one line in `analyze_segment` that marks an earlier program; removing either restores the 0.10.0 ask. No stored state.

## Evidence

`scripts/guardrails-review2.test.sh`, section N8: 32 checks, including the venv activate fixture allowing, a file that force-pushes main denying with the file named, a file outside, a link, a linked folder, a file over 64 KB, a nested source, a named-twice file and a file after `make` asking. Two N90 cases changed from ask to allow (an edited and an untracked script under `scripts/` whose text fires nothing), labelled in the file. Every lane suite exit 0 on the commit.
