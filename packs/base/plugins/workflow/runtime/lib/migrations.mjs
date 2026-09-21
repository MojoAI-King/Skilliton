// migrations.mjs: ordered project layout migrations (docs/CONTRACTS.md section 10).
//
// Each migration has an ID NNNN-slug, a from and a to layout, and a plan function that checks its preconditions and
// returns its file changes without writing. Applying one writes those changes through prepare.mjs applyChanges (lock,
// recheck, Git-private backups, rollback) together with a receipt in .skilliton/migrations/<id>.json. A rollback
// restores the backups only when every file still holds exactly what the migration wrote, then removes the receipt.
//
// 0100-instructions-<template sha256, 12 hex> refreshes the managed instruction blocks in CLAUDE.md and AGENTS.md when
// the harness template changed after a layout-2 project was prepared. It is keyed by the template's hash, so each
// template version is one migration with one receipt; the receipt records the hash of every block it wrote, so a later
// refresh can tell a block a person edited inside the markers (refused, with the reconciling step) from one Skilliton
// wrote. Text outside the markers is never changed.
//
// 0002-integrated-layout moves a project prepared by the standalone prototype (layout 1) to layout 2. It recognises
// prototype content only by exact bytes (prototype-v1.mjs) and refuses anything else with the step that reconciles it,
// because a copied runtime or a managed block that differs may hold a person's changes.
//
// 0003-skilliton-names moves a layout-2 project from the earlier names (legacy-names.mjs) to the Skilliton names (layout 3):
// every file under the earlier project folder to .skilliton/, the marker lines in the instruction files, records and security report,
// the .gitignore lines, the marketplace name in .claude/settings.json, and the READMEs prepare generated when they are
// exactly what it wrote. Layouts 1 and 2 keep their receipts in the earlier project folder. A receipt written by the runtime
// before the rename is listed as applied, and is rolled back only with the release that wrote it.
//
// Nothing here parses arguments or exits the process. Nothing here imports from outside the plugin folder.

import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Refused, clone, cmpVersion, isPlainObject, refuse, selfCommand, tilde } from "./core.mjs";
import { HARNESS_FILES, HARNESS_TEMPLATE, detectEol, findBlock, lineSpans, planHarnessFile, readHarnessTemplate, removeBlockAt, renderBlock, templateBody } from "./harness.mjs";
import { CONFIG_REL, LAYOUT_VERSION, PROJECT_DIR, ROLES, templateVars, validRelPath } from "./config.mjs";
import { OperationFailed, applyChanges, inspectFolder, inspectPath, newBackupId, readPath, sha256 } from "./prepare.mjs";
import {
  GITIGNORE_LINES, MIGRATIONS_DIR, RECORDS_README_REL, SECURITY_README_REL, entryFolderReadme, gitignoreWithSkilliton,
  recordsReadme, securityReadme,
} from "./project-files.mjs";
import { LEGACY_TEMPLATE } from "./legacy-template.mjs";
import {
  LEGACY_BACKUPS_DIR, LEGACY_COMMAND, LEGACY_CONFIG_REL, LEGACY_ENV_PREFIX, LEGACY_HARNESS_END,
  LEGACY_HARNESS_PREFIX, LEGACY_HARNESS_START, LEGACY_JOURNAL_DIR, LEGACY_MARKETPLACE, LEGACY_MIGRATIONS_DIR,
  LEGACY_NAME, LEGACY_PROJECT_DIR, LEGACY_RECEIPT_SCHEMA, LEGACY_RECORD_MARKER, LEGACY_SECURITY_README_REL,
} from "./legacy-names.mjs";
import {
  PROJECT_MARKER_END, PROJECT_MARKER_START, PROTOTYPE_COMMIT, PROTOTYPE_RUNTIME_PATH, PROTOTYPE_RUNTIME_SHA256,
  maintenanceInstructions, projectInstructions, prototypeBlock,
} from "./prototype-v1.mjs";

const RECEIPT_SCHEMA = "skilliton.migration-receipt/1";
const INSTRUCTIONS_PREFIX = "0100-instructions-";
export const MIGRATION_ID_RE = /^\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*$/; // the one pattern; release.mjs imports it (B41)
const BACKUP_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const SHA_RE = /^[0-9a-f]{64}$/;
const ID_0002 = "0002-integrated-layout";
const ID_0003 = "0003-skilliton-names";

// Where a project keeps its migration receipts: layouts 1 and 2 under the earlier names, layout 3 under .skilliton/.
const receiptsDir = (project) => (project.legacyNames ? LEGACY_MIGRATIONS_DIR : MIGRATIONS_DIR);

// ---------- prototype blocks ----------

// The single skillgate:project block in text, or null. Marker text that is not exactly one well-formed block is refused.
function findPrototypeBlock(text, label) {
  const spans = lineSpans(text);
  const starts = [], ends = [], other = [];
  spans.forEach((s, i) => {
    if (!s.body.includes("skillgate:project:")) return;
    if (s.body === PROJECT_MARKER_START) starts.push(i);
    else if (s.body === PROJECT_MARKER_END) ends.push(i);
    else other.push(i);
  });
  if (!starts.length && !ends.length && !other.length) return null;
  if (other.length || starts.length !== 1 || ends.length !== 1 || ends[0] < starts[0]) {
    const lines = [...starts, ...ends, ...other].sort((a, b) => a - b).map((i) => i + 1).join(", ");
    refuse(`migration ${ID_0002} refused: ${label} has skillgate:project marker text on line(s) ${lines} that is not one well-formed prototype block, so it cannot be recognised as what the prototype wrote. Nothing was changed. To reconcile: move any text you want to keep away from those lines, delete the marker lines and the text between them, then run migrate again`);
  }
  const s = spans[starts[0]], e = spans[ends[0]];
  return { startOffset: s.start + s.bom, endOffset: e.end, markerEnd: e.start + e.body.length, startLineNo: starts[0] + 1, endLineNo: ends[0] + 1 };
}

function checkPrototypeBlock(text, found, expected, label) {
  const actual = Buffer.from(text.slice(found.startOffset, found.markerEnd), "latin1");
  if (!actual.equals(Buffer.from(expected, "utf8"))) {
    refuse(`migration ${ID_0002} refused: ${label} lines ${found.startLineNo} to ${found.endLineNo} hold a skillgate:project block that differs from what the prototype wrote for this project's records, so it may hold hand edits. Nothing was changed. To reconcile: move any text you want to keep outside the block, delete the block including both marker lines, then run migrate again`);
  }
}

// ---------- 0002-integrated-layout ----------

