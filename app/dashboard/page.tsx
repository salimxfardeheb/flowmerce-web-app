import { getSessionServer } from "@/lib/getSession";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  VENDOR_STATUS_LABELS,
  CLAIM_STATUS_LABELS,
  formatClaimType,
  formatDate,
} from "@/lib/utils";
import { DocumentUploadSection } from "@/components/vendor/DocumentUploadSection";
import {
  BTN_PRIMARY,
  Card,
  CardTitle,
  EmptyState,
  FOCUS,
  NavCard,
  Notice,
  PageHeader,
  RiskBadge,
  StatTile,
  StatusBadge,
} from "@/components/dashboard/ui";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  FileText,
  Inbox,
  Key,
  Shield,
  ShieldAlert,
  XCircle,
} from "lucide-react";

export default async function DashboardPage() {
  const session = await getSessionServer();
  if (!session) redirect("/auth/login");

  const user = session.user;

  const vendor = await prisma.vendor.findUnique({
    where: { userId: user.id },
    include: {
      returnPolicy: true,
      apiKeys: { where: { isActive: true } },
      claims: { orderBy: { createdAt: "desc" } },
      documents: true,
    },
  });

  // ── Administrateur sans profil vendeur ──
  if (!vendor && user?.role === "ADMIN") {
    return (
      <div className="w-full max-w-5xl p-5 sm:p-10">
        <PageHeader title={user.name} subtitle="Compte administrateur" />

        <div className="space-y-4">
          <Notice
            icon={Shield}
            title="Vous n’avez pas encore de profil vendeur"
            action={
              <Link href="/dashboard/setup-vendor" className={BTN_PRIMARY}>
                Créer mon profil vendeur
              </Link>
            }
          >
            En tant qu’administrateur, un profil vendeur vous donne accès à
            l’ensemble des fonctionnalités du tableau de bord.
          </Notice>

          <Card>
            <CardTitle>Administration</CardTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <NavCard
                href="/admin/vendors"
                icon={Shield}
                title="Vendeurs"
                hint="Validation et suivi des comptes"
              />
              <NavCard
                href="/admin/clients"
                icon={Inbox}
                title="Clients"
                hint="Historique et signalements"
              />
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (!vendor) redirect("/auth/register");

  // ── Métriques ──
  const allClaims = vendor.claims;
  const totalClaims = allClaims.length;
  const pendingClaims = allClaims.filter((c) => c.status === "PENDING").length;
  const approvedClaims = allClaims.filter((c) => c.status === "APPROVED").length;
  const rejectedClaims = allClaims.filter((c) => c.status === "REJECTED").length;
  const inProgressClaims = allClaims.filter((c) => c.status === "IN_PROGRESS").length;
  const aiDecisions = allClaims.filter((c) => c.aiDecision !== null).length;
  const approvalRate =
    totalClaims > 0 ? Math.round((approvedClaims / totalClaims) * 100) : null;
  const recentClaims = allClaims.slice(0, 5);

  // Le seuil affiché est celui que le marchand a réellement configuré, et non
  // une constante codée en dur : le tableau de bord comptait « risque élevé »
  // au-dessus de 60, une valeur qui ne correspondait à aucun réglage produit.
  const alertThreshold = vendor.returnPolicy?.fraudScoreThreshold ?? 70;
  const overThreshold = allClaims.filter((c) => (c.fraudScore ?? 0) > alertThreshold).length;

  // ── Statut du compte ──
  const isSuspended =
    vendor.status === "REJECTED" &&
    (vendor.rejectionReason?.startsWith("[SUSPENDU]") ?? false);
  const suspendReason = isSuspended
    ? vendor.rejectionReason?.replace("[SUSPENDU] ", "")
    : null;
  const isBlocked =
    isSuspended || vendor.status === "PENDING" || vendor.status === "DOCUMENTS_REQUESTED";

  const segments = [
    { label: "En attente", count: pendingClaims, color: "bg-amber-400" },
    { label: "Approuvées", count: approvedClaims, color: "bg-green-500" },
    { label: "Refusées", count: rejectedClaims, color: "bg-red-500" },
    { label: "En cours", count: inProgressClaims, color: "bg-blue-500" },
  ].map((s) => ({ ...s, pct: totalClaims > 0 ? (s.count / totalClaims) * 100 : 0 }));

  return (
    <div className="w-full max-w-5xl p-5 sm:p-10">
      <PageHeader
        title={vendor.companyName}
        subtitle={`${user.name} · ${VENDOR_STATUS_LABELS[vendor.status] ?? vendor.status}`}
      />

      {/* ── Bandeaux d’état du compte ── */}
      {isBlocked && (
        <div className="mb-6">
          {isSuspended && (
            <Notice tone="danger" icon={XCircle} title="Votre compte a été suspendu">
              {suspendReason && (
                <p>
                  <strong>Motif :</strong> {suspendReason}
                </p>
              )}
              <p className="mt-1">Contactez le support pour rétablir votre accès.</p>
            </Notice>
          )}

          {vendor.status === "PENDING" && (
            <Notice tone="warning" icon={Clock} title="Compte en cours de vérification">
              Vous pouvez déjà configurer votre politique de retour et vos clés API.
              Les réclamations réelles arriveront dès l’approbation de votre compte.
            </Notice>
          )}

          {vendor.status === "DOCUMENTS_REQUESTED" && (
            <Notice tone="warning" icon={FileText} title="Documents supplémentaires requis">
              {vendor.rejectionReason ? (
                <p>
                  <strong>Message de l’équipe :</strong> {vendor.rejectionReason}
                </p>
              ) : (
                <p>Déposez les pièces demandées ci-dessous pour poursuivre la vérification.</p>
              )}
            </Notice>
          )}
        </div>
      )}

      {vendor.status === "DOCUMENTS_REQUESTED" && (
        <DocumentUploadSection
          requestedDocuments={vendor.requestedDocuments as string[]}
          uploadedDocuments={vendor.documents.map((d) => ({
            type: d.type as string,
            name: d.name,
            url: `/api/vendors/documents/view?id=${d.id}`,
          }))}
        />
      )}

      {vendor.status === "REJECTED" && !isSuspended && (
        <div className="mb-6">
          <Notice tone="danger" icon={AlertCircle} title="Inscription refusée">
            {vendor.rejectionReason ? (
              <p>
                <strong>Motif :</strong> {vendor.rejectionReason}
              </p>
            ) : (
              <p>Contactez le support pour connaître les suites possibles.</p>
            )}
          </Notice>
        </div>
      )}

      {/* ── Tableau de bord actif ── */}
      {vendor.status === "APPROVED" && (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Réclamations" value={totalClaims} />
            <StatTile
              label="En attente"
              value={pendingClaims}
              tone={pendingClaims > 0 ? "warning" : "neutral"}
              hint={pendingClaims > 0 ? "À arbitrer" : "Rien à traiter"}
            />
            <StatTile
              label="Taux d’approbation"
              value={approvalRate !== null ? `${approvalRate} %` : "—"}
              tone={approvalRate !== null ? "positive" : "neutral"}
              icon={CheckCircle2}
            />
            <StatTile
              label="Décisions IA"
              value={aiDecisions}
              tone="brand"
              icon={Cpu}
              hint={`sur ${totalClaims} dossier${totalClaims > 1 ? "s" : ""}`}
            />
          </div>

          {totalClaims > 0 && (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardTitle
                  aside={
                    <span className="text-[12px] tabular-nums text-faint">
                      {totalClaims} au total
                    </span>
                  }
                >
                  Répartition des statuts
                </CardTitle>

                <div
                  role="img"
                  aria-label={segments
                    .filter((s) => s.count > 0)
                    .map((s) => `${s.label} : ${s.count}`)
                    .join(", ")}
                  className="mb-4 flex h-2 gap-px overflow-hidden rounded-full bg-page"
                >
                  {segments
                    .filter((s) => s.count > 0)
                    .map((s) => (
                      <div key={s.label} className={s.color} style={{ width: `${s.pct}%` }} />
                    ))}
                </div>

                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {segments.map((s) => (
                    <div key={s.label} className="flex items-start gap-2">
                      <span aria-hidden className={`mt-1 size-2.5 shrink-0 rounded-sm ${s.color}`} />
                      <div className="min-w-0">
                        <dt className="truncate text-[12px] text-body">{s.label}</dt>
                        <dd className="m-0 text-[14px] font-bold tabular-nums text-ink">
                          {s.count}
                          <span className="ml-1 text-[11px] font-medium text-faint">
                            {Math.round(s.pct)} %
                          </span>
                        </dd>
                      </div>
                    </div>
                  ))}
                </dl>
              </Card>

              <Card>
                <CardTitle>Au-dessus de votre seuil</CardTitle>
                <p
                  className={`text-3xl font-extrabold tabular-nums ${
                    overThreshold > 0 ? "text-risk-high" : "text-ink"
                  }`}
                >
                  {overThreshold}
                </p>
                <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-relaxed text-body">
                  <ShieldAlert size={13} strokeWidth={1.75} className="mt-px shrink-0" aria-hidden />
                  Dossiers dont le score de fraude dépasse {alertThreshold}, le seuil
                  d’alerte que vous avez configuré.
                </p>
                <Link
                  href="/dashboard/return-policy"
                  className={`mt-3 inline-flex rounded-control text-[12px] font-semibold text-brand-ink hover:underline ${FOCUS}`}
                >
                  Ajuster le seuil
                </Link>
              </Card>
            </div>
          )}

          <Card padded={false}>
            <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
              <h2 className="text-[13px] font-semibold text-ink">Réclamations récentes</h2>
              <Link
                href="/dashboard/claims"
                className={`inline-flex items-center gap-1 rounded-control text-[12px] font-semibold text-brand-ink hover:underline ${FOCUS}`}
              >
                Voir tout
                <ChevronRight size={13} aria-hidden />
              </Link>
            </div>

            {recentClaims.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="Aucune réclamation pour le moment"
                hint="Dès que votre boutique enverra sa première demande de retour, elle apparaîtra ici, déjà instruite."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <caption className="sr-only">Cinq dernières réclamations reçues</caption>
                  <thead>
                    <tr className="border-b border-line">
                      {["Client", "Type", "Statut", "Risque", "Date"].map((h) => (
                        <th
                          key={h}
                          scope="col"
                          className="px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {recentClaims.map((claim) => (
                      <tr key={claim.id} className="transition-colors hover:bg-page">
                        <td className="px-6 py-4">
                          <p className="text-[13px] font-semibold text-ink">
                            {claim.customerName}
                          </p>
                          <p className="text-[12px] text-body">{claim.customerEmail}</p>
                        </td>
                        <td className="px-6 py-4 text-[13px] text-body">
                          {formatClaimType(claim.type)}
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge
                            status={claim.status}
                            label={CLAIM_STATUS_LABELS[claim.status] ?? claim.status}
                          />
                        </td>
                        <td className="px-6 py-4">
                          <RiskBadge score={claim.fraudScore} />
                        </td>
                        <td className="px-6 py-4 text-[12px] tabular-nums text-body">
                          {formatDate(claim.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            <NavCard
              href="/dashboard/return-policy"
              icon={FileText}
              title="Politique de retour"
              hint={
                vendor.returnPolicy
                  ? `${vendor.returnPolicy.maxClaimDays} jours · ${
                      vendor.returnPolicy.validationMode === "AI_AUTO"
                        ? "Automatique"
                        : "Validation manuelle"
                    }`
                  : "Non configurée"
              }
            />
            <NavCard
              href="/dashboard/api-keys"
              icon={Key}
              title="Clés API"
              hint={`${vendor.apiKeys.length} clé${vendor.apiKeys.length !== 1 ? "s" : ""} active${
                vendor.apiKeys.length !== 1 ? "s" : ""
              } sur 5`}
            />
            <NavCard
              href="/dashboard/claims"
              icon={Inbox}
              title="Réclamations"
              hint={
                pendingClaims > 0
                  ? `${pendingClaims} en attente d’arbitrage`
                  : `${totalClaims} au total`
              }
              badge={pendingClaims}
            />
          </div>
        </div>
      )}
    </div>
  );
}
