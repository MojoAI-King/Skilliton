# What Cursor reads, and what a Skilliton adapter would have to write

Kind: Living. Decision entry.

- **ID:** 2026-09-20-what-cursor-reads-and-what-a-skilliton-a-006f
- **Status:** accepted
- **Date:** 2026-09-20

## Decision

Record what Cursor reads, from its published documentation, with every page's URL and the date it was
retrieved; do not build a Cursor adapter yet. `docs/CLIENTS.md` gains a Cursor column whose every cell is
`documented` with its URL or `not documented`, and never `measured`, because no session has been run there. **Cursor
is not a supported client** under this repository's own rule, which needs a column with at least one measured row.

What an adapter would have to write is settled here so that the work, when it happens, is a build rather than a
research project. What cannot carry across is settled here too, so nobody tries.

## Why

A spike is cheap and an adapter is not, and until this was read there was no way to tell which. Three
things came out of the reading that change what an adapter is:

**Most of the harness already arrives.** Cursor reads `AGENTS.md` at the project root and in any subdirectory, the
more specific taking precedence. Skilliton already writes `AGENTS.md` for Codex, so the harness block reaches a
Cursor session today with nothing new written. Cursor also reads skills as a folder holding `SKILL.md` under
`.agents/skills/`, which is the same folder Skilliton already writes for Codex in the IDE, with `name` and
`description` required in the frontmatter exactly as Claude Code wants them.

**Hooks do ship inside a Cursor plugin**, which is the opposite of Codex. The documentation says hooks are defined in
`hooks.json` at the project or user level "or install them through plugins from Customize", and the plugin layout
carries `hooks/hooks.json`. So the one thing that killed the Codex adapter is not what would kill this one.

**What would have to be rewritten is every hook itself.** The events are Cursor's own (`sessionStart`, `preToolUse`,
`beforeShellExecution`, `beforeReadFile`, `stop`, `preCompact`, `sessionEnd` and the rest), and so is the JSON. A
permission hook answers `{"permission": "allow" | "deny" | "ask", "user_message", "agent_message"}`, not Claude
Code's `hookSpecificOutput.permissionDecision`. Exit 2 blocks; other non-zero codes fail open unless the entry sets
`failClosed`. None of Skilliton's seven hooks would run unchanged.

**And one thing has no route at all.** The dispatch suggestion wave 6 added rides on `UserPromptSubmit` putting text
in front of the model. Cursor's nearest event is `beforeSubmitPrompt`, whose output schema is `continue` and
`user_message` only, with no context field. That behavior cannot be delivered to Cursor by any hook documented
today, and an adapter would have to say so rather than quietly ship six of seven.

## Alternatives rejected

**Build the adapter now.** Rejected on sequence, not on merit. Every hook body would
have to be rewritten against event names and a permission schema nobody here has watched run, and the result could
not be tested without a Cursor login. That is the same shape as the Codex adapter this wave refused, with one
difference: here the delivery route exists, so it is worth building once a session can prove it.

**Mark the Cursor cells `measured` on the strength of the documentation.** Rejected outright. The word `measured` in
this matrix means a command or a session was run here and its evidence file exists. Documentation is a claim by the
vendor; several rows in the Claude Code and Codex columns record where a vendor's claim and a run disagreed.

**Infer the blank rows from Claude Code or Codex.** Rejected. A row with no documentation behind it says "not
documented", and eleven of the twenty-nine do. Install records, executable bits, a missing home folder and the rest
are unknown, and a matrix that guessed at them would be worth less than one with holes in it.

**Skip Cursor entirely.** Rejected: the spike cost one session's reading and produced the `.agents/skills` finding,
which says a large part of the work is already done, and the `beforeSubmitPrompt` finding, which says one part
cannot be done at all. Both would otherwise have been discovered halfway through building.

## Risk

**The documentation is the weakest kind of source this repository accepts, and it is dated.** Every
cell carries its URL and 2026-09-20, so a reader can tell how old the claim is, but Cursor ships often and no version
number was available on the pages read, which is worse than the Codex column's pinned `0.154.0-alpha.6.2`.

**A reader may take a full column for support.** The column header says "documentation only", the file's opening
paragraph says Cursor is not supported, and `scripts/docs.test.mjs` fails if `README.md` names a client the matrix
does not carry. That check reports how many columns have a measured row, and it was corrected in the same change so
that a cell reading "not measured" no longer counts as one; without that, a column of documentation would have been
reported as a column with evidence.

