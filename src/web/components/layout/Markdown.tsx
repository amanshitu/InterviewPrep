import type { ReactNode } from "react";

// Minimal, dependency-free Markdown rendering for answer/model-answer prose
// (revealed answers, Self Test's model answer, Stats' AI coaching insight,
// admin's question review). Deliberately supports only a small safe subset
// — **bold**, *italic*, `inline code`, paragraphs, and bullet/numbered
// lists — mapped to real React elements, never dangerouslySetInnerHTML:
// some of this text comes from other users' uploaded question sets, not
// just the shared curriculum or AI, so no HTML is ever interpreted.
// Exported for spots that need inline-only formatting (bold/italic/code,
// no paragraph/list wrapping) — e.g. a question rendered on the same line
// as its "Q1" label, where the block-level <Markdown> below doesn't fit.
export function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) nodes.push(<strong key={`${keyPrefix}-${i++}`}>{m[1]}</strong>);
    else if (m[2] !== undefined) nodes.push(<em key={`${keyPrefix}-${i++}`}>{m[2]}</em>);
    else if (m[3] !== undefined)
      nodes.push(
        <code key={`${keyPrefix}-${i++}`} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">
          {m[3]}
        </code>,
      );
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {blocks.map((block, bi) => {
        const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length === 0) return null;
        const isBulletList = lines.every((l) => /^[-*]\s+/.test(l));
        const isNumberedList = !isBulletList && lines.every((l) => /^\d+[.)]\s+/.test(l));

        if (isBulletList) {
          return (
            <ul key={bi} className="list-disc space-y-1 pl-5">
              {lines.map((l, li) => (
                <li key={li}>{renderInline(l.replace(/^[-*]\s+/, ""), `${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        }
        if (isNumberedList) {
          return (
            <ol key={bi} className="list-decimal space-y-1 pl-5">
              {lines.map((l, li) => (
                <li key={li}>{renderInline(l.replace(/^\d+[.)]\s+/, ""), `${bi}-${li}`)}</li>
              ))}
            </ol>
          );
        }
        return <p key={bi}>{renderInline(lines.join(" "), `${bi}`)}</p>;
      })}
    </div>
  );
}
