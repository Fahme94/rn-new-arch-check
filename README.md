# rn-new-arck-check

Static analyzer to check if React Native dependencies support the New Architecture (TurboModules, Fabric), Bridgeless Mode, and Android 16KB Page Sizes.

## Features

- Static Native Code Analysis: Inspects podspecs, Java, Kotlin, Objective-C++, and C++ source code for TurboModule and Fabric component descriptors.
- Android 16KB Page Size Verification: Inspects prebuilt shared libraries (.so ELF headers) and C/C++ memory alignments for Android 15 / Google Play 16KB page size compliance.
- Platform Breakdown: Identifies target platforms ([iOS], [Android], [C++]) for every native dependency.
- Migration Recommendations: Provides drop-in replacements and upgrade paths for unmaintained or legacy packages.
- CI/CD Strict Mode: Exits with status code 1 if incompatible dependencies are detected.

## Installation

Run directly with `npx` (no installation needed):

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

## Usage

Run the command from your React Native project root directory:

```bash
npx rn-new-arck-check
```

Or specify a path to your project:

```bash
npx rn-new-arck-check -p /path/to/react-native-project
```

## Options

| Option | Description |
|---|---|
| `-p, --path <path>` | Path to React Native project root (default: current directory) |
| `-d, --deep` | Perform deep recursive scan for transitive dependencies in `node_modules` |
| `-s, --strict` | Exit with status code 1 if any legacy bridge module is found (for CI/CD) |
| `-a, --all` | Include pure JavaScript/TypeScript packages in the report table |
| `--json` | Output scan results as formatted JSON |
| `-h, --help` | Display help menu and available commands |

## Examples

### 1. Basic Scan
Scan direct dependencies in the current directory:

```bash
npx rn-new-arck-check
```

### 2. Deep Scan
Scan direct and all transitive dependencies:

```bash
npx rn-new-arck-check -d
```

### 3. CI/CD Integration
Fail the build pipeline if incompatible legacy modules exist:

```bash
npx rn-new-arck-check --strict
```

### 4. Export JSON Output
Save report data for automated processing:

```bash
npx rn-new-arck-check --json > report.json
```

## Sample Output

```text
┌────────────────────────────────────────────────────────────────────────────┐
│  Project:      my-rn-app (v1.0.0)                                          │
│  React Native: 0.76.0 | React: 18.3.1                                      │
│  Path:         /path/to/my-rn-app                                          │
│  Scan Mode:    Direct Dependencies Only                                    │
└────────────────────────────────────────────────────────────────────────────┘

  New Architecture Readiness:
  [████████████████░░░░░░░░] 67% MIGRATION REQUIRED

┌────────────────────────────────┬────────────┬──────────────┬────────────────┬──────────────────────┬────────────────────────────────────┐
│ Package & Version              │ Type       │ Platforms    │ Status         │ Tech Details         │ Migration / Notes                  │
├────────────────────────────────┼────────────┼──────────────┼────────────────┼──────────────────────┼────────────────────────────────────┤
│ react-native-reanimated        │ Direct     │ [iOS]        │ Ready          │ Codegen, TurboModule,│ TurboModule / Fabric ready         │
│ v3.16.1                        │            │ [Android]    │                │ Fabric View          │                                    │
│                                │            │ [C++]        │                │                      │                                    │
├────────────────────────────────┼────────────┼──────────────┼────────────────┼──────────────────────┼────────────────────────────────────┤
│ react-native-screens           │ Direct     │ [iOS]        │ Ready          │ Codegen, TurboModule,│ TurboModule / Fabric ready         │
│ v3.34.0                        │            │ [Android]    │                │ Fabric View          │                                    │
├────────────────────────────────┼────────────┼──────────────┼────────────────┼──────────────────────┼────────────────────────────────────┤
│ @react-native-async-storage/.. │ Direct     │ [iOS]        │ Ready          │ Codegen, TurboModule │ TurboModule / Fabric ready         │
│ v2.1.0                         │            │ [Android]    │                │                      │                                    │
├────────────────────────────────┼────────────┼──────────────┼────────────────┼──────────────────────┼────────────────────────────────────┤
│ react-native-linear-gradient   │ Direct     │ [iOS]        │ Legacy         │ Legacy Bridge        │ expo-linear-gradient /             │
│ v2.8.3                         │            │ [Android]    │                │                      │ @shopify/react-native-skia         │
├────────────────────────────────┼────────────┼──────────────┼────────────────┼──────────────────────┼────────────────────────────────────┤
│ react-native-snackbar          │ Direct     │ [iOS]        │ Legacy         │ Legacy Bridge        │ react-native-toast-message /       │
│ v2.6.2                         │            │ [Android]    │                │                      │ react-native-paper                 │
└────────────────────────────────┴────────────┴──────────────┴────────────────┴──────────────────────┴────────────────────────────────────┘

Dependency Breakdown:
  - New Architecture Ready:   3
  - Legacy Bridge (Blocking):  2
  - Pure JS/TS Packages:       15
  - 16KB Page Size (Android):  All Aligned
  - Total Packages Scanned:    20

Action Required to Enable New Architecture:
  1. react-native-linear-gradient: expo-linear-gradient / @shopify/react-native-skia
  2. react-native-snackbar: react-native-toast-message / react-native-paper
```