async function plan0002(project, { root, runtimeVersion }) {
  const files = [], notes = [];

  const runtime = readPath(root, PROTOTYPE_RUNTIME_PATH, "the copied prototype runtime");
  if (runtime === null) notes.push(`${PROTOTYPE_RUNTIME_PATH} is not present, so there is no copied runtime to remove.`);
  else {
    const have = sha256(runtime);
    if (have !== PROTOTYPE_RUNTIME_SHA256) {
      refuse(`migration ${ID_0002} refused: ${PROTOTYPE_RUNTIME_PATH} does not match the prototype runtime released at ${PROTOTYPE_COMMIT} (its sha256 starts ${have.slice(0, 12)}; the release's starts ${PROTOTYPE_RUNTIME_SHA256.slice(0, 12)}), so it may hold local changes. Nothing was changed. To reconcile: keep any change you need outside ${PROTOTYPE_RUNTIME_PATH}, delete it (layouts 2 and 3 run "skilliton security" from the installed workflow plugin), then run migrate again`);
    }
    files.push({ path: PROTOTYPE_RUNTIME_PATH, action: "delete", before: runtime, after: null, what: `the copied prototype runtime; its sha256 matches the release at ${PROTOTYPE_COMMIT}`, diff: false });
  }

  const template = readHarnessTemplate(HARNESS_TEMPLATE);
  const vars = templateVars(project);
  const projectBlock = prototypeBlock(projectInstructions(project.artifacts));
  for (const name of HARNESS_FILES) {
    const bytes = readPath(root, name);
    const text = bytes === null ? null : bytes.toString("latin1");
    const proto = text === null ? null : findPrototypeBlock(text, name);
    if (proto) checkPrototypeBlock(text, proto, projectBlock, name);
    const harness = planHarnessFile(root, name, template, false, vars);
    let next = harness.next;
    if (proto) next = removeBlockAt(next, findPrototypeBlock(next, name));
    if (text !== null && next === text) continue;
    const harnessPart = text === null ? harness.summary
      : /already current/.test(harness.summary) ? "keep the harness block, which is already current"
      : /^replace/.test(harness.summary) ? "replace the harness block with the current template"
      : "add the harness block at the end after a blank line";
    const what = proto ? `remove the prototype skillgate:project block (lines ${proto.startLineNo} to ${proto.endLineNo}) and one blank line next to it; ${harnessPart}; other text is kept` : harnessPart;
    files.push({ path: name, action: text === null ? "create" : "update", before: bytes, after: Buffer.from(next, "latin1"), what, diff: true });
  }

  const maintainRel = project.artifacts.maintain;
  const maintain = readPath(root, maintainRel, "the maintain record");
  if (maintain !== null) {
    const text = maintain.toString("latin1");
    const proto = findPrototypeBlock(text, maintainRel);
    if (proto) {
      checkPrototypeBlock(text, proto, prototypeBlock(maintenanceInstructions()), maintainRel);
      files.push({ path: maintainRel, action: "update", before: maintain, after: Buffer.from(removeBlockAt(text, proto), "latin1"), what: `remove the prototype skillgate:project block (lines ${proto.startLineNo} to ${proto.endLineNo}) and one blank line next to it; nothing else changes (layout 2 has no managed block in the maintain record)`, diff: true });
    }
  }

  const configBytes = readPath(root, LEGACY_CONFIG_REL);
  const config = clone(project.config);
  const prepare = isPlainObject(config.prepare) ? config.prepare : (config.prepare = {});
  prepare.version = 2;
  const requires = isPlainObject(prepare.requires) ? prepare.requires : (prepare.requires = {});
  if (requires.workflow !== undefined && cmpVersion(requires.workflow, runtimeVersion) > 0) {
    refuse(`migration ${ID_0002} refused: prepare.requires.workflow is ${requires.workflow}, newer than this runtime (${runtimeVersion}). Update the workflow plugin, then run migrate again. Nothing was changed`);
  }
  if (requires.workflow === undefined || cmpVersion(requires.workflow, runtimeVersion) < 0) requires.workflow = runtimeVersion;
  files.push({ path: LEGACY_CONFIG_REL, action: configBytes === null ? "create" : "update", before: configBytes, after: Buffer.from(JSON.stringify(config, null, 2) + "\n", "utf8"), what: `prepare.version 1 to 2; prepare.requires.workflow ${requires.workflow}; every other key is kept`, diff: true });

  for (const rel of ["docs/security/README.md", LEGACY_SECURITY_README_REL]) {
    const bytes = readPath(root, rel);
    if (bytes && bytes.includes(PROTOTYPE_RUNTIME_PATH)) notes.push(`${rel} still tells people to run ${PROTOTYPE_RUNTIME_PATH}; this migration does not change it. Replace that text by hand with "skilliton security status".`);
  }
  return { files, notes };
}

// ---------- 0003-skilliton-names ----------

const LEGACY_WORD = new RegExp(`\\b${LEGACY_COMMAND}\\b`);
const toCurrent = (rel) => `${PROJECT_DIR}${rel.slice(LEGACY_PROJECT_DIR.length)}`;
const underFolder = (rel, dir) => rel.toLowerCase().startsWith(`${dir.toLowerCase()}/`);

// Every regular file under the earlier project folder, as repository-relative paths. Links, special files and hard-linked files are
// refused, because moving what one points at could move or expose a file outside the project.
function legacyFiles(root) {
  const files = [];
  const seen = new Map();
  const walk = (rel) => {
    const lower = rel.toLowerCase();
    if (seen.has(lower)) refuse(`migration ${ID_0003} refused: ${seen.get(lower)} and ${rel} differ only in letter case, and they would land on the same path on a file system that ignores case. Nothing was changed. Rename or remove one of them, then run migrate again`);
    seen.set(lower, rel);
    const abs = join(root, ...rel.split("/"));
    let st;
    try { st = lstatSync(abs); } catch (e) { throw new OperationFailed(`${rel} could not be inspected (${e.code ?? "error"}); nothing was changed`); }
    if (st.isSymbolicLink()) refuse(`migration ${ID_0003} refused: ${rel} is a symbolic link, which Skilliton does not follow or move. Nothing was changed. Replace it with the file or folder it points at, or remove it, then run migrate again`);
    if (st.isDirectory()) {
      let names;
      try { names = readdirSync(abs).sort(); } catch (e) { throw new OperationFailed(`${rel} could not be listed (${e.code ?? "error"}); nothing was changed`); }
      for (const name of names) walk(`${rel}/${name}`);
      return;
    }
    if (!st.isFile()) refuse(`migration ${ID_0003} refused: ${rel} is not a regular file or folder. Nothing was changed. Remove it, then run migrate again`);
    if (st.nlink !== 1) refuse(`migration ${ID_0003} refused: ${rel} is a hard-linked file, which Skilliton does not move. Nothing was changed. Replace it with a copy, then run migrate again`);
    if (!validRelPath(rel)) refuse(`migration ${ID_0003} refused: ${rel} has characters Skilliton does not use in project paths. Nothing was changed. Rename or remove it, then run migrate again`);
    files.push({ rel, mode: st.mode & 0o777 });
  };
  walk(LEGACY_PROJECT_DIR);
  return files;
}

