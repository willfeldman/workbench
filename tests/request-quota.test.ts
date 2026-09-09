import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyRunLimit, quotaRequestId, hasUnlimitedUsage } from "../src/lib/request-quota";

test("retries share a reservation but cross-project replays consume another", () => {
  const request = "b5e069e5-ac9b-4a4d-954d-a2c052bc62c4";
  const first = quotaRequestId("project-one", request);
  assert.equal(first, quotaRequestId("project-one", request));
  assert.notEqual(first, quotaRequestId("project-two", request));
  assert.notEqual(first, quotaRequestId("project-one", "another-request"));
  assert.match(first, /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
});

test("invalid quota configuration falls back to thirty requests", () => {
  for (const invalid of ["", "0", "-1", "NaN", "Infinity", "1.5"])
    assert.equal(dailyRunLimit(invalid), 30);
  assert.equal(dailyRunLimit("30"), 30);
  assert.equal(dailyRunLimit("4"), 4);
  assert.equal(dailyRunLimit("8"), 8);
});

test("unlimited usage requires an exact verified account email", () => {
  const user = { email: "Owner@Example.com", email_confirmed_at: "2026-09-08T00:00:00Z" };
  assert.equal(hasUnlimitedUsage(user, " owner@example.com "), true);
  assert.equal(hasUnlimitedUsage(user, "other@example.com"), false);
  assert.equal(hasUnlimitedUsage({ ...user, email: "owner@example.com.attacker.test" }, "owner@example.com"), false);
  assert.equal(hasUnlimitedUsage({ ...user, email_confirmed_at: undefined }, "owner@example.com"), false);
  assert.equal(hasUnlimitedUsage({ ...user, is_anonymous: true }, "owner@example.com"), false);
  assert.equal(hasUnlimitedUsage(null, "owner@example.com"), false);
});
