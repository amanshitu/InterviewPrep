import { useRef, useState } from "react";
import { updateAccount } from "../../api/account";
import type { User } from "../../api/types";
import { useToast } from "../../hooks/use-toast";
import { CameraIcon, SaveIcon, TrashIcon } from "./icons";
import { PrimaryButton, SecondaryButton, SectionCard, inputClass } from "./SectionCard";
import { resizeImageToDataUrl } from "./image-resize";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso;
  }
}

export function AccountSection({ user, onUserChange }: { user: User; onUserChange: (user: User) => void }) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user.name);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [savingName, setSavingName] = useState(false);

  async function handleAvatarChange(file: File | undefined) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("That image is too large — please choose one under 8MB.");
      return;
    }
    setAvatarBusy(true);
    try {
      const avatarData = await resizeImageToDataUrl(file);
      const { user: updated } = await updateAccount({ name: user.name, avatarData });
      onUserChange(updated);
      toast.success("Profile picture updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update your picture.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleRemoveAvatar() {
    setAvatarBusy(true);
    try {
      const { user: updated } = await updateAccount({ name: user.name, avatarData: null });
      onUserChange(updated);
      toast.success("Profile picture removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove your picture.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleSaveName() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Please enter your name.");
      return;
    }
    setSavingName(true);
    try {
      const { user: updated } = await updateAccount({ name: trimmed });
      onUserChange(updated);
      toast.success("Name saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save your name.");
    } finally {
      setSavingName(false);
    }
  }

  return (
    <SectionCard title="Account" subtitle={`${user.email} · member since ${formatDate(user.createdAt)}`}>
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-xl font-bold text-primary-foreground">
          {user.avatarData ? <img src={user.avatarData} alt="" className="h-full w-full object-cover" /> : user.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void handleAvatarChange(file);
            }}
          />
          <SecondaryButton onClick={() => fileInputRef.current?.click()} disabled={avatarBusy} loading={avatarBusy} loadingText="Uploading…">
            <CameraIcon /> Change picture
          </SecondaryButton>
          {user.avatarData ? (
            <SecondaryButton onClick={() => void handleRemoveAvatar()} disabled={avatarBusy} loading={avatarBusy} loadingText="Removing…">
              <TrashIcon /> Remove
            </SecondaryButton>
          ) : null}
        </div>
      </div>

      <label className="mt-5 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
        <span>Display name</span>
        <input className={inputClass()} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <PrimaryButton className="mt-3" onClick={() => void handleSaveName()} loading={savingName} loadingText="Saving…">
        <SaveIcon /> Save name
      </PrimaryButton>
    </SectionCard>
  );
}
