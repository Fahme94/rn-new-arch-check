import { satisfiesMinimum } from "./version";

/**
 * Curated migration advice.
 *
 * Each entry declares what *kind* of action it represents, so the renderer can
 * tell "replace this package" apart from "you are already fine". Previously a
 * single prose field carried all three meanings and every entry was rendered as
 * a warning, which flagged test runners and already-compliant packages as
 * problems.
 *
 * `upgrade` entries carry a `minVersion` floor that is compared against the
 * *installed* version, so advice disappears once it has been acted on. Treating
 * the number as a floor rather than a target is also what keeps this table from
 * rotting: a project several majors past the floor is simply silent, instead of
 * being told to upgrade to a version it passed long ago.
 */
export type AdviceKind = "replace" | "upgrade" | "none";

export interface AdviceEntry {
  kind: AdviceKind;
  /** Lowest version with New Architecture support. Only for `upgrade`. */
  minVersion?: string;
  /** What to migrate to. Only for `replace`. */
  replacement?: string;
  reason: string;
}

export interface Advice extends AdviceEntry {
  package: string;
  /** True when an `upgrade` floor is already met, or the entry is `none`. */
  satisfied: boolean;
}

/**
 * Date this table was last checked against upstream releases. Surfaced in the
 * report so a stale table is visible rather than silently trusted.
 */
export const ADVICE_LAST_REVIEWED = "2026-09-07";

