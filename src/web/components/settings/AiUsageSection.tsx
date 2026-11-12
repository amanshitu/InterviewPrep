import { useEffect, useState } from "react";
import { updateProfile } from "../../api/account";
import type { User } from "../../api/types";
import { getAiUsage } from "../../api/stats";
import { getSelfTestQuota, type SelfTestQuota } from "../../api/selftest";
import { useToast } from "../../hooks/use-toast";
import { PrimaryButton, SectionCard, inputClass } from "./SectionCard";
import { SaveIcon } from "./icons";

const AI_PROVIDER_LABELS: Record<string, string> = { "workers-ai": "Workers AI (free, default)", openai: "OpenAI", anthropic: "Anthropic" };

// Must match the server-side allowlist (WORKERS_AI_MODELS in
// src/worker/lib/ai.js) — a request naming a model outside this list falls
// back to the default there regardless, but keeping the two in sync avoids
// a confusing mismatch between what's shown here and what's actually used.
const WORKERS_AI_MODEL_OPTIONS = [
  { id: "@cf/meta/llama-3.1-8b-instruct-fp8", label: "Llama 3.1 8B (default)" },
  { id: "@cf/meta/llama-3.2-3b-instruct", label: "Llama 3.2 3B (smaller, faster)" },
  { id: "@cf/mistral/mistral-7b-instruct-v0.2-lora", label: "Mistral 7B" },
  { id: "@cf/google/gemma-2b-it-lora", label: "Gemma 2B (fastest)" },
  { id: "@cf/zai-org/glm-4.7-flash", label: "GLM 4.7 Flash" },
  { id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", label: "Llama 3.3 70B (higher quality, costs more of your daily cap)" },
];

function AiProviderCard({ user, onUserChange }: { user: User; onUserChange: (user: User) => void }) {
  const toast = useToast();
  const provider = user.aiProvider || "workers-ai";
  const [selectedProvider, setSelectedProvider] = useState(provider);
  const [model, setModel] = useState(user.workersAiModel);
  const [apiKey, setApiKey] = useState("");
  const [usageLine, setUsageLine] = useState("Checking today's AI usage…");

  useEffect(() => {
    getAiUsage()
      .then((data) => {
        setUsageLine(
          data.unlimited ? "Today's usage: unlimited (using your own key)." : `Today's shared AI usage: ${data.used}/${data.cap} generations.`,
        );
      })
      .catch(() => setUsageLine(""));
  }, []);

  async function handleSave() {
    const body: Parameters<typeof updateProfile>[0] = { aiProvider: selectedProvider as "workers-ai" | "openai" | "anthropic", workersAiModel: model };
    if (selectedProvider === "workers-ai") {
      body.aiApiKey = "";
    } else if (apiKey.trim()) {
      body.aiApiKey = apiKey.trim();
    }
    try {
      const { user: updated } = await updateProfile(body);
      onUserChange(updated);
      toast.success("AI provider saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save your AI provider.");
    }
  }

  return (
    <SectionCard
      title="AI provider"
      subtitle="Used to generate the daily multiple-choice test and your Stats coaching insight. Defaults to our built-in AI (shared, capped per day) — set your own key for unlimited use."
    >
      <p className="mb-1 text-sm text-muted-foreground">
        Currently using: <strong className="text-foreground">{AI_PROVIDER_LABELS[provider] || provider}</strong>
        {user.hasAiKey ? " (your key)" : ""}
      </p>
      {usageLine ? <p className="mb-3 text-sm text-muted-foreground">{usageLine}</p> : null}

      <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
        <span>Provider</span>
        <select className={inputClass()} value={selectedProvider} onChange={(e) => setSelectedProvider(e.target.value)}>
          <option value="workers-ai">Workers AI (free, default)</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
        </select>
      </label>

      {selectedProvider === "workers-ai" ? (
        <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
          <span>Workers AI model</span>
          <select className={inputClass()} value={model} onChange={(e) => setModel(e.target.value)}>
            {WORKERS_AI_MODEL_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <small className="font-normal">If generation seems to be failing (falling back to generic distractors/insights), try a different model here.</small>
        </label>
      ) : (
        <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
          <span>API key</span>
          <input
            className={inputClass()}
            type="password"
            autoComplete="off"
            placeholder={user.hasAiKey ? "Already set — enter a new key to replace it" : "sk-..."}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </label>
      )}

      <PrimaryButton onClick={() => void handleSave()}>
        <SaveIcon /> Save AI provider
      </PrimaryButton>
    </SectionCard>
  );
}

function SelfTestQuotaCard() {
  const [quota, setQuota] = useState<SelfTestQuota | null>(null);

  useEffect(() => {
    getSelfTestQuota()
      .then(setQuota)
      .catch(() => setQuota(null));
  }, []);

  const line = !quota
    ? ""
    : quota.unlimited
      ? "Unlimited — using your own AI key."
      : `${quota.used.toLocaleString()} / ${(quota.quota ?? 0).toLocaleString()} tokens used today (${quota.remaining.toLocaleString()} left).`;
  const pct = quota && !quota.unlimited && quota.quota ? Math.min(100, Math.round((quota.used / quota.quota) * 100)) : 0;

  return (
    <SectionCard
      title="Self Test AI usage"
      subtitle="Each time you analyze a practice answer in Self Test, it spends from this daily budget — a rough token estimate, not an exact count. Resets at your own midnight; set your own AI key above for unlimited use."
    >
      <p className="mb-2 text-sm text-muted-foreground">{line || "Checking today's usage…"}</p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </SectionCard>
  );
}

export function AiUsageSection({ user, onUserChange }: { user: User; onUserChange: (user: User) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <AiProviderCard user={user} onUserChange={onUserChange} />
      <SelfTestQuotaCard />
    </div>
  );
}
