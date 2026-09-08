import fs from "fs-extra";
import path from "path";
import fg from "fast-glob";
import { open } from "node:fs/promises";
import { readZipEntryPrefixes } from "./zip";

export interface PrebuiltLibInfo {
  file: string;
  arch: string;
  is16KBAligned: boolean;
  maxAlign: number;
  /** Set when the library was found inside an `.aar`/`.jar` archive. */
  container?: string;
}

export interface PageSize16KBReport {
  isCompatible: boolean;
  hasPrebuiltBinaries: boolean;
  prebuiltLibs: PrebuiltLibInfo[];
  warnings: string[];
}

/** Reads `length` bytes at `offset`. Returns fewer bytes near end-of-input. */
export type ByteReader = (offset: number, length: number) => Promise<Buffer>;

export type ElfParseResult =
  | { kind: "ok"; info: PrebuiltLibInfo }
  | { kind: "not-elf" }
  | { kind: "truncated" };

const ELF_HEADER_SIZE = 64;
const PT_LOAD = 1;
const REQUIRED_ALIGNMENT = 16384; // 0x4000

/** Architectures on which Android's 16KB page size actually applies. */
const SIXTEEN_KB_ARCHITECTURES = new Set(["arm64-v8a", "x86_64"]);

const MACHINE_NAMES: Record<number, string> = {
  183: "arm64-v8a",
  62: "x86_64",
  40: "armeabi-v7a",
  3: "x86",
};

function archFromPath(candidate: string): string {
  const lower = candidate.toLowerCase();
  if (lower.includes("arm64-v8a")) return "arm64-v8a";
  if (lower.includes("x86_64")) return "x86_64";
  if (lower.includes("armeabi-v7a")) return "armeabi-v7a";
  if (lower.includes("x86")) return "x86";
  return "unknown";
}

/**
 * Parse ELF segment alignment through a byte reader.
 *
 * Only the 64-byte header and the program header table are read. Previously the
 * whole shared library was loaded into memory to inspect ~120 bytes of it, which
 * cost 182MB of resident memory for a single 120MB library.
 */
export async function parseElfAlignment(
  read: ByteReader,
  label: string,
  archHint: string
): Promise<ElfParseResult> {
  const header = await read(0, ELF_HEADER_SIZE);
  if (header.length < ELF_HEADER_SIZE) return { kind: "not-elf" };

  if (header[0] !== 0x7f || header[1] !== 0x45 || header[2] !== 0x4c || header[3] !== 0x46) {
    return { kind: "not-elf" };
  }

  const is64Bit = header[4] === 2;
  const isLittleEndian = header[5] === 1;

  const machine = isLittleEndian ? header.readUInt16LE(18) : header.readUInt16BE(18);
  let arch = MACHINE_NAMES[machine] ?? "unknown";
  if (arch === "unknown") arch = archFromPath(archHint);

  // 16KB page size only applies to 64-bit devices, so 32-bit libraries are
  // reported as compliant rather than as findings the developer cannot act on.
  if (!is64Bit) {
    return {
      kind: "ok",
      info: { file: label, arch, is16KBAligned: true, maxAlign: 4096 },
    };
  }

  if (!isLittleEndian) return { kind: "not-elf" };

  const phOffset = Number(header.readBigUInt64LE(32));
  const phEntrySize = header.readUInt16LE(54);
  const phCount = header.readUInt16LE(56);

  // Guard against a corrupt or hostile header driving a huge allocation.
  if (phEntrySize < 56 || phEntrySize > 1024 || phCount === 0 || phCount > 65535) {
    return { kind: "not-elf" };
  }

  const tableSize = phEntrySize * phCount;
  const table = await read(phOffset, tableSize);
  if (table.length < tableSize) return { kind: "truncated" };

  let maxAlign = 0;
  let hasLoadSegment = false;
  let is16KBAligned = true;

  for (let i = 0; i < phCount; i++) {
    const entry = i * phEntrySize;
    if (table.readUInt32LE(entry) !== PT_LOAD) continue;

    hasLoadSegment = true;
    const align = Number(table.readBigUInt64LE(entry + 48));
    if (align > maxAlign) maxAlign = align;
    if (align < REQUIRED_ALIGNMENT) is16KBAligned = false;
  }

  return {
    kind: "ok",
    info: {
      file: label,
      arch,
      is16KBAligned: hasLoadSegment ? is16KBAligned : true,
      maxAlign,
    },
  };
}

