// path-form.mjs: whether two absolute paths are the same path written two ways.
//
// Several checks compare a realpath with a path another program printed, to prove that nothing on the way is a
// symbolic link. On Windows the two sides differ in form even when nothing is a link: git prints C:/Users/..., and
// Node's realpath gives C:\Users\... (the first Windows run refused every repository on exactly that).
// So the comparison is exact on POSIX, and on win32 it ignores only what is form rather than place: the separator,
// letter case (NTFS compares names without case by default, the drive letter included), one trailing separator and
// the \\?\ long-path prefix. A link still fails, because its realpath names another folder. A short 8.3 name
// (RUNNER~1) is not expanded here; a caller that can meet one resolves both sides with realpathSync.native, which does.

import { win32 } from "node:path";

const winForm = (p) => win32.normalize(p.replace(/^[\\/]{2}\?[\\/]/, "")).replace(/(?<=[^:])\\$/, "").toLowerCase();

// True when a and b are the same path; false when either is not a string (a realpath that failed, say).
export function samePath(a, b, platform = process.platform) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  return platform === "win32" ? winForm(a) === winForm(b) : a === b;
}
