import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, { url: string; expires: number }>();

export function useSignedUrl(path: string | null | undefined, bucket = "school-assets") {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) { setUrl(null); return; }
    // If path is already a full URL, use directly.
    if (/^https?:\/\//i.test(path)) { setUrl(path); return; }
    const key = `${bucket}:${path}`;
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit.expires > now) { setUrl(hit.url); return; }
    let cancelled = false;
    supabase.storage.from(bucket).createSignedUrl(path, 3600).then(({ data }) => {
      if (cancelled) return;
      if (data?.signedUrl) {
        cache.set(key, { url: data.signedUrl, expires: now + 55 * 60 * 1000 });
        setUrl(data.signedUrl);
      } else {
        // Repli : le bucket des logos est public, l'URL publique fonctionne si la signature échoue.
        const pub = supabase.storage.from(bucket).getPublicUrl(path).data?.publicUrl;
        setUrl(pub ?? null);
      }
    });
    return () => { cancelled = true; };
  }, [path, bucket]);
  return url;
}
