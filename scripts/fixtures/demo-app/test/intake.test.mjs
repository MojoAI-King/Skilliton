import { test } from "node:test";
import assert from "node:assert/strict";
import { intake } from "../src/intake.mjs";

const now = new Date("2026-09-23T10:30:00.000Z");
const good = { name: "A Person", email: "person@example.invalid", company: "", message: "Please call me." };

test("a usable submission becomes a record", () => {
  const record = intake(good, { now });
  assert.equal(record.receivedAt, "2026-09-23T10:30:00.000Z");
  assert.equal(record.source, "web");
  assert.deepEqual(record.fields, { name: "A Person", email: "person@example.invalid", message: "Please call me." });
  assert.equal(record.reference, "PER-20260923");
});

test("an unusable submission comes back with its problems and no record", () => {
  const answer = intake({ ...good, message: "" }, { now });
  assert.deepEqual(answer, { problems: ["The message is missing."] });
});
