import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Camera, Upload, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { StudentPhoto } from "./StudentPhoto";
import { compressImage } from "@/lib/image-compress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw } from "lucide-react";

type Props = {
  value: string | null;
  onChange: (path: string | null) => void;
  schoolId: string | null | undefined;
  name?: string | null;
};

export function StudentPhotoUpload({ value, onChange, schoolId, name }: Props) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const [camOpen, setCamOpen] = useState(false);

  async function handleFile(input: File | null | undefined) {
    if (!input) return;
    if (!schoolId) return toast.error("École non identifiée");
    if (!input.type.startsWith("image/") && !/\.(heic|heif)$/i.test(input.name)) return toast.error("Merci de choisir une image");
    if (input.size > 30 * 1024 * 1024) return toast.error("Image trop volumineuse (max 30 Mo)");
    setBusy(true);
    try {
      const file = await compressImage(input);
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${schoolId}/students/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("school-assets")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      // Best-effort: remove old photo if it lives in our bucket path
      if (value && value.startsWith(`${schoolId}/students/`)) {
        await supabase.storage.from("school-assets").remove([value]).catch(() => {});
      }
      onChange(path);
      toast.success("Photo enregistrée");
    } catch (e: any) {
      toast.error(e?.message ?? "Échec de l'envoi");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!value) return;
    if (!confirm("Supprimer la photo ?")) return;
    setBusy(true);
    try {
      if (value.startsWith(`${schoolId}/students/`)) {
        await supabase.storage.from("school-assets").remove([value]).catch(() => {});
      }
      onChange(null);
      toast.success("Photo supprimée");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <StudentPhoto path={value} name={name} size="xl" />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => galleryRef.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            <span className="ml-2">Choisir une image</span>
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => (navigator.mediaDevices?.getUserMedia ? setCamOpen(true) : cameraRef.current?.click())} disabled={busy}>
            <Camera className="size-4" />
            <span className="ml-2">Prendre une photo</span>
          </Button>
          {value && (
            <Button type="button" size="sm" variant="ghost" onClick={handleRemove} disabled={busy}>
              <Trash2 className="size-4 text-destructive" />
              <span className="ml-2">Supprimer</span>
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">JPG, PNG — réduite automatiquement. Sécurisé et privé à votre école.</p>
      </div>
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
      />
      <CameraDialog
        open={camOpen}
        onClose={() => setCamOpen(false)}
        onCapture={(f) => { setCamOpen(false); void handleFile(f); }}
        onUnavailable={() => { setCamOpen(false); toast.info("Caméra indisponible dans le navigateur : utilisez l'appareil photo du téléphone."); cameraRef.current?.click(); }}
      />
    </div>
  );
}

/** Aperçu caméra en direct (webcam ou téléphone) avec bascule avant/arrière. */
function CameraDialog({ open, onClose, onCapture, onUnavailable }: { open: boolean; onClose: () => void; onCapture: (f: File) => void; onUnavailable: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setReady(false);
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) { v.srcObject = stream; await v.play().catch(() => {}); setReady(true); }
      } catch {
        if (!cancelled) onUnavailable();
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facing]);

  function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    c.toBlob((b) => { if (b) onCapture(new File([b], "photo.jpg", { type: "image/jpeg" })); }, "image/jpeg", 0.9);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Prendre une photo</DialogTitle></DialogHeader>
        <div className="relative overflow-hidden rounded-lg bg-black aspect-[4/3]">
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
          {!ready && <div className="absolute inset-0 flex items-center justify-center text-white"><Loader2 className="size-6 animate-spin" /></div>}
        </div>
        <div className="flex justify-between gap-2">
          <Button type="button" variant="outline" onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}><RefreshCw className="size-4" /><span className="ml-2">Changer de caméra</span></Button>
          <Button type="button" onClick={snap} disabled={!ready}><Camera className="size-4" /><span className="ml-2">Capturer</span></Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
