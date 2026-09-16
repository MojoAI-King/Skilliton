#!/usr/bin/env node
// skillgate: the Skillgate command line. Node only, no dependencies.
//
//   node scripts/skillgate.mjs <command> ...   from a company skills repository checkout
//   skillgate <command> ...                    through bin/skillgate of the installed workflow plugin
//
// Contracts: docs/CONTRACTS.md. Exit codes, for every command: 0 complete; 1 attention (an evaluated state needs
// action); 2 invalid or refused (nothing was written); 3 operation failed (an internal error or a failed write).
//
// Built-in commands live in lib/core.mjs. Every other command is a module in commands/<name>.mjs exporting
// `run(argv)` (returning an exit code) and `help` (a string). A command listed below whose module is not there yet is
// refused as not built, never silently skipped.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Refused, say, selfCommand, cmdDoctor, cmdHarness, cmdProjectSettings, cmdNewSkill, cmdImport } from "./lib/core.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const GROUPS = [
  {
    title: "Project setup and everyday work",
    commands: [
      { name: "prepare", summary: "adopt a project's existing records and add the missing ones, config, instructions and security register (--apply writes)" },
      { name: "migrate", summary: "show or apply the project's pending layout migrations, with receipts and a tested rollback" },
      { name: "remove", summary: "remove Skillgate's managed instructions and config from a project, keeping its records and history (--apply writes)" },
      { name: "status", summary: "where the project stands: versions, migrations, records, open tasks, handoff freshness, security evidence" },
      { name: "task", summary: "start, list, show, or close a task record (one file per task, safe for parallel contributors)" },
      { name: "checkpoint", summary: "add a checkpoint (state, evidence, next step) to the current task record" },
      { name: "record", summary: "create a decision or lesson entry with a collision-free ID" },
      { name: "index", summary: "regenerate the decision, lesson and task indexes from their entries" },
      { name: "security", summary: "project security evidence: status, record, applicability, collect, findings" },
      { name: "hook", summary: "run a lifecycle hook (session-start, stop, pre-compact, session-end); called by the plugin's hooks" },
    ],
  },
  {
    title: "Company skills repository",
    commands: [
      { name: "doctor", summary: "check Claude Code, the marketplace, base plugins, harness block, config, and hook tools (writes nothing)", run: cmdDoctor },
      { name: "harness", summary: "show the harness block change for CLAUDE.md and AGENTS.md; --apply writes it, --undo removes it", run: cmdHarness },
      { name: "company", summary: "company init: give a fork its own marketplace name, owner and team settings template (--apply writes)" },
      { name: "new-plugin", summary: "create a plugin for the company's own skills and list it in the catalog and team template (--apply writes)" },
      { name: "project-settings", summary: "show the team .claude/settings.json built from the template; --apply merges it into the project", run: cmdProjectSettings },
      { name: "new-skill", summary: "create a SKILL.md skeleton in a plugin and bump the plugin's version", run: cmdNewSkill },
      { name: "import", summary: "scan an existing skill folder, then copy it into a plugin and bump the plugin's version", run: cmdImport },
      { name: "propose", summary: "turn a project lesson into a scrubbed improvement proposal for the company skills repository" },
      { name: "release", summary: "create, list, or withdraw a company release manifest (approval is a signed tag)" },
      { name: "verify", summary: "check installed plugins against approved releases: VERIFIED, TAMPERED, UNKNOWN VERSION, WITHDRAWN" },
      { name: "trust", summary: "record, show, or remove the company release signers this machine trusts" },
      { name: "delivery", summary: "install or run the trusted delivery check that tests a shared branch's combined result" },
    ],
  },
];

const COMMANDS = new Map(GROUPS.flatMap((g) => g.commands.map((c) => [c.name, c])));
const moduleFile = (name) => join(HERE, "commands", `${name}.mjs`);
const built = (c) => typeof c.run === "function" || existsSync(moduleFile(c.name));

function helpText() {
  const width = Math.max(...[...COMMANDS.keys()].map((n) => n.length)) + 2;
  const lines = ["Skillgate command line. Commands that write show their change first."];
  for (const group of GROUPS) {
    lines.push("", `${group.title}:`);
    for (const c of group.commands) lines.push(`  ${c.name.padEnd(width)}${c.summary}${built(c) ? "" : " (not built in this version)"}`);
  }
  lines.push(
    "",
    `Details for one command: ${selfCommand()} <command> --help`,
    "Exit codes: 0 complete; 1 attention (an evaluated state needs action); 2 invalid or refused (the reason is printed,",
    "nothing written); 3 operation failed (an internal error or a failed write).",
  );
  return lines.join("\n");
}

async function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h" || command === "help") { say(helpText()); return 0; }
  if (command === "--version") {
    const { readPluginVersion, PLUGIN_ROOT } = await import("./lib/core.mjs");
    say(`skillgate runtime ${readPluginVersion(PLUGIN_ROOT) ?? "(version unreadable)"} (workflow plugin)`);
    return 0;
  }
  const entry = COMMANDS.get(command);
  if (!entry) throw new Refused(`unknown command "${command}". Run: ${selfCommand()} --help`);
  if (entry.run) return entry.run(rest);
  if (!existsSync(moduleFile(command))) throw new Refused(`"${command}" is planned but not built in this version of the runtime. Run: ${selfCommand()} --help`);
  const mod = await import(pathToFileURL(moduleFile(command)).href);
  if (typeof mod.run !== "function") throw new Error(`commands/${command}.mjs does not export run()`);
  if (rest.includes("--help") || rest.includes("-h")) {
    if (typeof mod.help === "string") { say(mod.help); return 0; }
  }
  return await mod.run(rest);
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (e) {
  if (e instanceof Refused) {
    console.error(`skillgate: refused: ${e.message}`);
    process.exitCode = 2;
  } else {
    console.error(`skillgate: unexpected internal error: ${e?.message ?? e}. This is a bug in skillgate; steps printed above completed, and nothing after them ran.${process.env.SKILLGATE_DEBUG ? `\n${e?.stack}` : " Set SKILLGATE_DEBUG=1 to see where it happened."}`);
    process.exitCode = 3;
  }
}
