import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useIsClassScoped, useScopedClassOptions } from "@/hooks/useOptions";

export const Route = createFileRoute("/_authenticated/annonces")({
  head: () => ({ meta: [{ title: "Annonces — MBGEduGuinée" }] }),
  component: AnnouncementsPage,
});

function AnnouncementsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", audience: "all", class_id: "" });
  const scoped = useIsClassScoped();
  const { classes } = useScopedClassOptions();

  const { data: items = [] } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => (await supabase.from("announcements").select("*, profiles(full_name)").order("created_at", { ascending: false })).data ?? [],
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (scoped && !form.class_id) return toast.error("Choisissez la classe concernée.");
    const { class_id, ...rest } = form;
    const { error } = await supabase.from("announcements").insert({ ...rest, class_id: class_id || null, author_id: user?.id } as any);
    if (error) return toast.error(error.message);
    toast.success("Annonce publiée");
    setOpen(false);
    setForm({ title: "", content: "", audience: "all", class_id: "" });
    qc.invalidateQueries({ queryKey: ["announcements"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Annonces</h1>
          <p className="text-muted-foreground mt-1">Communiquez avec les parents, enseignants et élèves.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="gap-2"><Plus className="size-4" />Nouvelle annonce</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Publier une annonce</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div><Label>Titre</Label><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div>
                <Label>Destinataires</Label>
                <Select value={form.audience} onValueChange={(v) => setForm({ ...form, audience: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tout le monde</SelectItem>
                    <SelectItem value="parents">Parents</SelectItem>
                    <SelectItem value="enseignants">Enseignants</SelectItem>
                    <SelectItem value="eleves">Élèves</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{scoped ? "Classe concernée" : "Classe (facultatif — vide = toute l'école)"}</Label>
                <Select value={form.class_id || "none"} onValueChange={(v) => setForm({ ...form, class_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {!scoped && <SelectItem value="none">Toute l'école</SelectItem>}
                    {classes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Contenu</Label><Textarea required rows={5} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></div>
              <DialogFooter><Button type="submit">Publier</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {items.length === 0 && (
          <Card><CardContent className="p-12 text-center text-muted-foreground"><Megaphone className="size-12 mx-auto mb-3 opacity-30" />Aucune annonce pour le moment.</CardContent></Card>
        )}
        {items.map((a: any) => (
          <Card key={a.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-display text-lg font-semibold">{a.title}</h3>
                    <Badge variant="outline" className="capitalize">{a.audience}</Badge>
                    {a.class_id && <Badge variant="secondary">{classes.find((c: any) => c.id === a.class_id)?.name ?? "Classe"}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mb-3">
                    Par {a.profiles?.full_name ?? "Administration"} · {new Date(a.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{a.content}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
