// preflight-programs.mjs: the programs preflight checks for, one row per program docs/IT-ALLOWLIST.md section 1 names
// (scripts/allowlist.test.mjs holds the two to each other). Moved out of preflight.mjs, which re-exports it, when that
// file reached its size pin.

// Every program docs/IT-ALLOWLIST.md section 1 names, what starts it, and what stops working without it.
//   by      "hook" a hook script starts it, so the probe script starts it here; "runtime" node starts it; "client" a
//           coding tool the developer runs
//   need    "required" Skilliton does not work without it; "feature" one part stops working; "reader" one of the JSON
//           readers, of which one is enough; "maintainer" only a company maintainer's own commands reach it
//   blocks  "setup" setting a machine up cannot finish without it; "sessions" setup finishes and something in a later
//           session does not work; null neither. bash is a "sessions" item: join writes files with node and drives the
//           coding tools, and it is the hooks and the launcher that need a shell afterwards.
export const PROGRAMS = [
  {
    name: "node", by: "runtime", need: "required", blocks: "setup",
    what: "every command, every session hook, and reading the JSON a hook is given when jq is not there",
  },
  { name: "bash", by: "runtime", need: "required", what: "every hook script and the terminal launcher", blocks: "sessions" },
  { name: "sh", by: "runtime", need: "required", what: "the shell Claude Code hands each hook command to, and the launcher join writes", blocks: "sessions" },
  { name: "env", by: "runtime", need: "required", what: "the first line of every hook script", blocks: "sessions" },
  {
    name: "git", by: "runtime", need: "required", blocks: "setup",
    what: "project state at session start, the secret check before a commit, and release verification",
  },
  { name: "ssh-keygen", by: "runtime", need: "required", what: "checking the signature on a company release, so verify can say VERIFIED", blocks: "setup" },
  {
    name: "jq", by: "hook", need: "feature", blocks: "sessions",
    what: "the optional status line and the drift check, which have no other way to read JSON; the guardrails and handoff hooks fall back to node",
  },
  {
    name: "python3", by: "hook", need: "optional", blocks: null,
    what: "reading a hook's input where neither jq nor node is there, which cannot happen while node is required",
  },
  {
    name: "npm", by: "runtime", need: "optional", blocks: null,
    what: "skilliton gate's fallback (npm run verify) in a project with a verify script in package.json and no delivery policy; a project without "
      + "either names its command with --cmd",
  },
  { name: "grep", by: "hook", need: "required", what: "the guardrails check for secrets in a commit", blocks: "sessions" },
  { name: "find", by: "hook", need: "required", what: "the same check, when it looks at files", blocks: "sessions" },
  { name: "dirname", by: "hook", need: "required", what: "the terminal launcher and the status line", blocks: "sessions" },
  { name: "readlink", by: "hook", need: "required", what: "the terminal launcher, when it follows a link", blocks: "sessions" },
  { name: "awk", by: "hook", need: "feature", what: "the session-start checklist and the guardrails command reader", blocks: "sessions" },
  { name: "sed", by: "hook", need: "feature", what: "the session-start checklist and the drift check", blocks: "sessions" },
  { name: "tr", by: "hook", need: "feature", what: "the session-start checklist and the status line", blocks: "sessions" },
  { name: "wc", by: "hook", need: "feature", what: "the session-start checklist", blocks: "sessions" },
  { name: "cat", by: "hook", need: "feature", what: "the status line and the guardrails hook reading their input", blocks: "sessions" },
  { name: "date", by: "hook", need: "feature", what: "the time on each status line record", blocks: "sessions" },
  { name: "mkdir", by: "hook", need: "feature", what: "the status line's log folder", blocks: "sessions" },
  { name: "head", by: "hook", need: "feature", what: "the drift check", blocks: "sessions" },
  { name: "tail", by: "hook", need: "feature", what: "the drift check", blocks: "sessions" },
  { name: "cut", by: "hook", need: "feature", what: "the drift check", blocks: "sessions" },
  { name: "ls", by: "hook", need: "feature", what: "the drift check, finding the newest transcript", blocks: "sessions" },
  { name: "xargs", by: "hook", need: "feature", what: "the scrub check that import and propose run", blocks: "sessions" },
  { name: "tar", by: "runtime", need: "feature", what: "the delivery gate on a shared repository", blocks: "sessions" },
  { name: "ps", by: "runtime", need: "feature", what: "a failing skilliton gate verdict naming the other node processes running", blocks: null },
  { name: "cp", by: "hook", need: "maintainer", what: "the scrub check's own self-test", blocks: null },
  { name: "mktemp", by: "hook", need: "maintainer", what: "the scrub check's own self-test", blocks: null },
  { name: "rm", by: "hook", need: "maintainer", what: "the scrub check's own self-test", blocks: null },
  {
    name: "cmd.exe", by: "runtime", need: "required", platform: "win32", blocks: "setup",
    what: "on Windows, starting npm's claude launcher, a .cmd file Node cannot start by itself",
  },
  {
    name: "xcode-select", by: "hook", need: "feature", platform: "darwin", blocks: "sessions",
    what: "on a Mac, telling a real python3 from the developer-tools stub",
  },
  { name: "caffeinate", by: "runtime", need: "feature", what: "on a Mac, keeping it awake while skilliton gate runs", platform: "darwin", blocks: null },
  { name: "pmset", by: "runtime", need: "feature", what: "on a Mac, a failing gate verdict saying if the machine slept", platform: "darwin", blocks: null },
  {
    name: "sysctl", by: "runtime", need: "feature", platform: "darwin", blocks: null,
    what: "on a Mac, when it last slept, so the power log is read only if needed",
  },
  { name: "claude", by: "client", need: "client", what: "Claude Code itself: the marketplace, the plugins and every session", blocks: "setup" },
  { name: "codex", by: "client", need: "client", what: "Codex itself, for teams that use it", blocks: "setup" },
];