// text with every whole line that is an earlier-name marker renamed; count is how many lines changed.
function renameMarkerLines(text) {
  let count = 0;
  const next = lineSpans(text).map((span) => {
    const raw = text.slice(span.start, span.end);
    const body = span.body.trim();
    if (!LEGACY_RECORD_MARKER.test(body)) return raw;
    count++;
    return raw.replace(body, body.replace(LEGACY_COMMAND, "skilliton"));
  }).join("");
  return { next, count };
}

// The earlier harness block in text: null when absent, its offsets when exactly one well-formed block, else refused.
function findLegacyBlock(text, label) {
  const spans = lineSpans(text);
  const starts = [], ends = [], other = [];
  spans.forEach((s, i) => {
    const t = s.body.trim();
    if (!t.startsWith(LEGACY_HARNESS_PREFIX)) return;
    if (LEGACY_HARNESS_START.test(t)) starts.push(i);
    else if (t === LEGACY_HARNESS_END) ends.push(i);
    else other.push(i);
  });
  if (!starts.length && !ends.length && !other.length) return null;
  if (other.length || starts.length !== 1 || ends.length !== 1 || ends[0] < starts[0]) {
    const lines = [...starts, ...ends, ...other].sort((a, b) => a - b).map((i) => i + 1).join(", ");
    refuse(`migration ${ID_0003} refused: ${label} has earlier harness marker text on line(s) ${lines} that is not one well-formed block. Nothing was changed. Fix the markers by hand so there is exactly one start and one end line, then run migrate again`);
  }
  const s = spans[starts[0]], e = spans[ends[0]];
  return { startOffset: s.start + s.bom, endOffset: e.end, innerStart: s.end, innerEnd: e.start, startLineNo: starts[0] + 1, endLineNo: ends[0] + 1 };
}

// The newest receipt under the earlier names that recorded block hashes, or null. Read only to tell a block a person
// edited from one the earlier runtime wrote; an entry that is not exactly the recorded shape is skipped.
function latestLegacyBlocks(root) {
  let latest = null;
  for (const id of listReceiptIds(root, LEGACY_MIGRATIONS_DIR).filter((i) => i.startsWith(INSTRUCTIONS_PREFIX))) {
    const bytes = readPath(root, `${LEGACY_MIGRATIONS_DIR}/${id}.json`);
    let r;
    try { r = JSON.parse(bytes.toString("utf8")); } catch { continue; }
    if (!isPlainObject(r) || ![LEGACY_RECEIPT_SCHEMA, RECEIPT_SCHEMA].includes(r.schema) || r.id !== id || typeof r.appliedAt !== "string" || !isPlainObject(r.blocks)) continue;
    if (!Object.values(r.blocks).every((v) => v === null || (typeof v === "string" && SHA_RE.test(v)))) continue;
    if (!latest || r.appliedAt > latest.appliedAt) latest = { id, appliedAt: r.appliedAt, blocks: r.blocks };
  }
  return latest;
}

// Text as the last runtime before the rename rendered it: the only difference is the lowercase and environment names.
const asLegacy = (text) => text.replace(/skilliton/g, LEGACY_COMMAND).replace(/SKILLITON_/g, LEGACY_ENV_PREFIX);

// The files prepare generates, rendered now and as the runtime before the rename rendered them.
function generatedFiles(project) {
  const legacy = asLegacy;
  const list = [
    { rel: SECURITY_README_REL, current: securityReadme() },
    { rel: RECORDS_README_REL, current: recordsReadme() },
    ...["tasks", "decisions", "lessons"].map((kind) => ({ rel: `${project.directories[kind]}/README.md`, current: entryFolderReadme(kind, project) })),
  ];
  return list.map((g) => ({ ...g, legacy: legacy(g.current) }));
}

