import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Upload, Save, ImageIcon, Loader2 } from "lucide-react";
import { getCurrentAcademicYear } from "@/lib/academic-year";

export const Route = createFileRoute("/_authenticated/parametres")({
  head: () => ({ meta: [{ title: "Paramètres — MBGEduGuinée" }] }),
  component: SettingsPage,
});

type AssetKind = "logo" | "signature" | "stamp";
const KIND_TO_COL: Record<AssetKind, "logo_url" | "director_signature_url" | "school_stamp_url"> = {
  logo: "logo_url",
  signature: "director_signature_url",
  stamp: "school_stamp_url",
};
const ALLOWED = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml"];
const MAX_SIZE = 5 * 1024 * 1024;

function SettingsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const { data: school } = useQuery({
    queryKey: ["my-school"],
    queryFn: async () => {
      const { data: sid } = await supabase.rpc("current_school_id");
      if (!sid) return null;
      const { data } = await supabase.from("schools").select("*").eq("id", sid as any).maybeSingle();
      return data;
    },
  });

  useEffect(() => { if (school) setForm(school); }, [school]);

  async function save() {
    if (!form?.id) return;
    setSaving(true);
    const { id, created_at, updated_at, ...patch } = form;
    const { error } = await supabase.from("schools").update(patch).eq("id", id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Paramètres enregistrés");
    qc.invalidateQueries({ queryKey: ["my-school"] });
  }

  if (!form) return <div className="p-8 text-muted-foreground">Chargement…</div>;

  const set = (k: string, v: any) => setForm({ ...form, [k]: v });
  const bs = form.bulletin_settings ?? {};
  const rs = form.receipt_settings ?? {};
  const setBS = (k: string, v: any) => set("bulletin_settings", { ...bs, [k]: v });
  const setRS = (k: string, v: any) => set("receipt_settings", { ...rs, [k]: v });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Paramètres de l'école</h1>
          <p className="text-muted-foreground mt-1">Personnalisez l'identité et les documents de votre établissement.</p>
        </div>
        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Enregistrer
        </Button>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="general">Général</TabsTrigger>
          <TabsTrigger value="identity">Identité visuelle</TabsTrigger>
          <TabsTrigger value="academic">Année scolaire</TabsTrigger>
          <TabsTrigger value="theme">Thème</TabsTrigger>
          <TabsTrigger value="bulletins">Bulletins</TabsTrigger>
          <TabsTrigger value="receipts">Reçus</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <Card><CardHeader><CardTitle>Informations de l'établissement</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <Field label="Nom de l'établissement"><Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} /></Field>
              <Field label="Code"><Input value={form.code ?? ""} onChange={(e) => set("code", e.target.value)} /></Field>
              <Field label="Devise"><Input value={form.currency ?? "GNF"} onChange={(e) => set("currency", e.target.value.toUpperCase())} maxLength={5} /></Field>
              <Field label="Directeur"><Input value={form.director_name ?? ""} onChange={(e) => set("director_name", e.target.value)} /></Field>
              <Field label="Téléphone"><Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Field>
              <Field label="Email"><Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} /></Field>
              <Field label="Site web"><Input value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} placeholder="https://…" /></Field>
              <Field label="Adresse" full><Textarea rows={2} value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} /></Field>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="identity" className="mt-4">
          <div className="grid md:grid-cols-3 gap-4">
            <AssetUploader kind="logo" schoolId={form.id} url={form.logo_url} label="Logo de l'école" onDone={(url) => set("logo_url", url)} />
            <AssetUploader kind="signature" schoolId={form.id} url={form.director_signature_url} label="Signature du directeur" onDone={(url) => set("director_signature_url", url)} />
            <AssetUploader kind="stamp" schoolId={form.id} url={form.school_stamp_url} label="Cachet de l'établissement" onDone={(url) => set("school_stamp_url", url)} />
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            PNG, JPG ou SVG — 5 Mo maximum. Ces images seront utilisées sur les bulletins, reçus et documents PDF générés.
          </p>
        </TabsContent>

        <TabsContent value="academic" className="mt-4">
          <Card><CardHeader><CardTitle>Année et périodes</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <Field label="Année scolaire en cours"><Input value={getCurrentAcademicYear()} readOnly aria-readonly="true" /><p className="text-xs text-muted-foreground mt-1">Calculée automatiquement selon la date en Guinée (rentrée le 1er septembre). Les données des années précédentes restent conservées.</p></Field>
              <Field label="Système de périodes">
                <Select value={form.period_system ?? "trimester"} onValueChange={(v) => set("period_system", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trimester">Trimestres (T1, T2, T3)</SelectItem>
                    <SelectItem value="semester">Semestres (S1, S2)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="theme" className="mt-4">
          <Card><CardHeader><CardTitle>Couleurs du thème</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <Field label="Couleur primaire">
                <div className="flex gap-2">
                  <Input type="color" className="w-16 p-1 h-10" value={form.theme_primary ?? "#8B4513"} onChange={(e) => set("theme_primary", e.target.value)} />
                  <Input value={form.theme_primary ?? ""} onChange={(e) => set("theme_primary", e.target.value)} placeholder="#8B4513" />
                </div>
              </Field>
              <Field label="Couleur secondaire">
                <div className="flex gap-2">
                  <Input type="color" className="w-16 p-1 h-10" value={form.theme_secondary ?? "#DAA520"} onChange={(e) => set("theme_secondary", e.target.value)} />
                  <Input value={form.theme_secondary ?? ""} onChange={(e) => set("theme_secondary", e.target.value)} placeholder="#DAA520" />
                </div>
              </Field>
              <p className="text-xs text-muted-foreground md:col-span-2">Appliquées sur les documents imprimés (bulletins, reçus).</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bulletins" className="mt-4">
          <Card><CardHeader><CardTitle>Informations affichées sur les bulletins</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <ToggleRow label="Afficher le logo" checked={bs.show_logo !== false} onChange={(v) => setBS("show_logo", v)} />
              <ToggleRow label="Afficher la signature du directeur" checked={bs.show_signature !== false} onChange={(v) => setBS("show_signature", v)} />
              <ToggleRow label="Afficher le cachet" checked={bs.show_stamp !== false} onChange={(v) => setBS("show_stamp", v)} />
              <ToggleRow label="Afficher le rang de l'élève" checked={bs.show_rank !== false} onChange={(v) => setBS("show_rank", v)} />
              <ToggleRow label="Afficher les appréciations" checked={bs.show_appreciations !== false} onChange={(v) => setBS("show_appreciations", v)} />
              <ToggleRow label="Afficher les absences" checked={bs.show_attendance === true} onChange={(v) => setBS("show_attendance", v)} />
              <Field label="Mention en pied de bulletin"><Input value={bs.footer_note ?? ""} onChange={(e) => setBS("footer_note", e.target.value)} placeholder="Travail — Justice — Solidarité" /></Field>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="receipts" className="mt-4">
          <Card><CardHeader><CardTitle>Informations affichées sur les reçus</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <ToggleRow label="Afficher le logo" checked={rs.show_logo !== false} onChange={(v) => setRS("show_logo", v)} />
              <ToggleRow label="Afficher le cachet" checked={rs.show_stamp !== false} onChange={(v) => setRS("show_stamp", v)} />
              <ToggleRow label="Afficher la signature" checked={rs.show_signature === true} onChange={(v) => setRS("show_signature", v)} />
              <ToggleRow label="Afficher l'adresse de l'école" checked={rs.show_address !== false} onChange={(v) => setRS("show_address", v)} />
              <Field label="Mention en pied de reçu"><Input value={rs.footer_note ?? ""} onChange={(e) => setRS("footer_note", e.target.value)} placeholder="Merci de votre confiance" /></Field>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2 space-y-1.5" : "space-y-1.5"}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between border rounded-lg px-4 py-2.5">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function AssetUploader({ kind, schoolId, url, label, onDone }: {
  kind: AssetKind; schoolId: string; url?: string | null; label: string;
  onDone: (url: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [signed, setSigned] = useState<string | null>(null);

  const currentPath = useMemo(() => {
    if (!url) return null;
    // stored as bucket path like "{schoolId}/logo.png"
    return url.startsWith("http") ? null : url;
  }, [url]);

  useEffect(() => {
    let cancelled = false;
    async function loadSigned() {
      if (!currentPath) { setSigned(null); return; }
      const { data } = await supabase.storage.from("school-assets").createSignedUrl(currentPath, 3600);
      if (!cancelled) setSigned(data?.signedUrl ?? null);
    }
    loadSigned();
    return () => { cancelled = true; };
  }, [currentPath]);

  function pickFile(f: File | null) {
    if (!f) return;
    if (!ALLOWED.includes(f.type)) return toast.error("Format non autorisé (PNG, JPG, SVG)");
    if (f.size > MAX_SIZE) return toast.error("Fichier trop volumineux (max 5 Mo)");
    setPending(f);
    setPreview(URL.createObjectURL(f));
  }

  async function upload() {
    if (!pending || !schoolId) return;
    setUploading(true);
    try {
      // Remove previous file if it exists in bucket
      if (currentPath) {
        await supabase.storage.from("school-assets").remove([currentPath]);
      }
      const ext = pending.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${schoolId}/${kind}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("school-assets").upload(path, pending, {
        contentType: pending.type,
        upsert: true,
      });
      if (error) throw error;
      // Persist path in schools row
      const patch: any = { [KIND_TO_COL[kind]]: path };
      const { error: upErr } = await supabase.from("schools").update(patch).eq("id", schoolId);
      if (upErr) throw upErr;
      onDone(path);
      setPending(null);
      setPreview(null);
      toast.success("Fichier téléversé");
    } catch (e: any) {
      toast.error(e.message ?? "Erreur d'upload");
    } finally {
      setUploading(false);
    }
  }

  const displayed = preview ?? signed;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{label}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="aspect-square rounded-lg border-2 border-dashed bg-muted/30 flex items-center justify-center overflow-hidden">
          {displayed ? (
            <img src={displayed} alt={label} className="max-h-full max-w-full object-contain p-2" />
          ) : (
            <div className="text-muted-foreground text-center text-xs">
              <ImageIcon className="size-8 mx-auto mb-1 opacity-40" />
              Aucun fichier
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 gap-2" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> Choisir
          </Button>
          {pending && (
            <Button size="sm" className="flex-1 gap-2" onClick={upload} disabled={uploading}>
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Téléverser
            </Button>
          )}
        </div>
        {pending && <p className="text-xs text-muted-foreground truncate">{pending.name}</p>}
      </CardContent>
    </Card>
  );
}
