// ids.mjs: the one rule for task, decision and lesson IDs (docs/CONTRACTS.md sections 10 and 11).
//
//   YYYY-MM-DD-<slug>-<hex4>: the local date, a slug of 1 to 40 lowercase letters and digits joined by single
//   hyphens, and four random hex digits. No sequential numbers, so records written on different branches never
//   compete for one name.
//
//   newId(title, { date, fallback, hex })  a new ID; fallback is the slug for a title with no letter or digit
//   isId(id)                                whether a string follows the rule
//   slugify(title, fallback)                the slug alone; accents are dropped (an accented e becomes e)
//   localDate(date)                         YYYY-MM-DD in local time; throws TypeError for an invalid Date
//
// Every module that makes or reads these IDs imports them from here. Nothing here imports from outside the plugin.

import { randomBytes } from "node:crypto";

export const MAX_SLUG = 40;
export const ID_RE = /^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)-([0-9a-f]{4})$/;

export function slugify(title, fallback = "entry") {
  const plain = String(title).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  let slug = plain.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (slug.length > MAX_SLUG) slug = slug.slice(0, MAX_SLUG).replace(/-+$/, "");
  return slug || fallback;
}

const pad = (n, width = 2) => String(n).padStart(width, "0");

export function localDate(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new TypeError("a valid Date is required");
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function newId(title, { date = new Date(), fallback = "entry", hex = () => randomBytes(2).toString("hex") } = {}) {
  return `${localDate(date)}-${slugify(title, fallback)}-${hex()}`;
}

export function isId(id) {
  if (typeof id !== "string") return false;
  const m = ID_RE.exec(id);
  return Boolean(m) && m[2].length <= MAX_SLUG;
}
