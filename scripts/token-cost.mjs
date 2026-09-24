#!/usr/bin/env node
// token-cost.mjs: a shim. The meter ships inside the workflow plugin (packs/base/plugins/workflow/runtime/meter/
// token-cost.mjs), so every prepared project has it; this file runs that meter with the same arguments and exits with
// its exit code, so every document that names scripts/token-cost.mjs stays true. The meter's contract, its traps and
// its price table are described in the plugin's copy, which is the only copy.
//
//   node scripts/token-cost.mjs [FROM_DAY TO_DAY] [--project <substring>]... [--until <ISO time>] [--by-project] [--json]

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const METER = join(dirname(fileURLToPath(import.meta.url)), "..", "packs", "base", "plugins", "workflow", "runtime", "meter", "token-cost.mjs");
const r = spawnSync(process.execPath, [METER, ...process.argv.slice(2)], { stdio: "inherit" });
if (r.error) { console.error(`token-cost: the plugin's meter could not be started: ${r.error.message}`); process.exit(3); }
process.exit(r.status ?? 1);
