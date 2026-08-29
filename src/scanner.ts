import fs from "fs-extra";
import path from "path";
import fg from "fast-glob";
import { getSuggestion } from "./replacements";

export type ArchStatus = "PURE_JS" | "FULL_SUPPORT" | "LEGACY_BRIDGE" | "UNKNOWN_NATIVE";

export interface PackageReport {
  name: string;
  version: string;
  packagePath: string;
  isTransitive: boolean;
  hasNativeCode: boolean;
  hasCodegenConfig: boolean;
  hasTurboModule: boolean;
  hasFabric: boolean;
  isExpoModule: boolean;
  platforms: ("iOS" | "Android" | "C++")[];
  status: ArchStatus;
  suggestion?: string;
  reason?: string;
  notes: string[];
}

export interface ScanOptions {
  projectRoot: string;
  deepScan?: boolean;
}

export interface ScanResult {
  projectName: string;
  projectVersion: string;
  reactNativeVersion: string;
  reactVersion?: string;
  expoVersion?: string;
  projectRoot: string;
  reports: PackageReport[];
}

export async function inspectPackage(
  pkgDir: string,
  isTransitive = false
): Promise<PackageReport | null> {
  const pkgJsonPath = path.join(pkgDir, "package.json");
  if (!await fs.pathExists(pkgJsonPath)) return null;

  try {
    const pkgJson = await fs.readJson(pkgJsonPath);
    const pkgName = pkgJson.name || path.basename(pkgDir);
    const pkgVersion = pkgJson.version || "0.0.0";

    if (pkgName.startsWith("@types/") || pkgName === "react" || pkgName === "react-native") {
      return null;
    }

    const notes: string[] = [];
    const hasCodegenConfig = Boolean(pkgJson.codegenConfig);
    const expoConfigPath = path.join(pkgDir, "expo-module.config.json");
    const isExpoModule = await fs.pathExists(expoConfigPath);

    const nativeFiles = await fg(["**/*.{podspec,java,kt,mm,m,cpp,hpp,h,gradle}"], {
      cwd: pkgDir,
      ignore: ["**/node_modules/**", "**/example/**", "**/examples/**", "**/build/**", "**/android/build/**"],
    });

    const hasNativeCode = nativeFiles.length > 0 || isExpoModule;

    if (!hasNativeCode) {
      return {
        name: pkgName,
        version: pkgVersion,
        packagePath: pkgDir,
        isTransitive,
        hasNativeCode: false,
        hasCodegenConfig: false,
        hasTurboModule: false,
        hasFabric: false,
        isExpoModule: false,
        platforms: [],
        status: "PURE_JS",
        notes: ["Pure JS/TS"],
      };
    }

    const platformSet = new Set<"iOS" | "Android" | "C++">();
    let hasTurboModule = false;
    let hasFabric = false;
    let usesLegacyBridge = false;

    if (isExpoModule) {
      notes.push("Expo Module");
    }

    for (const relativeFilePath of nativeFiles) {
      const lower = relativeFilePath.toLowerCase();
      if (lower.endsWith(".podspec") || lower.endsWith(".mm") || lower.endsWith(".m") || lower.includes("/ios/") || lower.startsWith("ios/")) {
        platformSet.add("iOS");
      }
      if (lower.endsWith(".java") || lower.endsWith(".kt") || lower.endsWith(".gradle") || lower.includes("/android/") || lower.startsWith("android/")) {
        platformSet.add("Android");
      }
      if (lower.endsWith(".cpp") || lower.endsWith(".hpp") || lower.includes("/cpp/") || lower.startsWith("cpp/")) {
        platformSet.add("C++");
      }

      // Check code contents for architecture indicators
      if (lower.endsWith(".podspec") || lower.endsWith(".java") || lower.endsWith(".kt") || lower.endsWith(".mm") || lower.endsWith(".cpp") || lower.endsWith(".h")) {
        try {
          const fullPath = path.join(pkgDir, relativeFilePath);
          const content = await fs.readFile(fullPath, "utf8");

          if (
            content.includes("RCTTurboModule") ||
            content.includes("TurboReactPackage") ||
            content.includes("TurboModule") ||
            (content.includes("ReactContextBaseJavaModule") && content.includes("Spec"))
          ) {
            hasTurboModule = true;
          }

          if (
            content.includes("RCTComponentViewProtocol") ||
            content.includes("ConcreteComponentDescriptor") ||
            content.includes("ViewComponentDescriptor") ||
            content.includes("Fabric")
          ) {
            hasFabric = true;
          }

          if (
            (content.includes("RCTBridgeModule") && !content.includes("RCTTurboModule")) ||
            (content.includes("extends ReactContextBaseJavaModule") && !content.includes("Turbo"))
          ) {
            usesLegacyBridge = true;
          }
        } catch {
          // Ignore read errors
        }
      }
    }

    const platforms = Array.from(platformSet);

    let status: ArchStatus = "UNKNOWN_NATIVE";

    if (hasCodegenConfig || hasTurboModule || hasFabric || isExpoModule) {
      status = "FULL_SUPPORT";
      if (hasCodegenConfig) notes.push("Codegen");
      if (hasTurboModule) notes.push("TurboModule");
      if (hasFabric) notes.push("Fabric View");
    } else if (usesLegacyBridge) {
      status = "LEGACY_BRIDGE";
      notes.push("Legacy Bridge");
    }

    const suggestionInfo = getSuggestion(pkgName);

    return {
      name: pkgName,
      version: pkgVersion,
      packagePath: pkgDir,
      isTransitive,
      hasNativeCode,
      hasCodegenConfig,
      hasTurboModule,
      hasFabric,
      isExpoModule,
      platforms,
      status,
      suggestion: suggestionInfo?.replacement,
      reason: suggestionInfo?.reason,
      notes,
    };
  } catch {
    return null;
  }
}

