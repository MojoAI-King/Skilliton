#!/usr/bin/env node
// token-cost.test.mjs: a shim. The meter's fixture test ships beside the meter inside the workflow plugin
// (packs/base/plugins/workflow/runtime/meter/token-cost.test.mjs), and this file runs it with the same arguments and
// exits with its exit code, so `node scripts/token-cost.test.mjs` and `--reference` mean what they always meant.
// --reference reports NOT RUN where the reference transcripts are absent, exactly as before.
//
//   node scripts/token-cost.test.mjs [--reference]

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TEST = join(dirname(fileURLToPath(import.meta.url)), "..", "packs", "base", "plugins", "workflow", "runtime", "meter", "token-cost.test.mjs");
const r = spawnSync(process.execPath, [TEST, ...process.argv.slice(2)], { stdio: "inherit" });
if (r.error) { console.error(`token-cost.test: the plugin's meter test could not be started: ${r.error.message}`); process.exit(3); }
process.exit(r.status ?? 1);
