// secret-rules.mjs: every shape of secret the runtime and the guardrails hook look for, in one place.
//
// Five scanners read these, each for its own job:
//   lib/core.mjs scanSecrets        import and propose refuse to copy a file that carries one
//   lib/security-io.mjs             the evidence engine refuses a text field shaped like one, and the secrets collector
//                                   reports the tracked lines that carry one
//   lib/audit.mjs                   the self-running audit reports one in a changed file
//   lib/preflight.mjs redact        a value printed back in a refusal has one taken out
//   guardrails/hooks/guard-bash.sh  a commit or an add whose staged text carries one is blocked
//
// CREDENTIAL_SHAPES are the specific ones: a credential a service issues, with a prefix and a length that ordinary
// text does not have. Every scanner catches every one of them. The hook is a shell script and cannot import this file,
// so it carries the same list as POSIX extended expressions (each `ere` here is written so that it means the same in
// grep -E and in JavaScript), and scripts/secret-rules.test.mjs fails when the two lists differ.
//
// The rest are looser forms one scanner keeps for its own job, and each is named, with its reason, in that test:
// the evidence engine's older prefix rule and its generic shapes, the redaction forms preflight uses, and the bare
// prefixes import and propose refuse on. None of them may narrow; a shape a scanner caught before it still catches.

// { rule, label, prefix, ere }: rule is the stable name reports and records use; label is the plain words a message
// uses; prefix is the prefix alone where it is distinctive enough for import and propose to refuse on (null where it
// is an ordinary word or name part); ere is the whole shape.
export const CREDENTIAL_SHAPES = [
  { rule: "aws-access-key-id", label: "an AWS access key ID", prefix: null, ere: "(AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}" },
  { rule: "anthropic-api-key", label: "an Anthropic API key", prefix: "sk-ant-", ere: "sk-ant-[A-Za-z0-9_-]{20,}" },
  { rule: "openai-project-key", label: "an OpenAI project key", prefix: "sk-proj-", ere: "sk-proj-[A-Za-z0-9_-]{20,}" },
  { rule: "github-token", label: "a GitHub access token", prefix: "gh[pousr]_", ere: "gh[pousr]_[A-Za-z0-9]{30,}" },
  { rule: "github-fine-grained-token", label: "a GitHub fine-grained token", prefix: "github_pat_", ere: "github_pat_[A-Za-z0-9_]{30,}" },
  { rule: "gitlab-token", label: "a GitLab access token", prefix: "glpat-", ere: "glpat-[A-Za-z0-9_-]{20,}" },
  { rule: "slack-token", label: "a Slack token", prefix: "xox[baprs]-", ere: "xox[baprs]-[A-Za-z0-9-]{10,}" },
  { rule: "stripe-live-secret-key", label: "a Stripe live secret key", prefix: "sk_live_", ere: "sk_live_[A-Za-z0-9]{16,}" },
  // After these four prefixes only letters and digits count, thirty or more, so a setting name such as an npm_config
  // variable (a word, then an underscore) never reads as a token.
  { rule: "npm-token", label: "an npm access token", prefix: null, ere: "npm_[A-Za-z0-9]{30,}" },
  { rule: "digitalocean-token", label: "a DigitalOcean token", prefix: "dop_v1_", ere: "dop_v1_[A-Za-z0-9]{30,}" },
  { rule: "shopify-token", label: "a Shopify access token", prefix: "shpat_", ere: "shpat_[A-Za-z0-9]{30,}" },
  { rule: "supabase-token", label: "a Supabase access token", prefix: "sbp_", ere: "sbp_[A-Za-z0-9]{30,}" },
  { rule: "google-api-key", label: "a Google API key", prefix: null, ere: "AIza[A-Za-z0-9_-]{30,}" },
  { rule: "private-key-block", label: "a private key", prefix: null, ere: "-----BEGIN [A-Z ]*PRIVATE KEY-----" },
];

// Every credential shape as one expression, for a scanner that only asks whether a line carries one.
const credentialPattern = (flags = "") => new RegExp(CREDENTIAL_SHAPES.map((s) => `(?:${s.ere})`).join("|"), flags);

// A signed token (a JSON web token): three base64url parts, the first beginning with the encoding of {"a. Not in the
// hook's list: a signed token is also the usual test fixture and the expired sample in a guide, and the hook blocks a
// commit with no way to allow one line, so it is left to the scanners that report it for a person to look at.
export const SIGNED_TOKEN_ERE = "eyJ[A-Za-z0-9_-]{6,}\\.[A-Za-z0-9_-]{6,}\\.[A-Za-z0-9_-]{6,}";

// The evidence engine's shapes (lib/security-io.mjs SECRET_SHAPES), by the names its records and the collector's
// report use. known-token-prefix keeps the engine's earlier, looser form (a prefix, case ignored, then twelve or more)
// and adds every credential shape; json-web-token keeps its looser form, which the signed token above is inside; the
// last three are generic and match ordinary text often, so they are the engine's alone.
export const EVIDENCE_SHAPES = [
  { rule: "private-key-block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/i },
  { rule: "known-token-prefix", re: new RegExp(`\\b(?:gh[pousr]_|github_pat_|sk-(?:proj-|ant-)?|AKIA|ASIA)[A-Za-z0-9_-]{12,}|${credentialPattern().source}`, "i") },
  { rule: "json-web-token", re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/i },
  { rule: "credential-assignment", re: /\b(?:password|passwd|secret|token|api[-_ ]?key|authorization)\s*[:=]\s*\S+/i },
  { rule: "bearer-credential", re: /\bBearer\s+\S+/i },
  { rule: "long-encoded-run", re: /[A-Za-z0-9+/_=-]{48,}/i },
];

// The forms preflight's redact() takes out of a value it prints back, looser than the credential shapes because taking
// out too much there costs a word of the message and printing a credential costs the credential. Each is global,
// for String.replace. liveKeys is taken out only when what follows the prefix does not read as words (preflight.mjs).
export const REDACTION_SHAPES = {
  specificTokens: /\b(gh[pousr]|github_pat|glpat|xox[baprs]|sk-ant|sk-proj|npm|dop_v1|shpat|sbp)[_-][A-Za-z0-9_-]{12,}/g,
  liveKeys: /\b[A-Za-z]{2,4}_(live|test)_[A-Za-z0-9]{8,}/g,
  awsKeyIds: /\b(AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{12,}\b/g,
  googleKeys: /\bAIza[A-Za-z0-9_-]{20,}/g,
  signedToken: new RegExp(`\\b${SIGNED_TOKEN_ERE}`, "g"),
  credentials: credentialPattern("g"),
};
