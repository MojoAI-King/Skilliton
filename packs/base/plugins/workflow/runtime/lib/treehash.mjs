// treehash.mjs: the canonical tree hash of a plugin folder (docs/CONTRACTS.md section 13).
//
// treeSha256 is the sha256 of the lines "<sha256>  <path>\n", one per regular file in the folder, sorted by the
// UTF-8 bytes of the path (the order of `LC_ALL=C sort`), with "/" between folder names and .DS_Store files left
// out. That is the output format of `sha256sum`, so the hash can be reproduced without Skilliton:
//
//   cd <plugin> && find . -type f ! -name .DS_Store | sed 's|^\./||' | LC_ALL=C sort \
//     | while IFS= read -r f; do sha256sum "$f"; done | sha256sum        (shasum -a 256 on macOS)
//
// Symbolic links, and anything else that is not a regular file or a folder, are refused: a link can point outside
// the folder, so the bytes it stands for are not part of the package. The executable bit is recorded per file and is
// not part of the hash, because clients and file systems do not all preserve it.
//
// Node built-ins only. Nothing here writes, and nothing here imports from outside the plugin folder.

import { createHash } from "node:crypto";
import { closeSync, constants as fsConstants, fstatSync, lstatSync, openSync, readdirSync, readSync } from "node:fs";
import { join } from "node:path";

export const EXCLUDED_NAMES = [".DS_Store"];
export const MAX_TREE_FILES = 20000;
export const MAX_TREE_BYTES = 1024 * 1024 * 1024;

const NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0;
const utf8 = new TextDecoder("utf-8", { fatal: true });

export const sha256Hex = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Byte order of the UTF-8 encoding, so every implementation sorts the same way.
export function comparePaths(a, b) {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

export const treeLine = (sha256, path) => `${sha256}  ${path}\n`;

// The tree hash of a list of { path, sha256 }, in any order.
export function treeSha256Of(files) {
  const hash = createHash("sha256");
  for (const f of [...files].sort((x, y) => comparePaths(x.path, y.path))) hash.update(treeLine(f.sha256, f.path), "utf8");
  return hash.digest("hex");
}

// A file path as it may appear in a manifest: relative, "/"-separated, no empty, "." or ".." parts, no backslash and
// no control characters. Returns null when valid, otherwise the reason.
export function filePathProblem(path) {
  if (typeof path !== "string" || path === "") return "an empty path";
  if (path.length > 1024) return "a path longer than 1024 characters";
  if (path.startsWith("/")) return "an absolute path";
  if (/[\x00-\x1f\x7f]/.test(path)) return "a path with control characters";
  if (path.includes("\\")) return "a path with a backslash";
  const parts = path.split("/");
  if (parts.some((p) => p === "..")) return "a path with a .. part, which leaves its folder";
  if (parts.some((p) => p === "" || p === ".")) return "a path with an empty or . part";
  return null;
}

function readWholeFile(fd, size) {
  const buffer = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const n = readSync(fd, buffer, offset, size - offset, offset);
    if (n === 0) break;
    offset += n;
  }
  return offset === size ? buffer : buffer.subarray(0, offset);
}

// Every regular file under dir, with problems collected instead of thrown, so a verifier can name all of them.
//   files:    [{ path, sha256, executable, size, blob? }] sorted by path
//   problems: [{ path, problem }] (path "." means the folder itself)
// options.blobFormat "sha1" | "sha256" also computes the Git blob id of each file (used to compare with a commit).
export function scanTree(dir, options = {}) {
  const files = [], problems = [];
  let root;
  try { root = lstatSync(dir); } catch (e) {
    problems.push({ path: ".", problem: e.code === "ENOENT" || e.code === "ENOTDIR" ? "the folder does not exist" : `the folder could not be inspected (${e.code ?? e.message})` });
    return { files, problems };
  }
  if (root.isSymbolicLink()) { problems.push({ path: ".", problem: "the folder itself is a symbolic link" }); return { files, problems }; }
  if (!root.isDirectory()) { problems.push({ path: ".", problem: "not a folder" }); return { files, problems }; }

  let tooMany = false, totalBytes = 0;
  const walk = (abs, rel) => {
    let entries;
    try { entries = readdirSync(abs, { withFileTypes: true, encoding: "buffer" }); } catch (e) {
      problems.push({ path: rel || ".", problem: `the folder could not be read (${e.code ?? e.message})` });
      return;
    }
    const named = [];
    for (const ent of entries) {
      let name;
      try { name = utf8.decode(ent.name); } catch {
        problems.push({ path: `${rel ? rel + "/" : ""}${Buffer.from(ent.name).toString("latin1")}`, problem: "a file name that is not valid UTF-8" });
        continue;
      }
      named.push({ ent, name });
    }
    named.sort((a, b) => comparePaths(a.name, b.name));
    for (const { ent, name } of named) {
      if (tooMany) return;
      const path = rel ? `${rel}/${name}` : name;
      const bad = filePathProblem(path);
      if (bad) { problems.push({ path: JSON.stringify(path), problem: bad }); continue; }
      const full = join(abs, name);
      if (ent.isSymbolicLink()) { problems.push({ path, problem: "a symbolic link" }); continue; }
      if (ent.isDirectory()) { walk(full, path); continue; }
      if (!ent.isFile()) { problems.push({ path, problem: "not a regular file" }); continue; }
      if (EXCLUDED_NAMES.includes(name)) continue;
      if (files.length >= MAX_TREE_FILES) {
        problems.push({ path: rel || ".", problem: `more than ${MAX_TREE_FILES} files, which is not a plugin folder` });
        tooMany = true;
        return;
      }
      let fd;
      try {
        fd = openSync(full, fsConstants.O_RDONLY | NOFOLLOW);
        const st = fstatSync(fd);
        if (!st.isFile()) { problems.push({ path, problem: "not a regular file" }); continue; }
        totalBytes += st.size;
        if (totalBytes > MAX_TREE_BYTES) {
          problems.push({ path, problem: `the folder holds more than ${MAX_TREE_BYTES / 1024 / 1024} MB, which is not a plugin folder; nothing further was read` });
          tooMany = true;
          return;
        }
        const bytes = readWholeFile(fd, st.size);
        const entry = { path, sha256: sha256Hex(bytes), executable: (st.mode & 0o111) !== 0, size: bytes.length };
        if (options.blobFormat) entry.blob = createHash(options.blobFormat).update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
        files.push(entry);
      } catch (e) {
        problems.push({ path, problem: e.code === "ELOOP" ? "a symbolic link" : `could not be read (${e.code ?? e.message})` });
      } finally {
        if (fd !== undefined) closeSync(fd);
      }
    }
  };
  walk(dir, "");
  files.sort((a, b) => comparePaths(a.path, b.path));
  return { files, problems };
}

export class TreeError extends Error {
  constructor(dirLabel, problems) {
    const shown = problems.slice(0, 20).map((p) => `${p.path} (${p.problem})`);
    super(`${dirLabel} cannot be hashed: ${shown.join("; ")}${problems.length > shown.length ? `; and ${problems.length - shown.length} more` : ""}`);
    this.problems = problems;
  }
}

// { treeSha256, files } for a folder, or a TreeError naming every problem.
export function hashTree(dir, dirLabel = dir, options = {}) {
  const { files, problems } = scanTree(dir, options);
  if (problems.length) throw new TreeError(dirLabel, problems);
  return { treeSha256: treeSha256Of(files), files };
}
