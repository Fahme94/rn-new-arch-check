import fs from "fs-extra";
import path from "path";
import fg from "fast-glob";
import { Advice, getAdvice } from "./replacements";
import { checkPackage16KB, PageSize16KBReport } from "./elf";
import { inspectProject, ProjectInfo } from "./project";
import { resolveDeclaredDependencies } from "./resolve";
import {
  Confidence,
  NATIVE_FILE_EXTENSIONS,
  Platform,
  classify,
  collectEvidence,
  commentStyleFor,
  detectPlatform,
  emptyEvidence,
} from "./detect";

export type ArchStatus =
  | "PURE_JS"
  | "FULL_SUPPORT"
  | "LEGACY_BRIDGE"
  | "UNKNOWN_NATIVE"
  /** Declared in package.json but not found on disk, so nothing could be checked. */
  | "UNRESOLVED";

export interface PackageReport {
  name: string;
  version: string;
  packagePath: string | null;
  isTransitive: boolean;
  hasNativeCode: boolean;
  hasCodegenConfig: boolean;
  hasTurboModule: boolean;
  hasFabric: boolean;
  isExpoModule: boolean;
  platforms: Platform[];
  status: ArchStatus;
  /** How trustworthy the classification is. See `detect.ts`. */
  confidence: Confidence;
  pageSize16KB?: PageSize16KBReport;
  advice?: Advice;
  notes: string[];
}

export interface ScanOptions {
  projectRoot: string;
  deepScan?: boolean;
}

export interface ScanResult {
  project: ProjectInfo;
  projectRoot: string;
  scanMode: "direct" | "deep";
  reports: PackageReport[];
}

const NATIVE_GLOB = `**/*.{${NATIVE_FILE_EXTENSIONS.join(",")}}`;

const NATIVE_SCAN_IGNORE = [
  "**/node_modules/**",
  "**/example/**",
  "**/examples/**",
  "**/build/**",
  "**/android/build/**",
];

/** Packages that describe the platform itself rather than a dependency on it. */
const SKIPPED_PACKAGES = new Set(["react", "react-native"]);

function isSkipped(pkgName: string): boolean {
  return SKIPPED_PACKAGES.has(pkgName) || pkgName.startsWith("@types/");
}

export async function inspectPackage(
  pkgDir: string,
  isTransitive = false
): Promise<PackageReport | null> {
  const pkgJsonPath = path.join(pkgDir, "package.json");
  if (!(await fs.pathExists(pkgJsonPath))) return null;

  try {
    const pkgJson = await fs.readJson(pkgJsonPath);
    const pkgName: string = pkgJson.name || path.basename(pkgDir);
    const pkgVersion: string = pkgJson.version || "0.0.0";

    if (isSkipped(pkgName)) return null;

    const hasCodegenConfig = Boolean(pkgJson.codegenConfig);
    const isExpoModule = await fs.pathExists(path.join(pkgDir, "expo-module.config.json"));

    const nativeFiles = await fg([NATIVE_GLOB], {
      cwd: pkgDir,
      ignore: NATIVE_SCAN_IGNORE,
    });

    if (nativeFiles.length === 0 && !isExpoModule) {
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
        confidence: "structural",
        notes: ["Pure JS/TS"],
      };
    }

    const platformSet = new Set<Platform>();
    const evidence = emptyEvidence();

    for (const relativeFilePath of nativeFiles) {
      for (const platform of detectPlatform(relativeFilePath)) {
        platformSet.add(platform);
      }

      const style = commentStyleFor(relativeFilePath);
      if (!style) continue;

      try {
        const content = await fs.readFile(path.join(pkgDir, relativeFilePath), "utf8");
        collectEvidence(content, style, evidence);
      } catch {
        // Ignore read errors
      }
    }

    const { status, confidence, notes } = classify(
      { hasCodegenConfig, isExpoModule },
      evidence
    );

    const pageSize16KB = await checkPackage16KB(pkgDir);
    if (!pageSize16KB.isCompatible) notes.push("16KB Page Size Warning");

    return {
      name: pkgName,
      version: pkgVersion,
      packagePath: pkgDir,
      isTransitive,
      hasNativeCode: true,
      hasCodegenConfig,
      hasTurboModule: evidence.turboModule,
      hasFabric: evidence.fabric,
      isExpoModule,
      platforms: Array.from(platformSet),
      status,
      confidence,
      pageSize16KB,
      advice: getAdvice(pkgName, pkgVersion),
      notes,
    };
  } catch {
    return null;
  }
}

