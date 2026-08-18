import assert from "node:assert/strict";
import test from "node:test";

import {
  LEGACY_MARKETPLACE_EXTENSION_TOKEN_MESSAGE,
  SMARTAIHUB_COMPANION_NAME,
  SMARTAIHUB_COMPANION_TOKEN_MESSAGE,
  isSupportedCompanionTokenMessage,
} from "./companionIdentity";

test("defines the canonical SmartAIHub Companion identity", () => {
  assert.equal(SMARTAIHUB_COMPANION_NAME, "SmartAIHub Companion");
  assert.equal(SMARTAIHUB_COMPANION_TOKEN_MESSAGE, "SMARTAIHUB_COMPANION_TOKEN");
});

test("accepts canonical and legacy external token messages only", () => {
  assert.equal(isSupportedCompanionTokenMessage(SMARTAIHUB_COMPANION_TOKEN_MESSAGE), true);
  assert.equal(isSupportedCompanionTokenMessage(LEGACY_MARKETPLACE_EXTENSION_TOKEN_MESSAGE), true);
  assert.equal(isSupportedCompanionTokenMessage("SMARTAIHUB_OTHER_TOKEN"), false);
  assert.equal(isSupportedCompanionTokenMessage(null), false);
});
