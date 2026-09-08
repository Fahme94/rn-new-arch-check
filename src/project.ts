import fs from "fs-extra";
import path from "path";
import { resolvePackageDir, readInstalledVersion } from "./resolve";
import { coerceVersion, isBelow, satisfiesMinimum } from "./version";

/**
 * The project's own New Architecture configuration.
 *
 * Interpreting these flags requires the React Native version, because their
 * meaning changed:
 *
 *   < 0.76   New Architecture is opt-in; the flag is what turns it on.
 *   0.76+    New Architecture is the default; the flag can still opt out.
 *   0.82+    The opt-out was removed. `newArchEnabled` is still parsed by the
 *            Gradle plugin but ignored, and React Native logs an error-level
 *            warning telling you to delete the line. `use_react_native!` sets
 *            `RCT_NEW_ARCH_ENABLED=1` unconditionally.
 *
 * So on a current project these flags are not a switch to check -- they are
 * dead configuration to report and remove.
 */
export const NEW_ARCH_DEFAULT_VERSION = "0.76.0";
export const LEGACY_OPT_OUT_REMOVED_VERSION = "0.82.0";

export interface ArchFlag {
  /** Path relative to the project root. */
  source: string;
  key: string;
  value: string;
}

export interface ProjectNote {
  level: "info" | "warn";
  message: string;
}

export interface ProjectInfo {
  name: string;
  version: string;
  /** Range declared in package.json, e.g. `^0.76.0`. */
  declaredReactNative: string | null;
  /** Version read from the installed package, which is authoritative. */
  installedReactNative: string | null;
  installedReact: string | null;
  installedExpo: string | null;
  /**
   * Whether the New Architecture is in effect. `null` when the React Native
   * version could not be determined.
   */
  newArchEnabled: boolean | null;
  flags: ArchFlag[];
  notes: ProjectNote[];
  hasAndroidProject: boolean;
  hasIosProject: boolean;
}

/** Parse a `key=value` properties file, ignoring comments and blank lines. */
export function parseProperties(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#") || line.startsWith("!")) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key) result[key] = value;
  }

  return result;
}

const GRADLE_NEW_ARCH_KEYS = ["newArchEnabled", "react.newArchEnabled"];

async function readGradleFlags(projectRoot: string): Promise<ArchFlag[]> {
  const relativePath = path.join("android", "gradle.properties");
  const fullPath = path.join(projectRoot, relativePath);
  if (!(await fs.pathExists(fullPath))) return [];

  try {
    const properties = parseProperties(await fs.readFile(fullPath, "utf8"));
    return GRADLE_NEW_ARCH_KEYS.filter((key) => key in properties).map((key) => ({
      source: relativePath,
      key,
      value: properties[key],
    }));
  } catch {
    return [];
  }
}

