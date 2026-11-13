import { useCallback, useEffect, useState } from "react";
import { usePersistedPreference } from "./use-persisted-preference";

// Port of app.js's read-aloud infrastructure (Web Speech API + an optional
// Screen Wake Lock + a silent-audio/MediaSession background-keepalive
// hack). This is a faithful mechanical port, not a simplification — the
// wake-lock and keepalive pieces look unusual but both are intentional,
// real-device-tested workarounds (see the original comments in app.js)
// for mobile browsers suspending page JS (and speechSynthesis with it)
// once the screen locks or the tab is backgrounded.

export interface ReadAloudPrefs {
  voiceURI: string;
  rate: number;
  pitch: number;
  keepScreenOn: boolean;
}

const READ_ALOUD_PREFS_KEY = "readAloudPrefs";
const DEFAULT_READ_ALOUD_PREFS: ReadAloudPrefs = { voiceURI: "", rate: 0.95, pitch: 1, keepScreenOn: false };

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function isWakeLockSupported(): boolean {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

export function getVoiceOptions(): SpeechSynthesisVoice[] {
  return isSpeechSupported() ? window.speechSynthesis.getVoices() : [];
}

function readPrefs(): ReadAloudPrefs {
  try {
    const raw = localStorage.getItem(READ_ALOUD_PREFS_KEY);
    return raw ? { ...DEFAULT_READ_ALOUD_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_READ_ALOUD_PREFS };
  } catch {
    return { ...DEFAULT_READ_ALOUD_PREFS };
  }
}

function writePrefs(partial: Partial<ReadAloudPrefs>): ReadAloudPrefs {
  const merged = { ...readPrefs(), ...partial };
  try {
    localStorage.setItem(READ_ALOUD_PREFS_KEY, JSON.stringify(merged));
  } catch {
    // best-effort — localStorage unavailable (private window, blocked, etc.)
  }
  return merged;
}

// There is only ever one "thing being read aloud" app-wide, regardless of
// how many components use this hook — matching app.js's module-level
// `state.speakingId`/`wakeLock`/`keepAliveAudio` variables, this state
// lives outside any single hook instance and every instance subscribes to
// changes.
let currentSpeakingId: string | null = null;
let wakeLock: WakeLockSentinel | null = null;
let keepAliveAudio: HTMLAudioElement | null = null;
const speakingIdListeners = new Set<(id: string | null) => void>();

function setSpeakingId(id: string | null) {
  currentSpeakingId = id;
  speakingIdListeners.forEach((listener) => listener(id));
}

async function acquireWakeLock() {
  if (!isWakeLockSupported() || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => { wakeLock = null; });
  } catch {
    // best-effort — denied, unsupported context, battery saver, etc.
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => { /* already released */ });
    wakeLock = null;
  }
}

// Re-acquire the wake lock if the tab regains visibility mid-read with the
// preference still on — the browser force-releases it whenever the page
// is hidden, and the lock itself doesn't survive that on its own.
let visibilityListenerWired = false;
function wireVisibilityListenerOnce() {
  if (visibilityListenerWired || !isWakeLockSupported()) return;
  visibilityListenerWired = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && currentSpeakingId && readPrefs().keepScreenOn) {
      acquireWakeLock();
    }
  });
}

// Built at runtime as real PCM silence (not a hand-rolled base64 guess) —
// 1 second of 8kHz 8-bit mono silence, looped for as long as needed.
function getKeepAliveAudio(): HTMLAudioElement {
  if (keepAliveAudio) return keepAliveAudio;
  const sampleRate = 8000;
  const numSamples = sampleRate;
  const buffer = new ArrayBuffer(44 + numSamples);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + numSamples, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeStr(36, "data");
  view.setUint32(40, numSamples, true);
  for (let i = 0; i < numSamples; i++) view.setUint8(44 + i, 128); // 128 = silence at 8-bit PCM's midpoint
  const url = URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
  keepAliveAudio = new Audio(url);
  keepAliveAudio.loop = true;
  return keepAliveAudio;
}

function startBackgroundKeepAlive(title?: string) {
  getKeepAliveAudio().play().catch(() => { /* best-effort — autoplay restrictions, etc. */ });
  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: title || "Reading answer aloud", artist: "ExamStreak" });
      navigator.mediaSession.playbackState = "playing";
      navigator.mediaSession.setActionHandler("pause", stopSpeaking);
      navigator.mediaSession.setActionHandler("stop", stopSpeaking);
    } catch {
      // best-effort — not every browser supports every part of this
    }
  }
}

function stopBackgroundKeepAlive() {
  if (keepAliveAudio) {
    keepAliveAudio.pause();
    keepAliveAudio.currentTime = 0;
  }
  if ("mediaSession" in navigator) {
    try { navigator.mediaSession.playbackState = "none"; } catch { /* best-effort */ }
  }
}

export function stopSpeaking() {
  if (isSpeechSupported()) window.speechSynthesis.cancel();
  setSpeakingId(null);
  stopBackgroundKeepAlive();
  releaseWakeLock();
}

export function useReadAloud() {
  const [speakingId, setLocalSpeakingId] = useState<string | null>(currentSpeakingId);
  const [prefs, setPrefsState] = usePersistedPreference<ReadAloudPrefs>(
    READ_ALOUD_PREFS_KEY,
    DEFAULT_READ_ALOUD_PREFS,
    {
      serialize: (v) => JSON.stringify(v),
      deserialize: (raw) => ({ ...DEFAULT_READ_ALOUD_PREFS, ...JSON.parse(raw) }),
    },
  );

  useEffect(() => {
    wireVisibilityListenerOnce();
    speakingIdListeners.add(setLocalSpeakingId);
    return () => { speakingIdListeners.delete(setLocalSpeakingId); };
  }, []);

  // Starts reading `text` aloud for `id`, or stops if `id` is already
  // being read. Returns false if this browser has no speech synthesis
  // support at all (callers should hide/disable their read-aloud button
  // in that case, same as app.js's renderReadAloudButton did).
  const toggle = useCallback((id: string, text: string): boolean => {
    if (!isSpeechSupported()) return false;
    if (currentSpeakingId === id) {
      stopSpeaking();
      return true;
    }
    setSpeakingId(id);
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const current = readPrefs();
    utterance.rate = current.rate;
    utterance.pitch = current.pitch;
    if (current.voiceURI) {
      const voice = getVoiceOptions().find((v) => v.voiceURI === current.voiceURI);
      if (voice) utterance.voice = voice;
    }
    const finish = () => {
      if (currentSpeakingId === id) setSpeakingId(null);
      stopBackgroundKeepAlive();
      releaseWakeLock();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
    startBackgroundKeepAlive(text);
    if (current.keepScreenOn) acquireWakeLock();
    return true;
  }, []);

  const setPrefs = useCallback((partial: Partial<ReadAloudPrefs>) => {
    setPrefsState(writePrefs(partial));
  }, [setPrefsState]);

  return {
    speakingId,
    isSpeaking: speakingId !== null,
    toggle,
    stop: stopSpeaking,
    prefs,
    setPrefs,
    isSpeechSupported,
    isWakeLockSupported,
    getVoiceOptions,
  };
}
