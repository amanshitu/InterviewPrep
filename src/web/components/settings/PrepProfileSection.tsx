import { useState } from "react";
import { updateProfile } from "../../api/account";
import type { User } from "../../api/types";
import { ErrorText, PrimaryButton, SectionCard, SuccessText, inputClass } from "./SectionCard";
import { SaveIcon } from "./icons";
import { canonicalTz, timezoneSelectOptions } from "./timezones";

export function PrepProfileSection({ user, onUserChange }: { user: User; onUserChange: (user: User) => void }) {
  const [track, setTrack] = useState(user.track ?? "");
  const [headline, setHeadline] = useState(user.headline ?? "");
  const [years, setYears] = useState(user.yearsExperience != null ? String(user.yearsExperience) : "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [timezone, setTimezone] = useState(user.timezone || "UTC");
  const [quota, setQuota] = useState(String(user.dailyQuota));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const tzOptions = timezoneSelectOptions(user.timezone || "UTC");
  const canonicalCurrent = canonicalTz(timezone);

  async function handleSave() {
    setError(null);
    setSuccess(false);
    const dailyQuota = parseInt(quota, 10) || 10;
    const yearsExperience = years.trim() === "" ? null : parseInt(years, 10);
    try {
      const { user: updated } = await updateProfile({
        track: track.trim(),
        dailyQuota,
        headline: headline.trim(),
        bio: bio.trim(),
        yearsExperience,
        timezone: timezone.trim() || "UTC",
      });
      onUserChange(updated);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your profile.");
    }
  }

  return (
    <SectionCard
      title="Prep profile"
      subtitle="What you're preparing for, your background, and how many questions you want per day. The background fields are optional but help personalize your Stats coaching insight."
    >
      <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
        <span>What are you preparing for?</span>
        <input className={inputClass()} value={track} onChange={(e) => setTrack(e.target.value)} placeholder="e.g. Engineering Management" />
      </label>
      <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
        <span>Current role (optional)</span>
        <input className={inputClass()} value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="e.g. Senior Backend Engineer" />
      </label>
      <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
        <span>Years of experience (optional)</span>
        <input className={inputClass()} type="number" min={0} max={60} value={years} onChange={(e) => setYears(e.target.value)} />
      </label>
      <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
        <span>Short bio (optional)</span>
        <textarea className={inputClass()} rows={3} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="A sentence or two about your background and goals." />
      </label>
      <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
        <span>Timezone</span>
        <select className={inputClass()} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {tzOptions.map((o) => (
            <option key={o.tz} value={o.tz} selected={canonicalTz(o.tz) === canonicalCurrent}>
              {o.label}
            </option>
          ))}
        </select>
        <small className="font-normal">Used so your daily quota, test, and AI usage reset at your own midnight, not UTC. Auto-detected at signup — change it if you're traveling.</small>
      </label>
      <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
        <span>Questions per day</span>
        <input className={inputClass()} type="number" min={5} max={50} value={quota} onChange={(e) => setQuota(e.target.value)} />
      </label>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {success ? <SuccessText>Saved.</SuccessText> : null}
      <PrimaryButton onClick={() => void handleSave()}>
        <SaveIcon /> Save profile
      </PrimaryButton>
    </SectionCard>
  );
}
