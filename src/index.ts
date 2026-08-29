#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import path from "path";
import { scanProject } from "./scanner";

const program = new Command();

function renderProgressBar(percentage: number, length = 24): string {
  const filledLength = Math.round((length * percentage) / 100);
  const emptyLength = length - filledLength;
  const filled = chalk.green("█".repeat(filledLength));
  const empty = chalk.gray("░".repeat(emptyLength));
  return `[${filled}${empty}] ${percentage}%`;
}

program
  .name("rn-new-arck-check")
  .description("Static analyzer for React Native New Architecture compatibility")
  .option("-p, --path <path>", "Path to React Native project root", process.cwd())
  .option("-d, --deep", "Perform deep recursive scan for transitive dependencies", false)
  .option("-s, --strict", "Exit with code 1 if any legacy or incompatible module is found", false)
  .option("-a, --all", "Show all packages including pure JavaScript libraries in the table", false)
  .option("--json", "Output results in JSON format (useful for CI)", false)
  .action(async (options) => {
    const projectRoot = path.resolve(options.path);

    try {
      if (!options.json) {
        console.log(chalk.cyan.bold("\n🔍 Scanning React Native project for New Architecture compatibility..."));
      }

      const result = await scanProject({
        projectRoot,
        deepScan: options.deep,
      });

      const { projectName, projectVersion, reactNativeVersion, reactVersion, expoVersion, reports } = result;

      const nativeReports = reports.filter((r) => r.hasNativeCode);
      const legacyReports = reports.filter((r) => r.status === "LEGACY_BRIDGE");
      const readyReports = reports.filter((r) => r.status === "FULL_SUPPORT");
      const untestedReports = reports.filter((r) => r.status === "UNKNOWN_NATIVE");
      const pureJsReports = reports.filter((r) => r.status === "PURE_JS");
      const page16KBIssues = reports.filter((r) => r.pageSize16KB && !r.pageSize16KB.isCompatible);

      const totalNative = nativeReports.length;
      const readyPercentage = totalNative > 0 ? Math.round((readyReports.length / totalNative) * 100) : 100;
      const isFullyCompatible = legacyReports.length === 0 && page16KBIssues.length === 0;

      if (options.json) {
        const output = {
          project: {
            name: projectName,
            version: projectVersion,
            reactNativeVersion,
            reactVersion: reactVersion || null,
            expoVersion: expoVersion || null,
            path: projectRoot,
            scanMode: options.deep ? "deep (transitive)" : "direct",
          },
          summary: {
            totalScanned: reports.length,
            nativePackages: totalNative,
            ready: readyReports.length,
            legacy: legacyReports.length,
            untested: untestedReports.length,
            pureJs: pureJsReports.length,
            pageSize16KBIssues: page16KBIssues.length,
            compatibilityScore: readyPercentage,
            isCompatible: isFullyCompatible,
          },
          packages: reports,
        };
        console.log(JSON.stringify(output, null, 2));
      } else {
        // Project Header Card
        console.log("\n" + chalk.bold.cyan("┌" + "─".repeat(76) + "┐"));
        console.log(
          chalk.bold.cyan("│") +
          chalk.bold.white("  📦 Project:      ") +
          chalk.bold.yellow(projectName) +
          chalk.gray(` (v${projectVersion})`).padEnd(52) +
          chalk.bold.cyan("│")
        );
        console.log(
          chalk.bold.cyan("│") +
          chalk.bold.white("  ⚛️  React Native: ") +
          chalk.bold.green(reactNativeVersion) +
          (reactVersion ? chalk.gray(` | React: ${reactVersion}`) : "") +
          (expoVersion ? chalk.magenta(` | Expo: ${expoVersion}`) : "").padEnd(45) +
          chalk.bold.cyan("│")
        );
        console.log(
          chalk.bold.cyan("│") +
          chalk.bold.white("  📁 Path:         ") +
          chalk.gray(projectRoot.length > 55 ? "..." + projectRoot.slice(-52) : projectRoot).padEnd(61) +
          chalk.bold.cyan("│")
        );
        console.log(
          chalk.bold.cyan("│") +
          chalk.bold.white("  🔍 Scan Mode:    ") +
          (options.deep ? chalk.magenta("Deep (Direct + Transitive)") : chalk.blue("Direct Dependencies Only")).padEnd(63) +
          chalk.bold.cyan("│")
        );
        console.log(chalk.bold.cyan("└" + "─".repeat(76) + "┘\n"));

        // Progress & Readiness Score
        console.log(chalk.bold("  New Architecture Readiness:"));
        console.log(`  ${renderProgressBar(readyPercentage)} ${isFullyCompatible ? chalk.green.bold("✔ FULLY COMPATIBLE") : chalk.red.bold("✖ MIGRATION REQUIRED")}\n`);

        // Render Table
        const packagesToDisplay = options.all ? reports : nativeReports;

        const table = new Table({
          head: [
            chalk.bold.white("Package & Version"),
            chalk.bold.white("Type"),
            chalk.bold.white("Platforms"),
            chalk.bold.white("Status"),
            chalk.bold.white("Tech Details"),
            chalk.bold.white("Migration / Notes"),
          ],
          colWidths: [32, 12, 14, 16, 22, 36],
          wordWrap: true,
        });

        for (const rep of packagesToDisplay) {
          let statusText = "";
          if (rep.status === "FULL_SUPPORT") {
            statusText = chalk.green.bold("✔ Ready");
          } else if (rep.status === "LEGACY_BRIDGE") {
            statusText = chalk.red.bold("✖ Legacy");
          } else if (rep.status === "PURE_JS") {
            statusText = chalk.blue("○ Pure JS");
          } else {
            statusText = chalk.yellow("? Untested");
          }

          const platformBadges = rep.platforms.length > 0
            ? rep.platforms.map((p) => chalk.cyan(`[${p}]`)).join(" ")
            : chalk.gray("JS");

          const techDetails = rep.notes.length > 0 ? rep.notes.join(", ") : "-";

          let migrationAdvice = chalk.gray("-");
          if (rep.pageSize16KB && !rep.pageSize16KB.isCompatible) {
            const warningText = rep.pageSize16KB.warnings.join("\n");
            migrationAdvice = `${chalk.red.bold("⚠️ 16KB Page Size Warning:")}\n${chalk.gray(warningText)}`;
          } else if (rep.suggestion) {
            migrationAdvice = `${chalk.yellow.bold("💡 " + rep.suggestion)}`;
            if (rep.reason) {
              migrationAdvice += `\n${chalk.gray(rep.reason)}`;
            }
          } else if (rep.status === "FULL_SUPPORT") {
            migrationAdvice = chalk.green("✔ TurboModule / Fabric ready");
          }

          table.push([
            `${chalk.bold(rep.name)}\n${chalk.gray("v" + rep.version)}`,
            rep.isTransitive ? chalk.magenta("Transitive") : chalk.cyan("Direct"),
            platformBadges,
            statusText,
            techDetails,
            migrationAdvice,
          ]);
        }

        console.log(table.toString());

        // Breakdown Summary
        console.log("\n" + chalk.bold("📊 Dependency Breakdown:"));
        console.log(`  ${chalk.green("✔")} New Architecture Ready:   ${chalk.green.bold(readyReports.length)}`);
        console.log(`  ${chalk.red("✖")} Legacy Bridge (Blocking):  ${chalk.red.bold(legacyReports.length)}`);
        if (untestedReports.length > 0) {
          console.log(`  ${chalk.yellow("?")} Untested Native Modules:   ${chalk.yellow.bold(untestedReports.length)}`);
        }
        console.log(`  ${chalk.blue("○")} Pure JS/TS Packages:       ${chalk.blue.bold(pureJsReports.length)}`);
        console.log(`  📱 16KB Page Size (Android 15): ${page16KBIssues.length === 0 ? chalk.green.bold("✔ All Aligned") : chalk.red.bold(`✖ ${page16KBIssues.length} Warning(s)`)}`);
        console.log(`  📦 Total Packages Scanned:      ${chalk.bold(reports.length)}`);

        // Actionable Checklist for New Architecture
        if (legacyReports.length > 0) {
          console.log("\n" + chalk.red.bold("🚨 Action Required to Enable New Architecture:"));
          legacyReports.forEach((pkg, index) => {
            const advice = pkg.suggestion ? chalk.yellow(pkg.suggestion) : chalk.gray("Check library repo for New Arch / TurboModule release");
            console.log(`  ${index + 1}. ${chalk.bold.white(pkg.name)}: ${advice}`);
          });
          console.log();
        }

        // Actionable Checklist for 16KB Page Size Issues
        if (page16KBIssues.length > 0) {
          console.log(chalk.red.bold("⚠️ 16KB Page Size Compatibility Issues (Google Play / Android 15):"));
          page16KBIssues.forEach((pkg, index) => {
            console.log(`  ${index + 1}. ${chalk.bold.white(pkg.name)}:`);
            pkg.pageSize16KB?.warnings.forEach((w) => console.log(`     - ${chalk.yellow(w)}`));
          });
          console.log();
        }

        if (legacyReports.length === 0 && page16KBIssues.length === 0) {
          console.log(chalk.green.bold("\n🚀 Congratulations! All native dependencies are ready for New Architecture, Bridgeless Mode & 16KB Android Page Sizes!\n"));
        }
      }

      if (options.strict && (legacyReports.length > 0 || page16KBIssues.length > 0)) {
        process.exit(1);
      }
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`\n✖ Error: ${message}`));
      process.exit(1);
    }
  });

program.parse(process.argv);

