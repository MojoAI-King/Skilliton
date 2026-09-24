// legacy-migrate-plans.mjs: what 0002-integrated-layout and 0003-skilliton-names each check and change, split out of
// scripts/legacy-migrate.mjs (code-quality:split-a-file) so that file, the CLI and receipt engine, stays under the
// same line ceiling every other script in this repository holds to. This half is pure planning: it reads a project
// and returns the file changes and notes a migration would write, without writing anything itself and without
// knowing about --apply, previews or receipts. scripts/legacy-migrate.mjs imports MIGRATIONS from here.
//
// The frozen files these plans read (legacy-names.mjs, legacy-template.mjs, prototype-v1.mjs) are not touched to
// make a later change here pass (DECISIONS.md a3d4); a behavior change is a new decision, not such an edit.

import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { clone, cmpVersion, isPlainObject, refuse, selfCommand } from "../packs/base/plugins/workflow/runtime/lib/core.mjs";
import {
  HARNESS_FILES, HARNESS_TEMPLATE, detectEol, findBlock, lineSpans, planHarnessFile, readHarnessTemplate,
  removeBlockAt, renderBlock, templateBody,
} from "../packs/base/plugins/workflow/runtime/lib/harness.mjs";
import { CONFIG_REL, PROJECT_DIR, ROLES, templateVars, validRelPath } from "../packs/base/plugins/workflow/runtime/lib/config.mjs";
import { OperationFailed, inspectFolder, readPath, sha256 } from "../packs/base/plugins/workflow/runtime/lib/prepare.mjs";
import {
  GITIGNORE_LINES, RECORDS_README_REL, SECURITY_README_REL, entryFolderReadme, gitignoreWithSkilliton,
  recordsReadme, securityReadme,
} from "../packs/base/plugins/workflow/runtime/lib/project-files.mjs";
import { LEGACY_TEMPLATE } from "../packs/base/plugins/workflow/runtime/lib/legacy-template.mjs";
import {
  LEGACY_BACKUPS_DIR, LEGACY_COMMAND, LEGACY_CONFIG_REL, LEGACY_ENV_PREFIX, LEGACY_HARNESS_END,
  LEGACY_HARNESS_PREFIX, LEGACY_HARNESS_START, LEGACY_JOURNAL_DIR, LEGACY_MARKETPLACE, LEGACY_MIGRATIONS_DIR,
  LEGACY_NAME, LEGACY_PROJECT_DIR, LEGACY_RECEIPT_SCHEMA, LEGACY_RECORD_MARKER, LEGACY_SECURITY_README_REL,
} from "../packs/base/plugins/workflow/runtime/lib/legacy-names.mjs";
import {
  PROJECT_MARKER_END, PROJECT_MARKER_START, PROTOTYPE_COMMIT, PROTOTYPE_RUNTIME_PATH, PROTOTYPE_RUNTIME_SHA256,
  maintenanceInstructions, projectInstructions, prototypeBlock,
} from "../packs/base/plugins/workflow/runtime/lib/prototype-v1.mjs";
import { MIGRATION_ID_RE } from "../packs/base/plugins/workflow/runtime/lib/migrations.mjs";

export const RECEIPT_SCHEMA = "skilliton.migration-receipt/1";
const SHA_RE = /^[0-9a-f]{64}$/;
const INSTRUCTIONS_PREFIX = "0100-instructions-";
export const ID_0002 = "0002-integrated-layout";
export const ID_0003 = "0003-skilliton-names";

// A receipt ID already written under dir, oldest first. Duplicated from the CLI half (both are five lines and
// neither should import the other just for this, which would make the two files load each other).
function listReceiptIds(root, dir) {
  const folder = inspectFolder(root, dir, "the migration receipts folder");
  if (!folder.exists) return [];
  return readdirSync(folder.abs).filter((n) => n.endsWith(".json") && MIGRATION_ID_RE.test(n.slice(0, -5))).map((n) => n.slice(0, -5)).sort();
}

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
    refuse(`migration ${ID_0002} refused: ${label} has skillgate:project marker text on line(s) ${lines} that is not one well-formed prototype block, so it cannot be recognised as what the prototype wrote. Nothing was changed. To reconcile: move any text you want to keep away from those lines, delete the marker lines and the text between them, then run ${selfCommand()} again`);
  }
  const s = spans[starts[0]], e = spans[ends[0]];
  return { startOffset: s.start + s.bom, endOffset: e.end, markerEnd: e.start + e.body.length, startLineNo: starts[0] + 1, endLineNo: ends[0] + 1 };
}

