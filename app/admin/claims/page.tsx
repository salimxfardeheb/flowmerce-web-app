"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  FileWarning,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface MlInput {
  Order_ID?: string;
  Customer_ID?: string;
  Customer_Age?: number;
  Customer_Gender?: string;
  Customer_Wilaya?: string;
  Customer_Past_Returns?: number;
  Shop_Name?: string;
  Product_Category?: string;
  Product_Name?: string;
  Product_Price_DA?: number;
  Order_Quantity?: number;
  Total_Amount_DA?: number;
  Payment_Method?: string;
  Shipping_Method?: string;
  Shipping_Cost_DA?: number;
  Order_Date?: string;
  Return_Date?: string;
  Days_to_Return?: number;
  Shop_Return_Window_Days?: number;
  Within_Return_Policy?: boolean | string;
  Return_Reason?: string;
  Resolution?: string;
  Return_Shipping_Paid_By?: string;
  Refund_Amount_DA?: number;
  Fraud_Score?: number;
  Is_Suspicious?: boolean | string;
  Customer_Satisfaction?: number | string;
}

interface ClaimRow {
  id: string;
  aiDecision: string | null;
  mlInput: MlInput | null;
  vendor: { companyName: string };
}

interface FlatRow {
  id: string;
  Order_ID: string;
  Customer_ID: string;
  Customer_Age: string;
  Customer_Gender: string;
  Customer_Wilaya: string;
  Customer_Past_Returns: string;
  Shop_Name: string;
  Product_Category: string;
  Product_Name: string;
  Product_Price_DA: string;
  Order_Quantity: string;
  Total_Amount_DA: string;
  Payment_Method: string;
  Shipping_Method: string;
  Shipping_Cost_DA: string;
  Order_Date: string;
  Return_Date: string;
  Days_to_Return: string;
  Shop_Return_Window_Days: string;
  Within_Return_Policy: string;
  Return_Reason: string;
  Resolution: string;
  Return_Shipping_Paid_By: string;
  Refund_Amount_DA: string;
  Fraud_Score: string;
  Is_Suspicious: string;
  Customer_Satisfaction: string;
}

// ── Column definitions ───────────────────────────────────────────────────────

const COLUMNS: { key: keyof FlatRow; label: string; minW?: string }[] = [
  { key: "Order_ID", label: "Order ID", minW: "120px" },
  { key: "Customer_ID", label: "Customer ID", minW: "120px" },
  { key: "Customer_Age", label: "Age", minW: "60px" },
  { key: "Customer_Gender", label: "Gender", minW: "80px" },
  { key: "Customer_Wilaya", label: "Wilaya", minW: "110px" },
  { key: "Customer_Past_Returns", label: "Past Returns", minW: "100px" },
  { key: "Shop_Name", label: "Shop Name", minW: "140px" },
  { key: "Product_Category", label: "Category", minW: "110px" },
  { key: "Product_Name", label: "Product", minW: "160px" },
  { key: "Product_Price_DA", label: "Price (DA)", minW: "100px" },
  { key: "Order_Quantity", label: "Qty", minW: "50px" },
  { key: "Total_Amount_DA", label: "Total (DA)", minW: "100px" },
  { key: "Payment_Method", label: "Payment", minW: "100px" },
  { key: "Shipping_Method", label: "Shipping", minW: "100px" },
  { key: "Shipping_Cost_DA", label: "Ship Cost (DA)", minW: "110px" },
  { key: "Order_Date", label: "Order Date", minW: "110px" },
  { key: "Return_Date", label: "Return Date", minW: "110px" },
  { key: "Days_to_Return", label: "Days to Return", minW: "110px" },
  { key: "Shop_Return_Window_Days", label: "Return Window", minW: "110px" },
  { key: "Within_Return_Policy", label: "Within Policy", minW: "110px" },
  { key: "Return_Reason", label: "Return Reason", minW: "150px" },
  { key: "Resolution", label: "Resolution", minW: "110px" },
  { key: "Return_Shipping_Paid_By", label: "Shipping Paid By", minW: "130px" },
  { key: "Refund_Amount_DA", label: "Refund (DA)", minW: "100px" },
  { key: "Fraud_Score", label: "Fraud Score", minW: "100px" },
  { key: "Is_Suspicious", label: "Suspicious", minW: "90px" },
  { key: "Customer_Satisfaction", label: "Satisfaction", minW: "100px" },
];