async function plan0003(project, { root, runtimeVersion }) {
  // New and updated files are written before the earlier files are deleted, so a reader during the run sees both
  // configurations (and refuses) rather than none (and takes the project for unprepared).
  const writes = [], deletes = [], notes = [];
  const planned = new Set();
  const put = (path, before, after, what, mode = undefined) => {
    const key = path.toLowerCase();
    if (planned.has(key)) throw new Error(`internal: ${ID_0003} planned ${path} twice`);
    planned.add(key);
    const entry = { path, action: before === null ? "create" : after === null ? "delete" : "update", before, after, what, diff: before !== null && after !== null, ...(mode === undefined ? {} : { mode }) };
    (after === null ? deletes : writes).push(entry);
  };

  // .gitignore first, so the current private-evidence line exists before any evidence is written under .skilliton/.
  // The earlier lines stay: another clone or branch not yet migrated still writes evidence to the earlier folder.
  const ignore = readPath(root, ".gitignore");
  const ignoreText = ignore === null ? "" : ignore.toString("latin1");
  const ignoreNext = gitignoreWithSkilliton(ignoreText);
  if (ignoreNext !== ignoreText) put(".gitignore", ignore, Buffer.from(ignoreNext, "latin1"), `add ${GITIGNORE_LINES.join(" and ")}; the earlier lines are kept for clones and branches not yet migrated`);

  const currentFolder = inspectFolder(root, PROJECT_DIR, `the ${PROJECT_DIR} folder`);
  if (currentFolder.exists && readdirSync(currentFolder.abs).length) refuse(`migration ${ID_0003} refused: ${PROJECT_DIR}/ already holds files, and this migration moves ${LEGACY_PROJECT_DIR}/ into it. Nothing was changed. Compare the two folders, move what you want to keep into ${LEGACY_PROJECT_DIR}/, delete ${PROJECT_DIR}/, then run migrate again`);

  const generated = generatedFiles(project);
  const moved = legacyFiles(root);
  const observed = [];
  for (const { rel, mode } of moved) {
    const name = rel.slice(LEGACY_PROJECT_DIR.length + 1);
    if (name === "prepare.lock" || name === "security/applicability.lock") refuse(`migration ${ID_0003} refused: ${rel} exists, so another Skilliton run may be writing this project. Nothing was changed. If no other run is active (for example after a crash), delete ${rel}, then run migrate again`);
    const bytes = readPath(root, rel, `${rel} (a file this migration moves; files over 1 MB are moved by hand: move it out of the project, migrate, then move it into ${toCurrent(rel)})`);
    let after = bytes, what = `moved to ${toCurrent(rel)} unchanged`;
    if (rel === LEGACY_CONFIG_REL) {
      const config = clone(project.config);
      const prepare = isPlainObject(config.prepare) ? config.prepare : (config.prepare = {});
      prepare.version = 3;
      const requires = isPlainObject(prepare.requires) ? prepare.requires : (prepare.requires = {});
      if (requires.workflow !== undefined && cmpVersion(requires.workflow, runtimeVersion) > 0) refuse(`migration ${ID_0003} refused: prepare.requires.workflow is ${requires.workflow}, newer than this runtime (${runtimeVersion}). Update the workflow plugin, then run migrate again. Nothing was changed`);
      if (requires.workflow === undefined || cmpVersion(requires.workflow, runtimeVersion) < 0) requires.workflow = runtimeVersion;
      after = Buffer.from(JSON.stringify(config, null, 2) + "\n", "utf8");
      what = `moved to ${CONFIG_REL}; prepare.version 2 to 3; prepare.requires.workflow ${requires.workflow}; every other key is kept`;
      if (LEGACY_WORD.test(after.toString("utf8"))) notes.push(`${CONFIG_REL} still names ${LEGACY_COMMAND} in a value this migration keeps as it is (for example a path in dispatch.hotspots); update that value by hand.`);
    } else if (rel.endsWith(".md")) {
      const text = bytes.toString("latin1");
      const gen = generated.find((g) => toCurrent(rel) === g.rel);
      if (gen && text === gen.legacy) { after = Buffer.from(gen.current, "utf8"); what = `moved to ${toCurrent(rel)}; it is exactly what prepare generated, so it is regenerated with the Skilliton names`; }
      else {
        const { next, count } = renameMarkerLines(text);
        if (count) { after = Buffer.from(next, "latin1"); what = `moved to ${toCurrent(rel)}; ${count} generated marker line(s) renamed`; }
      }
    }
    if (underFolder(rel, `${LEGACY_PROJECT_DIR}/security/records`) && rel.endsWith(".json")) observed.push(rel);
    put(rel, bytes, null, `moved to ${toCurrent(rel)}`);
    put(toCurrent(rel), null, after, what, mode);
  }
  if (!moved.some((f) => f.rel === LEGACY_CONFIG_REL)) refuse(`migration ${ID_0003} refused: ${LEGACY_CONFIG_REL} is not a regular file in this project. Nothing was changed`);

  // Instruction files: the earlier block becomes the current block, unless a person edited inside its markers.
  const template = readHarnessTemplate(HARNESS_TEMPLATE);
  const vars = templateVars(project);
  const previous = latestLegacyBlocks(root);
  // What the last runtime before the rename wrote, so a block it wrote with prepare or harness --apply, which leaves
  // no receipt, is recognised as written by Skilliton rather than by a person: its own template, frozen in
  // legacy-template.mjs, and the current template under the earlier names (for a block refreshed with a later
  // template). Rendering only the current template broke the day the template first changed after the rename.
  const legacyInnerSha = sha256(Buffer.from(asLegacy(templateBody(template, vars)), "latin1"));
  const frozenInnerSha = sha256(Buffer.from(templateBody(LEGACY_TEMPLATE, vars), "latin1"));
  const blocks = {}, edited = [];
  for (const name of HARNESS_FILES) {
    const bytes = readPath(root, name);
    if (bytes === null) { blocks[name] = null; continue; }
    const text = bytes.toString("latin1");
    const legacy = findLegacyBlock(text, name);
    if (!legacy) {
      const current = findBlock(text, name);
      blocks[name] = current ? sha256(Buffer.from(text.slice(current.innerStart, current.innerEnd).replace(/\r\n/g, "\n"), "latin1")) : null;
      if (LEGACY_WORD.test(text)) notes.push(`${name} names ${LEGACY_COMMAND} outside a managed block; this migration changes only managed blocks, so update that text by hand.`);
      continue;
    }
    if (findBlock(text, name)) refuse(`migration ${ID_0003} refused: ${name} holds both an earlier and a current harness block. Nothing was changed. Delete one of them by hand, then run migrate again`);
    const inner = sha256(Buffer.from(text.slice(legacy.innerStart, legacy.innerEnd).replace(/\r\n/g, "\n"), "latin1"));
    // Written by Skilliton: exactly the earlier release's rendering of this template, or exactly what the last earlier
    // instructions receipt recorded. Anything else may hold a person's edit and is refused.
    if (inner !== legacyInnerSha && inner !== frozenInnerSha && !(previous && previous.blocks[name] === inner)) { edited.push(name); continue; }
    const block = renderBlock(template, detectEol(text), vars);
    const next = text.slice(0, legacy.startOffset) + block + text.slice(legacy.endOffset);
    blocks[name] = sha256(Buffer.from(templateInner(block), "latin1"));
    put(name, bytes, Buffer.from(next, "latin1"), `replace the earlier harness block (lines ${legacy.startLineNo} to ${legacy.endLineNo}) with the current template under the Skilliton markers; nothing outside the markers changes`);
    const outside = text.slice(0, legacy.startOffset) + text.slice(legacy.endOffset);
    if (LEGACY_WORD.test(outside)) notes.push(`${name} names ${LEGACY_COMMAND} outside its managed block; update that text by hand.`);
  }
  if (edited.length) refuse(`migration ${ID_0003} refused: the managed instruction block in ${edited.join(" and ")} is neither what the earlier release writes for the current template nor what ${previous ? `its last instructions receipt (${previous.id})` : "an earlier instructions receipt"} recorded, so it may hold a hand edit that replacing it would discard. Nothing was changed. Move the text you want to keep outside the harness markers; or, to replace the block on purpose, delete both marker lines and everything between them, run migrate again, then write the current block with prepare --apply`);

  // Records: generated marker lines only, and generated READMEs that are exactly what prepare wrote.
  const recordPaths = [...new Set(ROLES.map((role) => project.artifacts[role]))];
  for (const gen of generated) if (!underFolder(gen.rel, PROJECT_DIR) && !recordPaths.includes(gen.rel)) recordPaths.push(gen.rel);
  const stillNamed = [];
  for (const rel of recordPaths) {
    const bytes = readPath(root, rel);
    if (bytes === null) continue;
    const text = bytes.toString("latin1");
    const gen = generated.find((g) => g.rel === rel);
    if (gen && text === gen.legacy) { put(rel, bytes, Buffer.from(gen.current, "utf8"), "exactly what prepare generated, so it is regenerated with the Skilliton names"); continue; }
    const { next, count } = renameMarkerLines(text);
    if (count) put(rel, bytes, Buffer.from(next, "latin1"), `${count} generated marker line(s) renamed; nothing else changes`);
    if (LEGACY_WORD.test(next)) stillNamed.push(rel);
  }
  if (stillNamed.length) notes.push(`These records still name ${LEGACY_COMMAND} in their own text, which a migration never rewrites: ${stillNamed.join(", ")}. Update the wording by hand where it tells people what to run.`);

  // .claude/settings.json: the earlier default marketplace name, in canonical JSON only.
  const settingsRel = ".claude/settings.json";
  const settings = readPath(root, settingsRel);
  if (settings !== null) {
    const text = settings.toString("utf8");
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    const suffix = `@${LEGACY_MARKETPLACE}`;
    const mentions = isPlainObject(parsed) && ((isPlainObject(parsed.extraKnownMarketplaces) && Object.hasOwn(parsed.extraKnownMarketplaces, LEGACY_MARKETPLACE)) || (isPlainObject(parsed.enabledPlugins) && Object.keys(parsed.enabledPlugins).some((k) => k.endsWith(suffix))));
    if (mentions) {
      if (JSON.stringify(parsed, null, 2) + "\n" !== text) refuse(`migration ${ID_0003} refused: ${settingsRel} names the earlier marketplace "${LEGACY_MARKETPLACE}", and the file is not in the two-space JSON layout this migration can rewrite without reformatting it. Nothing was changed. Rename the marketplace key and every "${suffix}" plugin key to "skilliton" by hand, then run migrate again`);
      const collisions = [
        ...(isPlainObject(parsed.extraKnownMarketplaces) && Object.hasOwn(parsed.extraKnownMarketplaces, LEGACY_MARKETPLACE) && Object.hasOwn(parsed.extraKnownMarketplaces, "skilliton") ? ["the marketplace key \"skilliton\""] : []),
        ...(isPlainObject(parsed.enabledPlugins) ? Object.keys(parsed.enabledPlugins).filter((k) => k.endsWith(suffix) && Object.hasOwn(parsed.enabledPlugins, `${k.slice(0, -suffix.length)}@skilliton`)).map((k) => `"${k.slice(0, -suffix.length)}@skilliton"`) : []),
      ];
      if (collisions.length) refuse(`migration ${ID_0003} refused: ${settingsRel} already has ${collisions.join(", ")} beside the earlier "${LEGACY_MARKETPLACE}" entries, so renaming them would silently replace one with the other (for example a company marketplace source with the default one). Nothing was changed. Keep the entry you want in ${settingsRel}, delete the other, then run migrate again`);
      const rename = (obj, fn) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [fn(k), v]));
      const next = { ...parsed };
      if (isPlainObject(parsed.extraKnownMarketplaces)) next.extraKnownMarketplaces = rename(parsed.extraKnownMarketplaces, (k) => (k === LEGACY_MARKETPLACE ? "skilliton" : k));
      if (isPlainObject(parsed.enabledPlugins)) next.enabledPlugins = rename(parsed.enabledPlugins, (k) => (k.endsWith(suffix) ? `${k.slice(0, -suffix.length)}@skilliton` : k));
      put(settingsRel, settings, Buffer.from(JSON.stringify(next, null, 2) + "\n", "utf8"), `the marketplace "${LEGACY_MARKETPLACE}" and its plugin keys renamed to "skilliton"; every other key is kept`);
    }
  }

  if (observed.length) notes.push(`${observed.length} security observation record(s) moved unchanged. Records are never rewritten, so an observation that names a file under ${LEGACY_PROJECT_DIR}/ (for example saved collector output) reports that file as missing until it is reassessed; ${selfCommand()} security status lists them.`);
  if (moved.some((f) => f.rel === `${LEGACY_PROJECT_DIR}/delivery.json`)) notes.push(`This project has a delivery policy. A delivery gate installed on its shared repository under the earlier names keeps using the earlier runtime until someone runs delivery install there again (docs/DELIVERY.md).`);
  notes.push(`The local session journal (<git folder>/${LEGACY_JOURNAL_DIR}/) and earlier backups (<git folder>/${LEGACY_BACKUPS_DIR}/) stay where they are and are no longer read; the journal starts fresh under the Skilliton name.`);
  return { files: [...writes, ...deletes], notes, receiptExtra: { blocks, templateSha256: sha256(Buffer.from(template, "latin1")) } };
}

