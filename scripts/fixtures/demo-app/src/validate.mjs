// validate.mjs: is a submitted form usable?
//
// A submission is an object of field name to value, as a form sends it. Validation answers with a list of problems in
// plain words, because the people who read them are the ones who own the form, not the ones who wrote this file.

const EMAIL = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

export const FIELDS = {
  name: { label: "name", required: true, max: 120 },
  email: { label: "email address", required: true, max: 254 },
  company: { label: "company", required: false, max: 120 },
  message: { label: "message", required: true, max: 4000 },
};

// Returns [] when the submission is usable, else one sentence per problem.
export function validate(submission) {
  if (submission === null || typeof submission !== "object" || Array.isArray(submission)) {
    return ["The submission is not a set of fields."];
  }
  const problems = [];
  for (const [field, rule] of Object.entries(FIELDS)) {
    const value = submission[field];
    if (value === undefined || value === null || String(value).trim() === "") {
      if (rule.required) problems.push(`The ${rule.label} is missing.`);
      continue;
    }
    const text = String(value).trim();
    if (text.length > rule.max) problems.push(`The ${rule.label} is longer than ${rule.max} characters.`);
    if (field === "email" && !EMAIL.test(text)) problems.push("The email address does not look like an address.");
  }
  for (const field of Object.keys(submission)) {
    if (!Object.hasOwn(FIELDS, field)) problems.push(`The form sent a field this service does not know: ${field}.`);
  }
  return problems;
}
