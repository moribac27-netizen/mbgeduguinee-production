/** Attend que toutes les images de la page (logo, cachet, signature, photos) soient chargées, puis ouvre l'impression. */
export async function printWhenReady(maxWaitMs = 5000): Promise<void> {
  if (typeof document === "undefined") return;
  const pending = Array.from(document.images).filter((i) => !i.complete || i.naturalWidth === 0);
  if (pending.length) {
    await Promise.race([
      Promise.all(
        pending.map((i) =>
          i.decode
            ? i.decode().catch(() => undefined)
            : new Promise((r) => { i.onload = i.onerror = () => r(undefined); }),
        ),
      ),
      new Promise((r) => setTimeout(r, maxWaitMs)),
    ]);
  }
  window.print();
}
