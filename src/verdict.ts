import { PackageReport } from "./scanner";

/**
 * Turning package reports into a single verdict.
 *
 * The previous logic could print "0% FULLY COMPATIBLE" because the readiness
 * score counted unverified native packages against the total while the
 * pass/fail decision ignored them. The verdict below is derived from one
 * ordered set of conditions so the headline and the score cannot disagree, and
 * "nothing was found" can never read as success.
 */
export type Verdict = "READY" | "NEEDS_REVIEW" | "MIGRATION_REQUIRED" | "INCOMPLETE";

export type FailCategory = "legacy" | "unknown" | "unresolved" | "16kb" | "incomplete";

export const FAIL_CATEGORIES: FailCategory[] = [
  "legacy",
  "unknown",
  "unresolved",
  "16kb",
  "incomplete",
];

/** What `--strict` means: anything that is either broken or unverifiable. */
export const STRICT_CATEGORIES: FailCategory[] = [
  "legacy",
  "unresolved",
  "16kb",
  "incomplete",
];

export interface Summary {
  totalScanned: number;
  nativePackages: number;
  ready: number;
  legacy: number;
  unknown: number;
  pureJs: number;
  unresolved: number;
  pageSize16KBIssues: number;
  /**
   * Percentage of *inspected* native packages that are verified ready, or null
   * when no native package could be inspected. It is deliberately not 100 for
   * an empty scan.
   */
  compatibilityScore: number | null;
  verdict: Verdict;
  isCompatible: boolean;
}

export function summarize(reports: PackageReport[]): Summary {
  const byStatus = (status: PackageReport["status"]) =>
    reports.filter((report) => report.status === status);

  const ready = byStatus("FULL_SUPPORT").length;
  const legacy = byStatus("LEGACY_BRIDGE").length;
  const unknown = byStatus("UNKNOWN_NATIVE").length;
  const pureJs = byStatus("PURE_JS").length;
  const unresolved = byStatus("UNRESOLVED").length;

  const pageSize16KBIssues = reports.filter(
    (report) => report.pageSize16KB && !report.pageSize16KB.isCompatible
  ).length;

  const inspectedNative = ready + legacy + unknown;
  const compatibilityScore =
    inspectedNative > 0 ? Math.round((ready / inspectedNative) * 100) : null;

  let verdict: Verdict;
  if (reports.length === 0 || unresolved > 0) {
    // Either nothing was examined, or part of the dependency set could not be
    // resolved. Both mean no compatibility claim can be made -- an empty scan
    // must never read as a pass.
    verdict = "INCOMPLETE";
  } else if (legacy > 0 || pageSize16KBIssues > 0) {
    verdict = "MIGRATION_REQUIRED";
  } else if (unknown > 0) {
    verdict = "NEEDS_REVIEW";
  } else {
    verdict = "READY";
  }

  return {
    totalScanned: reports.length,
    nativePackages: inspectedNative,
    ready,
    legacy,
    unknown,
    pureJs,
    unresolved,
    pageSize16KBIssues,
    compatibilityScore,
    verdict,
    isCompatible: verdict === "READY",
  };
}

const CATEGORY_COUNTS: Record<FailCategory, (summary: Summary) => number> = {
  legacy: (summary) => summary.legacy,
  unknown: (summary) => summary.unknown,
  unresolved: (summary) => summary.unresolved,
  "16kb": (summary) => summary.pageSize16KBIssues,
  // Distinct from `unresolved`: nothing was examined at all, so the report
  // carries no evidence either way and must not pass a strict gate.
  incomplete: (summary) => (summary.totalScanned === 0 ? 1 : 0),
};

const CATEGORY_LABELS: Record<FailCategory, string> = {
  legacy: "legacy bridge packages",
  unknown: "unverified native packages",
  unresolved: "unresolved dependencies",
  "16kb": "16KB page size issues",
  incomplete: "empty scan (no dependencies examined)",
};

export interface GateFailure {
  category: FailCategory;
  count: number;
  label: string;
}

/** Which requested categories actually have findings. */
export function gateFailures(summary: Summary, categories: FailCategory[]): GateFailure[] {
  return categories
    .map((category) => ({
      category,
      count: CATEGORY_COUNTS[category](summary),
      label: CATEGORY_LABELS[category],
    }))
    .filter((failure) => failure.count > 0);
}

export interface ParsedCategories {
  categories: FailCategory[];
  invalid: string[];
}

/** Parse a `--fail-on` list. `all` and `none` are accepted shorthands. */
export function parseFailCategories(raw: string): ParsedCategories {
  const tokens = raw
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token !== "");

  if (tokens.includes("none")) return { categories: [], invalid: [] };
  if (tokens.includes("all")) return { categories: [...FAIL_CATEGORIES], invalid: [] };

  const categories: FailCategory[] = [];
  const invalid: string[] = [];

  for (const token of tokens) {
    if ((FAIL_CATEGORIES as string[]).includes(token)) {
      if (!categories.includes(token as FailCategory)) categories.push(token as FailCategory);
    } else {
      invalid.push(token);
    }
  }

  return { categories, invalid };
}
