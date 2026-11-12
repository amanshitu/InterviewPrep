import { exportProgress } from "../../api/account";
import { useToast } from "../../hooks/use-toast";
import { SecondaryButton, SectionCard } from "./SectionCard";
import { DownloadIcon } from "./icons";

function downloadBlob(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function DataExportSection() {
  const toast = useToast();

  async function handleExport() {
    try {
      const blob = await exportProgress();
      const text = await blob.text();
      const parsed = JSON.parse(text) as { exportedAt?: string };
      const dateSuffix = (parsed.exportedAt || new Date().toISOString()).slice(0, 10);
      downloadBlob(`interview-prep-progress-${dateSuffix}.json`, JSON.stringify(parsed, null, 2), "application/json");
      toast.success("Progress exported.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't export your progress.");
    }
  }

  return (
    <SectionCard title="Export data" subtitle="Download your progress as a JSON file.">
      <SecondaryButton onClick={() => void handleExport()}>
        <DownloadIcon /> Export my progress (JSON)
      </SecondaryButton>
    </SectionCard>
  );
}
