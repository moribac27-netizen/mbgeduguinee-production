import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, FileDown, ZoomIn, ZoomOut } from "lucide-react";
import { BulletinDocument, BULLETIN_PERIODS, periodLabel } from "@/components/BulletinDocument";
import { logActivity } from "@/lib/audit";
import { printWhenReady } from "@/lib/print-ready";

const A4_WIDTH_PX = 794; // 210mm @ 96dpi

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  studentId: string;
  studentName?: string;
  classId: string;
  defaultPeriod?: string;
}

export function BulletinPreviewDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  classId,
  defaultPeriod = "T1",
}: Props) {
  const [period, setPeriod] = useState(defaultPeriod);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(1);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = wrapRef.current;
    if (!el) return;
    const compute = () => setFit(Math.min(1, (el.clientWidth - 24) / A4_WIDTH_PX));
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  function handlePrint() {
    void logActivity({
      action: "print",
      entity_type: "bulletin",
      entity_id: studentId,
      entity_label: studentName ?? null,
      metadata: { periode: periodLabel(period), source: "apercu" },
    });
    void printWhenReady();
  }

  const scale = fit * zoom;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(96vw,900px)] max-h-[92vh] p-0 gap-0 overflow-hidden bulletin-preview-dialog">
        <DialogHeader className="p-4 border-b no-print">
          <DialogTitle className="text-base">
            Aperçu avant impression — {studentName ?? "Bulletin"}
          </DialogTitle>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BULLETIN_PERIODS.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="outline" className="size-9" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}>
                <ZoomOut className="size-4" />
              </Button>
              <span className="text-xs w-12 text-center tabular-nums">{Math.round(scale * 100)}%</span>
              <Button size="icon" variant="outline" className="size-9" onClick={() => setZoom((z) => Math.min(2, z + 0.1))}>
                <ZoomIn className="size-4" />
              </Button>
            </div>
            <div className="flex gap-2 ml-auto">
              <Button size="sm" onClick={handlePrint} className="gap-2"><Printer className="size-4" />Imprimer</Button>
              <Button size="sm" variant="outline" onClick={handlePrint} className="gap-2"><FileDown className="size-4" />PDF</Button>
            </div>
          </div>
        </DialogHeader>

        <div ref={wrapRef} className="overflow-auto bg-muted/40 p-3" style={{ maxHeight: "calc(92vh - 140px)" }}>
          <div
            className="a4-scaler mx-auto"
            style={{ width: A4_WIDTH_PX * scale, transform: `scale(${scale})`, transformOrigin: "top left", marginLeft: "auto" }}
          >
            <div style={{ width: A4_WIDTH_PX }}>
              {open && <BulletinDocument studentId={studentId} classId={classId} period={period} paged />}
            </div>
          </div>
        </div>

        <style>{`
          .a4-page { width: 210mm; min-height: 297mm; }
          .bulletin-analytics .recharts-surface { overflow: visible; }
          @media print {
            body * { visibility: hidden !important; }
            .bulletin, .bulletin * { visibility: visible !important; }
            .bulletin-preview-dialog {
              position: static !important; transform: none !important;
              max-width: none !important; max-height: none !important;
              width: auto !important; border: none !important; box-shadow: none !important;
            }
            .bulletin-preview-dialog > div { overflow: visible !important; max-height: none !important; padding: 0 !important; background: #fff !important; }
            .a4-scaler { transform: none !important; width: auto !important; margin: 0 !important; }
            .a4-scaler > div { width: auto !important; }
            .a4-page { width: auto !important; min-height: 0 !important; box-shadow: none !important; }
            .bulletin { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; box-shadow: none; border: none; }
            .no-print { display: none !important; }
            .bulletin-analytics { page-break-inside: auto; }
            .bulletin-analytics .break-inside-avoid { page-break-inside: avoid; break-inside: avoid; }
            .bulletin-analytics * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            @page { size: A4; margin: 1cm; }
          }
        `}</style>
      </DialogContent>
    </Dialog>
  );
}
