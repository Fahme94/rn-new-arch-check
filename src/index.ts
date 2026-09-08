#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import path from "path";
import { scanProject, PackageReport, ArchStatus } from "./scanner";
import { ProjectInfo } from "./project";
import { ADVICE_LAST_REVIEWED, Advice, formatAdvice } from "./replacements";
import {
  FAIL_CATEGORIES,
  STRICT_CATEGORIES,
  Summary,
  Verdict,
  gateFailures,
  parseFailCategories,
  summarize,
} from "./verdict";

const LABEL_WIDTH = 17;

function renderProgressBar(percentage: number | null, length = 24): string {
  if (percentage === null) {
    return `[${chalk.gray("░".repeat(length))}] ${chalk.gray("n/a")}`;
  }
  const filledLength = Math.round((length * percentage) / 100);
  const filled = chalk.green("█".repeat(filledLength));
  const empty = chalk.gray("░".repeat(length - filledLength));
  return `[${filled}${empty}] ${percentage}%`;
}

/**
 * Pad the plain label before colouring it. Padding a coloured string counts the
 * ANSI escape sequences as visible characters, which is what previously made the
 * report header misalign.
 */
function field(label: string, value: string): string {
  return `  ${chalk.gray(label.padEnd(LABEL_WIDTH))}${value}`;
}

const VERDICT_DISPLAY: Record<Verdict, { text: string; render: (s: string) => string }> = {
  READY: { text: "✔ READY", render: (s) => chalk.green.bold(s) },
  NEEDS_REVIEW: { text: "⚠ NEEDS REVIEW", render: (s) => chalk.yellow.bold(s) },
  MIGRATION_REQUIRED: { text: "✖ MIGRATION REQUIRED", render: (s) => chalk.red.bold(s) },
  INCOMPLETE: { text: "⚠ INCOMPLETE SCAN", render: (s) => chalk.magenta.bold(s) },
};

const STATUS_DISPLAY: Record<ArchStatus, string> = {
  FULL_SUPPORT: chalk.green.bold("✔ Ready"),
  LEGACY_BRIDGE: chalk.red.bold("✖ Legacy"),
  UNKNOWN_NATIVE: chalk.yellow("? Unverified"),
  PURE_JS: chalk.blue("○ Pure JS"),
  UNRESOLVED: chalk.magenta.bold("⚠ Not installed"),
};

function printProjectHeader(project: ProjectInfo, projectRoot: string, scanMode: string): void {
  console.log("\n" + chalk.bold.cyan("React Native architecture report"));
  console.log();

  console.log(field("Project", `${chalk.bold.yellow(project.name)} ${chalk.gray("v" + project.version)}`));

  const rnValue = project.installedReactNative
    ? chalk.bold.green(project.installedReactNative) +
      (project.declaredReactNative
        ? chalk.gray(`  (declared ${project.declaredReactNative})`)
        : "")
    : chalk.red("not installed") +
      (project.declaredReactNative
        ? chalk.gray(`  (declared ${project.declaredReactNative})`)
        : "");
  console.log(field("React Native", rnValue));

  if (project.installedReact) console.log(field("React", project.installedReact));
  if (project.installedExpo) console.log(field("Expo", chalk.magenta(project.installedExpo)));

  const platforms = [
    project.hasAndroidProject ? "android/" : null,
    project.hasIosProject ? "ios/" : null,
  ].filter(Boolean);
  if (platforms.length > 0) console.log(field("Native projects", platforms.join("  ")));

  console.log(field("Path", chalk.gray(projectRoot)));
  console.log(field("Scan mode", scanMode === "deep" ? "direct + transitive" : "direct dependencies"));

  console.log();
  console.log(chalk.bold("  Architecture"));
  if (project.notes.length === 0) {
    console.log(`    ${chalk.gray("No architecture configuration found.")}`);
  }
  for (const note of project.notes) {
    const marker = note.level === "warn" ? chalk.yellow("⚠") : chalk.green("✔");
    console.log(`    ${marker} ${note.level === "warn" ? chalk.yellow(note.message) : note.message}`);
  }
}

