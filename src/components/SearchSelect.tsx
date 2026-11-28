import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { matchesSearch } from "@/lib/search";

export interface SearchOption { value: string; label: string; /** texte supplémentaire cherchable (matricule, classe…) */ search?: string }

const MAX_SHOWN = 50;

/** Liste déroulante avec recherche (sans accents, mots dans n'importe quel ordre). */
export function SearchSelect({ options, value, onChange, placeholder = "Choisir…", searchPlaceholder = "Rechercher…", emptyText = "Aucun résultat", disabled, id }: {
  options: SearchOption[]; value: string; onChange: (v: string) => void; placeholder?: string; searchPlaceholder?: string; emptyText?: string; disabled?: boolean; id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = options.find((o) => o.value === value);
  const matches = useMemo(() => options.filter((o) => matchesSearch(q, o.label, o.search)), [options, q]);
  const shown = matches.slice(0, MAX_SHOWN);
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className="w-full justify-between font-normal">
          <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={q} onValueChange={setQ} autoFocus />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {shown.map((o) => (
              <CommandItem key={o.value} value={o.value} onSelect={() => { onChange(o.value); setOpen(false); setQ(""); }}>
                <Check className={cn("mr-2 size-4", o.value === value ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{o.label}</span>
              </CommandItem>
            ))}
            {matches.length > MAX_SHOWN && <div className="px-3 py-2 text-xs text-muted-foreground">{matches.length - MAX_SHOWN} autre(s) résultat(s) : précisez votre recherche.</div>}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Choix d'un élève par nom ou numéro matricule. */
export function StudentPicker({ students, value, onChange, disabled }: {
  students: Array<{ id: string; full_name: string; matricule?: string | null; classes?: { name?: string | null } | null }>;
  value: string; onChange: (id: string) => void; disabled?: boolean;
}) {
  const options = useMemo<SearchOption[]>(() => students.map((s) => ({
    value: s.id,
    label: `${s.full_name}${s.matricule ? ` — ${s.matricule}` : ""}${s.classes?.name ? ` · ${s.classes.name}` : ""}`,
  })), [students]);
  return <SearchSelect options={options} value={value} onChange={onChange} disabled={disabled} placeholder="Rechercher un élève (nom ou matricule)…" searchPlaceholder="Nom ou numéro matricule…" emptyText="Aucun élève trouvé" />;
}