export const EXACT_ADVICE: Record<string, AdviceEntry> = {
  // --- CAMERA & MEDIA ---
  "react-native-camera": {
    kind: "replace",
    replacement: "react-native-vision-camera / expo-camera",
    reason: "Deprecated and unmaintained; superseded by vision-camera.",
  },
  "react-native-image-picker": {
    kind: "upgrade",
    minVersion: "7.0.0",
    reason: "v7+ ships Codegen specs for TurboModules.",
  },
  "react-native-image-crop-picker": {
    kind: "upgrade",
    minVersion: "0.51.0",
    reason: "v0.51+ includes Codegen specs for the New Architecture.",
  },
  "react-native-image-resizer": {
    kind: "replace",
    replacement: "@bam.tech/react-native-image-resizer / expo-image-manipulator",
    reason: "The original package is unmaintained; the fork is the maintained line.",
  },
  "react-native-video": {
    kind: "upgrade",
    minVersion: "6.0.0",
    reason: "v6+ provides Fabric and TurboModule implementations.",
  },
  "react-native-sound": {
    kind: "replace",
    replacement: "expo-audio / react-native-track-player",
    reason: "Unmaintained; no TurboModule implementation.",
  },
  "react-native-sound-player": {
    kind: "replace",
    replacement: "expo-audio / react-native-track-player",
    reason: "Legacy bridge audio player with no Codegen specs.",
  },
  "react-native-audio-recorder-player": {
    kind: "replace",
    replacement: "expo-audio / react-native-track-player",
    reason: "Legacy bridge event emitters; no TurboModule implementation.",
  },
  "react-native-track-player": {
    kind: "upgrade",
    minVersion: "4.0.0",
    reason: "v4+ supports TurboModules.",
  },
  "react-native-tts": {
    kind: "upgrade",
    minVersion: "4.0.0",
    reason: "v4+ adds New Architecture support; expo-speech is an alternative.",
  },
  "@react-native-voice/voice": {
    kind: "upgrade",
    minVersion: "3.2.0",
    reason: "v3.2+ adds New Architecture support.",
  },
  "react-native-pdf": {
    kind: "upgrade",
    minVersion: "6.7.0",
    reason: "v6.7+ adds Fabric view support.",
  },

  // --- STORAGE & DATABASE ---
  "@react-native-community/async-storage": {
    kind: "replace",
    replacement: "@react-native-async-storage/async-storage / react-native-mmkv",
    reason: "Deprecated namespace; the package moved to a new scope.",
  },
  "react-native-sqlite-storage": {
    kind: "replace",
    replacement: "op-sqlite / expo-sqlite",
    reason: "Legacy bridge; op-sqlite and expo-sqlite use native JSI bindings.",
  },
  realm: {
    kind: "upgrade",
    minVersion: "12.0.0",
    reason: "v12+ is built on native C++ JSI bindings.",
  },
  "@nozbe/watermelondb": {
    kind: "upgrade",
    minVersion: "0.27.0",
    reason: "v0.27+ ships the JSI SQLite adapter.",
  },
  "@react-native-cookies/cookies": {
    kind: "upgrade",
    minVersion: "6.0.0",
    reason: "v6+ includes TurboModule specs.",
  },
  "react-native-keychain": {
    kind: "upgrade",
    minVersion: "10.0.0",
    reason: "v10+ provides Codegen and TurboModule support.",
  },

  // --- FILE SYSTEM ---
  "react-native-fs": {
    kind: "replace",
    replacement: "@dr.pogodin/react-native-fs / expo-file-system",
    reason: "The original package is unmaintained; the fork is the maintained line.",
  },
  "react-native-fetch-blob": {
    kind: "replace",
    replacement: "react-native-blob-util / expo-file-system",
    reason: "Deprecated and unmaintained.",
  },
  "react-native-zip-archive": {
    kind: "upgrade",
    minVersion: "7.0.0",
    reason: "v7+ supports the New Architecture.",
  },

  // --- NOTIFICATIONS & MESSAGING ---
  "react-native-push-notification": {
    kind: "replace",
    replacement: "expo-notifications / @notifee/react-native",
    reason: "Unmaintained; no TurboModule implementation.",
  },
  "@notifee/react-native": {
    kind: "replace",
    replacement: "expo-notifications",
    reason: "Legacy bridge event emitters; check Notifee releases for New Arch status.",
  },

  // --- DEVICE, SENSORS & SYSTEM ---
  "react-native-device-info": {
    kind: "upgrade",
    minVersion: "14.0.0",
    reason: "v14+ adds TurboModule support; expo-device is an alternative.",
  },
  "react-native-get-location": {
    kind: "replace",
    replacement: "expo-location / react-native-geolocation-service",
    reason: "Legacy bridge location listener.",
  },
  "react-native-geolocation-service": {
    kind: "upgrade",
    minVersion: "5.3.0",
    reason: "v5.3+ supports TurboModules.",
  },
  "react-native-orientation": {
    kind: "replace",
    replacement: "react-native-orientation-locker / expo-screen-orientation",
    reason: "Unmaintained.",
  },
  "react-native-orientation-locker": {
    kind: "replace",
    replacement: "expo-screen-orientation",
    reason: "Legacy bridge orientation listener.",
  },
  "react-native-sensors": {
    kind: "replace",
    replacement: "expo-sensors",
    reason: "Legacy bridge event emitters.",
  },
  "react-native-haptic-feedback": {
    kind: "upgrade",
    minVersion: "2.0.0",
    reason: "v2+ adds TurboModule support; expo-haptics is an alternative.",
  },
  "react-native-contacts": {
    kind: "upgrade",
    minVersion: "7.0.0",
    reason: "v7+ adds New Architecture support.",
  },
  "react-native-ble-plx": {
    kind: "upgrade",
    minVersion: "3.0.0",
    reason: "v3+ adds TurboModule support.",
  },
  "react-native-ble-manager": {
    kind: "upgrade",
    minVersion: "11.0.0",
    reason: "v11+ adds New Architecture support.",
  },
  "react-native-nfc-manager": {
    kind: "upgrade",
    minVersion: "3.14.0",
    reason: "v3.14+ adds TurboModule compatibility.",
  },
  "react-native-torch": {
    kind: "replace",
    replacement: "expo-camera / react-native-vision-camera",
    reason: "Legacy bridge torch module.",
  },
  "react-native-network-info": {
    kind: "replace",
    replacement: "@react-native-community/netinfo / expo-network",
    reason: "Superseded by @react-native-community/netinfo.",
  },
  "react-native-battery": {
    kind: "replace",
    replacement: "expo-battery / expo-device",
    reason: "Legacy bridge battery module.",
  },
  "react-native-background-timer": {
    kind: "replace",
    replacement: "react-native-background-actions / expo-task-manager",
    reason: "Legacy bridge background timers.",
  },

  // --- UI, ANIMATION & STYLING ---
  "react-native-fast-image": {
    kind: "replace",
    replacement: "expo-image / @d11/react-native-fast-image",
    reason: "The original package is unmaintained; the fork is the maintained line.",
  },
  "react-native-linear-gradient": {
    kind: "replace",
    replacement: "expo-linear-gradient / @shopify/react-native-skia",
    reason: "Older releases have no Fabric component descriptors.",
  },
  "react-native-blur": {
    kind: "replace",
    replacement: "@react-native-community/blur / @shopify/react-native-skia",
    reason: "Moved to the community scope; older releases lack Fabric descriptors.",
  },
  "react-native-snackbar": {
    kind: "replace",
    replacement: "react-native-toast-message / react-native-paper",
    reason: "Legacy bridge module; a JS implementation avoids native code entirely.",
  },
  "react-native-simple-toast": {
    kind: "replace",
    replacement: "react-native-toast-message",
    reason: "Legacy bridge module; a JS implementation avoids native code entirely.",
  },
  "react-native-snap-carousel": {
    kind: "replace",
    replacement: "react-native-reanimated-carousel",
    reason: "Unmaintained.",
  },
  "react-native-swiper": {
    kind: "replace",
    replacement: "react-native-pager-view / react-native-reanimated-carousel",
    reason: "Unmaintained.",
  },
  "react-native-vector-icons": {
    kind: "upgrade",
    minVersion: "10.0.0",
    reason: "v10+ adds New Architecture support.",
  },
  "lottie-react-native": {
    kind: "upgrade",
    minVersion: "7.0.0",
    reason: "v7+ supports Fabric and TurboModules.",
  },
  "react-native-maps": {
    kind: "upgrade",
    minVersion: "1.20.0",
    reason: "v1.20+ adds Fabric support.",
  },
  "react-native-splash-screen": {
    kind: "replace",
    replacement: "react-native-bootsplash / expo-splash-screen",
    reason: "Unmaintained; no New Architecture support.",
  },
  "react-native-bootsplash": {
    kind: "upgrade",
    minVersion: "6.0.0",
    reason: "v6+ adds full New Architecture and Fabric support.",
  },

  // --- APP UPDATES, IN-APP PURCHASES & AUTH ---
  "react-native-version-check": {
    kind: "replace",
    replacement: "expo-application / a plain JS registry lookup",
    reason: "Legacy bridge device info; trivially replaced in JS.",
  },
  "react-native-code-push": {
    kind: "upgrade",
    minVersion: "8.2.0",
    reason: "v8.2+ supports the New Architecture; expo-updates is an alternative.",
  },
  "react-native-iap": {
    kind: "upgrade",
    minVersion: "12.0.0",
    reason: "v12+ supports TurboModules.",
  },
  "react-native-in-app-review": {
    kind: "upgrade",
    minVersion: "4.0.0",
    reason: "v4+ includes TurboModule specs.",
  },
  "react-native-app-auth": {
    kind: "upgrade",
    minVersion: "7.0.0",
    reason: "v7+ supports the New Architecture.",
  },
  "react-native-config": {
    kind: "upgrade",
    minVersion: "1.5.3",
    reason: "v1.5.3+ supports TurboModules and Codegen.",
  },
  "react-native-google-mobile-ads": {
    kind: "upgrade",
    minVersion: "14.0.0",
    reason: "v14+ supports the New Architecture and TurboModules.",
  },

  // --- THIRD-PARTY SDKs ---
  "@zoom/meetingsdk-react-native": {
    kind: "none",
    reason:
      "Heavyweight native SDK with no Codegen specs; runs through the interop layer. Check the Zoom changelog for a native New Arch release.",
  },
  "posthog-react-native-session-replay": {
    kind: "replace",
    replacement: "posthog-react-native",
    reason: "Session replay moved into the main PostHog React Native SDK.",
  },
  "@segment/analytics-react-native": {
    kind: "upgrade",
    minVersion: "2.18.0",
    reason: "v2.18+ includes TurboModule support.",
  },
  "@sentry/react-native": {
    kind: "upgrade",
    minVersion: "6.0.0",
    reason: "v6+ includes Codegen and TurboModule support.",
  },

  // --- TOOLING & UTILITIES (no action needed) ---
  detox: {
    kind: "none",
    reason: "End-to-end test runner; does not affect app runtime architecture.",
  },
  "react-native-qrcode-svg": {
    kind: "none",
    reason: "Pure JS SVG wrapper; compatibility follows react-native-svg.",
  },
  "expo-updates": {
    kind: "none",
    reason: "Supports the New Architecture on modern Expo SDKs.",
  },
};

