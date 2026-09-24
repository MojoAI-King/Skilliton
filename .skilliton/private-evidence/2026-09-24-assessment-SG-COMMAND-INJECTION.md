# Assessment note: SG-COMMAND-INJECTION

Kind: Reference. Evidence note for one security record, written 2026-09-24 by a build session, for the owner to countersign. Paths are repository-relative; runtime/ means packs/base/plugins/workflow/runtime/.

Control: Assess operating-system command construction. Expected: reviewed command entry points and tests of untrusted
input, or a scoped explanation requiring human assessment. Assessment recorded: observed.

## Command entry points reviewed

- runtime/lib/core.mjs runProgram takes a program and an argument list and starts it with spawnSync and no shell.
  windowsCmdLine sends a .cmd or .bat launcher through cmd.exe on Windows only when the path holds none of the
  characters cmd.exe reads and every argument is plain; otherwise the start fails. resolveProgram keeps a program in
  the working folder from standing in for one on PATH.
- Every other spawn or spawnSync in the plugin runtime takes an argument list with no shell (trust, journal,
  collectors, delivery, preflight, join, and the propose and import commands). There is no exec or execSync.
- The one shell: runtime/lib/gate.mjs starts the text given to gate --cmd, or the project's own npm run verify, with
  shell true. That text is the command the person typed on their own machine, not repository or hook input, and the
  line carries the audit marker saying so. This is the scoped explanation the control allows.
- runtime/lib/audit.mjs AUDIT_RULES holds shell-true and interpolated-exec, both mapped to this control, so a new
  shell or interpolated command line is flagged by the self-running audit.

## Tests of untrusted input

- scripts/windows-cmd.test.mjs: "a character cmd.exe would read keeps the program out of cmd.exe" (ampersand, pipe,
  percent, exclamation mark, a quote, a space), and "a .cmd launcher on Windows goes through cmd.exe with the path quoted".
- scripts/audit.test.mjs: "a shell child process is found, under the command injection control"; "an interpolated
  command line is found, and so is a concatenated one"; "a revision git could read as an option or a command is
  refused, and never reaches git".
- scripts/git-config.test.mjs: "every git call in the runtime turns the setting off"; "the session hooks read the
  repository without starting it" (a repository's own git configuration cannot start a program).
- scripts/usage.test.mjs: "--since is refused when it is not a revision, before git is asked anything".

## Residual findings (for the backlog, not part of the observation)

- The gate's shell path has no test with hostile text; it rests on the explanation above.
- commands/propose.mjs and commands/import.mjs start a bare bash without resolveProgram, so on Windows a bash in the
  working folder could be picked up.
- The audit rules read one line at a time, so a command line split over two lines is not flagged.
