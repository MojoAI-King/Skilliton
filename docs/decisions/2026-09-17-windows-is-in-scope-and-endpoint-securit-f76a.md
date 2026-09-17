# Windows is in scope, and endpoint-security support is built without a product to test under

Kind: Living. Decision entry.

- **ID:** 2026-09-17-windows-is-in-scope-and-endpoint-securit-f76a
- **Status:** accepted
- **Date:** 2026-09-17

## Decision

Windows is in scope for Skilliton, and the owner will test on a Windows machine, which is the machine the owner has for testing. The four endpoint-security items are built now: a test that keeps docs/IT-ALLOWLIST.md matched to the code (B26), a preflight check (B27), a small-footprint test (B28), and the preflight proved against blocks created on purpose on real machines (B29). No endpoint-security product is available, so a run under ThreatLocker or a similar product stays not measured and is stated that way. How Windows is supported (PowerShell versions of the launcher and hooks, or a stated Git Bash or WSL requirement) is proposed by the next session for the owner to confirm.

## Why

The owner said on 2026-09-17: "I want all 4 of those set up even though I can only test on windows and have no way of getting on a threatlocker or similar security software device right now so its gonna have to be built in theory enough". Companies that push Skilliton to managed laptops run endpoint security and often Windows, so both are adoption blockers.

## Alternatives rejected

- Waiting for a security product before building the preflight and the tests: nothing would be built, and the allow list could drift from the code meanwhile.
- Claiming ThreatLocker compatibility from the allow list and blocks made on purpose: that would present a derived list as a measurement.
- Leaving Windows out: the owner's only test machine is Windows.

## Risk

- Blocks created on purpose (a program removed from the search path, a folder made unwritable, a network destination refused) are real conditions on a real machine, but a product may block in ways they do not show, for example by parent process or by script origin. The page and the evidence keep saying "not tested under any product" until one is.
- Windows support touches every hook and the launcher. Until it is rehearsed on Windows, docs keep "macOS and Linux".

## Reversibility

Easy for the decision; the Windows approach, once built, is harder to change, which is why it is proposed before it is built.

## Evidence

The owner's message in this session (2026-09-17, about 13:30 EDT). Backlog B26 to B30; docs/IT-ALLOWLIST.md.
