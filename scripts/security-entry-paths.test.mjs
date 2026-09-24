// security-entry-paths.test.mjs: a security record can cite a decision, lesson or task entry. Their file names
// (<date>-<lowercase words>-<4 hex>.md, lib/ids.mjs) are long runs of letters and hyphens, which the long-encoded-run
// rule read as a secret, so `security record --source docs/lessons/<entry>.md` was refused as SENSITIVE_PATH. The entry
// name is exempt from that rule and from the credential-word rule (a title word such as tokenizer); a real encoded run
// elsewhere, and a known token shape anywhere in the path, is still refused.
//   node scripts/security-entry-paths.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { relativePath } from "../packs/base/plugins/workflow/runtime/lib/security-io.mjs";

const ok = (p) => assert.doesNotThrow(() => relativePath(p, true), p);
const refused = (p) => assert.throws(() => relativePath(p, true), /SENSITIVE_PATH/, p);
const RUN = ["QmFzZTY0IGVuY29kZWQg", "c2VjcmV0IHRoYXQgaXMg", "bG9uZyBlbm91Z2g"].join(""); // assembled at run time

test("a lesson, decision or task entry file can be cited", () => {
  ok("docs/lessons/2026-09-24-a-fix-that-hardens-the-writers-it-names-772e.md");
  ok("docs/decisions/2026-09-24-the-guard-s-tokenizer-stays-in-awk-the-n-44a4.md");
  ok("docs/tasks/2026-09-23-everything-a-session-can-finish-the-usag-b6c7.md");
});

test("a real encoded run is still refused, in an entry-shaped folder or file", () => {
  refused(`docs/lessons/${RUN}.md`);
  refused(`docs/lessons/2026-09-24-${RUN}-772e.md`);
  refused(`evidence/${RUN}/notes.md`);
});

test("a word such as token in an entry's title does not refuse it, and still refuses any other file", () => {
  ok("docs/lessons/2026-09-24-a-token-in-a-log-772e.md");
  refused("docs/notes/a-token-in-a-log.md");
  refused("docs/lessons/github-token.txt");
});

test("a known token shape is refused anywhere in the path, entry-shaped or not", () => {
  const shaped = ["gh", "p_", "a".repeat(36)].join("");
  refused(`docs/lessons/${shaped}.md`);
  refused(`docs/lessons/2026-09-24-${shaped}-772e.md`);
});
