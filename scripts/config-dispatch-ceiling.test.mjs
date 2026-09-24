#!/usr/bin/env node
// config-dispatch-ceiling.test.mjs: dispatch.contextCeiling, the bound `dispatch close` measures each lane's peak
// context against (B82), is a known key, so a project that sets it is not refused by the configuration check.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DISPATCH_DEFAULTS, configProblems } from "../packs/base/plugins/workflow/runtime/lib/config.mjs";

const MESSAGE = "dispatch.contextCeiling must be null or a whole number of tokens from 10000 to 2000000";

test("the key is known, null by default, and a plain bound is accepted", () => {
  assert.equal(DISPATCH_DEFAULTS.contextCeiling, null);
  assert.deepEqual(configProblems({ dispatch: { contextCeiling: 200000 } }), []);
  assert.deepEqual(configProblems({ dispatch: { contextCeiling: null } }), []);
});

test("a bound that is not a whole number of tokens in range is refused", () => {
  for (const bad of [0, 9999, 2000001, 1.5, "200000", true]) {
    assert.deepEqual(configProblems({ dispatch: { contextCeiling: bad } }), [MESSAGE], `value ${JSON.stringify(bad)}`);
  }
});
