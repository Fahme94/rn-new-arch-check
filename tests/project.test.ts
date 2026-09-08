import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectProject, parseProperties } from "../src/project";
import { makeProject, tempDir } from "./helpers";

async function project(fixture: Parameters<typeof makeProject>[1]) {
  const root = await tempDir("project");
  const projectRoot = await makeProject(root, fixture);
  return inspectProject(projectRoot);
}

test("parses key=value properties", () => {
  assert.equal(parseProperties("newArchEnabled=true\n").newArchEnabled, "true");
});

test("ignores comments and blank lines", () => {
  assert.deepEqual(parseProperties("# comment\n\n"), {});
});

test("tolerates values containing an equals sign", () => {
  assert.equal(parseProperties("a=b=c").a, "b=c");
});

test("reads the installed react-native version rather than the range", async () => {
  const info = await project({ reactNativeVersion: "0.87.1" });
  assert.equal(info.installedReactNative, "0.87.1");
});

test("New Architecture is unconditional from 0.82 onward", async () => {
  const info = await project({ reactNativeVersion: "0.87.1" });
  assert.equal(info.newArchEnabled, true);
});

test("newArchEnabled=false cannot disable the New Architecture on 0.82+", async () => {
  const info = await project({
    reactNativeVersion: "0.87.1",
    gradleProperties: "newArchEnabled=false\n",
  });
  assert.equal(info.newArchEnabled, true);
});

test("a stale flag on 0.82+ is reported as dead configuration", async () => {
  const info = await project({
    reactNativeVersion: "0.87.1",
    gradleProperties: "newArchEnabled=true\n",
  });
  const warnings = info.notes.filter((note) => note.level === "warn");
  assert.match(warnings[0].message, /dead configuration/);
});

test("an ignored opt-out on 0.82+ tells the developer to delete the line", async () => {
  const info = await project({
    reactNativeVersion: "0.87.1",
    gradleProperties: "newArchEnabled=false\n",
  });
  const warnings = info.notes.filter((note) => note.level === "warn");
  assert.match(warnings[0].message, /is ignored .* Delete the line/);
});

test("between 0.76 and 0.82 the opt-out is still honoured", async () => {
  const info = await project({
    reactNativeVersion: "0.79.7",
    gradleProperties: "newArchEnabled=false\n",
  });
  assert.equal(info.newArchEnabled, false);
});

test("from 0.76 the New Architecture is on by default", async () => {
  const info = await project({ reactNativeVersion: "0.79.7", gradleProperties: "" });
  assert.equal(info.newArchEnabled, true);
});

test("before 0.76 an absent flag means the legacy architecture", async () => {
  const info = await project({ reactNativeVersion: "0.72.17", gradleProperties: "" });
  assert.equal(info.newArchEnabled, false);
});

test("before 0.76 the flag is what opts in", async () => {
  const info = await project({
    reactNativeVersion: "0.72.17",
    gradleProperties: "newArchEnabled=true\n",
  });
  assert.equal(info.newArchEnabled, true);
});

test("the scoped gradle property is recognised", async () => {
  const info = await project({
    reactNativeVersion: "0.87.1",
    gradleProperties: "react.newArchEnabled=true\n",
  });
  assert.equal(info.flags[0].key, "react.newArchEnabled");
});

test("an uninstalled react-native leaves the status undetermined", async () => {
  const info = await project({ dependencies: { "react-native": "^0.87.0" } });
  assert.equal(info.newArchEnabled, null);
});

test("an uninstalled react-native is called out", async () => {
  const info = await project({ dependencies: { "react-native": "^0.87.0" } });
  assert.match(info.notes[0].message, /not installed/);
});

test("the Podfile flag is picked up", async () => {
  const info = await project({
    reactNativeVersion: "0.87.1",
    podfile: "ENV['RCT_NEW_ARCH_ENABLED'] = '1'\n",
  });
  assert.ok(info.flags.some((flag) => flag.key === "RCT_NEW_ARCH_ENABLED"));
});

test("the Expo config flag is picked up", async () => {
  const info = await project({
    reactNativeVersion: "0.87.1",
    appJson: { expo: { newArchEnabled: true } },
  });
  assert.ok(info.flags.some((flag) => flag.key === "expo.newArchEnabled"));
});

test("native project directories are detected", async () => {
  const info = await project({ reactNativeVersion: "0.87.1", gradleProperties: "" });
  assert.equal(info.hasAndroidProject, true);
});