const templateInner = (block) => block.replace(/\r\n/g, "\n").split("\n").slice(1, -2).join("\n") + "\n";

// Paths a 0003 receipt may name: the two project folders, the instruction files, the records, the generated READMEs,
// .gitignore and .claude/settings.json.
// A 0003 receipt is committed, so it is checked before a rollback acts on it: every file created under .skilliton/ must
// pair with the deletion of the same file under the earlier folder, and every other path is one the migration updates. An
// edited receipt therefore cannot make a rollback delete a file the migration never moved.
function receiptProblem0003(receipt) {
  const byPath = new Map(receipt.files.map((f) => [f.path, f]));
  for (const f of receipt.files) {
    if (underFolder(f.path, PROJECT_DIR)) {
      const pair = byPath.get(`${LEGACY_PROJECT_DIR}${f.path.slice(PROJECT_DIR.length)}`);
      if (f.action !== "create" || !pair || pair.action !== "delete") return `lists ${f.path} without the matching move from ${LEGACY_PROJECT_DIR}/`;
    } else if (underFolder(f.path, LEGACY_PROJECT_DIR)) {
      const pair = byPath.get(toCurrent(f.path));
      if (f.action !== "delete" || !pair || pair.action !== "create") return `lists ${f.path} without the matching move to ${PROJECT_DIR}/`;
    } else if (f.action !== "update" && !(f.path === ".gitignore" && f.action === "create")) {
      return `lists ${f.path} with the action ${f.action}, which ${ID_0003} never takes there`;
    }
  }
  return null;
}

