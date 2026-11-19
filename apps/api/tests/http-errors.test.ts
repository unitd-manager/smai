import assert from "node:assert/strict";
import test from "node:test";
import { isClientDisconnectError } from "../src/http-errors.js";

test("classifies aborted HTTP response writes as client disconnects", () => {
  for (const code of ["ECANCELED", "ECONNABORTED", "ECONNRESET", "EPIPE"]) {
    assert.equal(isClientDisconnectError(Object.assign(new Error("response closed"), { code })), true);
  }
  assert.equal(isClientDisconnectError(new Error("unexpected API failure")), false);
  assert.equal(isClientDisconnectError(null), false);
});
