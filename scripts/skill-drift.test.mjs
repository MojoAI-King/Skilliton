// skill-drift.test.mjs: two kinds of drift between a skill's text and what the harness does.
//
// N18 (backlog B73): the maintain skill's first step is the one command every maintenance runs, so the journal sees
// each one, and the stop hook's maintenance-due sentence names that same command. If either side changes alone, the
// skill and the reminder send a person two different ways.
//
//   node scripts/skill-drift.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { maintainReason } from "../packs/base/plugins/workflow/runtime/lib/maintain.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = join(REPO, "packs", "base", "plugins", "workflow");

test("the maintain skill's first step and the stop hook's maintenance sentence name the same command", () => {
  const skill = readFileSync(join(PLUGIN, "skills", "maintain", "SKILL.md"), "utf8");
  const body = skill.slice(skill.indexOf("\n---", 3) + 4);
  const firstSection = body.slice(body.indexOf("\n## "), body.indexOf("\n## ", body.indexOf("\n## ") + 1));
  assert.match(firstSection, /^\n## First step: run skilliton maintain --apply and read its output\n/, "the first section of the skill is that step");
  assert.ok(firstSection.includes("run skilliton maintain --apply and read its output."), "the step says it in those words");
  const reason = maintainReason({ why: "a merge commit landed", baseline: { kind: "maintain" } }, { command: "skilliton" });
  assert.match(reason, /Before finishing, run: skilliton maintain --apply \(/, "the stop hook names the same command");
});