/** Advice worth showing: a real action the developer has not taken yet. */
function actionableAdvice(report: PackageReport): Advice | undefined {
  if (!report.advice || report.advice.satisfied) return undefined;
  return report.advice;
}

function adviceCell(report: PackageReport): string {
  if (report.pageSize16KB && !report.pageSize16KB.isCompatible) {
    return `${chalk.red.bold("⚠ 16KB page size:")}\n${chalk.gray(report.pageSize16KB.warnings.join("\n"))}`;
  }

  if (report.status === "UNRESOLVED") {
    return chalk.magenta("Install dependencies and re-run");
  }

  const advice = actionableAdvice(report);
  if (advice) {
    return `${chalk.yellow.bold("💡 " + formatAdvice(advice))}\n${chalk.gray(advice.reason)}`;
  }

  if (report.status === "FULL_SUPPORT") return chalk.green("✔ TurboModule / Fabric ready");
  if (report.status === "UNKNOWN_NATIVE") {
    return chalk.gray("No codegenConfig found; verify with the library docs");
  }
  return chalk.gray("-");
}

interface Column {
  header: string;
  /** Narrowest useful width. */
  minWidth: number;
  /** Share of the leftover width; 0 for columns of fixed size. */
  share: number;
  /** Dropped first when the terminal is too narrow for every column. */
  optional?: boolean;
  render: (report: PackageReport) => string;
}

const COLUMNS: Column[] = [
  {
    header: "Package & Version",
    minWidth: 22,
    share: 0.4,
    render: (report) =>
      `${chalk.bold(report.name)}\n${chalk.gray(
        report.status === "UNRESOLVED" ? report.version : "v" + report.version
      )}`,
  },
  {
    header: "Type",
    minWidth: 12,
    share: 0,
    optional: true,
    render: (report) =>
      report.isTransitive ? chalk.magenta("Transitive") : chalk.cyan("Direct"),
  },
  {
    header: "Platforms",
    minWidth: 14,
    share: 0,
    optional: true,
    render: (report) =>
      report.platforms.length > 0
        ? report.platforms.map((platform) => chalk.cyan(`[${platform}]`)).join(" ")
        : chalk.gray(report.status === "UNRESOLVED" ? "-" : "JS"),
  },
  {
    header: "Status",
    minWidth: 16,
    share: 0,
    render: (report) => STATUS_DISPLAY[report.status],
  },
  {
    header: "Evidence",
    minWidth: 14,
    share: 0.22,
    render: (report) => (report.notes.length > 0 ? report.notes.join(", ") : "-"),
  },
  {
    header: "Action",
    minWidth: 22,
    share: 0.38,
    render: adviceCell,
  },
];

function buildTable(reports: PackageReport[]): string {
  // `columns` is unset when output is piped, so fall back to COLUMNS (which CI
  // logs commonly set) before assuming a width.
  const detected = process.stdout.columns || Number(process.env.COLUMNS) || 120;
  const available = Math.max(60, Math.min(detected, 160));

  // Every column carries two border characters plus padding.
  const overhead = (count: number) => count + 1 + count * 2;
  const fits = (columns: Column[]) =>
    columns.reduce((total, column) => total + column.minWidth, 0) + overhead(columns.length) <=
    available;

  const columns = fits(COLUMNS) ? COLUMNS : COLUMNS.filter((column) => !column.optional);

  const fixedWidth = columns
    .filter((column) => column.share === 0)
    .reduce((total, column) => total + column.minWidth, 0);
  const flexible = Math.max(0, available - fixedWidth - overhead(columns.length));
  const totalShare = columns.reduce((total, column) => total + column.share, 0);

  const widths = columns.map((column) =>
    column.share === 0
      ? column.minWidth
      : Math.max(column.minWidth, Math.floor((flexible * column.share) / totalShare))
  );

  const table = new Table({
    head: columns.map((column) => chalk.bold.white(column.header)),
    colWidths: widths,
    wordWrap: true,
  });

  for (const report of reports) {
    table.push(columns.map((column) => column.render(report)));
  }

  return table.toString();
}