async function readPodfileFlags(projectRoot: string): Promise<ArchFlag[]> {
  const relativePath = path.join("ios", "Podfile");
  const fullPath = path.join(projectRoot, relativePath);
  if (!(await fs.pathExists(fullPath))) return [];

  try {
    const content = await fs.readFile(fullPath, "utf8");
    // Matches `ENV['RCT_NEW_ARCH_ENABLED'] = '1'` and the `== '1'` comparison form.
    const match = /RCT_NEW_ARCH_ENABLED['"]?\s*\]?\s*=+\s*['"]?([A-Za-z0-9]+)/.exec(content);
    if (!match) return [];
    return [{ source: relativePath, key: "RCT_NEW_ARCH_ENABLED", value: match[1] }];
  } catch {
    return [];
  }
}

async function readExpoFlags(projectRoot: string): Promise<ArchFlag[]> {
  for (const candidate of ["app.json", "app.config.json"]) {
    const fullPath = path.join(projectRoot, candidate);
    if (!(await fs.pathExists(fullPath))) continue;

    try {
      const config = await fs.readJson(fullPath);
      const value = config?.expo?.newArchEnabled ?? config?.newArchEnabled;
      if (value === undefined) continue;
      return [{ source: candidate, key: "expo.newArchEnabled", value: String(value) }];
    } catch {
      continue;
    }
  }

  return [];
}

function isFalsey(value: string): boolean {
  return value.toLowerCase() === "false" || value === "0";
}

/**
 * Turn the raw flags into notes, using the React Native version to decide what
 * they actually mean.
 */
function interpretFlags(
  reactNativeVersion: string | null,
  flags: ArchFlag[]
): { newArchEnabled: boolean | null; notes: ProjectNote[] } {
  const notes: ProjectNote[] = [];

  if (!reactNativeVersion) {
    notes.push({
      level: "warn",
      message:
        "React Native is not installed, so New Architecture status cannot be determined. Install dependencies and re-run.",
    });
    return { newArchEnabled: null, notes };
  }

  const optOutRemoved = satisfiesMinimum(reactNativeVersion, LEGACY_OPT_OUT_REMOVED_VERSION);
  const defaultsOn = satisfiesMinimum(reactNativeVersion, NEW_ARCH_DEFAULT_VERSION);
  const disablingFlags = flags.filter((flag) => isFalsey(flag.value));

  if (optOutRemoved) {
    notes.push({
      level: "info",
      message: `React Native ${reactNativeVersion} runs on the New Architecture unconditionally; the legacy opt-out was removed in ${LEGACY_OPT_OUT_REMOVED_VERSION}.`,
    });

    for (const flag of flags) {
      notes.push({
        level: "warn",
        message: isFalsey(flag.value)
          ? `${flag.source}: \`${flag.key}=${flag.value}\` is ignored on React Native ${reactNativeVersion} and will not disable the New Architecture. Delete the line.`
          : `${flag.source}: \`${flag.key}=${flag.value}\` is dead configuration on React Native ${reactNativeVersion}. Delete the line.`,
      });
    }

    return { newArchEnabled: true, notes };
  }

  if (defaultsOn) {
    if (disablingFlags.length > 0) {
      for (const flag of disablingFlags) {
        notes.push({
          level: "warn",
          message: `${flag.source}: \`${flag.key}=${flag.value}\` disables the New Architecture, which is the default on React Native ${reactNativeVersion}.`,
        });
      }
      return { newArchEnabled: false, notes };
    }

    notes.push({
      level: "info",
      message: `New Architecture is enabled by default on React Native ${reactNativeVersion}.`,
    });
    return { newArchEnabled: true, notes };
  }

  const enablingFlag = flags.find((flag) => !isFalsey(flag.value));
  if (enablingFlag) {
    notes.push({
      level: "info",
      message: `New Architecture is opted in via \`${enablingFlag.key}\` in ${enablingFlag.source}.`,
    });
    return { newArchEnabled: true, notes };
  }

  notes.push({
    level: "warn",
    message: `React Native ${reactNativeVersion} predates ${NEW_ARCH_DEFAULT_VERSION} and no opt-in flag was found, so this project is on the legacy architecture.`,
  });
  return { newArchEnabled: false, notes };
}

export async function inspectProject(projectRoot: string): Promise<ProjectInfo> {
  const pkgJson = await fs.readJson(path.join(projectRoot, "package.json"));
  const specs: Record<string, string> = {
    ...(pkgJson.dependencies ?? {}),
    ...(pkgJson.devDependencies ?? {}),
  };

  const [reactNativeDir, reactDir, expoDir] = await Promise.all([
    resolvePackageDir(projectRoot, "react-native"),
    resolvePackageDir(projectRoot, "react"),
    resolvePackageDir(projectRoot, "expo"),
  ]);

  const installedReactNative = reactNativeDir ? await readInstalledVersion(reactNativeDir) : null;
  const installedReact = reactDir ? await readInstalledVersion(reactDir) : null;
  const installedExpo = expoDir ? await readInstalledVersion(expoDir) : null;

  const [gradleFlags, podfileFlags, expoFlags] = await Promise.all([
    readGradleFlags(projectRoot),
    readPodfileFlags(projectRoot),
    readExpoFlags(projectRoot),
  ]);
  const flags = [...gradleFlags, ...podfileFlags, ...expoFlags];

  const { newArchEnabled, notes } = interpretFlags(installedReactNative, flags);

  const declaredReactNative = specs["react-native"] ?? null;
  if (installedReactNative && declaredReactNative) {
    const declared = coerceVersion(declaredReactNative);
    if (declared && isBelow(installedReactNative, declared)) {
      notes.push({
        level: "warn",
        message: `Installed react-native ${installedReactNative} is older than the declared range ${declaredReactNative}; dependencies may be out of date.`,
      });
    }
  }

  const [hasAndroidProject, hasIosProject] = await Promise.all([
    fs.pathExists(path.join(projectRoot, "android")),
    fs.pathExists(path.join(projectRoot, "ios")),
  ]);

  return {
    name: pkgJson.name ?? path.basename(projectRoot),
    version: pkgJson.version ?? "0.0.0",
    declaredReactNative,
    installedReactNative,
    installedReact,
    installedExpo,
    newArchEnabled,
    flags,
    notes,
    hasAndroidProject,
    hasIosProject,
  };
}
