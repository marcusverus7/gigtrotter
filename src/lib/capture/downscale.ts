/**
 * Shrink a phone photo in the browser before it is uploaded.
 *
 * A current iPhone hands "Take photo" or a camera-roll pick over as a 3–8MB
 * JPEG (iOS transcodes HEIC to full-size JPEG). Three limits sit under that
 * on the way to the model: Vercel rejects a request body over 4.5MB with an
 * HTML 413 before the route runs (the dropzone then showed "Couldn't read
 * this one", which is wrong), Anthropic refuses images over 5MB, and our own
 * route caps at 8MB — so the 4.5–8MB band was accepted, encrypted, stored,
 * counted against the daily quota and THEN rejected by the model.
 *
 * A ticket is legible at 2000px on the long edge; that lands at 300–600KB,
 * uploads in a second on 4G and roughly halves the vision call. Screenshots
 * are already small and pass through untouched. Anything the browser cannot
 * decode (an exotic format) falls back to the original bytes, and the
 * server-side limits still apply.
 */

const MAX_EDGE = 2000;
const SKIP_BELOW_BYTES = 1_200_000;
const QUALITY = 0.85;

export async function downscaleForUpload(file: File): Promise<File> {
  if (typeof window === "undefined") return file;
  if (file.size < SKIP_BELOW_BYTES && file.type !== "image/heic" && file.type !== "image/heif") {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 4_000_000 && file.type !== "image/heic") {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}
