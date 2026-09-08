import yauzl from "yauzl";

/**
 * Read the leading bytes of selected entries inside a zip archive.
 *
 * Android SDKs shipped through React Native wrapper packages are distributed as
 * `.aar`/`.jar` archives with their native libraries inside, so a scan that only
 * looks at loose `.so` files on disk misses them entirely -- and those bundled,
 * vendor-built libraries are among the most likely to be 4KB aligned.
 *
 * Only a prefix of each entry is read: an ELF header plus its program header
 * table is all the alignment check needs, and vendor archives can contain
 * libraries hundreds of megabytes in size.
 */
export interface ZipEntryPrefix {
  /** Entry path inside the archive, e.g. `jni/arm64-v8a/libfoo.so`. */
  name: string;
  bytes: Buffer;
  /** True when the entry is larger than the bytes returned. */
  truncated: boolean;
}

export async function readZipEntryPrefixes(
  archivePath: string,
  matches: (entryName: string) => boolean,
  maxBytes: number
): Promise<ZipEntryPrefix[]> {
  return new Promise((resolve, reject) => {
    const results: ZipEntryPrefix[] = [];
    let settled = false;

    const settle = (err: Error | null) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(results);
    };

    yauzl.open(archivePath, { lazyEntries: true, autoClose: true }, (openErr, zip) => {
      if (openErr || !zip) return settle(openErr ?? new Error("Unable to open archive"));

      zip.on("error", settle);
      zip.on("end", () => settle(null));

      zip.on("entry", (entry) => {
        // Directory entries carry a trailing slash and no content.
        if (entry.fileName.endsWith("/") || !matches(entry.fileName)) {
          return zip.readEntry();
        }

        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) {
            // A single unreadable entry should not abort the whole archive.
            return zip.readEntry();
          }

          const chunks: Buffer[] = [];
          let collected = 0;
          let done = false;

          const finish = () => {
            if (done) return;
            done = true;
            const bytes = Buffer.concat(chunks).subarray(0, maxBytes);
            results.push({
              name: entry.fileName,
              bytes,
              truncated: entry.uncompressedSize > bytes.length,
            });
            stream.destroy();
            zip.readEntry();
          };

          stream.on("data", (chunk: Buffer) => {
            chunks.push(chunk);
            collected += chunk.length;
            if (collected >= maxBytes) finish();
          });
          stream.on("end", finish);
          stream.on("error", finish);
        });
      });

      zip.readEntry();
    });
  });
}
