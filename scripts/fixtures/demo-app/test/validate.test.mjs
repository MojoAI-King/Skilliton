import { test } from "node:test";
import assert from "node:assert/strict";
import { validate } from "../src/validate.mjs";

const good = { name: "A Person", email: "person@example.invalid", message: "Please call me." };

test("a usable submission has no problems", () => {
  assert.deepEqual(validate(good), []);
});

test("a missing required field is named in plain words", () => {
  assert.deepEqual(validate({ ...good, email: "" }), ["The email address is missing."]);
});

test("an address that is not an address is named", () => {
  assert.deepEqual(validate({ ...good, email: "person at example" }), ["The email address does not look like an address."]);
});

test("a field the service does not know is named", () => {
  assert.deepEqual(validate({ ...good, referrer: "a friend" }), ["The form sent a field this service does not know: referrer."]);
});

test("something that is not a set of fields is refused", () => {
  assert.deepEqual(validate(null), ["The submission is not a set of fields."]);
  assert.deepEqual(validate(["a"]), ["The submission is not a set of fields."]);
});