function printBreakdown(summary: Summary): void {
  console.log("\n" + chalk.bold("📊 Dependency breakdown:"));
  console.log(`  ${chalk.green("✔")} New Architecture ready:     ${chalk.green.bold(summary.ready)}`);
  console.log(`  ${chalk.red("✖")} Legacy bridge:              ${chalk.red.bold(summary.legacy)}`);
  console.log(`  ${chalk.yellow("?")} Unverified native:          ${chalk.yellow.bold(summary.unknown)}`);
  console.log(`  ${chalk.blue("○")} Pure JS/TS:                 ${chalk.blue.bold(summary.pureJs)}`);
  if (summary.unresolved > 0) {
    console.log(`  ${chalk.magenta("⚠")} Declared but not installed: ${chalk.magenta.bold(summary.unresolved)}`);
  }
  console.log(
    `  📱 16KB page size (Android):   ${
      summary.pageSize16KBIssues === 0
        ? chalk.green.bold("✔ all aligned")
        : chalk.red.bold(`✖ ${summary.pageSize16KBIssues} warning(s)`)
    }`
  );
  console.log(`  📦 Total packages:             ${chalk.bold(summary.totalScanned)}`);
}

function printActions(reports: PackageReport[], summary: Summary): void {
  const unresolved = reports.filter((report) => report.status === "UNRESOLVED");
  if (unresolved.length > 0) {
    console.log("\n" + chalk.magenta.bold("⚠ Dependencies declared but not installed:"));
    console.log(
      chalk.gray(
        "  These could not be inspected, so this scan is incomplete and proves nothing about compatibility."
      )
    );
    unresolved.forEach((report, index) => {
      console.log(`  ${index + 1}. ${chalk.bold.white(report.name)} ${chalk.gray(report.version)}`);
    });
  }

  const legacy = reports.filter((report) => report.status === "LEGACY_BRIDGE");
  if (legacy.length > 0) {
    console.log("\n" + chalk.red.bold("🚨 Legacy bridge packages:"));
    console.log(
      chalk.gray(
        "  These run through React Native's interop layer, which is enabled by default. They are frozen upstream (no fixes since 0.80) and are the packages to migrate first."
      )
    );
    legacy.forEach((report, index) => {
      const advice = actionableAdvice(report);
      const text = advice
        ? chalk.yellow(formatAdvice(advice))
        : chalk.gray("Check the library repo for a TurboModule/Fabric release");
      console.log(`  ${index + 1}. ${chalk.bold.white(report.name)}: ${text}`);
    });
  }

  const unverified = reports.filter((report) => report.status === "UNKNOWN_NATIVE");
  if (unverified.length > 0) {
    console.log("\n" + chalk.yellow.bold("? Unverified native packages:"));
    console.log(
      chalk.gray(
        "  Native code with no codegenConfig and no legacy markers. Not a failure -- these need a manual check."
      )
    );
    unverified.forEach((report, index) => {
      console.log(`  ${index + 1}. ${chalk.bold.white(report.name)} ${chalk.gray("v" + report.version)}`);
    });
  }

  const pageSizeIssues = reports.filter(
    (report) => report.pageSize16KB && !report.pageSize16KB.isCompatible
  );
  if (pageSizeIssues.length > 0) {
    console.log("\n" + chalk.red.bold("⚠ 16KB page size issues (Google Play, Android 15+):"));
    pageSizeIssues.forEach((report, index) => {
      console.log(`  ${index + 1}. ${chalk.bold.white(report.name)}:`);
      report.pageSize16KB?.warnings.forEach((warning) =>
        console.log(`     - ${chalk.yellow(warning)}`)
      );
    });
  }

  if (summary.verdict === "READY") {
    console.log(
      "\n" +
        chalk.green.bold(
          "🚀 All native dependencies are verified ready for the New Architecture and 16KB Android page sizes.\n"
        )
    );
  }
}

