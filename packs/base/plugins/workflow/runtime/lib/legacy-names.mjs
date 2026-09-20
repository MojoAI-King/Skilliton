// legacy-names.mjs: the names this runtime used before the product was renamed from Skillgate to Skilliton
// (PLAN.md M9; docs/BRANDING.md). Nothing else in the runtime spells them.
//
// They are read for these purposes only, and never written:
//   1. Migration 0003-skilliton-names moves a prepared project from these names to the current ones.
//   2. State left on a project, a machine or a repository under these names is detected and reported with the step
//      that resolves it, so it is never silently ignored. That state is never read as configuration or trust, with
//      two exceptions that keep protection from lapsing before a project is migrated: the guardrails hook still reads
//      an unmigrated project's guardrail settings, and the delivery gate still enforces a shared branch's policy at
//      the earlier path, so the migration commit that moves it needs an approver's signature. status, doctor, the
//      session start and the stop reminder also read an unmigrated project's configuration, to report it and keep
//      reminding about checkpoints; nothing writes it except the migration that moves it.
//
// Stored-evidence identifiers kept on purpose are not listed here: the security catalog versions
// (skillgate-starter-1, skillgate-baseline-2) and control IDs (SG-*), which recorded observations name (DECISIONS.md
// O23), and the prototype's exact bytes in prototype-v1.mjs, which migration 0002 recognises.
//
// Nothing here imports from outside the plugin folder.

import { homedir } from "node:os";
import { join } from "node:path";

const OLD = "skillgate";

export const LEGACY_NAME = "Skillgate";
export const LEGACY_COMMAND = OLD;

// ---------- a prepared project ----------

export const LEGACY_PROJECT_DIR = `.${OLD}`;
export const LEGACY_CONFIG_REL = `${LEGACY_PROJECT_DIR}/config.json`;
export const LEGACY_MIGRATIONS_DIR = `${LEGACY_PROJECT_DIR}/migrations`;
export const LEGACY_SECURITY_README_REL = `${LEGACY_PROJECT_DIR}/security/records/README.md`;
export const LEGACY_RECEIPT_SCHEMA = `${OLD}.migration-receipt/1`;
export const LEGACY_HARNESS_START = new RegExp(`^<!-- ${OLD}:harness:start v(\\d+) -->$`);
export const LEGACY_HARNESS_END = `<!-- ${OLD}:harness:end -->`;
export const LEGACY_HARNESS_PREFIX = `<!-- ${OLD}:harness:`;
// Marker lines the runtime writes into record files and the generated security report.
export const LEGACY_RECORD_MARKER = new RegExp(`^<!-- ${OLD}(:index:[a-z]+:(?:start|end)|:security-findings:(?:start|end)|-security-evidence-report:v1) -->$`);
export const LEGACY_MANIFEST_MARKER = `# ${OLD}-file-manifest/1`;
export const LEGACY_MARKETPLACE = OLD;
// <git dir>/skillgate/journal.jsonl and <git dir>/skillgate-backups/: left in place, and named in the migration's notes.
export const LEGACY_JOURNAL_DIR = OLD;
export const LEGACY_BACKUPS_DIR = `${OLD}-backups`;

// ---------- a machine ----------

const legacyConfigHome = () => join(homedir(), ".config", OLD);
export const legacyJoinDir = () => join(legacyConfigHome(), "joined");
export const legacyTrustDir = () => join(legacyConfigHome(), "trust");
const LEGACY_LAUNCHER_NAME = OLD;
export const LEGACY_ENV_PREFIX = "SKILLGATE_";

// ---------- a company skills repository and a shared repository ----------

export const LEGACY_RELEASE_TAG = `${OLD}-release/`;
const LEGACY_WITHDRAWN_TAG = `${OLD}-withdrawn/`;
export const LEGACY_DELIVERY_HOOK_MARKER = new RegExp(`^# ${OLD}:delivery-hook v\\d+[ \\t]*$`, "m");
export const LEGACY_DELIVERY_CONFIG_KEYS = [`${OLD}.approvers`, `${OLD}.runtime`];
// A shared branch whose delivery policy is still at the earlier path stays protected by it until the project's
// migration commit, signed by an approver, moves it (lib/delivery.mjs readPolicyAt).
export const LEGACY_POLICY_FILE = `${LEGACY_PROJECT_DIR}/delivery.json`;
export const LEGACY_POLICY_SCHEMA = `${OLD}.delivery/1`;

// The SKILLGATE_* variables set in env, each with the SKILLITON_* name that replaced it.
export function legacyEnvironment(env = process.env) {
  return Object.keys(env)
    .filter((key) => key.startsWith(LEGACY_ENV_PREFIX) && key.length > LEGACY_ENV_PREFIX.length)
    .sort()
    .map((key) => ({ name: key, replacement: `SKILLITON_${key.slice(LEGACY_ENV_PREFIX.length)}` }));
}
