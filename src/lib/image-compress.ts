/**
 * Réduit une photo (appareil photo ou galerie) avant envoi : côté max 1024 px, JPEG.
 * Une photo de téléphone pèse 3 à 12 Mo ; l'envoi échouait au-delà de 5 Mo. Convertit aussi HEIC → JPEG quand le navigateur sait le lire.
 * En cas d'échec de lecture, renvoie le fichier d'origine.
 */
export async function compressImage(file: File, maxSide = 1024, quality = 0.85): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob) return file;
    return new File([blob], (file.name.replace(/\.[^.]+$/, "") || "photo") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
