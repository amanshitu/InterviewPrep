import { useCallback, useEffect, useState } from "react";

// Generic replacement for the repeated "read a value from localStorage,
// fall back to a default, write back on change, wrapped in try/catch
// since localStorage can throw in private browsing" pattern that app.js
// hand-rolled separately for theme, accent, answer font size, and
// read-aloud prefs. `serialize`/`deserialize` default to plain strings
// (matching e.g. THEME_KEY's raw "light"/"dark"/"system" values); pass
// JSON.stringify/JSON.parse for object-shaped preferences (matching e.g.
// READ_ALOUD_PREFS_KEY's `{voiceURI, rate, pitch, keepScreenOn}` shape).
export function usePersistedPreference<T>(
  key: string,
  defaultValue: T,
  options?: { serialize?: (value: T) => string; deserialize?: (raw: string) => T },
): [T, (value: T) => void] {
  const serialize = options?.serialize ?? ((v: T) => String(v));
  const deserialize = options?.deserialize ?? ((raw: string) => raw as unknown as T);

  const read = useCallback((): T => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? defaultValue : deserialize(raw);
    } catch {
      // localStorage unavailable (private window, blocked, etc.) — fall
      // back to the default rather than throwing.
      return defaultValue;
    }
    // defaultValue/deserialize are expected to be referentially stable
    // enough for a one-shot initial read; re-created values just mean a
    // cheap re-read, not incorrect behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const [value, setValue] = useState<T>(read);

  // If `key` itself changes, re-read for the new key.
  useEffect(() => {
    setValue(read());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, serialize(next));
      } catch {
        // best-effort — localStorage unavailable
      }
    },
    [key, serialize],
  );

  return [value, set];
}
