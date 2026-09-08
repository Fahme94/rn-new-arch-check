# rn-new-arck-check

Static analyzer for React Native projects that checks readiness for the New Architecture (TurboModules, Fabric) and Android 16KB page sizes.

## Key Checks

- **Project Configuration**: Analyzes installed React Native version, `android/gradle.properties`, `ios/Podfile`, and Expo config. Correctly detects dead legacy configuration (such as `newArchEnabled` flags on React Native 0.82+ where the legacy engine was removed).
- **Dependency Inspection**: Resolves packages using standard Node resolution (including hoisted mono-repo dependencies across yarn, npm, and pnpm workspaces).
- **Native Architecture Evidence**: Verifies `codegenConfig`, `expo-module.config.json`, and scans native C++, Objective-C++, Java, and Kotlin source code for TurboModule and Fabric descriptors.
- **Android 16KB Page Size Alignment**: Parses 64-bit ELF headers of prebuilt `.so` shared libraries (including those inside `.aar` and `.jar` archives) to verify 16KB segment alignment for Android 15+, and flags hardcoded 4KB page size constants in C/C++ code.

## What's New in 1.2.0

This release changes how compatibility is decided. Previously a package was
marked ready if its source merely mentioned TurboModules or Fabric anywhere,
including inside comments, and a scan that found nothing reported success. Both
produced confident false passes. Verdicts are now derived from structural
evidence, and a scan that cannot verify something says so.

