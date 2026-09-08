/**
 * Evidence-based New Architecture detection.
 *
 * Signals are ranked by how hard they are to fake:
 *
 *   structural  `codegenConfig` in package.json, or `expo-module.config.json`.
 *               React Native's codegen discovers TurboModule/Fabric packages
 *               through `codegenConfig`, so its presence is a real declaration
 *               by the package author rather than a coincidence of wording.
 *
 *   source      Symbols found in native sources. Matching runs on
 *               comment-stripped text with token boundaries, and may only ever
 *               *downgrade* a package to LEGACY_BRIDGE. It never promotes one to
 *               FULL_SUPPORT: prose mentioning "Fabric" or "TurboModule" occurs
 *               most often in packages that have *not* migrated ("TODO: Fabric
 *               support", "incompatible with TurboModule"), so treating it as
 *               positive evidence systematically produced false "ready" verdicts.
 *
 * A package with native code and no structural signal is reported as
 * UNKNOWN_NATIVE — an honest "not verified" rather than a guess.
 */
export type Platform = "iOS" | "Android" | "C++";

export type NativeStatus = "FULL_SUPPORT" | "LEGACY_BRIDGE" | "UNKNOWN_NATIVE";

export type Confidence = "structural" | "source" | "none";

type CommentStyle = "c" | "ruby";

/** Extensions worth globbing for. Presence alone establishes "has native code". */
export const NATIVE_FILE_EXTENSIONS = [
  "podspec",
  "java",
  "kt",
  "kts",
  "mm",
  "m",
  "cpp",
  "cc",
  "c",
  "h",
  "hpp",
  "swift",
  "gradle",
];

const COMMENT_STYLE_BY_EXTENSION: Record<string, CommentStyle> = {
  podspec: "ruby",
  java: "c",
  kt: "c",
  kts: "c",
  mm: "c",
  m: "c",
  cpp: "c",
  cc: "c",
  c: "c",
  h: "c",
  hpp: "c",
  swift: "c",
  gradle: "c",
};

/** Files whose contents are worth reading, keyed by extension. */
export function commentStyleFor(relativePath: string): CommentStyle | null {
  const ext = relativePath.split(".").pop();
  if (!ext) return null;
  return COMMENT_STYLE_BY_EXTENSION[ext.toLowerCase()] ?? null;
}

/**
 * Remove comments while leaving string literals intact, so that a symbol
 * mentioned in a comment cannot be mistaken for one that is used in code.
 * Comment bodies are replaced with spaces to keep offsets stable.
 */
