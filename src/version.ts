/**
 * Minimal semver comparison.
 *
 * The tool only ever needs to compare two *concrete* versions (an installed
 * `package.json` version against a known floor), so a full range engine would
 * be dead weight. `coerce` exists solely to salvage a display value out of a
 * dependency range when a package could not be resolved on disk.
 */
export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

const VERSION_RE = /(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/;

export function parseVersion(input: string | undefined | null): ParsedVersion | null {
  if (!input) return null;
  // Build metadata never affects precedence, so drop it before matching.
  const withoutBuild = input.split("+")[0];
  const match = VERSION_RE.exec(withoutBuild);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: match[3] === undefined ? 0 : Number(match[3]),
    prerelease: match[4] ?? null,
  };
}

/** Pull a concrete version out of a range spec (`^0.76.0` -> `0.76.0`). */
export function coerceVersion(spec: string | undefined | null): string | null {
  const parsed = parseVersion(spec);
  if (!parsed) return null;
  return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}

function comparePrerelease(a: string | null, b: string | null): number {
  if (a === b) return 0;
  // A release always outranks a prerelease of the same core version.
  if (a === null) return 1;
  if (b === null) return -1;

  const left = a.split(".");
  const right = b.split(".");
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const l = left[i];
    const r = right[i];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    const lNum = /^\d+$/.test(l);
    const rNum = /^\d+$/.test(r);
    if (lNum && rNum) {
      const diff = Number(l) - Number(r);
      if (diff !== 0) return diff < 0 ? -1 : 1;
    } else if (l !== r) {
      return l < r ? -1 : 1;
    }
  }
  return 0;
}

/** -1 if a < b, 0 if equal, 1 if a > b. Unparseable input sorts as equal. */
export function compareVersions(a: string | undefined | null, b: string | undefined | null): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;

  for (const key of ["major", "minor", "patch"] as const) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

/** True when `installed` is known to be at or above `minimum`. */
export function satisfiesMinimum(installed: string | undefined | null, minimum: string): boolean {
  if (!parseVersion(installed)) return false;
  return compareVersions(installed, minimum) >= 0;
}

/** True when `installed` is known to be below `boundary`. */
export function isBelow(installed: string | undefined | null, boundary: string): boolean {
  if (!parseVersion(installed)) return false;
  return compareVersions(installed, boundary) < 0;
}