> **Upgrading?** `--strict` fails in situations that previously passed, and the
> JSON shape changed. See [Breaking Changes](#breaking-changes) below.

### Breaking Changes

| Change | Why It Matters |
|---|---|
| `--strict` now also fails on `unresolved` and `incomplete` | A pipeline that runs before `install`, or in a workspace where dependencies are hoisted, used to exit `0` while inspecting nothing. It now exits `1`. |
| An empty scan reports `INCOMPLETE`, never `READY` | "No findings" is no longer treated as "no problems". |
| Source code alone can no longer mark a package `Ready` | Only `codegenConfig` or `expo-module.config.json` do. Packages previously reported `Ready` on the strength of a comment now report `Legacy` or `Unverified`. |
| `summary.untested` renamed to `summary.unknown` | Matches the `unknown` category used by `--fail-on`. |
| `summary.compatibilityScore` may now be `null` | Returned when no native package could be inspected, instead of a misleading `100`. |
| `project.reactNativeVersion` is the *installed* version | It previously echoed the range from `package.json` (`^0.76.0`). The declared range moved to `project.reactNativeDeclared`. |
| `project.scanMode` values are now `direct` / `deep` | Previously `direct` / `deep (transitive)`. |
| Package field `suggestion` / `reason` replaced by an `advice` object | Carries `kind`, `minVersion`, `replacement`, `reason`, and `satisfied`. |
| New `UNRESOLVED` package status | Consumers that branch on `status` need to handle it. |
| `getSuggestion()` replaced by `getAdvice(name, installedVersion)` | Affects programmatic use only. |

### New Features

- **Project configuration analysis.** Reads the installed React Native version,
  `android/gradle.properties`, `ios/Podfile`, and the Expo config, and
  interprets the New Architecture flags against that version. On React Native
  0.82+ the legacy opt-out no longer exists, so `newArchEnabled=false` is
  reported as ignored configuration to delete rather than as a disabled build.
- **Node-style dependency resolution.** Dependencies are resolved by walking up
  parent `node_modules`, so packages hoisted by a yarn, npm, or pnpm workspace
  are found instead of silently skipped.
- **`--fail-on` categories.** CI gates are now selectable per category
  (`legacy`, `unknown`, `unresolved`, `16kb`, `incomplete`) rather than a single
  all-or-nothing `--strict`.
- **16KB alignment inside archives.** `.aar` and `.jar` files are opened and
  their embedded `.so` libraries checked. Bundled vendor SDKs are the libraries
  most likely to be misaligned, and were previously invisible.
- **Scan verdicts.** A single `READY` / `NEEDS_REVIEW` / `MIGRATION_REQUIRED` /
  `INCOMPLETE` verdict replaces the old compatible/incompatible flag, so the
  headline and the readiness score can no longer contradict each other.
- **Evidence confidence.** Each package reports whether its classification came
  from a structural declaration or from source matching.

### Correctness Fixes

| Area | Before | After |
|---|---|---|
| Comment matching | A comment reading `TODO: Fabric unsupported` marked a package `Ready` | Comments are stripped and symbols matched on token boundaries |
| Objective-C `.m` files | Never scanned, so classic bridge modules were `Unverified` | Scanned alongside `.mm`, `.hpp`, `.cc`, and `.swift` |
| Workspace projects | Hoisted dependencies were reported as missing | Resolved through parent `node_modules` |
| Missing `node_modules` | Reported `100%` and exited `0` | Reports `INCOMPLETE` and fails `--strict` |
| Readiness headline | Could print `0% FULLY COMPATIBLE` | Verdict and score are derived together |
| Prebuilt `.so` memory | A 120 MB library used 182 MB of memory | Only ELF headers are read: 55 MB, independent of file size |
| Migration advice | Suggested upgrades already satisfied by the installed version | `minVersion` is compared against the installed version and satisfied advice is suppressed |
| Deep scan | Manifests inside package subdirectories counted as extra dependencies | Only real package roots are counted, deduplicated by name and version |
| Report layout | Fixed 132-column table with misaligned header borders | Adapts to terminal width, dropping the Type and Platforms columns below 119 columns |

### Internals

- The advice table now declares `kind: "replace" | "upgrade" | "none"` per entry,
  so replacements, version floors, and "no action needed" entries are no longer
  all rendered as warnings. Test runners such as `detox` are no longer flagged.
- Version floors mean the table ages gracefully: a package several majors past
  its floor is simply silent rather than being told to upgrade to a version it
  passed long ago.
- 99 tests run on Node's built-in test runner with no additional test
  dependency, covering every fix above. Fixtures, including ELF images and zip
  archives, are generated at runtime so no binaries are committed.
- GitHub Actions CI runs typecheck, tests, and build on Node 18, 20, and 22.

## Installation

Run directly using `npx` (recommended, no installation required):

```bash
npx rn-new-arck-check
```

Or install globally:

```bash
# Using npm
npm install -g rn-new-arck-check

# Using yarn
yarn global add rn-new-arck-check
```

## Quick Start

```bash
# Scan current directory
npx rn-new-arck-check

# Scan a specific project path
npx rn-new-arck-check -p /path/to/react-native-project

# Include transitive dependencies in node_modules
npx rn-new-arck-check -d

# Show all dependencies (including pure JavaScript packages)
npx rn-new-arck-check -a

# Run in strict mode (fails CI on legacy, 16KB, or unresolved dependencies)
npx rn-new-arck-check --strict

# Output machine-readable JSON for tooling and CI
npx rn-new-arck-check --json > report.json
```

## CLI Options

| Flag | Argument | Default | Description |
|---|---|---|---|
| `-p, --path` | `<path>` | `.` | Path to React Native project root or `package.json` |
| `-d, --deep` | - | `false` | Deep recursive scan for transitive dependencies |
| `-a, --all` | - | `false` | Include pure JavaScript/TypeScript libraries in the report table |
| `-s, --strict` | - | `false` | Shorthand for `--fail-on legacy,unresolved,16kb,incomplete` |
| `--fail-on` | `<categories>` | - | Comma-separated categories that trigger exit code 1 |
| `--json` | - | `false` | Output full scan results as structured JSON |
| `-h, --help` | - | - | Display help menu and options |

## CI/CD Integration & Exit Codes

### Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success: No findings in requested failure categories |
| `1` | Failure: One or more requested findings were detected |
| `2` | Usage error: Invalid CLI options or arguments |

### `--fail-on` Categories

Filter failure triggers using comma-separated values:

| Category | Triggers Failure When |
|---|---|
| `legacy` | A package implements only the legacy bridge |
| `unknown` | A native package cannot be verified from code evidence |
| `unresolved` | A declared dependency is not installed on disk |
| `16kb` | A prebuilt native binary is not 16KB page-size aligned |
| `incomplete` | Scan could not examine dependencies (missing `node_modules`) |
| `all` | Fails on any warning or issue |
| `none` | Never fails (always exits with code 0) |

Example:
```bash
# Fail CI only if legacy bridge packages or 16KB page size issues are found
npx rn-new-arck-check --fail-on legacy,16kb
```

## Package Statuses & Verdicts

### Package Statuses

| Status | Meaning | Action Needed |
|---|---|---|
| `Ready` | Implements TurboModules, Fabric, Codegen, or Expo modules | None. Fully compatible with New Architecture. |
| `Legacy` | Relies on the old bridge without New Architecture support | Migrate or upgrade to New Architecture release. |
| `Unverified` | Contains native code without explicit Codegen/TurboModule markers | Manual review (common for direct JSI libraries). |
| `Pure JS` | Contains only JavaScript/TypeScript code | None. Fully compatible. |
| `Not installed` | Declared in `package.json` but missing in `node_modules` | Run `npm install` or `yarn install`. |

### Scan Verdicts

| Verdict | Meaning |
|---|---|
| `READY` | All native dependencies verified ready with no 16KB issues |
| `NEEDS_REVIEW` | Dependencies work, but unverified native libraries require manual check |
| `MIGRATION_REQUIRED` | Legacy bridge packages or 16KB page size issues detected |
| `INCOMPLETE` | Dependencies missing from disk; scan could not complete |

## Sample Output

```text
React Native architecture report

  Project          my-rn-app v1.0.0
  React Native     0.79.0  (declared ^0.79.0)
  React            19.0.0
  Native projects  android/  ios/
  Path             /path/to/my-rn-app
  Scan mode        direct dependencies

  Architecture
    React Native 0.79.0 runs New Architecture by default.

  New Architecture readiness:
  [████████████████░░░░░░░░] 67%  MIGRATION REQUIRED

┌────────────────────────────────┬────────────┬──────────────┬────────────────┬──────────────┬────────────────────────────────────┐
│ Package & Version              │ Type       │ Platforms    │ Status         │ Evidence     │ Action                             │
├────────────────────────────────┼────────────┼──────────────┼────────────────┼──────────────┼────────────────────────────────────┤
│ react-native-reanimated        │ Direct     │ [iOS]        │ Ready          │ Codegen,     │ TurboModule / Fabric ready         │
│ v3.16.1                        │            │ [Android]    │                │ TurboModule  │                                    │
│                                │            │ [C++]        │                │              │                                    │
├────────────────────────────────┼────────────┼──────────────┼────────────────┼──────────────┼────────────────────────────────────┤
│ react-native-screens           │ Direct     │ [iOS]        │ Ready          │ Codegen,     │ TurboModule / Fabric ready         │
│ v3.34.0                        │            │ [Android]    │                │ Fabric       │                                    │
├────────────────────────────────┼────────────┼──────────────┼────────────────┼──────────────┼────────────────────────────────────┤
│ @react-native-async-storage/.. │ Direct     │ [iOS]        │ Ready          │ Codegen,     │ TurboModule / Fabric ready         │
│ v2.1.0                         │            │ [Android]    │                │ TurboModule  │                                    │
├────────────────────────────────┼────────────┼──────────────┼────────────────┼──────────────┼────────────────────────────────────┤
│ react-native-linear-gradient   │ Direct     │ [iOS]        │ Legacy         │ Legacy       │ Replace with expo-linear-gradient  │
│ v2.8.3                         │            │ [Android]    │                │ Bridge       │ or @shopify/react-native-skia      │
├────────────────────────────────┼────────────┼──────────────┼────────────────┼──────────────┼────────────────────────────────────┤
│ react-native-snackbar          │ Direct     │ [iOS]        │ Legacy         │ Legacy       │ Replace with                       │
│ v2.6.2                         │            │ [Android]    │                │ Bridge       │ react-native-toast-message         │
└────────────────────────────────┴────────────┴──────────────┴────────────────┴──────────────┴────────────────────────────────────┘

Dependency breakdown:
  - New Architecture ready:   3
  - Legacy bridge:            2
  - Unverified native:        0
  - Pure JS/TS:               15
  - 16KB page size (Android): All Aligned
  - Total packages:           20

Legacy bridge packages:
  1. react-native-linear-gradient: Replace with expo-linear-gradient / @shopify/react-native-skia
  2. react-native-snackbar: Replace with react-native-toast-message / react-native-paper
```

## License

MIT