function allowed0003(path, project) {
  const lower = path.toLowerCase();
  if (underFolder(lower, PROJECT_DIR) || underFolder(lower, LEGACY_PROJECT_DIR)) return true;
  const fixed = [...HARNESS_FILES, ".gitignore", ".claude/settings.json", SECURITY_README_REL, ...ROLES.map((role) => project.artifacts[role]), ...["tasks", "decisions", "lessons"].map((kind) => `${project.directories[kind]}/README.md`)];
  return fixed.some((p) => p.toLowerCase() === lower);
}

// Each migration also names every path it can change, so a rollback never acts on a path its receipt should not hold.
export const MIGRATIONS = [
  {
    id: ID_0002,
    from: 1,
    to: 2,
    summary: "from the standalone prototype layout to the integrated layout: remove the copied security runtime and the skillgate:project blocks, add the harness blocks, set prepare.version 2 and prepare.requires.workflow",
    plan: plan0002,
    paths: (project) => [PROTOTYPE_RUNTIME_PATH, ...HARNESS_FILES, project.artifacts.maintain, LEGACY_CONFIG_REL],
  },
  {
    id: ID_0003,
    from: 2,
    to: 3,
    summary: `from the earlier ${LEGACY_NAME} names to the Skilliton names: move ${LEGACY_PROJECT_DIR}/ to .skilliton/, rename the managed markers in the instruction files, records and security report, update the .gitignore lines and the marketplace name in .claude/settings.json, set prepare.version 3`,
    plan: plan0003,
    allows: (path, project) => allowed0003(path, project),
    receiptProblem: receiptProblem0003,
  },
];

// ---------- 0100-instructions-<sha12> ----------

// The text between a file's harness markers, as its sha256, or null when the file or the block is absent.
function blockSha(root, name) {
  const bytes = readPath(root, name);
  if (bytes === null) return null;
  const text = bytes.toString("latin1");
  const found = findBlock(text, name);
  return found ? sha256(Buffer.from(text.slice(found.innerStart, found.innerEnd).replace(/\r\n/g, "\n"), "latin1")) : null;
}

function instructionsId(template) {
  return INSTRUCTIONS_PREFIX + sha256(Buffer.from(template, "latin1")).slice(0, 12);
}

// The newest instructions receipt that recorded block hashes, or null.
function latestInstructionsReceipt(root, dir = MIGRATIONS_DIR) {
  let latest = null;
  for (const id of listReceiptIds(root, dir).filter((i) => i.startsWith(INSTRUCTIONS_PREFIX) || i === ID_0003)) {
    let receipt;
    try { receipt = readReceipt(root, id, dir).receipt; } catch (e) { if (e instanceof Refused) continue; throw e; }
    if (!isPlainObject(receipt.blocks)) continue;
    if (!latest || String(receipt.appliedAt) > String(latest.appliedAt)) latest = receipt;
  }
  return latest;
}

// { id, templateSha12, outdated: [file names whose block differs from the current rendering], applied } for a layout-2
// project, else null. Malformed markers are refused (core findBlock), which status reports as a failed check.
function instructionsState(project) {
  if (project.layoutVersion !== LAYOUT_VERSION) return null;
  const template = readHarnessTemplate(HARNESS_TEMPLATE);
  const vars = templateVars(project);
  // Only an existing block that differs is a template update; a missing file or block is prepare's to add.
  const outdated = HARNESS_FILES.filter((name) => { const plan = planHarnessFile(project.root, name, template, false, vars); return plan.changed && /^replace the harness block/.test(plan.summary); });
  const id = instructionsId(template);
  return { id, templateSha12: id.slice(INSTRUCTIONS_PREFIX.length), outdated, applied: listReceiptIds(project.root, receiptsDir(project)).includes(id) };
}

async function planInstructions(project, { root }) {
  const template = readHarnessTemplate(HARNESS_TEMPLATE);
  const vars = templateVars(project);
  const previous = latestInstructionsReceipt(root);
  const files = [], notes = [], blocks = {}, edited = [];
  for (const name of HARNESS_FILES) {
    const plan = planHarnessFile(root, name, template, false, vars);
    const now = blockSha(root, name);
    if (previous && now !== null && typeof previous.blocks[name] === "string" && previous.blocks[name] !== now && plan.changed) edited.push(name);
    if (!plan.changed || !/^replace the harness block/.test(plan.summary)) { blocks[name] = now; continue; }
    files.push({ path: name, action: plan.exists ? "update" : "create", before: plan.exists ? Buffer.from(plan.text, "latin1") : null, after: Buffer.from(plan.next, "latin1"), what: plan.summary, diff: true });
    const afterText = plan.next;
    const found = findBlock(afterText, name);
    blocks[name] = found ? sha256(Buffer.from(afterText.slice(found.innerStart, found.innerEnd).replace(/\r\n/g, "\n"), "latin1")) : null;
  }
  if (edited.length) {
    refuse(`the managed instruction block in ${edited.join(" and ")} was edited by hand after Skilliton last wrote it (receipt ${previous.id}), so refreshing it would discard that edit. Nothing was changed. To reconcile: move the text you want to keep outside the skilliton:harness markers, then run migrate again; or overwrite the block on purpose with: ${selfCommand()} harness --apply (it keeps a backup)`);
  }
  if (!previous) notes.push("No earlier instructions receipt records what Skilliton wrote into these blocks, so a hand edit inside the markers cannot be told apart; the diff above shows everything that changes, and the backup keeps the old text.");
  return { files, notes, receiptExtra: { blocks, templateSha256: sha256(Buffer.from(template, "latin1")) } };
}

// A migration by ID: a layout migration from MIGRATIONS, or the instructions refresh for a template hash.
export function migrationById(id, project) {
  const layout = MIGRATIONS.find((m) => m.id === id);
  if (layout) return layout;
  if (typeof id === "string" && id.startsWith(INSTRUCTIONS_PREFIX) && MIGRATION_ID_RE.test(id)) {
    const level = project.layoutVersion ?? LAYOUT_VERSION;
    return { id, kind: "instructions", from: level, to: level, summary: `refresh the managed instruction blocks in CLAUDE.md and AGENTS.md to harness template ${id.slice(INSTRUCTIONS_PREFIX.length)}; text outside the markers is kept`, plan: planInstructions, paths: () => [...HARNESS_FILES] };
  }
  return null;
}

// ---------- state ----------

function listReceiptIds(root, dir = MIGRATIONS_DIR) {
  const folder = inspectFolder(root, dir, "the migration receipts folder");
  if (!folder.exists) return [];
  return readdirSync(folder.abs).filter((n) => n.endsWith(".json") && MIGRATION_ID_RE.test(n.slice(0, -5))).map((n) => n.slice(0, -5)).sort();
}