const program = new Command();

program
  .name("rn-new-arck-check")
  .description("Static analyzer for React Native New Architecture compatibility")
  .option("-p, --path <path>", "Path to React Native project root", process.cwd())
  .option("-d, --deep", "Perform deep recursive scan for transitive dependencies", false)
  .option("-a, --all", "Show all packages including pure JavaScript libraries", false)
  .option(
    "-s, --strict",
    `Exit 1 on findings in: ${STRICT_CATEGORIES.join(", ")} (shorthand for --fail-on)`,
    false
  )
  .option(
    "--fail-on <categories>",
    `Comma-separated exit-1 conditions: ${FAIL_CATEGORIES.join(", ")}, all, none`
  )
  .option("--json", "Output results in JSON format (useful for CI)", false)
  .action(async (options) => {
    const projectRoot = path.resolve(options.path);

    let failCategories = options.strict ? [...STRICT_CATEGORIES] : [];
    if (options.failOn !== undefined) {
      const parsed = parseFailCategories(options.failOn);
      if (parsed.invalid.length > 0) {
        console.error(
          chalk.red(
            `\n✖ Unknown --fail-on value(s): ${parsed.invalid.join(", ")}. Valid: ${FAIL_CATEGORIES.join(", ")}, all, none`
          )
        );
        process.exit(2);
      }
      failCategories = parsed.categories;
    }

    try {
      if (!options.json) {
        console.log(
          chalk.cyan("\n🔍 Scanning React Native project for New Architecture compatibility...")
        );
      }

      const result = await scanProject({ projectRoot, deepScan: options.deep });
      const summary = summarize(result.reports);
      const failures = gateFailures(summary, failCategories);

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              project: {
                name: result.project.name,
                version: result.project.version,
                reactNativeVersion: result.project.installedReactNative,
                reactNativeDeclared: result.project.declaredReactNative,
                reactVersion: result.project.installedReact,
                expoVersion: result.project.installedExpo,
                newArchEnabled: result.project.newArchEnabled,
                archFlags: result.project.flags,
                archNotes: result.project.notes,
                path: projectRoot,
                scanMode: result.scanMode,
              },
              summary,
              adviceLastReviewed: ADVICE_LAST_REVIEWED,
              failOn: failCategories,
              failures,
              packages: result.reports,
            },
            null,
            2
          )
        );
      } else {
        printProjectHeader(result.project, projectRoot, result.scanMode);

        const verdict = VERDICT_DISPLAY[summary.verdict];
        console.log("\n" + chalk.bold("  New Architecture readiness:"));
        console.log(
          `  ${renderProgressBar(summary.compatibilityScore)}  ${verdict.render(verdict.text)}\n`
        );

        const displayed = options.all
          ? result.reports
          : result.reports.filter(
              (report) => report.hasNativeCode || report.status === "UNRESOLVED"
            );

        if (displayed.length > 0) {
          console.log(buildTable(displayed));
        } else {
          console.log(chalk.gray("  No native dependencies found."));
        }

        printBreakdown(summary);
        printActions(result.reports, summary);

        if (failures.length > 0) {
          console.log(
            chalk.red.bold(
              `✖ Failing (--fail-on ${failCategories.join(",")}): ` +
                failures.map((failure) => `${failure.count} ${failure.label}`).join(", ") +
                "\n"
            )
          );
        }
      }

      if (failures.length > 0) process.exit(1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`\n✖ Error: ${message}`));
      process.exit(1);
    }
  });

program.parse(process.argv);
