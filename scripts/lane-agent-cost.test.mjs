#!/usr/bin/env node
// lane-agent-cost.test.mjs: a lane run as an agent from the integrating window is counted as that lane's cost (B89).
//
// Claude Code files such a lane under the integrating window's session, in <folder>/<session>/subagents/, so the lane
// folder has no transcripts of its own and `dispatch close` read 0 requests for all seven lanes of one batch. The meter's
// --lane-dir (runtime/meter/lanes.mjs) attributes a subagent transcript to a lane when its meta.json names a lane agent
// and its first message names the lane folder and no other folder beside it, and then the agents it started, found by
// the toolUseId in their meta.json. Every fixture here is built in a temporary folder; no real transcript is read.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const runtime = join(here, "..", "packs", "base", "plugins", "workflow", "runtime");
const METER = join(runtime, "meter", "token-cost.mjs");
const { folderNameFor } = await import(join(runtime, "meter", "projects.mjs"));
const { laneFigures } = await import(join(runtime, "lib", "usage.mjs"));

const MODEL = "claude-sonnet-5";
const usage = (id, extra = {}) => JSON.stringify({
  type: "assistant", requestId: `r-${id}`, timestamp: "2026-09-24T12:00:00.000Z",
  message: { id: `m-${id}`, model: MODEL, usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, ...extra },
});
const prompt = (text) => JSON.stringify({ type: "user", message: { role: "user", content: text } });
const call = (id) => ({ content: [{ type: "tool_use", id, name: "Agent", input: {} }] });

function fixture(t) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "lane-cost-")));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const home = join(base, "home");
  const lanes = join(home, "lanes");
  const ctx = { base, home, projects: join(base, "projects"), main: join(home, "main"), alpha: join(lanes, "alpha"), beta: join(lanes, "beta"), alphaTwo: join(lanes, "alpha-two") };
  for (const d of [ctx.main, ctx.alpha, ctx.beta, ctx.alphaTwo]) mkdirSync(d, { recursive: true });
  const mainFolder = join(ctx.projects, folderNameFor(ctx.main));
  const sub = join(mainFolder, "session-1", "subagents");
  mkdirSync(sub, { recursive: true });
  const agent = (name, meta, lines) => {
    writeFileSync(join(sub, `${name}.jsonl`), `${lines.join("\n")}\n`);
    if (meta) writeFileSync(join(sub, `${name}.meta.json`), JSON.stringify(meta));
  };
  writeFileSync(join(mainFolder, "session-1.jsonl"), `${usage("main")}\n`);
  // a: the lane agent, its brief naming the lane with the home folder as ~; it starts b.
  agent("agent-a", { agentType: "workflow:lane", toolUseId: "toolu_from_main" },
    [prompt("Follow the brief in ~/lanes/alpha."), usage("a"), usage("a2", call("toolu_child_b"))]);
  agent("agent-b", { agentType: "Explore", toolUseId: "toolu_child_b" }, [prompt("Find where the meter walks folders."), usage("b")]);
  // c names two lane folders; d names a folder whose name only starts like the lane's; e is not a lane agent; f has no meta.
  agent("agent-c", { agentType: "workflow:lane", toolUseId: "toolu_c" }, [prompt(`Lanes ${ctx.alpha} and ${ctx.beta}.`), usage("c")]);
  agent("agent-d", { agentType: "workflow:lane", toolUseId: "toolu_d" }, [prompt(`Read ${ctx.alphaTwo}/LANE_BRIEF.md.`), usage("d")]);
  agent("agent-e", { agentType: "general-purpose", toolUseId: "toolu_e" }, [prompt(`Review ${ctx.alpha}.`), usage("e")]);
  agent("agent-f", null, [prompt(`Read ${ctx.alpha}.`), usage("f")]);
  // The lane folder's own session, as when a person opens a window in it.
  const own = join(ctx.projects, folderNameFor(ctx.alpha));
  mkdirSync(own, { recursive: true });
  writeFileSync(join(own, "session-2.jsonl"), `${usage("own")}\n`);
  ctx.env = { ...process.env, HOME: home, SKILLITON_PROJECTS: ctx.projects, SKILLITON_TZ: "UTC" };
  return ctx;
}

