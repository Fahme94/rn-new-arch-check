import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import path from "path";
import { checkElfFile, checkPackage16KB, parseElfAlignment } from "../src/elf";
import { makeElf, makeZip, tempDir } from "./helpers";

async function writeLib(dir: string, relativePath: string, elf: Buffer): Promise<string> {
  const target = path.join(dir, relativePath);
  await fs.ensureDir(path.dirname(target));
  await fs.writeFile(target, elf);
  return target;
}

test("flags a 4KB-aligned arm64 library", async () => {
  const dir = await tempDir("elf-bad");
  const file = await writeLib(dir, "libbad.so", makeElf({ aligns: [4096] }));
  const result = await checkElfFile(file);
  assert.equal(result.kind === "ok" && result.info.is16KBAligned, false);
});

test("accepts a 16KB-aligned arm64 library", async () => {
  const dir = await tempDir("elf-good");
  const file = await writeLib(dir, "libgood.so", makeElf({ aligns: [16384, 16384] }));
  const result = await checkElfFile(file);
  assert.equal(result.kind === "ok" && result.info.is16KBAligned, true);
});

test("reports the largest PT_LOAD alignment", async () => {
  const dir = await tempDir("elf-max");
  const file = await writeLib(dir, "libmix.so", makeElf({ aligns: [4096, 16384] }));
  const result = await checkElfFile(file);
  assert.equal(result.kind === "ok" && result.info.maxAlign, 16384);
});

test("identifies the architecture from e_machine", async () => {
  const dir = await tempDir("elf-arch");
  const file = await writeLib(dir, "lib.so", makeElf({ machine: 62 }));
  const result = await checkElfFile(file);
  assert.equal(result.kind === "ok" && result.info.arch, "x86_64");
});

test("exempts 32-bit libraries, which never run on 16KB page kernels", async () => {
  const dir = await tempDir("elf-32");
  const file = await writeLib(dir, "lib32.so", makeElf({ bits: 32, machine: 40, aligns: [4096] }));
  const result = await checkElfFile(file);
  assert.equal(result.kind === "ok" && result.info.is16KBAligned, true);
});

test("ignores a file that is not an ELF image", async () => {
  const dir = await tempDir("elf-not");
  const file = await writeLib(dir, "notelf.so", Buffer.alloc(128, 0x41));
  assert.equal((await checkElfFile(file)).kind, "not-elf");
});

test("reads only the headers, not the whole library", async () => {
  const dir = await tempDir("elf-big");
  // 8MB of padding; a whole-file read would have to materialise all of it.
  const file = await writeLib(dir, "libbig.so", makeElf({ aligns: [4096], padding: 8 * 1024 * 1024 }));

  let bytesRead = 0;
  const handle = await fs.open(file, "r");
  try {
    const result = await parseElfAlignment(
      async (offset, length) => {
        const buffer = Buffer.alloc(length);
        const { bytesRead: n } = await fs.read(handle, buffer, 0, length, offset);
        bytesRead += n;
        return buffer.subarray(0, n);
      },
      "libbig.so",
      file
    );
    assert.equal(result.kind, "ok");
  } finally {
    await fs.close(handle);
  }

  assert.ok(bytesRead < 4096, `expected a header-sized read, got ${bytesRead} bytes`);
});

test("reports a misaligned library stored inside an .aar", async () => {
  const dir = await tempDir("aar-stored");
  await makeZip(path.join(dir, "sdk.aar"), [
    { name: "jni/arm64-v8a/libinner.so", data: makeElf({ aligns: [4096] }), method: 0 },
  ]);
  const report = await checkPackage16KB(dir);
  assert.equal(report.warnings.length, 1);
});

test("reports a misaligned library deflated inside an .aar", async () => {
  const dir = await tempDir("aar-deflate");
  await makeZip(path.join(dir, "sdk.aar"), [
    { name: "jni/arm64-v8a/libinner.so", data: makeElf({ aligns: [4096] }), method: 8 },
  ]);
  const report = await checkPackage16KB(dir);
  assert.equal(report.warnings.length, 1);
});

test("attributes an archive finding to its container", async () => {
  const dir = await tempDir("aar-container");
  await makeZip(path.join(dir, "vendor.jar"), [
    { name: "jni/arm64-v8a/libinner.so", data: makeElf({ aligns: [4096] }), method: 8 },
  ]);
  const report = await checkPackage16KB(dir);
  assert.equal(report.prebuiltLibs[0].container, "vendor.jar");
});

test("accepts an aligned library inside an .aar", async () => {
  const dir = await tempDir("aar-ok");
  await makeZip(path.join(dir, "sdk.aar"), [
    { name: "jni/arm64-v8a/libinner.so", data: makeElf({ aligns: [16384] }), method: 8 },
  ]);
  const report = await checkPackage16KB(dir);
  assert.equal(report.isCompatible, true);
});

test("ignores non-library entries inside an archive", async () => {
  const dir = await tempDir("aar-other");
  await makeZip(path.join(dir, "sdk.aar"), [
    { name: "classes.jar", data: Buffer.alloc(64, 1), method: 8 },
    { name: "AndroidManifest.xml", data: Buffer.from("<manifest/>"), method: 8 },
  ]);
  const report = await checkPackage16KB(dir);
  assert.equal(report.prebuiltLibs.length, 0);
});

test("flags a hardcoded 4KB page size in C sources", async () => {
  const dir = await tempDir("elf-cpp");
  await fs.outputFile(path.join(dir, "src/mem.cpp"), "#define PAGE_SIZE 4096\n");
  const report = await checkPackage16KB(dir);
  assert.equal(report.isCompatible, false);
});
