import { useEffect, useState } from "react";

// navigator.onLine only reflects whether the device has *a* network
// interface up, not whether the API is actually reachable — same
// limitation every browser has here. Good enough to drive "you're
// offline" messaging and disable actions that need the server; a genuine
// request failure while this still reports true just surfaces as its
// own error toast, same as ever.
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}
