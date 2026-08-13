import { CLAIM_STATUS_LABELS, formatClaimType, formatDate } from "@/lib/utils";
import { XCircle } from "lucide-react";

/**
 * Tableau des réclamations d'un vendeur.
 *
 * Partagé par la fiche client (les 5 dernières) et la page dédiée
 * (`/admin/clients/[vendorId]/claims`, paginée) : les deux affichaient sinon
 * les mêmes six colonnes, à deux endroits, avec deux barèmes de score.
 */

export type VendorClaimRow = {
  id: string;
  customerName: string;
  customerEmail: string;
  orderId: string;
  type: string | null;
  status: string;
  aiScore: number | null;
  createdAt: Date;
};

const STATUS_BADGE: Record<string, string> = {
  PENDING:     "bg-yellow-50 text-yellow-700 border border-yellow-200",
  APPROVED:    "bg-green-50 text-green-700 border border-green-200",
  REJECTED:    "bg-red-50 text-red-700 border border-red-200",
  IN_PROGRESS: "bg-blue-50 text-blue-700 border border-blue-200",
};

const TH =
  "text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 sm:px-6 py-3";

export function VendorClaimsTable({ claims }: { claims: VendorClaimRow[] }) {
  if (claims.length === 0) return <VendorClaimsEmpty />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-150">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/60">
            <th className={TH}>Client</th>
            <th className={TH}>Commande</th>
            <th className={TH}>Type</th>
            <th className={TH}>Statut</th>
            <th className={TH}>Score IA</th>
            <th className={TH}>Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {claims.map((claim) => (
            <tr key={claim.id} className="hover:bg-gray-50/60 transition-colors">
              <td className="px-4 sm:px-6 py-3.5">
                <p className="text-sm font-medium text-gray-800 leading-tight">
                  {claim.customerName}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{claim.customerEmail}</p>
              </td>
              <td className="px-4 sm:px-6 py-3.5">
                <span className="text-xs font-mono bg-gray-100 text-gray-700 px-2 py-1 rounded-md">
                  {claim.orderId}
                </span>
              </td>
              <td className="px-4 sm:px-6 py-3.5">
                <span className="text-xs text-gray-600">{formatClaimType(claim.type)}</span>
              </td>
              <td className="px-4 sm:px-6 py-3.5">
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                    STATUS_BADGE[claim.status] ?? "bg-gray-100 text-gray-600"
                  }`}
                >
                  {CLAIM_STATUS_LABELS[claim.status as keyof typeof CLAIM_STATUS_LABELS] ??
                    claim.status}
                </span>
              </td>
              <td className="px-4 sm:px-6 py-3.5">
                <AiScore score={claim.aiScore} />
              </td>
              <td className="px-4 sm:px-6 py-3.5">
                <p className="text-xs text-gray-400 whitespace-nowrap">
                  {formatDate(claim.createdAt)}
                </p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function VendorClaimsEmpty({
  hint = "Les réclamations de ce vendeur apparaîtront ici.",
}: {
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
        <XCircle className="w-5 h-5 text-gray-300" />
      </div>
      <p className="text-sm font-medium text-gray-500">Aucune réclamation</p>
      <p className="text-xs text-gray-400 mt-1">{hint}</p>
    </div>
  );
}

function AiScore({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-gray-300">—</span>;

  const tone =
    score >= 0.7
      ? { bar: "bg-green-500", text: "text-green-700" }
      : score >= 0.4
        ? { bar: "bg-yellow-400", text: "text-yellow-600" }
        : { bar: "bg-red-500", text: "text-red-600" };

  return (
    <div className="flex items-center gap-2">
      <div className="w-14 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full rounded-full ${tone.bar}`}
          style={{ width: `${score * 100}%` }}
        />
      </div>
      <span className={`text-xs font-medium tabular-nums ${tone.text}`}>
        {Math.round(score * 100)}%
      </span>
    </div>
  );
}