**The adapter may be more work than the column suggests.** Rows that read "not documented" are not rows that are
simple; they are rows nobody has looked into.

## Reversibility

Trivially reversible, since nothing was built. The column is a document, and a session run
in Cursor replaces a `documented` cell with a `measured` one plus its evidence file, which is the ordinary way every
other column grew.

The one thing that would have to be undone if Cursor changed is the claim itself, and it is dated so that a reader
knows to check.

## Evidence

Retrieved 2026-09-20, each page read for this entry and cited in the matrix cell it supports:

- `https://cursor.com/docs/reference/plugins`: a plugin manifest at `.cursor-plugin/plugin.json` (or `plugin.json`
  for the open Agent Plugin format), with `name` required and `description`, `version`, `rules`, `agents`, `skills`,
  `commands`, `hooks`, `mcpServers` and `variables` among the optional fields; the layout `rules/`, `skills/<name>/SKILL.md`,
  `agents/`, `commands/`, `hooks/hooks.json`, `mcp.json`, `scripts/`, `assets/`; installation from the official
  marketplace, a team marketplace, a local folder or a git repository link; several plugins in one repository declared
  in `.cursor-plugin/marketplace.json`; `${CURSOR_PLUGIN_ROOT}` expanded in `mcp.json`.
- `https://cursor.com/docs/agent/hooks`: the four `hooks.json` layers and their precedence, enterprise down to user;
  the entry fields `command`, `type`, `timeout`, `loop_limit`, `failClosed`, `matcher`; the event list; the permission
  response shape and the merge rule "any deny wins over ask, and ask wins over allow"; exit 2 blocking and the
  fail-open default; `sessionStart` returning `additional_context` fire-and-forget; `stop` returning
  `followup_message` with a default `loop_limit` of 5; `beforeSubmitPrompt` returning only `continue` and
  `user_message`; project hooks running "in any trusted workspace".
- `https://cursor.com/docs/context/rules`: `.cursor/rules/*.mdc` with `description`, `globs` and `alwaysApply`, a
  plain `.md` there ignored; `AGENTS.md` at the root and in subdirectories; user rules and team rules from the
  dashboard.
- `https://cursor.com/docs/skills`: `.agents/skills/` and `.cursor/skills/` for a project, `~/.agents/skills/` and
  `~/.cursor/skills/` for a person; `SKILL.md` with `name` and `description` required and `paths`,
  `disable-model-invocation`, `icon`, `color`, `metadata` optional; a `scripts/` folder allowed; sharing through the
  team marketplace.
- `https://cursor.com/docs/context/mcp`: `.cursor/mcp.json` and `~/.cursor/mcp.json`, the `mcpServers` shape, approval
  before a tool runs, and team distribution through the dashboard's Plugins and MCPs section.
- `https://cursor.com/docs/cli/using`: the CLI runs non-interactively with `-p` or `--print` and `--output-format`,
  and reads `.cursor/rules`, `AGENTS.md`, `CLAUDE.md` and `mcp.json`.

**What a Skilliton adapter would have to write**, from the above, as the shopping list for the wave that builds it:

| Piece | Where it goes | State |
| --- | --- | --- |
| The harness block | `AGENTS.md`, root and subdirectories | already written for Codex; nothing new |
| The skills | `.agents/skills/<name>/SKILL.md` | already written for Codex in the IDE; frontmatter already matches |
| The plugin manifest | `.cursor-plugin/plugin.json`, or `plugin.json` for the Agent Plugin format | new, and a second manifest to keep in step with `.claude-plugin/plugin.json` |
| Seven hook bodies | `hooks/hooks.json` in the plugin, or `.cursor/hooks.json` in a project | new: different event names, different input, different response shape, `failClosed` to choose per hook |
| Guardrails | `beforeShellExecution` and `preToolUse`, answering `permission` | new, and `ask` is real here, unlike Codex where it becomes a deny |
| The read guard | `beforeReadFile` | new, and `beforeTabFileRead` decides separately whether Tab is covered |
| The dispatch suggestion | nowhere | **no route**: `beforeSubmitPrompt` cannot add context |
| MCP, if it is ever shipped | `mcp.json` in the plugin, `${CURSOR_PLUGIN_ROOT}` for paths | not applicable today |

**What is not evidence.** Nothing in this entry was run. No Cursor session, no `cursor-agent` invocation, no plugin
install, no hook firing. Every line above is a vendor's published claim, read once, on one day.
