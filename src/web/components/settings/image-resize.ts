// Verbatim port of settings.js's resizeImageToDataUrl: client-side resize
// keeps the uploaded picture small (well under the server's
// MAX_AVATAR_DATA_URL_LENGTH backstop) without needing any file storage —
// the data URL is stored directly in the users table.
export function resizeImageToDataUrl(file: File, maxDim = 256, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That doesn't look like a valid image."));
      img.onload = () => {
        const cropSize = Math.min(img.width, img.height);
        const sx = (img.width - cropSize) / 2;
        const sy = (img.height - cropSize) / 2;
        const outSize = Math.min(maxDim, cropSize);
        const canvas = document.createElement("canvas");
        canvas.width = outSize;
        canvas.height = outSize;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not process that image."));
          return;
        }
        ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, outSize, outSize);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
