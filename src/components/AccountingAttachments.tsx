import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Paperclip, Upload, Trash2, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import { compressImage } from "@/lib/image-compress";

const db = supabase as any;
export type AttachmentKind = "revenue" | "expense" | "transfer";
const MAX_BYTES = 5 * 1024 * 1024;

/** Nombre de pièces jointes par écriture (clé « kind:id »). */
export function useAttachmentCounts() {
  const { data } = useQuery({
    queryKey: ["acc", "attachment-counts"],
    queryFn: async () => {
      const { data, error } = await db.from("accounting_attachments").select("kind, entry_id").limit(5000);
      if (error) throw error;
      const m = new Map<string, number>();
      for (const r of (data ?? []) as any[]) m.set(`${r.kind}:${r.entry_id}`, (m.get(`${r.kind}:${r.entry_id}`) ?? 0) + 1);
      return m;
    },
    staleTime: 30_000,
  });
  return data ?? new Map<string, number>();
}

const safeName = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80) || "fichier";
const sizeLabel = (b?: number | null) => (b == null ? "" : b > 1048576 ? `${(b / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`);

/** Bouton trombone : liste, ajoute et retire les justificatifs d'une écriture. */
export function AttachmentsButton({ kind, entryId, count }: { kind: AttachmentKind; entryId: string; count: number }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  return (
    <>
      <Button size="sm" variant="ghost" className="gap-1" onClick={() => setOpen(true)} title="Pièces jointes">
        <Paperclip className="size-3.5" />{count > 0 ? count : ""}
      </Button>
      {open && <AttachmentsDialog kind={kind} entryId={entryId} onClose={() => { setOpen(false); void qc.invalidateQueries({ queryKey: ["acc", "attachment-counts"] }); }} />}
    </>
  );
}

function AttachmentsDialog({ kind, entryId, onClose }: { kind: AttachmentKind; entryId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const list = useQuery({
    queryKey: ["acc", "attachments", kind, entryId],
    queryFn: async () => {
      const { data, error } = await db.from("accounting_attachments").select("*").eq("kind", kind).eq("entry_id", entryId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["acc", "attachments", kind, entryId] });

  async function upload(input: File | undefined) {
    if (!input) return;
    const isPdf = input.type === "application/pdf";
    if (!isPdf && !input.type.startsWith("image/")) return void toast.error("Ajoutez un PDF ou une photo (JPG, PNG).");
    setBusy(true);
    try {
      const file = isPdf ? input : await compressImage(input, 1600, 0.85);
      if (file.size > MAX_BYTES) throw new Error("Fichier trop volumineux (5 Mo maximum).");
      const { data: sid } = await supabase.rpc("current_school_id");
      if (!sid) throw new Error("École non identifiée");
      const path = `${sid}/${kind}/${entryId}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const up = await supabase.storage.from("accounting-attachments").upload(path, file, { contentType: file.type });
      if (up.error) throw up.error;
      const ins = await db.from("accounting_attachments").insert({ kind, entry_id: entryId, storage_path: path, file_name: input.name.slice(0, 120), mime_type: file.type, size_bytes: file.size });
      if (ins.error) { await supabase.storage.from("accounting-attachments").remove([path]).catch(() => {}); throw ins.error; }
      toast.success("Pièce jointe ajoutée.");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Échec de l'envoi");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function open(a: any) {
    const { data, error } = await supabase.storage.from("accounting-attachments").createSignedUrl(a.storage_path, 300);
    if (error || !data?.signedUrl) return void toast.error("Ouverture impossible.");
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function remove(a: any) {
    if (!confirm(`Retirer « ${a.file_name} » ?`)) return;
    setBusy(true);
    const del = await db.from("accounting_attachments").delete().eq("id", a.id).select("id");
    if (del.error || !(del.data ?? []).length) {
      setBusy(false);
      return void toast.error("Retrait impossible : la période est peut-être clôturée.");
    }
    await supabase.storage.from("accounting-attachments").remove([a.storage_path]).catch(() => {});
    setBusy(false);
    toast.success("Pièce jointe retirée.");
    refresh();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pièces jointes</DialogTitle>
          <DialogDescription>Facture, reçu ou justificatif (PDF ou photo, 5 Mo max). Visible uniquement par la direction et les finances.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {list.isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
          {!list.isLoading && (list.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Aucune pièce jointe.</p>}
          {(list.data ?? []).map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <button type="button" className="flex min-w-0 items-center gap-2 text-left hover:underline" onClick={() => void open(a)}>
                <FileText className="size-4 shrink-0" /><span className="truncate">{a.file_name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{sizeLabel(a.size_bytes)}</span>
              </button>
              <Button type="button" size="icon" variant="ghost" disabled={busy} onClick={() => void remove(a)}><Trash2 className="size-4 text-destructive" /></Button>
            </div>
          ))}
        </div>
        <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
        <Button type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}<span className="ml-2">Ajouter un fichier</span>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
