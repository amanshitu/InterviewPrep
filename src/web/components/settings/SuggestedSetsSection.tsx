import { useEffect, useState } from "react";
import { getSuggestedSets, subscribeToSet, type SuggestedQuestionSet } from "../../api/queue";
import { useToast } from "../../hooks/use-toast";
import { PlusIcon } from "./icons";
import { ErrorText, SectionCard } from "./SectionCard";

// Suggestions are scoped server-side to the user's active category
// (getSuggestedSets() reads activeCategoryId from the session), so this
// takes it as a prop purely to refetch when it changes — passing it as a
// value, not reading it via a hook, keeps this component from needing to
// know about the shell at all.
export function SuggestedSetsSection({ activeCategoryId }: { activeCategoryId: string | null }) {
  const toast = useToast();
  const [sets, setSets] = useState<SuggestedQuestionSet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [subscribingId, setSubscribingId] = useState<string | null>(null);

  useEffect(() => {
    getSuggestedSets()
      .then((data) => setSets(data.sets))
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load suggested sets."));
  }, [refreshKey, activeCategoryId]);

  async function handleSubscribe(id: string) {
    setSubscribingId(id);
    try {
      await subscribeToSet(id);
      toast.success("Subscribed — it'll start showing up in your daily queue.");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't subscribe to that set.");
    } finally {
      setSubscribingId(null);
    }
  }

  return (
    <SectionCard title="Suggested sets" subtitle="Question sets other users have shared, approved by an admin. Subscribing adds them to your daily rotation.">
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!error && !sets ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!error && sets && sets.length === 0 ? <p className="text-sm text-muted-foreground">No shared sets available to subscribe to right now.</p> : null}
      {sets && sets.length > 0 ? (
        <div className="flex flex-col gap-2">
          {sets.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3">
              <span className="text-sm font-medium text-foreground">
                {s.title}
                {s.track ? <span className="text-muted-foreground"> ({s.track})</span> : null}
              </span>
              <span className="text-sm text-muted-foreground">by {s.owner_name || "someone"}</span>
              <button
                type="button"
                disabled={subscribingId === s.id}
                onClick={() => void handleSubscribe(s.id)}
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <PlusIcon width={13} height={13} /> {subscribingId === s.id ? "Subscribing…" : "Subscribe"}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </SectionCard>
  );
}
