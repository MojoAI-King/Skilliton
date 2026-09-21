# Joining a machine takes one file the company hands out, not three facts typed by hand

Kind: Living. Decision entry.

- **ID:** 2026-09-21-joining-a-machine-takes-one-file-the-com-53bd
- **Status:** accepted
- **Date:** 2026-09-21

## Decision

A machine joins a company's Skilliton with one argument: `skilliton join --from <join file> --apply`. The join file (`skilliton.join/1`) is a small JSON the company makes once with `company join-file --name <company> --signers <allowed_signers> --out <path>` and hands out through device management or an internal page. It carries the company name, the fork's repository URL and the release signers text. The three-flag form stays for anyone who has the facts by hand. `company join-file` refuses to write inside any Git working tree.

## Why

On 2026-09-21 the owner tried to enable Skilliton in a repository and was refused twice by `join`, one missing flag at a time, then guessed a company name. The friction was not the refusals (fixed the same day) but the shape of the task: a developer had to know a company short name, obtain a signers file and type both correctly. A company that rolls out to every laptop needs one artifact device management can drop and one command a first-login script can run. docs/PHASE-3.md M12 already names that artifact ("the release signers file. Device management is the out-of-band channel machine setup already requires"); the join file is the smallest piece of M12 that makes the flow one step, and it keeps the trust rule: whom a machine trusts never arrives through a pull.

## Alternatives rejected

Reading the signers from the repository (a `signers` file in the fork): rejected, because a pull could then change whom a machine trusts, which is the property the signed release exists to protect. Fetching the join file from a URL inside `join`: rejected for now, because Skilliton has no HTTP code of its own (docs/IT-ALLOWLIST.md section 4) and adding it is a security-surface decision of its own; a script that downloads the file first loses nothing. Cloning the fork from inside `join`: rejected, because `join` runs from the clone's own runtime, so the clone exists before `join` can. Deriving the signers from a GitHub account's public keys page: deferred, an owner decision (B53), because it ties trust to the same account that controls the repository.

## Risk

The join file is a second trust-carrying artifact beside the signers file, so two things must travel out of band instead of one. Mitigation: the file contains the signers text itself, so a company that hands out the join file hands out nothing else; `company join-file` refuses a path inside a working tree, and `join --from` validates the signers text before writing anything. A developer who is given a join file over an untrusted channel trusts whoever sent it, exactly as with the signers file today.

## Reversibility

Fully: `join --from` is additive, the three-flag form is unchanged, the join file is not recorded anywhere on the machine (the receipt records the trust file and the clone, as before), and `join --undo` removes exactly what was added.

## Evidence

`scripts/join.test.mjs`: "company join-file writes the join file outside any repository, and join --from joins with it alone" (a path inside the repository refused; bare refusal names all three flags; preview writes nothing; the file has the schema, company and the exact signers text; `--from` with `--company` refused; an invalid signers text refused; a real join with `--from` leaves the receipt and a trust file equal to the signers text). 42 join tests pass.