function meter(ctx, args) {
  const r = spawnSync(process.execPath, [METER, ...args, "--json"], { env: ctx.env, encoding: "utf8" });
  return { code: r.status, out: r.status === 0 ? JSON.parse(r.stdout) : null, err: r.stderr };
}
const requests = (out) => Object.values(out.byScope).reduce((n, s) => n + s.requests, 0);

test("--lane-dir counts the lane's own sessions, its lane agent and the agent it started, and nothing else", (t) => {
  const ctx = fixture(t);
  const r = meter(ctx, ["--lane-dir", ctx.alpha]);
  assert.equal(r.code, 0, r.err);
  assert.equal(requests(r.out), 4, "own + a (two requests) + b");
  assert.equal(r.out.lane_agent_files, 2);
  assert.equal(r.out.lane_agent_children, 1);
  assert.equal(r.out.lane_agent_ambiguous, 1, "c names alpha and beta, so it is left out and counted");
  assert.equal(r.out.lane_agent_no_meta, 1, "f has no meta.json, so its type is unknown and it is counted as such");
  assert.equal(r.out.lane_dirs, 1);
  assert.equal(r.out.byScope.subagent.requests, 3);
});

test("a folder whose name only starts like the lane's is another lane, and the absolute spelling matches too", (t) => {
  const ctx = fixture(t);
  const r = meter(ctx, ["--lane-dir", ctx.alphaTwo]);
  assert.equal(r.code, 0, r.err);
  assert.equal(requests(r.out), 1, "d only");
  assert.equal(r.out.lane_agent_files, 1);
  assert.equal(r.out.absent_project_dirs, 1, "alpha-two has no session of its own");
});

test("a brief naming two lane folders counts for neither", (t) => {
  const ctx = fixture(t);
  const r = meter(ctx, ["--lane-dir", ctx.beta]);
  assert.equal(r.code, 0, r.err);
  assert.equal(requests(r.out), 0);
  assert.equal(r.out.lane_agent_ambiguous, 1);
});

test("with the integrating folder as well, every transcript is read once", (t) => {
  const ctx = fixture(t);
  const both = meter(ctx, ["--project-dir", ctx.main, "--lane-dir", ctx.alpha]);
  assert.equal(both.code, 0, both.err);
  assert.equal(both.out.files, 8, "the main session, six subagents and the lane's own session, each once");
  assert.equal(both.out.duplicates, 0);
  assert.equal(requests(both.out), 9);
  const main = meter(ctx, ["--project-dir", ctx.main]);
  assert.equal(requests(main.out), 8, "without --lane-dir the integrating folder counts its lane agents as its own, as before");
  assert.equal(main.out.lane_agent_files, 0);
});

test("--lane-dir with --project is refused", (t) => {
  const ctx = fixture(t);
  const r = meter(ctx, ["--lane-dir", ctx.alpha, "--project", "main"]);
  assert.equal(r.code, 2);
  assert.match(r.err, /does not combine with --project/);
});

test("dispatch close's figures come from --lane-dir, and a meter that does not know it is asked with --project-dir alone", (t) => {
  const ctx = fixture(t);
  const f = laneFigures({ path: METER }, ctx.alpha, ctx.env);
  assert.equal(f.requests, 4);
  assert.equal(f.laneAgents, 2);
  assert.equal(f.laneAgentsLeftOut, 1);

  const old = join(ctx.base, "old-meter.mjs");
  writeFileSync(old, [
    "const a = process.argv.slice(2);",
    "const n = a.includes('--lane-dir') ? 999 : 3;",
    "const row = { requests: n, input: n, output: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, peak_context: 7, cost_usd: 0 };",
    "process.stdout.write(JSON.stringify({ byScope: { top: row }, incomplete: false }));",
  ].join("\n"));
  const g = laneFigures({ path: old }, ctx.alpha, ctx.env);
  assert.equal(g.requests, 3, "the answer given to --lane-dir by a meter that does not report lane_agent_files is not used");
  assert.equal(g.laneAgents, null);
});
