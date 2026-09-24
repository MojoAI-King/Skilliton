// lanes.mjs: which subagent transcripts belong to a dispatch lane that ran as an agent (--lane-dir).
//
// A lane run as a lane agent from the integrating window writes no transcript folder of its own: Claude Code files the
// agent under that window's session, in <project folder>/<session>/subagents/, with the window's working directory
// recorded on every line. Measured 2026-09-24 on the machine this was written on: 20 lane agents from four batches, each
// recorded the integrating checkout as its working directory, and each first prompt named exactly one lane folder. So a
// lane agent is told apart by what Claude Code writes beside it and in it:
//   1. its <name>.meta.json names an agent type of "lane" or "<plugin>:lane" (workflow:lane ships in this plugin);
//   2. its first user message, the brief it was started with, names the lane folder, as the path the person gave or
//      its real path, either one also with the home folder written as ~, and names no other folder beside it (a prompt
//      naming two lane folders is left out and counted, because the cost cannot be split between them);
//   3. a subagent the lane agent started is filed in the same subagents folder with a meta.json whose toolUseId is the
//      id of the lane agent's own tool call (6 of 6 children measured the same day), so it is counted with the lane,
//      and so on down.
// What it cannot see: a lane run by an agent of another type, and a subagent transcript with no meta.json (Claude Code
// wrote none for 52 of 2,175 on that machine). Both are counted and reported, never guessed.

import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { folderNameFor } from "./projects.mjs";

const LANE_TYPE = /(^|:)lane$/;
const PROMPT_BYTES = 262144; // the first prompt of a lane is a few kilobytes; one that does not start inside this is reported
const NAME_CHAR = /[A-Za-z0-9._-]/;
const PATH_CHAR = /[A-Za-z0-9._~/-]/;

// One --lane-dir: the folder Claude Code would file a session opened in it under, and every spelling a brief could use.
export function laneTarget(path) {
  const abs = resolve(path);
  let real = abs;
  try { real = realpathSync(abs); } catch { real = abs; }
  const home = homedir();
  const spellings = new Set([abs, real]);
  for (const p of [abs, real]) if (home && p.startsWith(`${home}/`)) spellings.add(`~${p.slice(home.length)}`);
  const pairs = [...spellings].map((s) => ({ parent: dirname(s), name: basename(s) }));
  return { folder: folderNameFor(abs), pairs };
}

// The folder names under one of the lane's parent spellings that the text names: "<parent>/<name>" where the character
// before is not part of a path and the name runs to the first character that cannot be in one, less any full stops
// that end it (a folder name ending in a full stop is read as the end of a sentence).
function namedBeside(text, lane) {
  const names = new Set();
  for (const { parent, name } of lane.pairs) {
    const lead = `${parent}/`;
    for (let at = text.indexOf(lead); at !== -1; at = text.indexOf(lead, at + 1)) {
      if (at > 0 && PATH_CHAR.test(text[at - 1])) continue;
      let end = at + lead.length;
      while (end < text.length && NAME_CHAR.test(text[end])) end++;
      const found = text.slice(at + lead.length, end).replace(/\.+$/, ""); // a full stop after a path ends the sentence
      if (found) names.add(found === name ? lane : `${parent}/${found}`);
    }
  }
  return names;
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

// The text of the first user message, read from the start of the file only, or null when none starts in PROMPT_BYTES.
function firstPrompt(path) {
  let fd;
  try {
    fd = openSync(path, "r");
    const buf = Buffer.alloc(PROMPT_BYTES);
    const n = readSync(fd, buf, 0, PROMPT_BYTES, 0);
    const lines = buf.subarray(0, n).toString("utf8").split("\n");
    if (n === PROMPT_BYTES) lines.pop(); // the last line may be cut
    for (const line of lines) {
      let rec; try { rec = JSON.parse(line); } catch { continue; }
      if (rec?.type !== "user") continue;
      const c = rec.message?.content;
      if (typeof c === "string") return c;
      if (Array.isArray(c)) return c.map((p) => (typeof p?.text === "string" ? p.text : "")).join("\n");
      return "";
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

// The ids of the tool calls a transcript made, which is how its own subagents point back at it.
function toolUseIds(path) {
  const ids = new Set();
  let text;
  try { text = readFileSync(path, "utf8"); } catch { return ids; }
  for (const m of text.matchAll(/"type":"tool_use","id":"([A-Za-z0-9_]+)"/g)) ids.add(m[1]);
  return ids;
}

function listJsonl(dir, out = []) {
  let ents = [];
  try { ents = readdirSync(dir); } catch { return out; }
  for (const e of ents) {
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) listJsonl(p, out);
    else if (e.endsWith(".jsonl")) out.push(p);
  }
  return out;
}

// Every session's subagents folder under the projects root.
function* subagentFolders(root) {
  let projects = [];
  try { projects = readdirSync(root); } catch { return; }
  for (const project of projects) {
    let sessions = [];
    try { sessions = readdirSync(join(root, project)); } catch { continue; }
    for (const session of sessions) {
      const sub = join(root, project, session, "subagents");
      if (existsSync(sub)) yield sub;
    }
  }
}

// path -> the lane's folder name, for every subagent transcript that belongs to one of the lanes. Counters, all numbers:
// lane_agent_files (attributed, children included), lane_agent_children (of those, started by a lane agent),
// lane_agent_ambiguous (a lane agent whose brief names more than one folder beside a lane), lane_agent_no_meta
// (subagent transcripts Claude Code wrote no meta.json for, so their type is unknown), lane_prompt_unread (a lane agent
// whose first message does not start in the first PROMPT_BYTES).
export function laneAgentFiles(root, lanes, counters) {
  const found = new Map();
  if (!lanes.length) return found;
  for (const sub of subagentFolders(root)) {
    const files = listJsonl(sub).map((path) => ({ path, meta: readJson(path.replace(/\.jsonl$/, ".meta.json")) }));
    for (const f of files) {
      if (!f.meta) { counters.lane_agent_no_meta++; continue; }
      if (!LANE_TYPE.test(String(f.meta.agentType ?? ""))) continue;
      const text = firstPrompt(f.path);
      if (text === null) { counters.lane_prompt_unread++; continue; }
      const hits = lanes.map((lane) => ({ lane, names: namedBeside(text, lane) })).filter((h) => h.names.has(h.lane));
      if (!hits.length) continue;
      if (hits.length > 1 || hits[0].names.size > 1) { counters.lane_agent_ambiguous++; continue; }
      found.set(f.path, hits[0].lane.folder);
    }
    // Children, then theirs: a meta.json whose toolUseId is a tool call an attributed transcript made.
    let grew = true;
    while (grew) {
      grew = false;
      const parents = new Map();
      for (const f of files) {
        if (!found.has(f.path)) continue;
        for (const id of toolUseIds(f.path)) parents.set(id, found.get(f.path));
      }
      for (const f of files) {
        if (found.has(f.path) || !f.meta?.toolUseId || !parents.has(f.meta.toolUseId)) continue;
        found.set(f.path, parents.get(f.meta.toolUseId));
        counters.lane_agent_children++;
        grew = true;
      }
    }
  }
  counters.lane_agent_files += found.size;
  return found;
}
