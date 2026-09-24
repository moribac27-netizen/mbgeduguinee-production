import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { resetSchoolAdminPassword, impersonateSchoolAdmin, updateSchoolAsSuperAdmin, deleteSchoolAsSuperAdmin, notifySchools, getStorageUsage, getLoginStats } from "@/lib/super-admin.functions";
import { logActivity } from "@/lib/audit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Building2, Users, GraduationCap, CreditCard, ShieldCheck, Activity, RefreshCw, MoreVertical, Send, Trash2, KeyRound, LogIn, HardDrive } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/super-admin")({
  head: () => ({ meta: [{ title: "Super Admin — MBGEduGuinée" }, { name: "description", content: "Supervision globale de MBGEduGuinée" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: sa } = await supabase.from("super_admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
    if (!sa) throw redirect({ to: "/dashboard" });
  },
  component: SuperAdminDashboard,
});

type School = { id:string; name:string; code:string|null; city:string|null; address:string|null; email:string|null; phone:string|null; director_name:string|null; status:string; created_at:string; academic_year:string|null };
type Summary = { students:number; teachers:number; users:number; validated:number; pending:number; revenue:number; schoolShare:number };

function SuperAdminDashboard() {
  const [schools,setSchools]=useState<School[]>([]); const [summaries,setSummaries]=useState<Record<string,Summary>>({}); const [activity,setActivity]=useState<any[]>([]); const [loading,setLoading]=useState(true); const [search,setSearch]=useState(""); const [selected,setSelected]=useState<School|null>(null); const [notify,setNotify]=useState(false); const [notifySubject,setNotifySubject]=useState(""); const [notifyBody,setNotifyBody]=useState(""); const [confirmDelete,setConfirmDelete]=useState<School|null>(null); const [storage,setStorage]=useState<Record<string,any>>({}); const [logins,setLogins]=useState<Record<string,any>>({});
  const resetPwd=useServerFn(resetSchoolAdminPassword), impersonate=useServerFn(impersonateSchoolAdmin), updateSchool=useServerFn(updateSchoolAsSuperAdmin), deleteSchool=useServerFn(deleteSchoolAsSuperAdmin), notifyFn=useServerFn(notifySchools), storageFn=useServerFn(getStorageUsage), loginFn=useServerFn(getLoginStats);

  async function load(){
    setLoading(true);
    const [sRes,stuRes,teaRes,profRes,payRes,actRes]=await Promise.all([
      supabase.from("schools").select("id,name,code,city,address,email,phone,director_name,status,created_at,academic_year").order("created_at",{ascending:false}),
      supabase.from("students").select("school_id"), supabase.from("teachers").select("school_id"), supabase.from("profiles").select("school_id"),
      (supabase as any).from("student_plan_payments").select("school_id,status,amount,school_share"),
      (supabase as any).from("activity_logs").select("id,school_id,action,entity_type,entity_label,created_at,actor_name,ip_address").order("created_at",{ascending:false}).limit(60),
    ]);
    const rows=(sRes.data??[]) as School[]; setSchools(rows); setActivity(actRes.data??[]);
    const c:Record<string,Summary>={}; const ensure=(id:string)=>(c[id]??={students:0,teachers:0,users:0,validated:0,pending:0,revenue:0,schoolShare:0});
    (stuRes.data??[]).forEach((r:any)=>ensure(r.school_id).students++); (teaRes.data??[]).forEach((r:any)=>ensure(r.school_id).teachers++); (profRes.data??[]).forEach((r:any)=>r.school_id&&ensure(r.school_id).users++);
    (payRes.data??[]).forEach((r:any)=>{const x=ensure(r.school_id); if(r.status==='VALIDATED'){x.validated++;x.revenue+=Number(r.amount||0);x.schoolShare+=Number(r.school_share||15000);} else if(['INITIATED','PENDING_VERIFICATION','AWAITING_VALIDATION'].includes(r.status)) x.pending++;});
    setSummaries(c);
    try{const x=await storageFn();const m:Record<string,any>={};(x as any[]).forEach(r=>m[r.school_id]=r);setStorage(m);}catch{}
    try{setLogins(await loginFn() as any);}catch{}
    setLoading(false);
  }
  useEffect(()=>{void load();},[]);
  const filtered=useMemo(()=>{const q=search.toLowerCase();return schools.filter(s=>!q||s.name.toLowerCase().includes(q)||(s.email??"").toLowerCase().includes(q)||(s.code??"").toLowerCase().includes(q));},[schools,search]);
  const totals=useMemo(()=>Object.values(summaries).reduce((a,b)=>({students:a.students+b.students,teachers:a.teachers+b.teachers,users:a.users+b.users,validated:a.validated+b.validated,pending:a.pending+b.pending,revenue:a.revenue+b.revenue,schoolShare:a.schoolShare+b.schoolShare}),{students:0,teachers:0,users:0,validated:0,pending:0,revenue:0,schoolShare:0}),[summaries]);

  async function logSA(action:string,school?:School,metadata?:Record<string,any>){try{await logActivity({action:`super_admin.${action}`,entity_type:"school",entity_id:school?.id,entity_label:school?.name,metadata});}catch{}}
  async function reset(s:School){try{const r=await resetPwd({data:{schoolId:s.id}});if(r.actionLink)await navigator.clipboard.writeText(r.actionLink).catch(()=>{});toast.success(`Lien généré pour ${r.email}`);void logSA("reset_password",s);}catch(e:any){toast.error(e.message);}}
  async function login(s:School){try{const r=await impersonate({data:{schoolId:s.id}});if(r.actionLink){await navigator.clipboard.writeText(r.actionLink).catch(()=>{});window.open(r.actionLink,"_blank");}toast.success(`Lien de connexion créé pour ${r.email}`);void logSA("impersonate",s);}catch(e:any){toast.error(e.message);}}
  async function changeStatus(s:School,status:"active"|"suspended"|"pending"){try{await updateSchool({data:{schoolId:s.id,patch:{status}}});toast.success("Statut de l'école mis à jour");void logSA("status_change",s,{status});await load();}catch(e:any){toast.error(e.message);}}
  async function remove(s:School){try{await deleteSchool({data:{schoolId:s.id}});toast.success("École supprimée");void logSA("delete",s);setConfirmDelete(null);await load();}catch(e:any){toast.error(e.message);}}
  async function sendNotification(){if(!selected||!notifySubject.trim()||!notifyBody.trim())return;try{await notifyFn({data:{schoolIds:[selected.id],subject:notifySubject.trim(),body:notifyBody.trim(),channel:"in-app"}});toast.success("Notification envoyée");setNotify(false);setNotifySubject("");setNotifyBody("");void logSA("notify",selected);}catch(e:any){toast.error(e.message);}}

  if(loading)return <div className="h-64 animate-pulse bg-muted rounded-xl"/>;
  return <div className="p-4 md:p-8 space-y-6 animate-fade-in">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl md:text-3xl font-display font-bold flex items-center gap-2"><ShieldCheck className="size-7 text-primary"/> Super Administrateur</h1><p className="text-sm text-muted-foreground mt-1">Supervision des écoles et des cotisations annuelles.</p></div><Button variant="outline" onClick={()=>void load()}><RefreshCw className="size-4 mr-2"/> Actualiser</Button></div>
    <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {[['Écoles',schools.length,Building2],['Élèves',totals.students,Users],['Enseignants',totals.teachers,GraduationCap],['VALIDATED',totals.validated,CreditCard],['En attente',totals.pending,Activity]].map(([label,value,Icon]:any)=><Card key={label as string}><CardContent className="p-5"><Icon className="size-5 text-primary mb-2"/><div className="text-2xl font-bold">{value}</div><div className="text-xs text-muted-foreground">{label}</div></CardContent></Card>)}
    </div>
    <Card><CardHeader><CardTitle>Vue financière globale</CardTitle><CardDescription>50 000 GNF par élève ; 15 000 GNF de part école par cotisation VALIDATED.</CardDescription></CardHeader><CardContent className="grid sm:grid-cols-2 gap-4"><div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">Cotisations VALIDATED</div><div className="text-2xl font-bold">{totals.revenue.toLocaleString('fr-FR')} GNF</div></div><div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">Part école cumulée</div><div className="text-2xl font-bold">{totals.schoolShare.toLocaleString('fr-FR')} GNF</div></div></CardContent></Card>
    <Card><CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3"><div><CardTitle>Établissements</CardTitle><CardDescription>Progression calculée à partir des cotisations VALIDATED.</CardDescription></div><Input className="max-w-sm" placeholder="Rechercher…" value={search} onChange={e=>setSearch(e.target.value)}/></CardHeader><CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Établissement</TableHead><TableHead>Ville</TableHead><TableHead>Élèves</TableHead><TableHead>VALIDATED</TableHead><TableHead>Accès</TableHead><TableHead>Utilisateurs actifs</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{filtered.map(s=>{const x=summaries[s.id]??{students:0,teachers:0,users:0,validated:0,pending:0,revenue:0,schoolShare:0};const full=x.validated>=20;return <TableRow key={s.id}><TableCell><div className="font-medium">{s.name}</div><div className="text-xs text-muted-foreground">{s.code??"—"} · {s.email??"—"}</div></TableCell><TableCell>{s.city??s.address??"—"}</TableCell><TableCell>{x.students}</TableCell><TableCell>{x.validated}/20</TableCell><TableCell><Badge variant={full?"default":"secondary"}>{full?"FULL":"RESTRICTED"}</Badge></TableCell><TableCell>{logins[s.id]?.active30d??0}/{x.users}</TableCell><TableCell className="text-right"><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={()=>{setSelected(s);setNotify(true)}}><Send className="size-4"/></Button><Button size="sm" variant="ghost" onClick={()=>void reset(s)}><KeyRound className="size-4"/></Button><Button size="sm" variant="ghost" onClick={()=>void login(s)}><LogIn className="size-4"/></Button><Button size="sm" variant="ghost" onClick={()=>setSelected(s)}><MoreVertical className="size-4"/></Button></div></TableCell></TableRow>})}</TableBody></Table></div></CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="size-4"/> Journal d'audit</CardTitle></CardHeader><CardContent><div className="space-y-2 max-h-80 overflow-y-auto">{activity.map(a=><div key={a.id} className="flex justify-between gap-3 text-sm border-b last:border-0 py-2"><div><span className="font-medium">{a.action}</span><span className="text-muted-foreground"> · {a.entity_type}{a.entity_label?` · ${a.entity_label}`:""}</span><div className="text-xs text-muted-foreground">{a.actor_name??"—"}</div></div><span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString("fr-FR")}</span></div>)}{activity.length===0&&<p className="text-sm text-muted-foreground text-center py-4">Aucune activité</p>}</div></CardContent></Card>

    <Dialog open={!!selected&&!notify} onOpenChange={o=>!o&&setSelected(null)}><DialogContent><DialogHeader><DialogTitle>{selected?.name}</DialogTitle><DialogDescription>Gestion administrative de l'établissement.</DialogDescription></DialogHeader>{selected&&<div className="space-y-3"><div className="grid grid-cols-2 gap-3 text-sm"><div className="border rounded-lg p-3"><div className="text-muted-foreground">VALIDATED</div><div className="font-bold">{summaries[selected.id]?.validated??0}/20</div></div><div className="border rounded-lg p-3"><div className="text-muted-foreground">Stockage</div><div className="font-bold flex items-center gap-1"><HardDrive className="size-4"/>{storage[selected.id]?`${(Number(storage[selected.id].bytes)/1048576).toFixed(1)} Mo`:"—"}</div></div></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>void changeStatus(selected,"active")}>Activer</Button><Button size="sm" variant="outline" onClick={()=>void changeStatus(selected,"suspended")}>Suspendre</Button><Button size="sm" variant="outline" onClick={()=>void changeStatus(selected,"pending")}>Mettre en attente</Button><Button size="sm" variant="destructive" onClick={()=>setConfirmDelete(selected)}>Supprimer</Button></div></div>}<DialogFooter><Button variant="outline" onClick={()=>setSelected(null)}>Fermer</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={notify} onOpenChange={setNotify}><DialogContent><DialogHeader><DialogTitle>Notifier {selected?.name}</DialogTitle></DialogHeader><div className="space-y-3"><div><Label>Objet</Label><Input value={notifySubject} onChange={e=>setNotifySubject(e.target.value)}/></div><div><Label>Message</Label><Textarea value={notifyBody} onChange={e=>setNotifyBody(e.target.value)} rows={5}/></div></div><DialogFooter><Button variant="outline" onClick={()=>setNotify(false)}>Annuler</Button><Button onClick={()=>void sendNotification()}>Envoyer</Button></DialogFooter></DialogContent></Dialog>
    <AlertDialog open={!!confirmDelete} onOpenChange={o=>!o&&setConfirmDelete(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Supprimer l'établissement ?</AlertDialogTitle><AlertDialogDescription>Cette action supprime l'établissement et les données liées selon les règles de la base.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction onClick={()=>confirmDelete&&void remove(confirmDelete)}>Supprimer</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