// { layoutVersion, target, pending: [{ id, from, to, summary }], applied: [receiptId] }. An unprepared project
// (no prepare.version) has nothing pending: it needs prepare, not a migration. Throws Refused when the receipts
// folder is a link or not a folder.
export function migrationState(project) {
  const pending = [];
  let layout = project.layoutVersion;
  if (layout !== null) {
    for (const m of MIGRATIONS) {
      if (layout >= LAYOUT_VERSION) break;
      if (m.from === layout) { pending.push({ id: m.id, from: m.from, to: m.to, summary: m.summary }); layout = m.to; }
    }
  }
  const instructions = pending.length ? null : instructionsState(project);
  if (instructions && instructions.outdated.length && !instructions.applied) {
    pending.push({ id: instructions.id, from: project.layoutVersion, to: project.layoutVersion, summary: migrationById(instructions.id, project).summary });
  }
  return { layoutVersion: project.layoutVersion, target: LAYOUT_VERSION, pending, applied: listReceiptIds(project.root, receiptsDir(project)), instructions };
}

// ---------- apply ----------

// The change set for one migration, without writing: { migration, files: [{ path, action, before, after, what, diff }],
// notes, receiptRel }. Precondition failures are refused here.
export async function planMigration(migration, project, { root, runtimeVersion }) {
  if (!runtimeVersion) throw new OperationFailed("the workflow plugin's version could not be read from its .claude-plugin/plugin.json, and a receipt must name it; reinstall the plugin. Nothing was changed");
  if (project.layoutVersion !== migration.from) refuse(`${migration.id} migrates layout ${migration.from}, and this project is at layout ${project.layoutVersion}. Nothing was changed`);
  // A migration that moves the project to the Skilliton names writes its receipt under them.
  const receiptRel = `${migration.to >= 3 ? MIGRATIONS_DIR : receiptsDir(project)}/${migration.id}.json`;
  if (inspectPath(root, receiptRel).exists) refuse(`${receiptRel} already exists, so ${migration.id} was applied before, yet prepare.version is ${project.layoutVersion}. Reconcile ${project.configRel} and the receipt by hand (git log shows when each changed). Nothing was changed`);
  const { files, notes, receiptExtra } = await migration.plan(project, { root, runtimeVersion });
  return { migration, files, notes, receiptRel, receiptExtra: receiptExtra ?? null };
}

// Write one planned migration and its receipt as one transaction. Returns { receipt, receiptRel, result }.
export function applyMigration(plan, { root, gitDir, runtimeVersion }) {
  const backupId = newBackupId("migrate");
  const receipt = {
    schema: RECEIPT_SCHEMA,
    id: plan.migration.id,
    from: plan.migration.from,
    to: plan.migration.to,
    appliedAt: new Date().toISOString(),
    runtime: runtimeVersion,
    files: plan.files.map((f) => ({ path: f.path, action: f.action, beforeSha256: f.before ? sha256(f.before) : null, afterSha256: f.after ? sha256(f.after) : null })),
    backup: backupId,
    ...(plan.receiptExtra ?? {}),
  };
  const changes = [
    ...plan.files.map((f) => ({ path: f.path, before: f.before, after: f.after })),
    { path: plan.receiptRel, before: null, after: Buffer.from(JSON.stringify(receipt, null, 2) + "\n", "utf8") },
  ];
  const result = applyChanges({ root, gitDir, command: "migrate", changes, backupId });
  return { receipt, receiptRel: plan.receiptRel, result };
}

// ---------- rollback ----------

function receiptProblem(r, id) {
  if (!isPlainObject(r)) return "does not hold a JSON object";
  if (r.schema === LEGACY_RECEIPT_SCHEMA) return `was written by the runtime before the rename to Skilliton (schema ${LEGACY_RECEIPT_SCHEMA}), so only that release can roll it back, from a checkout of a commit before the rename`;
  if (r.schema !== RECEIPT_SCHEMA) return `does not have the schema ${RECEIPT_SCHEMA}`;
  if (r.id !== id) return "names a different migration than its file name";
  if (!Number.isInteger(r.from) || !Number.isInteger(r.to)) return "has no whole-number from and to layouts";
  if (typeof r.appliedAt !== "string" || Number.isNaN(Date.parse(r.appliedAt))) return "has no usable appliedAt time";
  if (typeof r.backup !== "string" || !BACKUP_ID_RE.test(r.backup)) return "has no usable backup ID";
  if (!Array.isArray(r.files)) return "has no file list";
  const seen = new Set();
  for (const f of r.files) {
    if (!isPlainObject(f) || typeof f.path !== "string" || !validRelPath(f.path) || !["create", "update", "delete"].includes(f.action)) return "has a file entry without a usable path and action";
    const beforeOk = f.action === "create" ? f.beforeSha256 === null : typeof f.beforeSha256 === "string" && SHA_RE.test(f.beforeSha256);
    const afterOk = f.action === "delete" ? f.afterSha256 === null : typeof f.afterSha256 === "string" && SHA_RE.test(f.afterSha256);
    if (!beforeOk || !afterOk) return `has hashes for ${f.path} that do not fit its action`;
    if (seen.has(f.path.toLowerCase())) return `lists ${f.path} twice`;
    seen.add(f.path.toLowerCase());
  }
  return null;
}

function readReceipt(root, id, dir = MIGRATIONS_DIR) {
  if (typeof id !== "string" || !MIGRATION_ID_RE.test(id)) refuse(`"${id}" is not a migration ID (NNNN-slug, for example ${ID_0002})`);
  const rel = `${dir}/${id}.json`;
  const bytes = readPath(root, rel, `the receipt ${rel}`);
  if (bytes === null) {
    const applied = listReceiptIds(root, dir);
    refuse(`there is no receipt ${rel}, so ${id} is not applied in this project (applied: ${applied.length ? applied.join(", ") : "none"}). Nothing was changed`);
  }
  let receipt;
  try { receipt = JSON.parse(bytes.toString("utf8")); } catch { refuse(`the receipt ${rel} is not valid JSON. Nothing was changed`); }
  const problem = receiptProblem(receipt, id);
  if (problem) refuse(`the receipt ${rel} ${problem}. Nothing was changed`);
  return { rel, bytes, receipt };
}

