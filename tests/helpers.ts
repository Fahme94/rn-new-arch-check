import fs from "fs-extra";
import os from "os";
import path from "path";
import zlib from "zlib";

/** Create an isolated temporary directory for one test. */
export async function tempDir(label: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), `rn-arch-${label}-`));
}

export interface PackageFixture {
  name: string;
  version?: string;
  /** Adds `codegenConfig`, the structural New Architecture marker. */
  codegen?: boolean;
  /** Creates `expo-module.config.json`. */
  expoModule?: boolean;
  /** Relative path -> file contents, written inside the package. */
  files?: Record<string, string>;
}

export interface ProjectFixture {
  dependencies?: Record<string, string>;
  /** Packages to install into the project's own node_modules. */
  installed?: PackageFixture[];
  /** Packages to install one level above, as workspace hoisting does. */
  hoisted?: PackageFixture[];
  reactNativeVersion?: string;
  gradleProperties?: string;
  podfile?: string;
  appJson?: unknown;
}

async function writePackage(nodeModules: string, pkg: PackageFixture): Promise<void> {
  const dir = path.join(nodeModules, pkg.name);
  await fs.ensureDir(dir);

  const manifest: Record<string, unknown> = {
    name: pkg.name,
    version: pkg.version ?? "1.0.0",
  };
  if (pkg.codegen) manifest.codegenConfig = { name: "TestSpec", type: "modules" };
  await fs.writeJson(path.join(dir, "package.json"), manifest);

  if (pkg.expoModule) {
    await fs.writeJson(path.join(dir, "expo-module.config.json"), { platforms: ["ios"] });
  }

  for (const [relativePath, contents] of Object.entries(pkg.files ?? {})) {
    const target = path.join(dir, relativePath);
    await fs.ensureDir(path.dirname(target));
    await fs.writeFile(target, contents);
  }
}

/**
 * Build a project on disk. When `hoisted` is used the project is nested at
 * `<root>/apps/mobile` so the hoisted packages sit in a parent `node_modules`,
 * reproducing a yarn/pnpm workspace layout.
 */
export async function makeProject(
  root: string,
  fixture: ProjectFixture
): Promise<string> {
  const nested = (fixture.hoisted ?? []).length > 0;
  const projectRoot = nested ? path.join(root, "apps", "mobile") : root;
  await fs.ensureDir(projectRoot);

  const dependencies: Record<string, string> = { ...(fixture.dependencies ?? {}) };
  if (fixture.reactNativeVersion) {
    dependencies["react-native"] = `^${fixture.reactNativeVersion}`;
  }

  await fs.writeJson(path.join(projectRoot, "package.json"), {
    name: "fixture-app",
    version: "1.0.0",
    dependencies,
  });

  const ownModules = path.join(projectRoot, "node_modules");
  for (const pkg of fixture.installed ?? []) {
    await writePackage(ownModules, pkg);
  }

  if (fixture.reactNativeVersion) {
    await writePackage(ownModules, {
      name: "react-native",
      version: fixture.reactNativeVersion,
    });
  }

  for (const pkg of fixture.hoisted ?? []) {
    await writePackage(path.join(root, "node_modules"), pkg);
  }

  if (fixture.gradleProperties !== undefined) {
    const androidDir = path.join(projectRoot, "android");
    await fs.ensureDir(androidDir);
    await fs.writeFile(path.join(androidDir, "gradle.properties"), fixture.gradleProperties);
  }

  if (fixture.podfile !== undefined) {
    const iosDir = path.join(projectRoot, "ios");
    await fs.ensureDir(iosDir);
    await fs.writeFile(path.join(iosDir, "Podfile"), fixture.podfile);
  }

  if (fixture.appJson !== undefined) {
    await fs.writeJson(path.join(projectRoot, "app.json"), fixture.appJson);
  }

  return projectRoot;
}

export interface ElfOptions {
  bits?: 32 | 64;
  /** e_machine: 183 = arm64-v8a, 62 = x86_64, 40 = armeabi-v7a. */
  machine?: number;
  /** p_align of each PT_LOAD segment. */
  aligns?: number[];
  /** Trailing padding, to simulate a large library. */
  padding?: number;
}

/** Build a minimal but structurally valid ELF image. */
export function makeElf(options: ElfOptions = {}): Buffer {
  const { bits = 64, machine = 183, aligns = [4096], padding = 0 } = options;

  const PH_ENTRY_SIZE = 56;
  const header = Buffer.alloc(64);
  header.write("\x7fELF", 0, "binary");
  header[4] = bits === 64 ? 2 : 1;
  header[5] = 1; // little endian
  header[6] = 1; // ELF version
  header.writeUInt16LE(3, 16); // e_type = ET_DYN
  header.writeUInt16LE(machine, 18);
  header.writeUInt32LE(1, 20); // e_version
  header.writeBigUInt64LE(BigInt(64), 32); // e_phoff
  header.writeUInt16LE(PH_ENTRY_SIZE, 54);
  header.writeUInt16LE(aligns.length, 56);

  const table = Buffer.concat(
    aligns.map((align) => {
      const entry = Buffer.alloc(PH_ENTRY_SIZE);
      entry.writeUInt32LE(1, 0); // p_type = PT_LOAD
      entry.writeBigUInt64LE(BigInt(align), 48);
      return entry;
    })
  );

  return Buffer.concat([header, table, Buffer.alloc(padding)]);
}

interface ZipMember {
  name: string;
  data: Buffer;
  /** 0 = stored, 8 = deflate. */
  method?: 0 | 8;
}

/**
 * Write a minimal zip archive. Vendor `.aar` files store native libraries both
 * uncompressed and deflated, so both paths are exercised by the tests.
 */
export async function makeZip(target: string, members: ZipMember[]): Promise<void> {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const member of members) {
    const method = member.method ?? 0;
    const nameBytes = Buffer.from(member.name, "utf8");
    const body = method === 8 ? zlib.deflateRawSync(member.data) : member.data;
    const crc = zlib.crc32(member.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(member.data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    localChunks.push(local, nameBytes, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(member.data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centralChunks.push(central, nameBytes);

    offset += local.length + nameBytes.length + body.length;
  }

  const centralDirectory = Buffer.concat(centralChunks);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(members.length, 8);
  eocd.writeUInt16LE(members.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);

  await fs.ensureDir(path.dirname(target));
  await fs.writeFile(target, Buffer.concat([...localChunks, centralDirectory, eocd]));
}
