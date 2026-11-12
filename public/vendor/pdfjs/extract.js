// Thin wrapper around the vendored pdf.js build (Mozilla, Apache-2.0 — see
// ./LICENSE) — lazy-loaded only when a user actually browses for a PDF
// resume, so it never touches the app's normal page bundle. Text-layer
// extraction only, no rendering. Returns "" (never throws) on a PDF pdf.js
// can't extract usable text from — e.g. a scanned/image-only resume — so
// the caller can fall back to asking the user to paste the text manually.
let pdfjsLibPromise = null;

function loadPdfjs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import("./pdf.min.mjs").then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = new URL("./pdf.worker.min.mjs", import.meta.url).href;
      return mod;
    });
  }
  return pdfjsLibPromise;
}

export async function extractPdfText(arrayBuffer) {
  try {
    const pdfjsLib = await loadPdfjs();
    const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pageTexts = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pageTexts.push(content.items.map((item) => item.str).join(" "));
    }
    return pageTexts.join("\n\n").trim();
  } catch {
    return "";
  }
}
