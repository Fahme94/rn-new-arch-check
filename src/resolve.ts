import fs from "fs-extra";
import path from "path";

/**
 * Node-style package resolution.
 *
 * A dependency declared by the project is not necessarily installed inside the
 * project's own `node_modules`: yarn/pnpm workspaces hoist shared dependencies
 * to the repository root, so an app at `apps/mobile` routinely resolves its
 * dependencies several directories up. Looking only at `<projectRoot>/node_modules`
 * makes every hoisted dependency invisible, which previously turned a monorepo
 * scan into an empty (and therefore falsely clean) report.
 */
export interface DeclaredDependency {
  name: string;
  /** The range declared in the project's package.json. */
  spec: string;
  /** Absolute path to the installed package, or null when it is not on disk. */
  dir: string | null;
  /** Version read from the installed package.json, when resolved. */
  installedVersion: string | null;
}

async function isPackageDir(dir: string): Promise<boolean> {
  return fs.pathExists(path.join(dir, "package.json"));
}

/**
 * Walk up from `fromDir` looking for `node_modules/<name>`, mirroring Node's
 * own resolution. Returns the first directory that actually contains a
 * package.json, or null.
 */
export async function resolvePackageDir(fromDir: string, name: string): Promise<string | null> {
  let current = path.resolve(fromDir);

  while (true) {
    const candidate = path.join(current, "node_modules", name);
    if (await isPackageDir(candidate)) return candidate;

    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export async function readInstalledVersion(pkgDir: string): Promise<string | null> {
  try {
    const pkgJson = await fs.readJson(path.join(pkgDir, "package.json"));
    return typeof pkgJson.version === "string" ? pkgJson.version : null;
  } catch {
    return null;
  }
}

/**
 * Resolve every dependency declared by the project. Dependencies that cannot be
 * found on disk come back with `dir: null` so the caller can report them as
 * unresolved rather than silently omitting them.
 */
export async function resolveDeclaredDependencies(
  projectRoot: string,
  specs: Record<string, string>
): Promise<DeclaredDependency[]> {
  const names = Object.keys(specs).sort();

  return Promise.all(
    names.map(async (name) => {
      const dir = await resolvePackageDir(projectRoot, name);
      return {
        name,
        spec: specs[name],
        dir,
        installedVersion: dir ? await readInstalledVersion(dir) : null,
      };
    })
  );
}
