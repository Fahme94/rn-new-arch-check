import { test } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { resolvePackageDir } from "../src/resolve";
import { scanProject } from "../src/scanner";
import { summarize } from "../src/verdict";
import { makeProject, tempDir } from "./helpers";

/** A legacy Objective-C module whose comments claim the opposite. */
const SPOOFED_LEGACY_M = `
// FIXME: TurboModule migration not started. Incompatible with Fabric.
#import <React/RCTBridgeModule.h>
@implementation Legacy
RCT_EXPORT_MODULE()
@end
`;

const LEGACY_JAVA = "public class M extends ReactContextBaseJavaModule {}\n";

const PODSPEC = "Pod::Spec.new do |s|\n  s.name = 'x'\nend\n";

async function scan(root: string, deep = false) {
  const result = await scanProject({ projectRoot: root, deepScan: deep });
  return { result, summary: summarize(result.reports) };
}

test("walks up to a parent node_modules, as Node resolution does", async () => {
  const root = await tempDir("resolve-up");
  const projectRoot = await makeProject(root, {
    dependencies: { "react-native-legacy": "1.0.0" },
    hoisted: [{ name: "react-native-legacy" }],
  });
  const resolved = await resolvePackageDir(projectRoot, "react-native-legacy");
  assert.equal(resolved, path.join(root, "node_modules", "react-native-legacy"));
});

test("returns null for a dependency that is not installed anywhere", async () => {
  const root = await tempDir("resolve-missing");
  const projectRoot = await makeProject(root, { dependencies: { absent: "1.0.0" } });
  assert.equal(await resolvePackageDir(projectRoot, "absent"), null);
});

test("declared but uninstalled dependencies are reported as UNRESOLVED", async () => {
  const root = await tempDir("scan-uninstalled");
  await makeProject(root, {
    dependencies: { "react-native-camera": "4.2.1", "react-native-fs": "2.20.0" },
  });
  const { summary } = await scan(root);
  assert.equal(summary.unresolved, 2);
});

test("an uninstalled project never yields a compatibility score", async () => {
  const root = await tempDir("scan-noscore");
  await makeProject(root, { dependencies: { "react-native-camera": "4.2.1" } });
  const { summary } = await scan(root);
  assert.equal(summary.compatibilityScore, null);
});

test("an uninstalled project is not reported as compatible", async () => {
  const root = await tempDir("scan-notcompatible");
  await makeProject(root, { dependencies: { "react-native-camera": "4.2.1" } });
  const { summary } = await scan(root);
  assert.equal(summary.isCompatible, false);
});

test("a hoisted workspace dependency is found and inspected", async () => {
  const root = await tempDir("scan-mono");
  const projectRoot = await makeProject(root, {
    dependencies: { "react-native-legacy": "1.0.0" },
    hoisted: [
      { name: "react-native-legacy", files: { "x.podspec": PODSPEC, "ios/M.m": SPOOFED_LEGACY_M } },
    ],
  });
  const { summary } = await scan(projectRoot);
  assert.equal(summary.legacy, 1);
});

test("a legacy module in a .m file is classified as legacy", async () => {
  const root = await tempDir("scan-dot-m");
  await makeProject(root, {
    dependencies: { "rn-legacy": "1.0.0" },
    installed: [{ name: "rn-legacy", files: { "x.podspec": PODSPEC, "M.m": SPOOFED_LEGACY_M } }],
  });
  const { result } = await scan(root);
  assert.equal(result.reports[0].status, "LEGACY_BRIDGE");
});

test("file extension does not change the verdict for identical source", async () => {
  const root = await tempDir("scan-ext");
  await makeProject(root, {
    dependencies: { "rn-a": "1.0.0", "rn-b": "1.0.0" },
    installed: [
      { name: "rn-a", files: { "x.podspec": PODSPEC, "M.m": SPOOFED_LEGACY_M } },
      { name: "rn-b", files: { "x.podspec": PODSPEC, "M.mm": SPOOFED_LEGACY_M } },
    ],
  });
  const { result } = await scan(root);
  const statuses = result.reports.map((report) => report.status);
  assert.deepEqual(statuses, ["LEGACY_BRIDGE", "LEGACY_BRIDGE"]);
});

test("comments mentioning TurboModule do not make a package ready", async () => {
  const root = await tempDir("scan-spoof");
  await makeProject(root, {
    dependencies: { "rn-spoof": "1.0.0" },
    installed: [
      {
        name: "rn-spoof",
        files: {
          "x.podspec": PODSPEC,
          "android/M.java": `// TurboModule and Fabric are unsupported.\n${LEGACY_JAVA}`,
        },
      },
    ],
  });
  const { summary } = await scan(root);
  assert.equal(summary.ready, 0);
});

test("codegenConfig marks a package ready", async () => {
  const root = await tempDir("scan-codegen");
  await makeProject(root, {
    dependencies: { "rn-turbo": "1.0.0" },
    installed: [{ name: "rn-turbo", codegen: true, files: { "x.podspec": PODSPEC } }],
  });
  const { summary } = await scan(root);
  assert.equal(summary.ready, 1);
});

test("a package with no native files is pure JS", async () => {
  const root = await tempDir("scan-purejs");
  await makeProject(root, {
    dependencies: { "pure-lib": "1.0.0" },
    installed: [{ name: "pure-lib", files: { "index.js": "module.exports = {};" } }],
  });
  const { summary } = await scan(root);
  assert.equal(summary.pureJs, 1);
});

test("a manifest inside a package subdirectory is not a separate dependency", async () => {
  const root = await tempDir("scan-nested");
  await makeProject(root, {
    dependencies: { "rn-nested": "1.0.0" },
    installed: [
      {
        name: "rn-nested",
        files: {
          "x.podspec": PODSPEC,
          // Packages ship these to set "type" for a subdirectory.
          "dist/package.json": '{"name":"rn-nested-inner","version":"0.0.0"}',
        },
      },
    ],
  });
  const { result } = await scan(root, true);
  const names = result.reports.map((report) => report.name);
  assert.equal(names.includes("rn-nested-inner"), false);
});

test("scoped packages are resolved", async () => {
  const root = await tempDir("scan-scoped");
  await makeProject(root, {
    dependencies: { "@scope/rn-mod": "1.0.0" },
    installed: [{ name: "@scope/rn-mod", codegen: true, files: { "x.podspec": PODSPEC } }],
  });
  const { result } = await scan(root);
  assert.equal(result.reports[0].name, "@scope/rn-mod");
});

test("an Expo module is recognised without codegenConfig", async () => {
  const root = await tempDir("scan-expo");
  await makeProject(root, {
    dependencies: { "expo-thing": "1.0.0" },
    installed: [{ name: "expo-thing", expoModule: true }],
  });
  const { result } = await scan(root);
  assert.equal(result.reports[0].status, "FULL_SUPPORT");
});

test("the installed react-native version is read, not the declared range", async () => {
  const root = await tempDir("scan-rnversion");
  await makeProject(root, { reactNativeVersion: "0.87.1" });
  const { result } = await scan(root);
  assert.equal(result.project.installedReactNative, "0.87.1");
});
