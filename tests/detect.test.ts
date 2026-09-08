import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classify,
  collectEvidence,
  emptyEvidence,
  hasToken,
  stripComments,
} from "../src/detect";

test("strips line comments", () => {
  assert.equal(stripComments("a // TurboModule\nb", "c").includes("TurboModule"), false);
});

test("strips block comments", () => {
  assert.equal(stripComments("/* Fabric */ code", "c").includes("Fabric"), false);
});

test("strips Ruby comments in podspecs", () => {
  assert.equal(stripComments("# uses Fabric\ns.name", "ruby").includes("Fabric"), false);
});

test("keeps string literals intact", () => {
  assert.equal(stripComments('x = "http://example.com";', "c").includes("example.com"), true);
});

test("does not treat a hash inside a string as a Ruby comment", () => {
  assert.equal(stripComments('s.name = "a#b"', "ruby").includes("a#b"), true);
});

test("token matching respects word boundaries", () => {
  assert.equal(hasToken("class Fabricator {}", "Fabric"), false);
});

test("token matching finds a real symbol", () => {
  assert.equal(hasToken("@interface M : NSObject <RCTTurboModule>", "RCTTurboModule"), true);
});

test("a comment claiming Fabric support is not evidence of it", () => {
  const evidence = collectEvidence("// TODO: Fabric support not started\n", "c", emptyEvidence());
  assert.equal(evidence.fabric, false);
});

test("codegenConfig establishes full support", () => {
  const result = classify({ hasCodegenConfig: true, isExpoModule: false }, emptyEvidence());
  assert.equal(result.status, "FULL_SUPPORT");
});

test("an Expo module config establishes full support", () => {
  const result = classify({ hasCodegenConfig: false, isExpoModule: true }, emptyEvidence());
  assert.equal(result.status, "FULL_SUPPORT");
});

test("legacy source symbols downgrade to LEGACY_BRIDGE", () => {
  const evidence = { ...emptyEvidence(), legacy: true };
  const result = classify({ hasCodegenConfig: false, isExpoModule: false }, evidence);
  assert.equal(result.status, "LEGACY_BRIDGE");
});

test("TurboModule source symbols alone never promote to FULL_SUPPORT", () => {
  const evidence = { ...emptyEvidence(), turboModule: true, fabric: true };
  const result = classify({ hasCodegenConfig: false, isExpoModule: false }, evidence);
  assert.equal(result.status, "UNKNOWN_NATIVE");
});

test("a migrated package keeps FULL_SUPPORT despite retained legacy files", () => {
  const evidence = { ...emptyEvidence(), legacy: true };
  const result = classify({ hasCodegenConfig: true, isExpoModule: false }, evidence);
  assert.equal(result.status, "FULL_SUPPORT");
});

test("native code with no signals is reported as unverified", () => {
  const result = classify({ hasCodegenConfig: false, isExpoModule: false }, emptyEvidence());
  assert.equal(result.confidence, "none");
});
