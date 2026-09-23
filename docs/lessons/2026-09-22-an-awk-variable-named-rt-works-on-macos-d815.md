# An awk variable named RT works on macOS and is silently reset by GNU awk

Kind: Living. Lesson entry.

- **ID:** 2026-09-22-an-awk-variable-named-rt-works-on-macos-d815
- **Status:** accepted
- **Date:** 2026-09-22

## What broke

The guard-security lane's new redirection cases (a write into `.skilliton/config.json`, a file written then staged in the same command) passed on the build Mac, 117 of 117, and 17 of them failed in CI on the Linux runner at 5a0f1e9: every one expected an ask and got an allow.

## The mechanism

The tokenizer in `packs/base/plugins/guardrails/hooks/guard-bash.sh` is an awk program. It marked a redirection target by prefixing it with a variable named `RT`, set once in `BEGIN`. In BSD awk (macOS) `RT` is an ordinary name. In GNU awk, which the Ubuntu runner uses, `RT` is a built-in: the text that matched `RS` for the record just read, reset on every record. So by the time a target was emitted the mark was the record terminator, no word carried the mark, and every redirection-based rule saw nothing.

## The fix

The awk variable is `RDM` now, with a comment saying why not `RT`. Proved both ways in a `node:22-bookworm` container with GNU awk 5.2.1: the committed hook failed 17 of the 123 bypass checks, the fixed one passed all 123 and all 676 of the original suite.

## The rule

An awk program that ships must not name a variable after a GNU awk built-in (`RT`, `FPAT`, `IGNORECASE`, `RSTART`, `RLENGTH`, `PROCINFO`, `SYMTAB`, `FUNCTAB` and the POSIX ones). A hook change is not verified until it has run under GNU awk as well as the Mac's awk; the Docker line above runs both suites under it in about two minutes.

## What now enforces it

CI, which runs every suite on Linux with GNU awk, is what caught it; nothing checks the names before a push. A lint for built-in names in shipped awk programs is not written yet.