export function stripComments(source: string, style: CommentStyle): string {
  const out: string[] = [];
  let i = 0;
  const n = source.length;
  const hashComments = style === "ruby";
  const slashComments = style === "c";

  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === '"' || ch === "'" || (style === "ruby" && ch === "`")) {
      const quote = ch;
      out.push(ch);
      i++;
      while (i < n) {
        if (source[i] === "\\") {
          out.push(source[i], source[i + 1] ?? "");
          i += 2;
          continue;
        }
        out.push(source[i]);
        if (source[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (slashComments && ch === "/" && next === "/") {
      while (i < n && source[i] !== "\n") {
        out.push(" ");
        i++;
      }
      continue;
    }

    if (slashComments && ch === "/" && next === "*") {
      out.push("  ");
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        out.push(source[i] === "\n" ? "\n" : " ");
        i++;
      }
      if (i < n) {
        out.push("  ");
        i += 2;
      }
      continue;
    }

    if (hashComments && ch === "#") {
      while (i < n && source[i] !== "\n") {
        out.push(" ");
        i++;
      }
      continue;
    }

    out.push(ch);
    i++;
  }

  return out.join("");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Token-boundary match, so `Fabricator` never satisfies `Fabric`. */
export function hasToken(source: string, token: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(token)}([^A-Za-z0-9_]|$)`).test(source);
}

function hasAnyToken(source: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => hasToken(source, token));
}

/**
 * Symbols that indicate a TurboModule implementation. Recorded for context
 * only -- see the note at the top of this file on why they cannot promote.
 */
const TURBO_MODULE_TOKENS = [
  "RCTTurboModule",
  "RCTTurboModuleRegistry",
  "TurboModuleRegistry",
  "TurboReactPackage",
  "BaseReactPackage",
  "getTurboModule",
] as const;

/**
 * Fabric component symbols. Deliberately excludes the bare word `Fabric`, which
 * carries no information: it appears in migration TODOs and compatibility
 * warnings far more often than in actual Fabric implementations.
 */
const FABRIC_TOKENS = [
  "RCTComponentViewProtocol",
  "RCTViewComponentView",
  "RCTComponentViewFactory",
  "ConcreteComponentDescriptor",
  "ComponentDescriptorProvider",
  "ViewManagerDelegate",
  "ReactViewManagerWrapper",
] as const;

/** Symbols that only exist in legacy bridge modules and view managers. */
const LEGACY_TOKENS = [
  "RCTBridgeModule",
  "RCT_EXPORT_MODULE",
  "RCT_EXPORT_VIEW_PROPERTY",
  "RCTViewManager",
  "RCTEventEmitter",
  "ReactContextBaseJavaModule",
  "SimpleViewManager",
  "LazyReactPackage",
  "CxxModuleWrapper",
] as const;

/** Direct JSI bindings, which need no codegen and so have no structural marker. */
const JSI_TOKENS = ["jsi", "JSIModulePackage", "installJSIBindings"] as const;

export interface SourceEvidence {
  turboModule: boolean;
  fabric: boolean;
  legacy: boolean;
  jsi: boolean;
}

export function emptyEvidence(): SourceEvidence {
  return { turboModule: false, fabric: false, legacy: false, jsi: false };
}

/** Accumulate evidence from one native source file. */
export function collectEvidence(
  content: string,
  style: CommentStyle,
  into: SourceEvidence
): SourceEvidence {
  const code = stripComments(content, style);

  if (hasAnyToken(code, TURBO_MODULE_TOKENS)) into.turboModule = true;
  if (hasAnyToken(code, FABRIC_TOKENS)) into.fabric = true;
  if (hasAnyToken(code, LEGACY_TOKENS)) into.legacy = true;
  if (hasAnyToken(code, JSI_TOKENS)) into.jsi = true;

  return into;
}

export function detectPlatform(relativePath: string): Platform[] {
  const lower = relativePath.toLowerCase();
  const platforms: Platform[] = [];

  if (
    lower.endsWith(".podspec") ||
    lower.endsWith(".mm") ||
    lower.endsWith(".m") ||
    lower.endsWith(".swift") ||
    lower.includes("/ios/") ||
    lower.startsWith("ios/")
  ) {
    platforms.push("iOS");
  }

  if (
    lower.endsWith(".java") ||
    lower.endsWith(".kt") ||
    lower.endsWith(".kts") ||
    lower.endsWith(".gradle") ||
    lower.includes("/android/") ||
    lower.startsWith("android/")
  ) {
    platforms.push("Android");
  }

  if (
    lower.endsWith(".cpp") ||
    lower.endsWith(".cc") ||
    lower.endsWith(".hpp") ||
    lower.includes("/cpp/") ||
    lower.startsWith("cpp/")
  ) {
    platforms.push("C++");
  }

  return platforms;
}

export interface StructuralSignals {
  hasCodegenConfig: boolean;
  isExpoModule: boolean;
}

export interface Classification {
  status: NativeStatus;
  confidence: Confidence;
  notes: string[];
}

export function classify(
  structural: StructuralSignals,
  evidence: SourceEvidence
): Classification {
  const notes: string[] = [];

  if (structural.hasCodegenConfig) notes.push("Codegen");
  if (structural.isExpoModule) notes.push("Expo Module");

  if (structural.hasCodegenConfig || structural.isExpoModule) {
    if (evidence.turboModule) notes.push("TurboModule");
    if (evidence.fabric) notes.push("Fabric View");
    return { status: "FULL_SUPPORT", confidence: "structural", notes };
  }

  // No structural declaration. Source symbols may only downgrade from here.
  if (evidence.legacy) {
    notes.push("Legacy Bridge");
    if (evidence.turboModule || evidence.fabric) {
      notes.push("New Arch symbols present but no codegenConfig");
    }
    return { status: "LEGACY_BRIDGE", confidence: "source", notes };
  }

  if (evidence.turboModule || evidence.fabric) {
    notes.push("New Arch symbols but no codegenConfig (unverified)");
  }
  if (evidence.jsi) {
    notes.push("Direct JSI (no codegen required)");
  }

  return { status: "UNKNOWN_NATIVE", confidence: "none", notes };
}
