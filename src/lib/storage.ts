/**
 * @file storage.ts
 * @description Core data models and schema definitions for persistent Chrome local storage profile state.
 *
 * Architectural Overview:
 * 1. Unified State Schema (`SensaUserProfile`):
 *    - Consolidates global preferences (`hasSeenWelcome`, `activeMode`, `theme`), Visual Mode TTS settings, and Auditory Mode subtitle preferences into a single type-safe interface.
 *
 * 2. Zero-Config Defaults (`DEFAULT_PROFILE`):
 *    - Provides fallback initial state for clean installations or schema migrations.
 */

// Core TypeScript interface defining the persistent JSON profile structure stored in chrome.storage.local
export interface SensaUserProfile {
  globalSettings: {
    hasSeenWelcome: boolean;
    activeMode: "visual" | "auditory" | null;
    theme: "light" | "dark";
  };
  visualState: {
    ttsEnabled: boolean;
    readingSpeed: number;
  };
  auditoryState: {
    captionsEnabled: boolean;
    targetLanguage: string;
  };
}

// Default state configuration instantiated for first-time extension onboarding
export const DEFAULT_PROFILE: SensaUserProfile = {
  globalSettings: {
    hasSeenWelcome: false,
    activeMode: null,
    theme: "light", // Default is light mode
  },
  visualState: {
    ttsEnabled: false,
    readingSpeed: 1.0,
  },
  auditoryState: {
    captionsEnabled: false,
    targetLanguage: "en-US",
  },
};