export async function scanProject(options: ScanOptions): Promise<ScanResult> {
  const { projectRoot, deepScan } = options;
  const rootPkgJsonPath = path.join(projectRoot, "package.json");
  const nodeModulesPath = path.join(projectRoot, "node_modules");

  if (!await fs.pathExists(rootPkgJsonPath)) {
    throw new Error("package.json not found in project root.");
  }

  const rootPkgJson = await fs.readJson(rootPkgJsonPath);
  const directDeps = new Set([
    ...Object.keys(rootPkgJson.dependencies || {}),
    ...Object.keys(rootPkgJson.devDependencies || {}),
  ]);

  const projectName = rootPkgJson.name || path.basename(projectRoot);
  const projectVersion = rootPkgJson.version || "1.0.0";
  const reactNativeVersion =
    rootPkgJson.dependencies?.["react-native"] ||
    rootPkgJson.devDependencies?.["react-native"] ||
    "Not detected";
  const reactVersion =
    rootPkgJson.dependencies?.["react"] ||
    rootPkgJson.devDependencies?.["react"];
  const expoVersion =
    rootPkgJson.dependencies?.["expo"] ||
    rootPkgJson.devDependencies?.["expo"];

  const reports: PackageReport[] = [];
  const processedPaths = new Set<string>();

  if (deepScan) {
    const allPkgJsons = await fg(["**/node_modules/**/package.json"], {
      cwd: projectRoot,
      ignore: ["**/example/**", "**/examples/**"],
      absolute: true,
    });

    for (const pkgJsonPath of allPkgJsons) {
      const pkgDir = path.dirname(pkgJsonPath);
      if (processedPaths.has(pkgDir)) continue;
      processedPaths.add(pkgDir);

      const dirName = path.basename(pkgDir);
      const parentDirName = path.basename(path.dirname(pkgDir));
      const pkgName = parentDirName.startsWith("@") ? `${parentDirName}/${dirName}` : dirName;

      const isTransitive = !directDeps.has(pkgName);
      const report = await inspectPackage(pkgDir, isTransitive);
      if (report) reports.push(report);
    }
  } else {
    for (const depName of directDeps) {
      const depDir = path.join(nodeModulesPath, depName);
      if (await fs.pathExists(depDir)) {
        const report = await inspectPackage(depDir, false);
        if (report) reports.push(report);
      }
    }
  }

  return {
    projectName,
    projectVersion,
    reactNativeVersion,
    reactVersion,
    expoVersion,
    projectRoot,
    reports,
  };
}
