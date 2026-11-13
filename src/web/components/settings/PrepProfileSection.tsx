import { useState } from "react";
import { updateProfile } from "../../api/account";
import type { User } from "../../api/types";
import { useToast } from "../../hooks/use-toast";
import { PrimaryButton, SectionCard, inputClass } from "./SectionCard";
import { SaveIcon } from "./icons";
import { canonicalTz, timezoneSelectOptions } from "./timezones";

const QUOTA_MIN = 5;
const QUOTA_MAX = 50;
const YEARS_MIN = 0;
const YEARS_MAX = 60;

export function PrepProfileSection({ user, onUserChange }: { user: User; onUserChange: (user: User) => void }) {
  const toast = useToast();
  const [track, setTrack] = useState(user.track ?? "");
  const [headline, setHeadline] = useState(user.headline ?? "");
  const [years, setYears] = useState(user.yearsExperience != null ? String(user.yearsExperience) : "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [timezone, setTimezone] = useState(user.timezone || "UTC");
  const [quota, setQuota] = useState(String(user.dailyQuota));
  const [saving, setSaving] = useState(false);

  const tzOptions = timezoneSelectOptions(user.timezone || "UTC");
  const canonicalCurrent = canonicalTz(timezone);

  async function handleSave() {
    const dailyQuota = parseInt(quota, 10);
    if (!Number.isFinite(dailyQuota) || dailyQuota < QUOTA_MIN || dailyQuota > QUOTA_MAX) {
      toast.error(`Questions per day must be between ${QUOTA_MIN} and ${QUOTA_MAX}.`);
      return;
    }
    let yearsExperience: number | null = null;
    if (years.trim() !== "") {
      const parsedYears = parseInt(years, 10);
      if (!Number.isFinite(parsedYears) || parsedYears < YEARS_MIN || parsedYears > YEARS_MAX) {
        toast.error(`Years of experience must be between ${YEARS_MIN} and ${YEARS_MAX}.`);
        return;
      }
      yearsExperience = parsedYears;
    }
    setSaving(true);
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
      toast.success("Profile saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save your profile.");
    } finally {
      setSaving(false);
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
      <PrimaryButton onClick={() => void handleSave()} loading={saving} loadingText="Saving…">
        <SaveIcon /> Save profile
      </PrimaryButton>
    </SectionCard>
  );
}