function bufferReader(bytes: Buffer): ByteReader {
  return async (offset, length) => bytes.subarray(offset, offset + length);
}

/** Inspect a shared library on disk, reading only its headers. */
export async function checkElfFile(filePath: string): Promise<ElfParseResult> {
  let handle;
  try {
    handle = await open(filePath, "r");
  } catch {
    return { kind: "not-elf" };
  }

  try {
    const read: ByteReader = async (offset, length) => {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle!.read(buffer, 0, length, offset);
      return buffer.subarray(0, bytesRead);
    };
    return await parseElfAlignment(read, path.basename(filePath), filePath);
  } catch {
    return { kind: "not-elf" };
  } finally {
    await handle.close().catch(() => undefined);
  }
}

/**
 * Back-compatible wrapper returning `null` for anything that is not a readable
 * ELF file.
 */
export async function checkElf16KBAlignment(filePath: string): Promise<PrebuiltLibInfo | null> {
  const result = await checkElfFile(filePath);
  return result.kind === "ok" ? result.info : null;
}

/**
 * Bytes read per archive entry. An ELF header plus program header table sits at
 * the very start of the file; 64KB covers it with a wide margin.
 */
const ARCHIVE_PREFIX_BYTES = 64 * 1024;

const SCAN_IGNORE = [
  "**/node_modules/**",
  "**/example/**",
  "**/examples/**",
  "**/build/**",
  "**/android/build/**",
];

function alignmentWarning(info: PrebuiltLibInfo): string | null {
  if (info.is16KBAligned) return null;
  if (!SIXTEEN_KB_ARCHITECTURES.has(info.arch)) return null;

  const where = info.container ? `${info.container} -> ${info.file}` : info.file;
  return `Prebuilt binary ${where} (${info.arch}) has ${info.maxAlign}B alignment, requires ${REQUIRED_ALIGNMENT}B (16KB).`;
}

/** Checks a package directory for Android 16KB page size compatibility. */
export async function checkPackage16KB(pkgDir: string): Promise<PageSize16KBReport> {
  const warnings: string[] = [];
  const prebuiltLibs: PrebuiltLibInfo[] = [];

  const [soFiles, archives, cppFiles] = await Promise.all([
    fg(["**/*.so"], { cwd: pkgDir, ignore: SCAN_IGNORE, absolute: true }),
    fg(["**/*.{aar,jar}"], { cwd: pkgDir, ignore: SCAN_IGNORE, absolute: true }),
    fg(["**/*.{cpp,c,cc,h,hpp}"], {
      cwd: pkgDir,
      ignore: ["**/node_modules/**", "**/example/**", "**/examples/**", "**/build/**"],
      absolute: true,
    }),
  ]);

  for (const soPath of soFiles) {
    const result = await checkElfFile(soPath);
    if (result.kind !== "ok") continue;
    prebuiltLibs.push(result.info);
    const warning = alignmentWarning(result.info);
    if (warning) warnings.push(warning);
  }

  for (const archivePath of archives) {
    const container = path.basename(archivePath);
    let entries;
    try {
      entries = await readZipEntryPrefixes(
        archivePath,
        (name) => name.toLowerCase().endsWith(".so"),
        ARCHIVE_PREFIX_BYTES
      );
    } catch {
      // An unreadable archive is not evidence of misalignment.
      continue;
    }

    for (const entry of entries) {
      const result = await parseElfAlignment(
        bufferReader(entry.bytes),
        entry.name,
        entry.name
      );

      if (result.kind === "truncated") {
        warnings.push(
          `Could not read program headers of ${container} -> ${entry.name}; alignment unverified.`
        );
        continue;
      }
      if (result.kind !== "ok") continue;

      const info = { ...result.info, container };
      prebuiltLibs.push(info);
      const warning = alignmentWarning(info);
      if (warning) warnings.push(warning);
    }
  }

  for (const cppPath of cppFiles) {
    try {
      const content = await fs.readFile(cppPath, "utf8");
      if (
        content.includes("#define PAGE_SIZE 4096") ||
        content.includes("#define PAGESIZE 4096") ||
        content.includes("PAGE_SIZE = 4096")
      ) {
        warnings.push(`Hardcoded 4096 page size found in ${path.basename(cppPath)}`);
      }
    } catch {
      // Ignore read errors
    }
  }

  return {
    isCompatible: warnings.length === 0,
    hasPrebuiltBinaries: prebuiltLibs.length > 0,
    prebuiltLibs,
    warnings,
  };
}
