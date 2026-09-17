# Skilliton is the evolved product name

Kind: Living. Decision entry.

- **ID:** 2026-09-16-skilliton-is-the-evolved-product-name-0be0
- **Status:** accepted
- **Date:** 2026-09-16

## Decision

Skilliton is the product's current name; Skillgate is its former name. This supersedes the earlier decision headed "Repository name Skilliton, product name Skillgate" in DECISIONS.md. Update current documentation, generated instructions, plugin descriptions and displayed runtime text. Keep existing technical identifiers compatible, as listed in docs/BRANDING.md.

## Why

The owner clarified that the product evolved and was rebranded, rather than the repository and product having separate names. Current copy must communicate one product.

## Alternatives rejected

- Keeping the separate-name explanation: contradicts the owner's clarification.
- Renaming all commands, paths, marketplace identities and stored markers in a text replacement: would break existing installs and require a separate migration.
- Rewriting historical evidence: would misrepresent what earlier runs actually exercised.

## Risk

Old technical names can look inconsistent without an explanation, so README.md links to the compatibility policy. Launcher recognition compares exact text and must retain its existing generated comment. The workflow template changes, so prepared projects need the normal instruction migration; bump the workflow plugin to 0.5.1.

## Reversibility

Easy: product wording can be changed without moving stored data or renaming commands.

## Evidence

Owner clarification and cleanup request in this session. The task record 2026-09-16-make-skilliton-the-consistent-product-na-a6ba tracks checks and completion. Historical client rehearsals remain at their recorded versions.
