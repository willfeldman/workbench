import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyRunLimit, quotaRequestId } from "../src/lib/request-quota";

test("retries share a reservation but cross-project replays consume another", () => {
  const request = "b5e069e5-ac9b-4a4d-954d-a2c052bc62c4";
  const first = quotaRequestId("project-one", request);
  assert.equal(first, quotaRequestId("project-one", request));
  assert.notEqual(first, quotaRequestId("project-two", request));
  assert.notEqual(first, quotaRequestId("project-one", "another-request"));
  assert.match(first, /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
});

test("invalid quota configuration falls back to four requests", () => {
  for (const invalid of ["", "0", "-1", "NaN", "Infinity", "1.5"])
    assert.equal(dailyRunLimit(invalid), 4);
  assert.equal(dailyRunLimit("4"), 4);
  assert.equal(dailyRunLimit("8"), 8);
});