function checkPrototypeBlock(text, found, expected, label) {
  const actual = Buffer.from(text.slice(found.startOffset, found.markerEnd), "latin1");
  if (!actual.equals(Buffer.from(expected, "utf8"))) {
    refuse(`migration ${ID_0002} refused: ${label} lines ${found.startLineNo} to ${found.endLineNo} hold a skillgate:project block that differs from what the prototype wrote for this project's records, so it may hold hand edits. Nothing was changed. To reconcile: move any text you want to keep outside the block, delete the block including both marker lines, then run ${selfCommand()} again`);
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
      refuse(`migration ${ID_0002} refused: ${PROTOTYPE_RUNTIME_PATH} does not match the prototype runtime released at ${PROTOTYPE_COMMIT} (its sha256 starts ${have.slice(0, 12)}; the release's starts ${PROTOTYPE_RUNTIME_SHA256.slice(0, 12)}), so it may hold local changes. Nothing was changed. To reconcile: keep any change you need outside ${PROTOTYPE_RUNTIME_PATH}, delete it (layouts 2 and 3 run "skilliton security" from the installed workflow plugin), then run ${selfCommand()} again`);
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
    refuse(`migration ${ID_0002} refused: prepare.requires.workflow is ${requires.workflow}, newer than this runtime (${runtimeVersion}). Update the workflow plugin, then run ${selfCommand()} again. Nothing was changed`);
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
    if (seen.has(lower)) refuse(`migration ${ID_0003} refused: ${seen.get(lower)} and ${rel} differ only in letter case, and they would land on the same path on a file system that ignores case. Nothing was changed. Rename or remove one of them, then run ${selfCommand()} again`);
    seen.set(lower, rel);
    const abs = join(root, ...rel.split("/"));
    let st;
    try { st = lstatSync(abs); } catch (e) { throw new OperationFailed(`${rel} could not be inspected (${e.code ?? "error"}); nothing was changed`); }
    if (st.isSymbolicLink()) refuse(`migration ${ID_0003} refused: ${rel} is a symbolic link, which Skilliton does not follow or move. Nothing was changed. Replace it with the file or folder it points at, or remove it, then run ${selfCommand()} again`);
    if (st.isDirectory()) {
      let names;
      try { names = readdirSync(abs).sort(); } catch (e) { throw new OperationFailed(`${rel} could not be listed (${e.code ?? "error"}); nothing was changed`); }
      for (const name of names) walk(`${rel}/${name}`);
      return;
    }
    if (!st.isFile()) refuse(`migration ${ID_0003} refused: ${rel} is not a regular file or folder. Nothing was changed. Remove it, then run ${selfCommand()} again`);
    if (st.nlink !== 1) refuse(`migration ${ID_0003} refused: ${rel} is a hard-linked file, which Skilliton does not move. Nothing was changed. Replace it with a copy, then run ${selfCommand()} again`);
    if (!validRelPath(rel)) refuse(`migration ${ID_0003} refused: ${rel} has characters Skilliton does not use in project paths. Nothing was changed. Rename or remove it, then run ${selfCommand()} again`);
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
    refuse(`migration ${ID_0003} refused: ${label} has earlier harness marker text on line(s) ${lines} that is not one well-formed block. Nothing was changed. Fix the markers by hand so there is exactly one start and one end line, then run ${selfCommand()} again`);
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
    { rel: SECURITY_README_REL, current: securityReadme(project) },
    { rel: RECORDS_README_REL, current: recordsReadme(project) },
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
  if (currentFolder.exists && readdirSync(currentFolder.abs).length) refuse(`migration ${ID_0003} refused: ${PROJECT_DIR}/ already holds files, and this migration moves ${LEGACY_PROJECT_DIR}/ into it. Nothing was changed. Compare the two folders, move what you want to keep into ${LEGACY_PROJECT_DIR}/, delete ${PROJECT_DIR}/, then run ${selfCommand()} again`);

  const generated = generatedFiles(project);
  const moved = legacyFiles(root);
  const observed = [];
  for (const { rel, mode } of moved) {
    const name = rel.slice(LEGACY_PROJECT_DIR.length + 1);
    if (name === "prepare.lock" || name === "security/applicability.lock") refuse(`migration ${ID_0003} refused: ${rel} exists, so another Skilliton run may be writing this project. Nothing was changed. If no other run is active (for example after a crash), delete ${rel}, then run ${selfCommand()} again`);
    const bytes = readPath(root, rel, `${rel} (a file this migration moves; files over 1 MB are moved by hand: move it out of the project, migrate, then move it into ${toCurrent(rel)})`);
    let after = bytes, what = `moved to ${toCurrent(rel)} unchanged`;
    if (rel === LEGACY_CONFIG_REL) {
      const config = clone(project.config);
      const prepare = isPlainObject(config.prepare) ? config.prepare : (config.prepare = {});
      prepare.version = 3;
      const requires = isPlainObject(prepare.requires) ? prepare.requires : (prepare.requires = {});
      if (requires.workflow !== undefined && cmpVersion(requires.workflow, runtimeVersion) > 0) refuse(`migration ${ID_0003} refused: prepare.requires.workflow is ${requires.workflow}, newer than this runtime (${runtimeVersion}). Update the workflow plugin, then run ${selfCommand()} again. Nothing was changed`);
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
    if (findBlock(text, name)) refuse(`migration ${ID_0003} refused: ${name} holds both an earlier and a current harness block. Nothing was changed. Delete one of them by hand, then run ${selfCommand()} again`);
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
  if (edited.length) refuse(`migration ${ID_0003} refused: the managed instruction block in ${edited.join(" and ")} is neither what the earlier release writes for the current template nor what ${previous ? `its last instructions receipt (${previous.id})` : "an earlier instructions receipt"} recorded, so it may hold a hand edit that replacing it would discard. Nothing was changed. Move the text you want to keep outside the harness markers; or, to replace the block on purpose, delete both marker lines and everything between them, run ${selfCommand()} again, then write the current block with skilliton prepare --apply`);

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
      if (JSON.stringify(parsed, null, 2) + "\n" !== text) refuse(`migration ${ID_0003} refused: ${settingsRel} names the earlier marketplace "${LEGACY_MARKETPLACE}", and the file is not in the two-space JSON layout this migration can rewrite without reformatting it. Nothing was changed. Rename the marketplace key and every "${suffix}" plugin key to "skilliton" by hand, then run ${selfCommand()} again`);
      const collisions = [
        ...(isPlainObject(parsed.extraKnownMarketplaces) && Object.hasOwn(parsed.extraKnownMarketplaces, LEGACY_MARKETPLACE) && Object.hasOwn(parsed.extraKnownMarketplaces, "skilliton") ? ["the marketplace key \"skilliton\""] : []),
        ...(isPlainObject(parsed.enabledPlugins) ? Object.keys(parsed.enabledPlugins).filter((k) => k.endsWith(suffix) && Object.hasOwn(parsed.enabledPlugins, `${k.slice(0, -suffix.length)}@skilliton`)).map((k) => `"${k.slice(0, -suffix.length)}@skilliton"`) : []),
      ];
      if (collisions.length) refuse(`migration ${ID_0003} refused: ${settingsRel} already has ${collisions.join(", ")} beside the earlier "${LEGACY_MARKETPLACE}" entries, so renaming them would silently replace one with the other (for example a company marketplace source with the default one). Nothing was changed. Keep the entry you want in ${settingsRel}, delete the other, then run ${selfCommand()} again`);
      const rename = (obj, fn) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [fn(k), v]));
      const next = { ...parsed };
      if (isPlainObject(parsed.extraKnownMarketplaces)) next.extraKnownMarketplaces = rename(parsed.extraKnownMarketplaces, (k) => (k === LEGACY_MARKETPLACE ? "skilliton" : k));
      if (isPlainObject(parsed.enabledPlugins)) next.enabledPlugins = rename(parsed.enabledPlugins, (k) => (k.endsWith(suffix) ? `${k.slice(0, -suffix.length)}@skilliton` : k));
      put(settingsRel, settings, Buffer.from(JSON.stringify(next, null, 2) + "\n", "utf8"), `the marketplace "${LEGACY_MARKETPLACE}" and its plugin keys renamed to "skilliton"; every other key is kept`);
    }
  }

  if (observed.length) notes.push(`${observed.length} security observation record(s) moved unchanged. Records are never rewritten, so an observation that names a file under ${LEGACY_PROJECT_DIR}/ (for example saved collector output) reports that file as missing until it is reassessed; skilliton security status lists them.`);
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

// ---------- the two migrations, in order ----------

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
