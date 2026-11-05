import { useSchool } from "@/hooks/useSchool";

/**
 * Bloc de signatures commun aux documents imprimés : le cachet et la signature du directeur
 * (téléversés dans Paramètres) s'affichent s'ils existent ; sinon l'emplacement reste vide pour signer à la main.
 * Les interrupteurs « Afficher le cachet / la signature » des paramètres de bulletin sont respectés.
 */
export function SchoolSignatureBlock({ leftLabel = "Le Titulaire", className = "" }: { leftLabel?: string; className?: string }) {
  const { school, stampUrl, signatureUrl } = useSchool();
  const bs = ((school as any)?.bulletin_settings ?? {}) as { show_stamp?: boolean; show_signature?: boolean };
  const stamp = bs.show_stamp === false ? null : stampUrl;
  const signature = bs.show_signature === false ? null : signatureUrl;
  return (
    <div className={`grid grid-cols-3 gap-4 text-xs text-center mt-8 print-avoid-break ${className}`}>
      <div>
        <div className="font-semibold mb-12">{leftLabel}</div>
        <div className="border-t border-black pt-1">Signature</div>
      </div>
      <div>
        <div className="font-semibold mb-2">Cachet de l'établissement</div>
        {stamp ? (
          <img src={stamp} alt="Cachet de l'établissement" className="mx-auto h-24 w-24 object-contain" />
        ) : (
          <div className="mx-auto size-24 rounded-full border-2 border-dashed border-gray-500 flex items-center justify-center text-[10px] text-gray-500">CACHET</div>
        )}
      </div>
      <div>
        <div className="font-semibold mb-1">Le Directeur</div>
        <div className="h-11 flex items-end justify-center">
          {signature && <img src={signature} alt="Signature du directeur" className="max-h-11 max-w-full object-contain" />}
        </div>
        <div className="border-t border-black pt-1">Signature</div>
      </div>
    </div>
  );
}
