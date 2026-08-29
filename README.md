# rn-arch-check

CLI static analyzer to check if your React Native dependencies support the **New Architecture (TurboModules & Fabric)** and **Bridgeless Mode**.

## Installation

```bash
npm install -g rn-arch-check
# or run directly with npx:
npx rn-arch-check
# or with yarn:
yarn rn-arch-check
```

## Features

- 🔍 **Static Native Code Analysis**: Inspects `.podspec`, `Java`, `Kotlin`, `Objective-C++`, and `C++` files for TurboModule and Fabric component descriptors.
- 📱 **Platform Breakdown**: Identifies target native platforms (`[iOS]`, `[Android]`, `[C++]`).
- ⚡ **Expo Module Support**: Automatically detects modern Expo modules and config plugins.
- 📊 **Readiness Scoring**: Provides visual progress bars and percentage scores.
- 💡 **Actionable Migration Database**: Recommends modern replacements and upgrade paths for unmaintained or legacy libraries.
- 🚦 **CI/CD Strict Mode**: Exits with code `1` if incompatible dependencies are detected.

## Options

| Flag | Description |
|---|---|
| `-p, --path <path>` | Path to React Native project root (default: current directory) |
| `-d, --deep` | Deep recursive scan for transitive dependencies |
| `-s, --strict` | Exit with code `1` if any legacy module is found (for CI pipelines) |
| `-a, --all` | Show all scanned packages (including pure JavaScript libraries) |
| `--json` | Output scan results as structured JSON |
| `-h, --help` | Display CLI help menu |

## Example Usage

```bash
# Scan a specific React Native project
rn-arch-check -p /path/to/my-rn-app

# Deep scan of transitive dependencies
rn-arch-check -p /path/to/my-rn-app -d

# Strict mode for CI/CD checks
rn-arch-check -p /path/to/my-rn-app --strict

# Export JSON report
rn-arch-check -p /path/to/my-rn-app --json > rn-arch-report.json
```

