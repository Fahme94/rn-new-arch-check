import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXACT_ADVICE,
  PREFIX_ADVICE,
  formatAdvice,
  getAdvice,
} from "../src/replacements";

test("advice is suppressed once the upgrade floor is met", () => {
  assert.equal(getAdvice("react-native-video", "6.19.2")?.satisfied, true);
});

test("advice still applies below the upgrade floor", () => {
  assert.equal(getAdvice("react-native-video", "5.2.0")?.satisfied, false);
});

test("a version far past the floor stays quiet, so the table cannot rot", () => {
  assert.equal(getAdvice("@react-native-firebase/messaging", "26.3.3")?.satisfied, true);
});

test("scoped prefix rules apply to every package in the scope", () => {
  assert.equal(getAdvice("@react-native-firebase/app", "1.0.0")?.kind, "upgrade");
});

test("a replacement is never satisfied by a version bump", () => {
  assert.equal(getAdvice("react-native-camera", "99.0.0")?.satisfied, false);
});

test("informational entries are always satisfied", () => {
  assert.equal(getAdvice("detox", "20.0.0")?.satisfied, true);
});

test("a test runner is not advertised as a replacement", () => {
  assert.equal(getAdvice("detox", "20.0.0")?.kind, "none");
});

test("an unknown version cannot satisfy an upgrade floor", () => {
  assert.equal(getAdvice("react-native-video", null)?.satisfied, false);
});

test("packages with no entry get no advice", () => {
  assert.equal(getAdvice("some-random-lib", "1.0.0"), undefined);
});

test("upgrade advice names the floor", () => {
  const advice = getAdvice("react-native-keychain", "8.0.0")!;
  assert.equal(formatAdvice(advice), "Upgrade to v10.0.0 or later");
});

test("replace advice names the target", () => {
  const advice = getAdvice("react-native-fs", "2.20.0")!;
  assert.match(formatAdvice(advice), /^Replace with /);
});

test("every upgrade entry declares a floor to compare against", () => {
  const entries = [
    ...Object.entries(EXACT_ADVICE),
    ...PREFIX_ADVICE.map((rule) => [rule.prefix, rule.entry] as const),
  ];
  const broken = entries
    .filter(([, entry]) => entry.kind === "upgrade" && !entry.minVersion)
    .map(([name]) => name);
  assert.deepEqual(broken, []);
});

test("every replace entry names a replacement", () => {
  const broken = Object.entries(EXACT_ADVICE)
    .filter(([, entry]) => entry.kind === "replace" && !entry.replacement)
    .map(([name]) => name);
  assert.deepEqual(broken, []);
});

test("no entry carries a field belonging to another kind", () => {
  const broken = Object.entries(EXACT_ADVICE)
    .filter(
      ([, entry]) =>
        (entry.kind === "none" && (entry.minVersion || entry.replacement)) ||
        (entry.kind === "upgrade" && entry.replacement) ||
        (entry.kind === "replace" && entry.minVersion)
    )
    .map(([name]) => name);
  assert.deepEqual(broken, []);
});

test("every entry explains itself", () => {
  const broken = Object.entries(EXACT_ADVICE)
    .filter(([, entry]) => entry.reason.trim() === "")
    .map(([name]) => name);
  assert.deepEqual(broken, []);
});
