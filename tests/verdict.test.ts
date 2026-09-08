import { test } from "node:test";
import assert from "node:assert/strict";
import { PackageReport } from "../src/scanner";
import { gateFailures, parseFailCategories, summarize } from "../src/verdict";

function report(overrides: Partial<PackageReport>): PackageReport {
  return {
    name: "pkg",
    version: "1.0.0",
    packagePath: "/tmp/pkg",
    isTransitive: false,
    hasNativeCode: true,
    hasCodegenConfig: false,
    hasTurboModule: false,
    hasFabric: false,
    isExpoModule: false,
    platforms: [],
    status: "FULL_SUPPORT",
    confidence: "structural",
    notes: [],
    ...overrides,
  };
}

test("an empty scan is incomplete, never ready", () => {
  assert.equal(summarize([]).verdict, "INCOMPLETE");
});

test("an empty scan reports no score rather than 100%", () => {
  assert.equal(summarize([]).compatibilityScore, null);
});

test("unverified native packages cannot yield READY", () => {
  const summary = summarize([report({ status: "UNKNOWN_NATIVE", confidence: "none" })]);
  assert.equal(summary.verdict, "NEEDS_REVIEW");
});

test("unverified native packages are not reported as compatible", () => {
  const summary = summarize([report({ status: "UNKNOWN_NATIVE", confidence: "none" })]);
  assert.equal(summary.isCompatible, false);
});

test("a legacy package requires migration", () => {
  assert.equal(summarize([report({ status: "LEGACY_BRIDGE" })]).verdict, "MIGRATION_REQUIRED");
});

test("an unresolved dependency makes the whole scan incomplete", () => {
  const summary = summarize([report({ status: "FULL_SUPPORT" }), report({ status: "UNRESOLVED" })]);
  assert.equal(summary.verdict, "INCOMPLETE");
});

test("a 16KB finding requires migration even when every package is ready", () => {
  const summary = summarize([
    report({
      status: "FULL_SUPPORT",
      pageSize16KB: {
        isCompatible: false,
        hasPrebuiltBinaries: true,
        prebuiltLibs: [],
        warnings: ["misaligned"],
      },
    }),
  ]);
  assert.equal(summary.verdict, "MIGRATION_REQUIRED");
});

test("all-ready packages yield READY", () => {
  assert.equal(summarize([report({ status: "FULL_SUPPORT" })]).verdict, "READY");
});

test("the score counts only inspected native packages", () => {
  const summary = summarize([
    report({ status: "FULL_SUPPORT" }),
    report({ status: "LEGACY_BRIDGE" }),
    report({ status: "PURE_JS", hasNativeCode: false }),
  ]);
  assert.equal(summary.compatibilityScore, 50);
});

test("the strict gate fires on unresolved dependencies", () => {
  const summary = summarize([report({ status: "UNRESOLVED" })]);
  assert.equal(gateFailures(summary, ["unresolved"]).length, 1);
});

test("the gate stays silent for categories that were not requested", () => {
  const summary = summarize([report({ status: "UNKNOWN_NATIVE" })]);
  assert.equal(gateFailures(summary, ["legacy"]).length, 0);
});

test("an empty scan trips the incomplete gate", () => {
  assert.equal(gateFailures(summarize([]), ["incomplete"]).length, 1);
});

test("--fail-on parses a comma separated list", () => {
  assert.deepEqual(parseFailCategories("legacy,16kb").categories, ["legacy", "16kb"]);
});

test("--fail-on none disables every gate", () => {
  assert.deepEqual(parseFailCategories("none").categories, []);
});

test("--fail-on all enables every gate", () => {
  assert.equal(parseFailCategories("all").categories.length, 5);
});

test("--fail-on rejects an unknown category", () => {
  assert.deepEqual(parseFailCategories("bogus").invalid, ["bogus"]);
});
