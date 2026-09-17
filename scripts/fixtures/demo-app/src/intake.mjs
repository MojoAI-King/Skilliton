// intake.mjs: turn a usable submission into the record the next system reads.

import { FIELDS, validate } from "./validate.mjs";

// A record the next system can read, or { problems } when the submission cannot be used. `now` is passed in so a test
// can decide the time.
export function intake(submission, { now = new Date(), source = "web" } = {}) {
  const problems = validate(submission);
  if (problems.length) return { problems };
  const fields = {};
  for (const field of Object.keys(FIELDS)) {
    const value = submission[field];
    if (value !== undefined && value !== null && String(value).trim() !== "") fields[field] = String(value).trim();
  }
  return {
    receivedAt: now.toISOString(),
    source,
    fields,
    reference: reference(fields.email, now),
  };
}

// A short reference a person can read back over the telephone. Not a secret, and not unique on its own: the time is
// what makes it unique, and the next system stores both.
function reference(email, now) {
  const initials = (email ?? "").replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase().padEnd(3, "X");
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `${initials}-${day}`;
}
