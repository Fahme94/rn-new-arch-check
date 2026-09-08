import { test } from "node:test";
import assert from "node:assert/strict";
import { compareVersions, coerceVersion, satisfiesMinimum, isBelow } from "../src/version";

test("orders versions numerically, not lexically", () => {
  assert.equal(compareVersions("10.0.0", "9.0.0"), 1);
});

test("treats a prerelease as older than its release", () => {
  assert.equal(compareVersions("7.0.0-rc.1", "7.0.0"), -1);
});

test("ignores build metadata when comparing", () => {
  assert.equal(compareVersions("1.2.3+build.9", "1.2.3"), 0);
});

test("coerces a range spec to a concrete version", () => {
  assert.equal(coerceVersion("^0.76.0"), "0.76.0");
});

test("returns null for a range with no version", () => {
  assert.equal(coerceVersion("workspace:*"), null);
});

test("satisfiesMinimum is false for an unparseable installed version", () => {
  assert.equal(satisfiesMinimum(undefined, "6.0.0"), false);
});

test("satisfiesMinimum accepts a version well past the floor", () => {
  assert.equal(satisfiesMinimum("26.3.3", "21.6.0"), true);
});

test("isBelow detects a version under the boundary", () => {
  assert.equal(isBelow("0.79.7", "0.82.0"), true);
});
