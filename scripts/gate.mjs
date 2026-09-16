#!/usr/bin/env node
// gate.mjs: wrap the existing verify command. Do not maintain a second list of checks.
//   - preserves the real exit status (never pipe a test through head/tail)
//   - writes complete stdout+stderr to .gate/<lane>.log
//   - prints one deterministic summary line naming source, command, result, log path
// Usage: node scripts/gate.mjs [--lane <name>] [--cmd "<command>"]
// Default command: npm run verify

import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream } from "node:fs";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const lane = opt("--lane", "main");
const cmd = opt("--cmd", "npm run verify");

mkdirSync(".gate", { recursive: true });
const logPath = `.gate/${lane}.log`;
const log = createWriteStream(logPath);

let sha = "unknown";
try { sha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch {}

const started = Date.now();
const child = spawn(cmd, { shell: true, stdio: ["ignore", "pipe", "pipe"] });
let bytes = 0;
for (const s of [child.stdout, child.stderr]) {
  s.on("data", (d) => { bytes += d.length; log.write(d); });
}
child.on("close", (code) => {
  log.end(() => finish(code));
});

function finish(code) {
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const result = code === 0 ? "PASS" : `FAIL(exit ${code})`;
  // One line. This is all that should enter the model's context.
  console.log(`gate lane=${lane} sha=${sha} cmd="${cmd}" result=${result} time=${secs}s output=${bytes}B log=${logPath}`);
  if (code !== 0) {
    // On failure, surface the tail so the failure is diagnosable without cat-ing the whole log.
    try {
      const tail = execSync(`tail -n 40 ${logPath}`).toString();
      console.log("---- last 40 lines ----\n" + tail);
    } catch {}
  }
  process.exit(code ?? 1);
}
