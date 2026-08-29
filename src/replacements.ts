export interface ReplacementInfo {
  replacement: string;
  reason: string;
}

export const REPLACEMENTS_DB: Record<string, ReplacementInfo> = {
  // --- CAMERA & MEDIA ---
  "react-native-camera": {
    replacement: "react-native-vision-camera / expo-camera",
    reason: "Deprecated; crashes in Bridgeless mode.",
  },
  "react-native-image-picker": {
    replacement: "react-native-image-picker (v7+) / expo-image-picker",
    reason: "Ensure v7+ for full TurboModule & Fabric support.",
  },
  "react-native-image-crop-picker": {
    replacement: "react-native-image-crop-picker (v0.51+) / expo-image-picker",
    reason: "v0.51+ includes Codegen specs for New Architecture.",
  },
  "react-native-image-resizer": {
    replacement: "@bam.tech/react-native-image-resizer / expo-image-manipulator",
    reason: "The original package is unmaintained on New Arch.",
  },
  "react-native-video": {
    replacement: "react-native-video (v6+) / expo-video",
    reason: "Ensure using v6+ for full New Architecture Fabric/TurboModule support.",
  },
  "react-native-sound": {
    replacement: "expo-av / react-native-sound-player / react-native-track-player",
    reason: "Unmaintained library; does not implement TurboModule specs.",
  },
  "react-native-sound-player": {
    replacement: "expo-av / react-native-track-player",
    reason: "Legacy bridge audio player.",
  },
  "react-native-audio-recorder-player": {
    replacement: "expo-av / react-native-sound-player",
    reason: "Uses legacy bridge event emitters; consider Expo AV or modern audio libraries.",
  },
  "react-native-track-player": {
    replacement: "react-native-track-player (v4+)",
    reason: "v4+ supports TurboModules and modern React Native architecture.",
  },
  "react-native-tts": {
    replacement: "expo-speech / react-native-tts (v4+)",
    reason: "Legacy TTS bridge; expo-speech provides full cross-platform compatibility.",
  },
  "@react-native-voice/voice": {
    replacement: "@react-native-voice/voice (v3.2+) / expo-speech",
    reason: "Ensure using v3.2+ for New Architecture support.",
  },
  "react-native-pdf": {
    replacement: "react-native-pdf (v6.7+) / expo-document-picker",
    reason: "Ensure v6.7+ with Fabric view support.",
  },

  // --- STORAGE & DATABASE ---
  "@react-native-community/async-storage": {
    replacement: "react-native-mmkv / @react-native-async-storage/async-storage",
    reason: "Deprecated namespace; migrate to MMKV (JSI) for best performance.",
  },
  "react-native-sqlite-storage": {
    replacement: "op-sqlite / expo-sqlite",
    reason: "Old native bridge; op-sqlite and expo-sqlite offer native JSI bindings.",
  },
  "realm": {
    replacement: "realm (v12+)",
    reason: "Realm v12+ is built directly with native C++ JSI bindings.",
  },
  "@nozbe/watermelondb": {
    replacement: "@nozbe/watermelondb (v0.27+)",
    reason: "Ensure v0.27+ with JSI SQLite adapter enabled.",
  },
  "@react-native-cookies/cookies": {
    replacement: "@react-native-cookies/cookies (v6+)",
    reason: "v6+ includes TurboModule specs.",
  },
  "react-native-keychain": {
    replacement: "react-native-keychain (v10+) / expo-secure-store",
    reason: "v10+ provides full Codegen and TurboModule support.",
  },

  // --- FILE SYSTEM ---
  "react-native-fs": {
    replacement: "@dr.pogodin/react-native-fs / expo-file-system",
    reason: "The original react-native-fs is unmaintained on New Arch.",
  },
  "react-native-fetch-blob": {
    replacement: "react-native-blob-util / expo-file-system",
    reason: "Deprecated and unmaintained; migrate to react-native-blob-util.",
  },
  "react-native-zip-archive": {
    replacement: "react-native-zip-archive (v7+) / expo-file-system",
    reason: "v7+ supports New Architecture.",
  },

  // --- NOTIFICATIONS & MESSAGING ---
  "react-native-push-notification": {
    replacement: "expo-notifications / @notifee/react-native",
    reason: "Unmaintained; incompatible with New Architecture & Bridgeless mode.",
  },
  "@notifee/react-native": {
    replacement: "expo-notifications / check latest Notifee release",
    reason: "Legacy event bridge emitter; check latest releases for New Arch support.",
  },

  // --- DEVICE, SENSORS & SYSTEM ---
  "react-native-device-info": {
    replacement: "expo-device / react-native-device-info (v14+)",
    reason: "Synchronous legacy bridge methods; use expo-device or async getters.",
  },
  "react-native-get-location": {
    replacement: "expo-location / react-native-geolocation-service",
    reason: "Legacy bridge location listener; migrate to modern location API.",
  },
  "react-native-geolocation-service": {
    replacement: "expo-location / react-native-geolocation-service (v5.3+)",
    reason: "v5.3+ supports TurboModules.",
  },
  "react-native-orientation": {
    replacement: "react-native-orientation-locker / expo-screen-orientation",
    reason: "Unmaintained; replace with orientation-locker or expo-screen-orientation.",
  },
  "react-native-orientation-locker": {
    replacement: "expo-screen-orientation",
    reason: "Legacy bridge orientation listener.",
  },
  "react-native-sensors": {
    replacement: "expo-sensors",
    reason: "Legacy event bridge; expo-sensors has full modern architecture support.",
  },
  "react-native-haptic-feedback": {
    replacement: "expo-haptics / react-native-haptic-feedback (v2+)",
    reason: "expo-haptics or v2+ provides TurboModule support.",
  },
  "react-native-contacts": {
    replacement: "expo-contacts / react-native-contacts (v7+)",
    reason: "Ensure v7+ for modern architecture compatibility.",
  },
  "react-native-ble-plx": {
    replacement: "react-native-ble-plx (v3+)",
    reason: "Ensure v3+ with TurboModule support.",
  },
  "react-native-ble-manager": {
    replacement: "react-native-ble-manager (v11+) / react-native-ble-plx",
    reason: "Ensure v11+ for New Architecture support.",
  },
  "react-native-nfc-manager": {
    replacement: "react-native-nfc-manager (v3.14+)",
    reason: "v3.14+ includes TurboModule compatibility.",
  },
  "react-native-torch": {
    replacement: "expo-camera / react-native-vision-camera",
    reason: "Legacy bridge torch module.",
  },
  "react-native-network-info": {
    replacement: "@react-native-community/netinfo / expo-network",
    reason: "Migrate to @react-native-community/netinfo (v11+).",
  },
  "react-native-battery": {
    replacement: "expo-battery / expo-device",
    reason: "Legacy battery bridge.",
  },
  "react-native-background-timer": {
    replacement: "react-native-background-actions / expo-task-manager",
    reason: "Uses legacy background bridge timers.",
  },

  // --- UI, ANIMATION & STYLING ---
  "react-native-fast-image": {
    replacement: "expo-image / @d11/react-native-fast-image",
    reason: "Original fast-image is unmaintained; use expo-image or @d11/react-native-fast-image.",
  },
  "react-native-linear-gradient": {
    replacement: "expo-linear-gradient / @shopify/react-native-skia",
    reason: "Lacks native Fabric component descriptors in older builds.",
  },
  "react-native-blur": {
    replacement: "@react-native-community/blur (v4.4+) / @shopify/react-native-skia",
    reason: "Older versions lack Fabric view descriptors.",
  },
  "react-native-snackbar": {
    replacement: "react-native-toast-message / react-native-paper",
    reason: "Legacy bridge snackbar; JS toast message provides better cross-platform support.",
  },
  "react-native-simple-toast": {
    replacement: "react-native-toast-message / expo-notifications",
    reason: "Pure JS toast libraries avoid native bridge overhead.",
  },
  "react-native-snap-carousel": {
    replacement: "react-native-reanimated-carousel",
    reason: "Unmaintained; reanimated-carousel offers high performance with Fabric.",
  },
  "react-native-swiper": {
    replacement: "react-native-pager-view / react-native-reanimated-carousel",
    reason: "Unmaintained legacy swiper component.",
  },
  "react-native-vector-icons": {
    replacement: "@expo/vector-icons / react-native-vector-icons (v10+)",
    reason: "Ensure v10+ for New Architecture support.",
  },
  "lottie-react-native": {
    replacement: "lottie-react-native (v7+)",
    reason: "v7+ supports Fabric & TurboModules.",
  },
  "react-native-maps": {
    replacement: "react-native-maps (v1.20+) / @rnmapbox/maps",
    reason: "Upgrade to v1.20+ with Fabric support or enable Interop layer.",
  },
  "react-native-splash-screen": {
    replacement: "react-native-bootsplash (v6+) / expo-splash-screen",
    reason: "react-native-splash-screen is unmaintained and incompatible with New Arch.",
  },
  "react-native-bootsplash": {
    replacement: "react-native-bootsplash (v6+)",
    reason: "Ensure v6+ for full New Architecture & Fabric support.",
  },

  // --- APP UPDATES, IN-APP PURCHASES & AUTH ---
  "react-native-version-check": {
    replacement: "react-native-version-check-expo / pure JS lookup",
    reason: "Relies on legacy bridge for device info; easy to replace with JS fetch.",
  },
  "react-native-code-push": {
    replacement: "expo-updates / react-native-code-push (v8.2+)",
    reason: "Ensure v8.2+ or migrate to modern OTA updates.",
  },
  "react-native-iap": {
    replacement: "react-native-iap (v12+) / react-native-purchases (RevenueCat)",
    reason: "v12+ supports TurboModules.",
  },
  "react-native-in-app-review": {
    replacement: "expo-store-review / react-native-in-app-review (v4+)",
    reason: "v4+ includes TurboModule specs.",
  },
  "react-native-app-auth": {
    replacement: "expo-auth-session / react-native-app-auth (v7+)",
    reason: "v7+ supports modern React Native architectures.",
  },
  "react-native-config": {
    replacement: "react-native-config (v1.5.3+) / expo-constants",
    reason: "Ensure using v1.5.3+ which supports TurboModules & Codegen.",
  },
  "react-native-google-mobile-ads": {
    replacement: "react-native-google-mobile-ads (v14+)",
    reason: "v14+ supports New Architecture & TurboModules.",
  },

  // --- THIRD-PARTY SDKs ---
  "@zoom/meetingsdk-react-native": {
    replacement: "Check Zoom SDK changelog / Interop layer",
    reason: "Heavyweight native SDK requiring legacy bridge or Interop layer.",
  },
  "posthog-react-native-session-replay": {
    replacement: "posthog-react-native (v3+) / check posthog docs",
    reason: "Update to latest PostHog React Native SDK.",
  },
  "@segment/analytics-react-native": {
    replacement: "@segment/analytics-react-native (v2.18+)",
    reason: "v2.18+ includes TurboModule support.",
  },

  // --- TOOLING & UTILITIES (Non-blocking) ---
  "detox": {
    replacement: "None needed (Test Runner)",
    reason: "E2E testing tool; does not affect app runtime New Arch compatibility.",
  },
  "react-native-qrcode-svg": {
    replacement: "None needed (Ready via react-native-svg)",
    reason: "Pure JS SVG wrapper; compatibility depends on react-native-svg.",
  },
  "expo-updates": {
    replacement: "Compatible on Expo SDK 51+",
    reason: "OTA updates module; supports New Arch on modern Expo SDK.",
  },
};

export function getSuggestion(pkgName: string): ReplacementInfo | undefined {
  if (REPLACEMENTS_DB[pkgName]) {
    return REPLACEMENTS_DB[pkgName];
  }

  // Handle Firebase modules
  if (pkgName.startsWith("@react-native-firebase/")) {
    return {
      replacement: "Upgrade @react-native-firebase to v21.6+ or v22+",
      reason: "New Architecture support is included in recent RN Firebase releases.",
    };
  }

  // Handle Sentry
  if (pkgName === "@sentry/react-native") {
    return {
      replacement: "@sentry/react-native (v6+)",
      reason: "v6+ includes Codegen and TurboModule support.",
    };
  }

  return undefined;
}