function unresolvedReport(name: string, spec: string): PackageReport {
  return {
    name,
    version: spec,
    packagePath: null,
    isTransitive: false,
    hasNativeCode: false,
    hasCodegenConfig: false,
    hasTurboModule: false,
    hasFabric: false,
    isExpoModule: false,
    platforms: [],
    status: "UNRESOLVED",
    confidence: "none",
    notes: ["Declared but not installed"],
    advice: getAdvice(name, null),
  };
}

/**
 * Directories that are a package root, i.e. `node_modules/<name>` or
 * `node_modules/@scope/<name>`.
 *
 * A bare `**\/package.json` glob also matches manifests that packages ship
 * inside their own subdirectories (`dist/package.json`, used to set
 * `"type": "module"`), which were previously reported as separate transitive
 * dependencies and inflated the totals the verdict is derived from.
 */
function isPackageRoot(pkgDir: string): boolean {
  const parent = path.basename(path.dirname(pkgDir));
  if (parent === "node_modules") return true;

  const grandparent = path.basename(path.dirname(path.dirname(pkgDir)));
  return parent.startsWith("@") && grandparent === "node_modules";
}

async function scanDeep(
  projectRoot: string,
  directNames: Set<string>
): Promise<PackageReport[]> {
  const manifests = await fg(["**/node_modules/**/package.json"], {
    cwd: projectRoot,
    ignore: ["**/example/**", "**/examples/**"],
    absolute: true,
  });

  const reports: PackageReport[] = [];
  const seenDirs = new Set<string>();
  const seenPackages = new Set<string>();

  for (const manifestPath of manifests) {
    const pkgDir = path.dirname(manifestPath);
    if (seenDirs.has(pkgDir) || !isPackageRoot(pkgDir)) continue;
    seenDirs.add(pkgDir);

    const report = await inspectPackage(pkgDir, true);
    if (!report) continue;

    // A hoisted package can appear at several depths; report it once.
    const identity = `${report.name}@${report.version}`;
    if (seenPackages.has(identity)) continue;
    seenPackages.add(identity);

    report.isTransitive = !directNames.has(report.name);
    reports.push(report);
  }

  return reports;
}

export async function scanProject(options: ScanOptions): Promise<ScanResult> {
  const { projectRoot, deepScan } = options;

  if (!(await fs.pathExists(path.join(projectRoot, "package.json")))) {
    throw new Error("package.json not found in project root.");
  }

  const project = await inspectProject(projectRoot);
  const pkgJson = await fs.readJson(path.join(projectRoot, "package.json"));
  const specs: Record<string, string> = {
    ...(pkgJson.dependencies ?? {}),
    ...(pkgJson.devDependencies ?? {}),
  };

  const declared = await resolveDeclaredDependencies(projectRoot, specs);
  const directNames = new Set(declared.map((dependency) => dependency.name));

  const reports: PackageReport[] = [];

  // Declared dependencies are always accounted for, whether or not they are
  // installed, so an absent node_modules cannot pass as a clean project.
  for (const dependency of declared) {
    if (isSkipped(dependency.name)) continue;

    if (!dependency.dir) {
      reports.push(unresolvedReport(dependency.name, dependency.spec));
      continue;
    }

    const report = await inspectPackage(dependency.dir, false);
    if (report) reports.push(report);
  }

  if (deepScan) {
    const seen = new Set(reports.map((report) => `${report.name}@${report.version}`));
    for (const report of await scanDeep(projectRoot, directNames)) {
      if (seen.has(`${report.name}@${report.version}`)) continue;
      seen.add(`${report.name}@${report.version}`);
      reports.push(report);
    }
  }

  return {
    project,
    projectRoot,
    scanMode: deepScan ? "deep" : "direct",
    reports,
  };
}
