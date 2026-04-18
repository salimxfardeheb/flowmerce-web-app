import { getSessionServer } from "@/lib/getSession";


import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { VENDOR_STATUS_LABELS } from "@/lib/utils";
import { DocumentUploadSection } from "@/components/vendor/DocumentUploadSection";

export default async function DashboardPage() {
  const session = await getSessionServer();
  if (!session) redirect("/auth/login");

  const user = session.user as any;

  const vendor = await prisma.vendor.findUnique({
    where: { userId: user.id },
    include: {
      returnPolicy: true,
      apiKeys: { where: { isActive: true } },
      claims: true,
      documents: true,
    },
  });

  // ADMIN sans profil vendeur → dashboard admin avec invitation à créer un profil
  if (!vendor && user?.role === "ADMIN") {
    return (
      <div className="p-8 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">Bonjour, {user.name} 👋</h1>
          <p className="text-gray-500 mt-1">Compte administrateur</p>
        </div>
        <div className="rounded-xl p-6 mb-6 border bg-blue-50 border-blue-200">
          <div className="flex items-start gap-4">
            <span className="text-3xl">🛡️</span>
            <div>
              <p className="font-semibold text-gray-800 text-lg">Vous n&apos;avez pas encore de profil vendeur</p>
              <p className="text-sm text-blue-700 mt-2">
                En tant qu&apos;administrateur, vous pouvez créer un profil vendeur pour accéder à toutes les fonctionnalités du dashboard.
              </p>
              <Link
                href="/dashboard/setup-vendor"
                className="inline-block mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                Créer mon profil vendeur
              </Link>
            </div>
          </div>
        </div>
        <div className="rounded-xl p-5 border bg-white border-gray-200">
          <p className="text-sm font-semibold text-gray-700 mb-3">⚙️ Accès administration</p>
          <div className="flex gap-3">
            <Link href="/admin/vendors" className="bg-orange-50 border border-orange-200 text-orange-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-100 transition-colors">
              Gérer les vendeurs
            </Link>
            <Link href="/admin/clients" className="bg-orange-50 border border-orange-200 text-orange-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-100 transition-colors">
              Gérer les clients
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!vendor) redirect("/auth/register");

  const pendingClaims = vendor.claims.filter((c) => c.status === "PENDING").length;
  const totalClaims = vendor.claims.length;

  const isSuspended =
    vendor.status === "REJECTED" &&
    (vendor.rejectionReason?.startsWith("[SUSPENDU]") ?? false);

  const suspendReason = isSuspended
    ? vendor.rejectionReason?.replace("[SUSPENDU] ", "")
    : null;

  const isBlocked =
    isSuspended ||
    vendor.status === "PENDING" ||
    vendor.status === "DOCUMENTS_REQUESTED";

  const statusColors: Record<string, string> = {
    PENDING: "bg-yellow-100 text-yellow-800",
    APPROVED: "bg-green-100 text-green-800",
    REJECTED: "bg-red-100 text-red-800",
    DOCUMENTS_REQUESTED: "bg-orange-100 text-orange-800",
  };

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">
          Bonjour, {user.name} 👋
        </h1>
        <p className="text-gray-500 mt-1">{vendor.companyName}</p>
      </div>

      {/* ── Banner bloquant ── */}
      {isBlocked && (
        <div
          className={`rounded-xl p-6 mb-8 border ${
            isSuspended
              ? "bg-red-50 border-red-200"
              : vendor.status === "PENDING"
              ? "bg-yellow-50 border-yellow-200"
              : "bg-orange-50 border-orange-200"
          }`}
        >
          <div className="flex items-start gap-4">
            <span className="text-3xl">
              {isSuspended ? "🚫" : vendor.status === "PENDING" ? "⏳" : "📄"}
            </span>
            <div className="flex-1">
              <p className="font-semibold text-gray-800 text-lg">
                {isSuspended
                  ? "Votre compte a été suspendu"
                  : vendor.status === "PENDING"
                  ? "Compte en cours de vérification"
                  : "Documents supplémentaires requis"}
              </p>

              {isSuspended && suspendReason && (
                <p className="text-sm text-red-700 mt-2">
                  <strong>Motif :</strong> {suspendReason}
                </p>
              )}

              {vendor.status === "PENDING" && (
                <p className="text-sm text-gray-600 mt-2">
                  Votre inscription est en cours de vérification. L&apos;accès aux
                  fonctionnalités sera activé dès l&apos;approbation de votre
                  compte. Vous serez notifié par email.
                </p>
              )}

              {vendor.status === "DOCUMENTS_REQUESTED" && (
                <>
                  <p className="text-sm text-orange-700 mt-2">
                    Notre équipe a besoin de documents supplémentaires pour
                    valider votre compte.
                    {vendor.rejectionReason && (
                      <span className="block mt-1">
                        <strong>Message :</strong> {vendor.rejectionReason}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-orange-600 mt-1">
                    Soumettez les documents demandés ci-dessous. Notre équipe
                    les examinera dans les plus brefs délais.
                  </p>
                </>
              )}

              {(isSuspended || vendor.status === "PENDING") && (
                <p className="text-sm text-gray-500 mt-3">
                  Pour toute question, contactez notre support.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Upload documents (DOCUMENTS_REQUESTED) ── */}
      {vendor.status === "DOCUMENTS_REQUESTED" && (
        <DocumentUploadSection
          requestedDocuments={vendor.requestedDocuments as string[]}
          uploadedDocuments={vendor.documents.map((d) => ({
            type: d.type as string,
            name: d.name,
            url: d.url,
          }))}
        />
      )}

      {/* ── Refus simple (non-suspendu) ── */}
      {vendor.status === "REJECTED" && !isSuspended && (
        <div className="rounded-xl p-5 mb-8 border bg-red-50 border-red-200">
          <div className="flex items-start gap-3">
            <span className="text-2xl">❌</span>
            <div>
              <p className="font-semibold text-gray-800">
                Statut :{" "}
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusColors[vendor.status]}`}>
                  {VENDOR_STATUS_LABELS[vendor.status]}
                </span>
              </p>
              <p className="text-sm text-red-700 mt-1">
                Votre inscription a été refusée.{" "}
                {vendor.rejectionReason && (
                  <strong>Motif : {vendor.rejectionReason}</strong>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Dashboard normal (APPROVED) ── */}
      {vendor.status === "APPROVED" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <p className="text-sm text-gray-500">Réclamations totales</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">{totalClaims}</p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <p className="text-sm text-gray-500">En attente</p>
              <p className="text-3xl font-bold text-orange-600 mt-1">{pendingClaims}</p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <p className="text-sm text-gray-500">Clés API actives</p>
              <p className="text-3xl font-bold text-indigo-600 mt-1">{vendor.apiKeys.length}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link href="/dashboard/return-policy" className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:border-indigo-300 transition-colors group">
              <div className="text-2xl mb-3">📋</div>
              <h3 className="font-semibold text-gray-800 group-hover:text-indigo-700">
                {vendor.returnPolicy ? "Modifier la politique" : "Configurer la politique"}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                {vendor.returnPolicy ? `Délai : ${vendor.returnPolicy.maxClaimDays} jours` : "Politique non configurée"}
              </p>
            </Link>

            <Link href="/dashboard/api-keys" className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:border-indigo-300 transition-colors group">
              <div className="text-2xl mb-3">🔑</div>
              <h3 className="font-semibold text-gray-800 group-hover:text-indigo-700">Gérer les clés API</h3>
              <p className="text-sm text-gray-500 mt-1">{vendor.apiKeys.length} clé(s) active(s)</p>
            </Link>

            <Link href="/dashboard/claims" className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:border-indigo-300 transition-colors group">
              <div className="text-2xl mb-3">📩</div>
              <h3 className="font-semibold text-gray-800 group-hover:text-indigo-700">Voir les réclamations</h3>
              <p className="text-sm text-gray-500 mt-1">{pendingClaims} en attente</p>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}