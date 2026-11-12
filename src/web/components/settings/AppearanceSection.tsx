import { useEffect, useState } from "react";
import { useReadAloud } from "../../hooks/use-read-aloud";
import { SpeakerIcon, StopIcon } from "./icons";
import { SectionCard } from "./SectionCard";
import { ACCENT_OPTIONS, ANSWER_FONT_SIZES, getAccent, getAnswerFontSize, setAccent, setAnswerFontSize } from "./appearance-prefs";

// NOTE (flagged gap, not a bug): the accent swatches below set
// `data-accent` + persist the choice exactly like the old app did, but
// the new MealSathi-token globals.css doesn't yet define `[data-accent="X"]`
// recoloring rules (only the base saffron-terracotta palette was ported in
// the theme phase) — so picking a non-default accent here currently has no
// visible effect until that CSS is added in a follow-up pass. The control
// is wired correctly and will "just work" once those rules exist.
function AccentCard() {
  const [current, setCurrent] = useState(getAccent());
  return (
    <SectionCard title="Accent color" subtitle="Changes the app's main interactive color (buttons, progress bars, highlights). Saved to this browser.">
      <div className="flex flex-wrap gap-2">
        {ACCENT_OPTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            title={a.label}
            onClick={() => {
              setAccent(a.id);
              setCurrent(a.id);
            }}
            className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium ${
              current === a.id ? "border-primary bg-muted text-foreground" : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            <span className="h-3.5 w-3.5 rounded-full" style={{ background: a.swatch }} />
            {a.label}
          </button>
        ))}
      </div>
    </SectionCard>
  );
}

function AnswerFontSizeCard() {
  const [current, setCurrent] = useState(getAnswerFontSize());
  useEffect(() => {
    setAnswerFontSize(current);
  }, []);
  const labels = [
    { size: "small", label: "Small" },
    { size: "medium", label: "Medium" },
    { size: "large", label: "Large" },
    { size: "xlarge", label: "Extra large" },
  ];
  return (
    <SectionCard title="Answer text size" subtitle="Controls how large revealed answers appear on Today's questions, Daily Review, and anywhere else an answer is shown. Saved to this browser.">
      <div className="flex flex-wrap gap-2">
        {labels.map((opt) => (
          <button
            key={opt.size}
            type="button"
            onClick={() => {
              setAnswerFontSize(opt.size);
              setCurrent(opt.size);
            }}
            style={{ fontSize: ANSWER_FONT_SIZES[opt.size] }}
            className={`rounded-md border px-3 py-1.5 font-medium ${
              current === opt.size ? "border-primary bg-muted text-foreground" : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </SectionCard>
  );
}

function ReadAloudCard() {
  const { isSpeaking, speakingId, toggle, prefs, setPrefs, isSpeechSupported, isWakeLockSupported, getVoiceOptions } = useReadAloud();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (!isSpeechSupported()) return;
    const update = () => setVoices(getVoiceOptions());
    update();
    window.speechSynthesis.onvoiceschanged = update;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isSpeechSupported()) return null;
  const previewing = speakingId === "__preview__";

  return (
    <SectionCard title="Read aloud" subtitle="Controls the “Read aloud” button on Today's questions. Saved to this browser — voice options depend on your device and OS.">
      <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
        <span>Voice</span>
        <select
          className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          value={prefs.voiceURI}
          onChange={(e) => setPrefs({ voiceURI: e.target.value })}
        >
          <option value="">Browser default</option>
          {voices.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name} ({v.lang})
            </option>
          ))}
        </select>
        <small className="font-normal">
          Don't see the accent you want? Most OSes let you add more voices — e.g. on Windows, Settings → Time &amp; Language → Speech → Add voices.
        </small>
      </label>

      <div className="mb-3 flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">Speed: <strong className="text-foreground">{prefs.rate.toFixed(2)}x</strong></span>
        <input type="range" min={0.5} max={1.5} step={0.05} value={prefs.rate} onChange={(e) => setPrefs({ rate: parseFloat(e.target.value) })} />
      </div>

      <div className="mb-3 flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">Pitch: <strong className="text-foreground">{prefs.pitch.toFixed(1)}</strong></span>
        <input type="range" min={0} max={2} step={0.1} value={prefs.pitch} onChange={(e) => setPrefs({ pitch: parseFloat(e.target.value) })} />
      </div>

      <button
        type="button"
        onClick={() => toggle("__preview__", "This is a preview of the read aloud voice, speed, and pitch you've selected.")}
        className="mb-4 inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-muted"
      >
        {previewing ? <StopIcon /> : <SpeakerIcon />} {previewing ? "Stop preview" : "Preview voice"}
      </button>

      <label className="flex items-center gap-2 text-sm font-medium text-foreground">
        <input
          type="checkbox"
          checked={prefs.keepScreenOn}
          disabled={!isWakeLockSupported()}
          onChange={(e) => setPrefs({ keepScreenOn: e.target.checked })}
        />
        Keep screen on while reading
      </label>
      <small className="mt-1 block text-muted-foreground">
        {isWakeLockSupported()
          ? 'Reading can otherwise be cut off when your screen locks. Turning this on keeps the screen awake for as long as "Read aloud" is active — off by default since it uses more battery.'
          : "Not supported on this browser."}
      </small>
      {isSpeaking && !previewing ? <p className="mt-2 text-xs text-muted-foreground">Currently reading a question aloud elsewhere.</p> : null}
    </SectionCard>
  );
}

export function AppearanceSection() {
  return (
    <div className="flex flex-col gap-4">
      <AccentCard />
      <AnswerFontSizeCard />
      <ReadAloudCard />
    </div>
  );
}