export const PREFIX_ADVICE: { prefix: string; entry: AdviceEntry }[] = [
  {
    prefix: "@react-native-firebase/",
    entry: {
      kind: "upgrade",
      minVersion: "21.6.0",
      reason: "New Architecture support landed in v21.6.",
    },
  },
];

function lookup(pkgName: string): AdviceEntry | undefined {
  const exact = EXACT_ADVICE[pkgName];
  if (exact) return exact;

  for (const rule of PREFIX_ADVICE) {
    if (pkgName.startsWith(rule.prefix)) return rule.entry;
  }

  return undefined;
}

/**
 * Resolve advice for a package against its installed version.
 *
 * `satisfied` advice is still returned so machine-readable output can show that
 * the check ran; the human report suppresses it.
 */
export function getAdvice(pkgName: string, installedVersion?: string | null): Advice | undefined {
  const entry = lookup(pkgName);
  if (!entry) return undefined;

  const satisfied =
    entry.kind === "none" ||
    (entry.kind === "upgrade" &&
      entry.minVersion !== undefined &&
      satisfiesMinimum(installedVersion, entry.minVersion));

  return { ...entry, package: pkgName, satisfied };
}

/** One-line summary for display. */
export function formatAdvice(advice: Advice): string {
  if (advice.kind === "replace") return `Replace with ${advice.replacement}`;
  if (advice.kind === "upgrade") return `Upgrade to v${advice.minVersion} or later`;
  return "No action needed";
}