// What rolling back id would write: { receipt, receiptRel, changes: [{ path, before, after, action }] }. Refused when
// a later migration is applied, when any file no longer holds exactly what the migration wrote (every such file is
// listed), or when a backup is missing or does not match the receipt.
export function planRollback(project, { root, gitDir }, id) {
  const { rel, bytes, receipt } = readReceipt(root, id, receiptsDir(project));
  const migration = migrationById(id, project);
  if (!migration) refuse(`${id} is not a migration this runtime knows, so it cannot check what the receipt lists. Nothing was changed`);
  if (receipt.from !== migration.from || receipt.to !== migration.to) refuse(`the receipt ${rel} says layout ${receipt.from} to ${receipt.to}, but ${id} migrates layout ${migration.from} to ${migration.to}. Nothing was changed`);
  const listed = migration.paths ? new Set(migration.paths(project).map((p) => p.toLowerCase())) : null;
  const foreign = receipt.files.map((f) => f.path).filter((p) => (listed ? !listed.has(p.toLowerCase()) : !migration.allows(p, project)));
  if (foreign.length) refuse(`the receipt ${rel} lists ${foreign.join(", ")}, which ${id} never changes, so the receipt was edited after the migration wrote it. Nothing was changed; restore the receipt from Git history before rolling back`);
  const shape = migration.receiptProblem?.(receipt);
  if (shape) refuse(`the receipt ${rel} ${shape}, so the receipt was edited after the migration wrote it. Nothing was changed; restore the receipt from Git history before rolling back`);
  if (id === ID_0003) {
    // Files added under .skilliton/ after the migration would be left behind with no ignore line for them once the
    // earlier .gitignore is back, so private evidence written since could be committed.
    const created = new Set([...receipt.files.filter((f) => f.action === "create").map((f) => f.path), rel]);
    const extra = [];
    const walk = (dir) => {
      const folder = inspectFolder(root, dir, `the ${dir} folder`);
      if (!folder.exists) return;
      for (const name of readdirSync(folder.abs).sort()) {
        const child = `${dir}/${name}`;
        const st = lstatSync(join(root, ...child.split("/")));
        if (st.isDirectory() && !st.isSymbolicLink()) walk(child);
        else if (!created.has(child)) extra.push(child);
      }
    };
    walk(PROJECT_DIR);
    if (extra.length) refuse(`rollback of ${id} refused: ${extra.length} file(s) were added under ${PROJECT_DIR}/ after the migration (${extra.slice(0, 5).join(", ")}${extra.length > 5 ? ", ..." : ""}), and the rollback would leave them where the restored .gitignore no longer covers them. Nothing was changed. Move them out of the project (or delete them), then roll back again`);
  }
  const later = laterReceipts(root, receiptsDir(project), receipt);
  if (later.length) refuse(`roll back the later migration(s) first: ${later.join(", ")}. Nothing was changed`);
  const changed = [], now = new Map();
  for (const f of receipt.files) {
    let current;
    try { current = readPath(root, f.path); } catch (e) {
      if (!(e instanceof Refused)) throw e;
      changed.push(`${f.path} (now a link, a folder, a hard link or too large)`);
      continue;
    }
    const sha = current === null ? null : sha256(current);
    if (sha !== f.afterSha256) changed.push(`${f.path} (${sha === null ? "deleted" : f.afterSha256 === null ? "created again" : "edited"})`);
    now.set(f.path, current);
  }
  if (changed.length) {
    refuse(`rollback of ${id} refused: ${changed.length} file(s) changed since the migration was applied: ${changed.join("; ")}. Nothing was changed. A rollback restores the backup only when every file still holds exactly what the migration wrote; reconcile those files by hand instead`);
  }
  const backupRel = `skilliton-backups/${receipt.backup}`;
  const changes = [];
  for (const f of [...receipt.files].reverse()) {
    let restore = null;
    if (f.beforeSha256 !== null) {
      restore = readPath(gitDir, `${backupRel}/${f.path}`, `the backup of ${f.path}`);
      if (restore === null) refuse(`rollback of ${id} refused: the backup of ${f.path} is not in ${tilde(join(gitDir, ...backupRel.split("/")))}. Backups stay in the Git folder of the clone where the migration was applied, so run the rollback there. Nothing was changed`);
      if (sha256(restore) !== f.beforeSha256) refuse(`rollback of ${id} refused: the backup of ${f.path} does not match the hash in the receipt. Nothing was changed`);
    }
    const action = f.action === "create" ? "delete" : f.action === "delete" ? "create" : "restore";
    // A file 0003 moved comes back with the permissions of its moved copy.
    let mode;
    if (action === "create" && id === ID_0003 && underFolder(f.path, LEGACY_PROJECT_DIR)) {
      try { mode = lstatSync(join(root, ...toCurrent(f.path).split("/"))).mode & 0o777; } catch { mode = undefined; }
    }
    changes.push({ path: f.path, before: now.get(f.path), after: restore, action, ...(mode === undefined ? {} : { mode }) });
  }
  changes.push({ path: rel, before: bytes, after: null, action: "delete" });
  return { receipt, receiptRel: rel, changes };
}

// The receipts applied after this one, by their recorded times: an instructions refresh (0100-...) can come before or
// after a layout migration whatever their IDs. A receipt whose time cannot be read is listed too, since its order is
// unknown; one written before the rename is read only for its time.
function laterReceipts(root, dir, receipt) {
  const later = [];
  for (const other of listReceiptIds(root, dir)) {
    if (other === receipt.id) continue;
    let appliedAt = null;
    try { appliedAt = JSON.parse(readPath(root, `${dir}/${other}.json`).toString("utf8"))?.appliedAt; } catch (e) { if (!(e instanceof Refused) && !(e instanceof SyntaxError)) throw e; }
    let schema = null;
    try { schema = JSON.parse(readPath(root, `${dir}/${other}.json`).toString("utf8"))?.schema; } catch { schema = null; }
    // A receipt the earlier runtime wrote predates every receipt this runtime writes, whatever time it records.
    if (schema === LEGACY_RECEIPT_SCHEMA && receipt.schema === RECEIPT_SCHEMA) continue;
    if (typeof appliedAt !== "string" || Number.isNaN(Date.parse(appliedAt))) later.push(`${other} (its receipt has no readable time, so it may be later)`);
    else if (Date.parse(appliedAt) > Date.parse(receipt.appliedAt) || (Date.parse(appliedAt) === Date.parse(receipt.appliedAt) && other > receipt.id)) later.push(other);
  }
  return later;
}

export function applyRollback(plan, { root, gitDir }) {
  return applyChanges({ root, gitDir, command: "rollback", changes: plan.changes.map(({ path, before, after, mode }) => ({ path, before, after, mode })) });
}
