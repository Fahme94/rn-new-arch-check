import fs from "fs-extra";
import path from "path";
import fg from "fast-glob";

export interface PrebuiltLibInfo {
  file: string;
  arch: string;
  is16KBAligned: boolean;
  maxAlign: number;
}

export interface PageSize16KBReport {
  isCompatible: boolean;
  hasPrebuiltBinaries: boolean;
  prebuiltLibs: PrebuiltLibInfo[];
  warnings: string[];
}

/**
 * Checks an ELF (.so) file for 16KB (0x4000) segment alignment.
 * Android 15 16KB page sizes apply to 64-bit architectures (arm64-v8a, x86_64).
 */
export async function checkElf16KBAlignment(filePath: string): Promise<PrebuiltLibInfo | null> {
  try {
    const buffer = await fs.readFile(filePath);
    if (buffer.length < 64) return null;

    // Check ELF magic: 0x7F, 'E', 'L', 'F'
    if (buffer[0] !== 0x7f || buffer[1] !== 0x45 || buffer[2] !== 0x4c || buffer[3] !== 0x46) {
      return null;
    }

    const is64Bit = buffer[4] === 2; // 1 = 32-bit, 2 = 64-bit
    const isLittleEndian = buffer[5] === 1;

    // We focus on 64-bit binaries as 16KB page size kernels run 64-bit binaries
    const archCode = isLittleEndian ? buffer.readUInt16LE(18) : buffer.readUInt16BE(18);
    let arch = "unknown";
    if (archCode === 183) arch = "arm64-v8a";
    else if (archCode === 62) arch = "x86_64";
    else if (archCode === 40) arch = "armeabi-v7a";
    else if (archCode === 3) arch = "x86";

    // Detect arch from folder if unknown
    if (arch === "unknown") {
      const lower = filePath.toLowerCase();
      if (lower.includes("arm64-v8a")) arch = "arm64-v8a";
      else if (lower.includes("x86_64")) arch = "x86_64";
      else if (lower.includes("armeabi-v7a")) arch = "armeabi-v7a";
      else if (lower.includes("x86")) arch = "x86";
    }

    if (!is64Bit) {
      // 32-bit binaries don't run on 16KB page size systems or are legacy
      return {
        file: path.basename(filePath),
        arch,
        is16KBAligned: true,
        maxAlign: 4096,
      };
    }

    if (!isLittleEndian) return null;

    const e_phoff = Number(buffer.readBigUInt64LE(32));
    const e_phentsize = buffer.readUInt16LE(54);
    const e_phnum = buffer.readUInt16LE(56);

    let maxAlign = 0;
    let hasLoadSegment = false;
    let is16KBAligned = true;

    for (let i = 0; i < e_phnum; i++) {
      const entryOffset = e_phoff + i * e_phentsize;
      if (entryOffset + 56 > buffer.length) break;

      const p_type = buffer.readUInt32LE(entryOffset);
      // PT_LOAD = 1
      if (p_type === 1) {
        hasLoadSegment = true;
        const p_align = Number(buffer.readBigUInt64LE(entryOffset + 48));
        if (p_align > maxAlign) {
          maxAlign = p_align;
        }
        // If segment alignment is less than 16KB (16384 / 0x4000)
        if (p_align < 16384) {
          is16KBAligned = false;
        }
      }
    }

    return {
      file: path.basename(filePath),
      arch,
      is16KBAligned: hasLoadSegment ? is16KBAligned : true,
      maxAlign,
    };
  } catch {
    return null;
  }
}

/**
 * Checks a package directory for 16KB page size compatibility issues.
 */
export async function checkPackage16KB(pkgDir: string): Promise<PageSize16KBReport> {
  const warnings: string[] = [];
  const prebuiltLibs: PrebuiltLibInfo[] = [];

  // Find all prebuilt .so and .aar files
  const soFiles = await fg(["**/*.so"], {
    cwd: pkgDir,
    ignore: ["**/node_modules/**", "**/example/**", "**/examples/**", "**/build/**", "**/android/build/**"],
    absolute: true,
  });

  for (const soPath of soFiles) {
    const elfInfo = await checkElf16KBAlignment(soPath);
    if (elfInfo) {
      prebuiltLibs.push(elfInfo);
      if (!elfInfo.is16KBAligned && (elfInfo.arch === "arm64-v8a" || elfInfo.arch === "x86_64")) {
        warnings.push(`Prebuilt binary ${elfInfo.file} (${elfInfo.arch}) has 4KB alignment (${elfInfo.maxAlign}B), requires 16KB (16384B).`);
      }
    }
  }

  // Scan C/C++ source code for hardcoded 4KB page size assumptions
  const cppFiles = await fg(["**/*.{cpp,c,cc,h,hpp}"], {
    cwd: pkgDir,
    ignore: ["**/node_modules/**", "**/example/**", "**/examples/**", "**/build/**"],
    absolute: true,
  });

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

  const isCompatible = warnings.length === 0;

  return {
    isCompatible,
    hasPrebuiltBinaries: prebuiltLibs.length > 0,
    prebuiltLibs,
    warnings,
  };
}