const PAGE_SIZE = 25;

// ── Helpers ──────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function flattenClaim(claim: ClaimRow): FlatRow {
  const ml = claim.mlInput ?? ({} as MlInput);
  return {
    id: claim.id,
    Order_ID: str(ml.Order_ID),
    Customer_ID: str(ml.Customer_ID),
    Customer_Age: str(ml.Customer_Age),
    Customer_Gender: str(ml.Customer_Gender),
    Customer_Wilaya: str(ml.Customer_Wilaya),
    Customer_Past_Returns: str(ml.Customer_Past_Returns),
    Shop_Name: str(ml.Shop_Name),
    Product_Category: str(ml.Product_Category),
    Product_Name: str(ml.Product_Name),
    Product_Price_DA: str(ml.Product_Price_DA),
    Order_Quantity: str(ml.Order_Quantity),
    Total_Amount_DA: str(ml.Total_Amount_DA),
    Payment_Method: str(ml.Payment_Method),
    Shipping_Method: str(ml.Shipping_Method),
    Shipping_Cost_DA: str(ml.Shipping_Cost_DA),
    Order_Date: str(ml.Order_Date),
    Return_Date: str(ml.Return_Date),
    Days_to_Return: str(ml.Days_to_Return),
    Shop_Return_Window_Days: str(ml.Shop_Return_Window_Days),
    Within_Return_Policy: str(ml.Within_Return_Policy),
    Return_Reason: str(ml.Return_Reason),
    Resolution: str(claim.aiDecision ?? ml.Resolution),
    Return_Shipping_Paid_By: str(ml.Return_Shipping_Paid_By),
    Refund_Amount_DA: str(ml.Refund_Amount_DA),
    Fraud_Score: str(ml.Fraud_Score),
    Is_Suspicious: str(ml.Is_Suspicious),
    Customer_Satisfaction: str(ml.Customer_Satisfaction),
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AdminClaimsPage() {
  const [rows, setRows] = useState<FlatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Table state
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof FlatRow | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/claims");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Erreur ${res.status}`);
      }
      const data = await res.json();
      setRows((data.claims as ClaimRow[]).map(flattenClaim));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  // ── Filter, sort, paginate ─────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      COLUMNS.some((c) => r[c.key].toLowerCase().includes(q))
    );
  }, [rows, search]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      // Try numeric comparison
      const an = Number(av);
      const bn = Number(bv);
      if (!isNaN(an) && !isNaN(bn)) return (an - bn) * dir;
      return av.localeCompare(bv, "fr") * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paginated = sorted.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE
  );

  // Reset to first page when search changes
  useEffect(() => {
    setPage(0);
  }, [search]);

  // ── Sort handler ───────────────────────────────────────────────────────────

  function toggleSort(key: keyof FlatRow) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-8 py-3 sm:py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-sm font-semibold text-gray-900">
                Réclamations
              </h1>
              {!loading && !error && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {filtered.length} résultat
                  {filtered.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Données ML de toutes les réclamations vendeurs.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <FileWarning size={12} />
            <span>
              {rows.length} réclamation{rows.length !== 1 ? "s" : ""} au total
            </span>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="px-4 sm:px-8 py-4 sm:py-6 space-y-4 sm:space-y-5">
        {/* Stats */}
        {!loading && !error && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {[
              {
                label: "Total",
                value: rows.length,
                color: "text-indigo-600",
              },
              {
                label: "Avec mlInput",
                value: rows.filter((r) => r.Order_ID !== "—").length,
                color: "text-green-600",
              },
              {
                label: "Sans mlInput",
                value: rows.filter((r) => r.Order_ID === "—").length,
                color: "text-amber-600",
              },
              {
                label: "Suspectes",
                value: rows.filter(
                  (r) => r.Is_Suspicious === "Yes" || r.Is_Suspicious === "true"
                ).length,
                color: "text-red-500",
              },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                className="bg-white border border-gray-200 rounded-lg px-4 py-3"
              >
                <p className="text-xs text-gray-500">{label}</p>
                <p
                  className={`text-2xl font-bold mt-1 tabular-nums ${color}`}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className="bg-white rounded-lg border border-gray-200 py-24 text-center">
            <Loader2
              size={24}
              className="mx-auto text-indigo-400 mb-3 animate-spin"
            />
            <p className="text-sm font-medium text-gray-500">
              Chargement des réclamations…
            </p>
          </div>
        )}

        {/* ── Error ── */}
        {!loading && error && (
          <div className="bg-white rounded-lg border border-red-200 py-12 px-6 text-center">
            <AlertTriangle
              size={24}
              className="mx-auto text-red-400 mb-3"
            />
            <p className="text-sm font-medium text-red-700 mb-1">
              Impossible de charger les réclamations
            </p>
            <p className="text-xs text-red-500 mb-4">{error}</p>
            <button
              onClick={fetchClaims}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
            >
              <RefreshCw size={12} />
              Réessayer
            </button>
          </div>
        )}

        {/* ── Empty ── */}
        {!loading && !error && rows.length === 0 && (
          <div className="bg-white rounded-lg border border-dashed border-gray-200 py-16 text-center">
            <FileWarning size={24} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm font-medium text-gray-500">
              Aucune réclamation
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Les réclamations apparaîtront ici lorsqu&apos;elles seront
              soumises.
            </p>
          </div>
        )}

        {/* ── Table ── */}
        {!loading && !error && rows.length > 0 && (
          <>
            {/* Search + pagination info */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                />
                <input
                  id="claims-search"
                  type="text"
                  placeholder="Rechercher…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-colors"
                />
              </div>
              <p className="text-xs text-gray-400 tabular-nums whitespace-nowrap">
                Page {safePage + 1} / {totalPages} · {sorted.length} ligne
                {sorted.length !== 1 ? "s" : ""}
              </p>
            </div>

            {/* Data table */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full" style={{ minWidth: "2800px" }}>
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {COLUMNS.map((col) => {
                      const isActive = sortKey === col.key;
                      return (
                        <th
                          key={col.key}
                          className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 select-none cursor-pointer hover:bg-gray-100 transition-colors"
                          style={{ minWidth: col.minW }}
                          onClick={() => toggleSort(col.key)}
                        >
                          <span className="inline-flex items-center gap-1">
                            {col.label}
                            {isActive ? (
                              sortDir === "asc" ? (
                                <ChevronUp size={12} className="text-indigo-600" />
                              ) : (
                                <ChevronDown size={12} className="text-indigo-600" />
                              )
                            ) : (
                              <ChevronsUpDown size={12} className="text-gray-300" />
                            )}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginated.length === 0 ? (
                    <tr>
                      <td
                        colSpan={COLUMNS.length}
                        className="px-4 py-12 text-center text-sm text-gray-400"
                      >
                        Aucun résultat pour &quot;{search}&quot;
                      </td>
                    </tr>
                  ) : (
                    paginated.map((row) => (
                      <tr
                        key={row.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        {COLUMNS.map((col) => (
                          <td
                            key={col.key}
                            className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap"
                          >
                            {row[col.key]}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-end gap-2">
                <button
                  disabled={safePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={14} />
                  Précédent
                </button>
                <button
                  disabled={safePage >= totalPages - 1}
                  onClick={() =>
                    setPage((p) => Math.min(totalPages - 1, p + 1))
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Suivant
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
