import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listCollaborators, addCollaborator, updateCollaboratorRole, setCollaboratorActive,
} from "@/lib/collaborators.functions";
import { ASSIGNABLE_STAFF_ROLES } from "@/lib/staff-roles";
import { ROLE_LABELS, type AppRole } from "@/hooks/useAuth";
import { logActivity } from "@/lib/audit";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Users2, Copy } from "lucide-react";
import { toast } from "sonner";
import { fmtDateTime } from "@/lib/reports";

export const Route = createFileRoute("/_authenticated/collaborateurs")({
  head: () => ({ meta: [{ title: "Collaborateurs — MBGEduGuinée" }] }),
  component: Collaborateurs,
});

type Collaborator = {
  id: string; fullName: string; phone: string | null; email: string | null;
  roles: string[]; disabledAt: string | null; createdAt: string;
};

const roleLabel = (r: string) => ROLE_LABELS[r as AppRole] ?? r;

function Collaborateurs() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tempPasswordFor, setTempPasswordFor] = useState<{ email: string; password: string } | null>(null);

  const listFn = useServerFn(listCollaborators);
  const addFn = useServerFn(addCollaborator);
  const updateRoleFn = useServerFn(updateCollaboratorRole);
  const setActiveFn = useServerFn(setCollaboratorActive);

  const { data: collaborators = [], isLoading } = useQuery({
    queryKey: ["collaborators"],
    queryFn: async () => (await listFn()) as Collaborator[],
  });

  async function handleRoleChange(c: Collaborator, role: string) {
    try {
      await updateRoleFn({ data: { userId: c.id, role: role as AppRole } });
      toast.success("Rôle mis à jour");
      logActivity({
        action: "update", entity_type: "collaborator", entity_id: c.id,
        entity_label: c.fullName, metadata: { role },
      });
      qc.invalidateQueries({ queryKey: ["collaborators"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur lors de la mise à jour du rôle");
    }
  }

  async function handleToggleActive(c: Collaborator) {
    const nextActive = !!c.disabledAt; // si actuellement désactivé -> on réactive
    try {
      await setActiveFn({ data: { userId: c.id, active: nextActive } });
      toast.success(nextActive ? "Collaborateur réactivé" : "Collaborateur désactivé");
      logActivity({
        action: "update", entity_type: "collaborator", entity_id: c.id,
        entity_label: c.fullName, metadata: { active: nextActive },
      });
      qc.invalidateQueries({ queryKey: ["collaborators"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Users2 className="size-5" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold">Collaborateurs</h1>
            <p className="text-muted-foreground mt-1">{collaborators.length} membre(s) du personnel</p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="size-4" /> Ajouter un collaborateur</Button>
          </DialogTrigger>
          <AddCollaboratorDialog
            addFn={addFn}
            onDone={(result) => {
              setOpen(false);
              qc.invalidateQueries({ queryKey: ["collaborators"] });
              if (result.mode === "direct" && result.tempPassword) {
                setTempPasswordFor({ email: result.email, password: result.tempPassword });
              }
            }}
          />
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Chargement...</TableCell></TableRow>
                )}
                {!isLoading && collaborators.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Aucun collaborateur pour l'instant.</TableCell></TableRow>
                )}
                {collaborators.map((c) => {
                  const currentRole = c.roles.find((r) => r !== "admin" && r !== "directeur") ?? c.roles[0];
                  const isCoreDirection = c.roles.includes("admin") || c.roles.includes("directeur");
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.fullName}</TableCell>
                      <TableCell className="text-sm">{c.email ?? "—"}</TableCell>
                      <TableCell className="text-sm">{c.phone ?? "—"}</TableCell>
                      <TableCell>
                        {isCoreDirection ? (
                          <Badge variant="outline">{c.roles.map(roleLabel).join(", ")}</Badge>
                        ) : (
                          <Select value={currentRole} onValueChange={(v) => handleRoleChange(c, v)}>
                            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {ASSIGNABLE_STAFF_ROLES.map((r) => (
                                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={c.disabledAt ? "destructive" : "default"}>
                          {c.disabledAt ? `Désactivé le ${fmtDateTime(c.disabledAt)}` : "Actif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {!isCoreDirection && (
                          <Button
                            variant="outline" size="sm"
                            onClick={() => handleToggleActive(c)}
                          >
                            {c.disabledAt ? "Réactiver" : "Désactiver"}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!tempPasswordFor} onOpenChange={(v) => !v && setTempPasswordFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Mot de passe temporaire</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Communiquez ce mot de passe à <strong>{tempPasswordFor?.email}</strong> — il ne sera plus
            affiché après la fermeture de cette fenêtre. Il est recommandé d'en changer à la première connexion.
          </p>
          <div className="flex items-center gap-2 rounded-lg border bg-muted p-3">
            <code className="font-mono text-lg flex-1">{tempPasswordFor?.password}</code>
            <Button
              type="button" variant="ghost" size="icon"
              onClick={() => {
                if (tempPasswordFor) navigator.clipboard.writeText(tempPasswordFor.password);
                toast.success("Copié");
              }}
            >
              <Copy className="size-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setTempPasswordFor(null)}>J'ai noté le mot de passe</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddCollaboratorDialog({
  addFn, onDone,
}: {
  addFn: ReturnType<typeof useServerFn<typeof addCollaborator>>;
  onDone: (result: { mode: "invite" | "direct"; email: string; tempPassword?: string }) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<string>(ASSIGNABLE_STAFF_ROLES[0].value);
  const [mode, setMode] = useState<"invite" | "direct">("invite");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await addFn({
        data: { fullName: fullName.trim(), email: email.trim(), phone: phone.trim() || null, role: role as any, mode },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        mode === "invite"
          ? "Invitation envoyée par e-mail."
          : "Compte créé — communiquez le mot de passe temporaire.",
      );
      logActivity({
        action: "create", entity_type: "collaborator", entity_id: res.userId,
        entity_label: fullName.trim(), metadata: { role, mode },
      });
      onDone({ mode: res.mode, email: email.trim(), tempPassword: (res as any).tempPassword });
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la création du collaborateur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Ajouter un collaborateur</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div><Label>Nom complet</Label><Input required value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
        <div>
          <Label>E-mail</Label>
          <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@ecole.com" />
          <p className="text-xs text-muted-foreground mt-1">
            Pas d'e-mail personnel ? Utilisez une adresse fictive de ce type — le collaborateur s'en servira pour se connecter.
          </p>
        </div>
        <div><Label>Téléphone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div>
          <Label>Rôle</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ASSIGNABLE_STAFF_ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-2 block">Mode de création</Label>
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as "invite" | "direct")} className="space-y-2">
            <label className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer">
              <RadioGroupItem value="invite" className="mt-0.5" />
              <span>
                <span className="font-medium block">Invitation par e-mail</span>
                <span className="text-xs text-muted-foreground">Le collaborateur reçoit un lien pour créer son propre mot de passe.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer">
              <RadioGroupItem value="direct" className="mt-0.5" />
              <span>
                <span className="font-medium block">Création directe</span>
                <span className="text-xs text-muted-foreground">Mot de passe temporaire généré, affiché une seule fois, à communiquer vous-même.</span>
              </span>
            </label>
          </RadioGroup>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={loading}>{loading ? "Création..." : "Ajouter"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
