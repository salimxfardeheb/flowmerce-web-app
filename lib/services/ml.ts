import { env } from '@/lib/env'
import { log } from '@/lib/logger'
import { TYPE_TO_RESOLUTION, isAIDecision, type AIDecision } from '@/lib/constants'
import {
  CONTRACT_VERSION_HEADER,
  FEATURE_CONTRACT_VERSION,
  diagnoseCategories,
  normalizeCustomerGender,
  normalizeCustomerWilaya,
  normalizePaymentMethod,
  normalizeProductCategory,
  normalizeReturnReason,
  normalizeShippingMethod,
} from '@/lib/ml-contract'

// Ré-export : la constante vit dans lib/constants.ts — elle sert aussi au
// filtrage de la recommandation (claim-decision), qui n'a rien à faire du
// transport ML. Les appelants historiques continuent de la lire ici.
export { TYPE_TO_RESOLUTION }

export interface MLPredictionOutput {
  resolution: {
    // Contrat 3 classes : l'API ML ne renvoie jamais 'Refund'.
    prediction:    AIDecision;
    // Probabilité de la classe retenue (= max des `probabilities`). Renvoyée par
    // l'API ML ; la web app recalcule la sienne à partir de la recommandation
    // filtrée, mais la valeur brute reste utile en journal.
    confidence?:   number;
    probabilities: Record<string, number>;
  };
  // Signaux de risque dérivés de l'entrée, renvoyés par l'API ML.
  risk_flag?: {
    is_suspicious:   boolean;
    fraud_score:     number;
    seuil_risque:    number;
    client_a_risque: boolean;
  };
  // État du contrat de features pour cette prédiction. Renseigné par l'API ML
  // depuis l'encodeur réellement chargé : `degraded` signale qu'une partie du
  // vecteur d'entrée était nulle faute de vocabulaire reconnu (C-02).
  contract?: {
    version:              string;
    degraded:             boolean;
    unknown_categories:   Record<string, string>;
    alert_features:       string[];
    expected_unknown:     string[];
    categorical_coverage: number;
  };
}

export type MLResult =
  | { ok: true;  prediction: MLPredictionOutput }
  | { ok: false; timedOut: boolean; error: string; retryable: boolean; attempts: number }

/**
 * Contexte d'appel — repris tel quel dans les journaux pour rattacher une
 * réponse ML à la réclamation et au vendeur concernés. Purement descriptif :
 * il n'influence jamais la requête envoyée au modèle.
 */
export type MLCallContext = {
  claimId?:  string
  vendorId?: string
  origin?:   'ingestion' | 'retry' | 'api_predict'
}

interface CallOptions {
  retries?:   number
  timeoutMs?: number
  context?:   MLCallContext
}

// ─────────────────────────────────────────────────────────────
// Journalisation de la réponse du modèle.
//
// Jusqu'ici, seuls les échecs laissaient une trace : une prédiction réussie
// disparaissait sans rien écrire. Impossible, après coup, de savoir ce que le
// modèle avait réellement répondu sur une réclamation donnée — ni de vérifier
// pourquoi la recommandation affichée n'était pas sa classe dominante (P1.1).
//
// Ce que l'on journalise, et pourquoi :
//   • les probabilités de TOUTES les classes — c'est la seule donnée qui permet
//     de rejouer l'arbitrage de `selectRecommendation` ;
//   • l'état du contrat de features — dit si le vecteur d'entrée était amputé ;
//   • la latence — l'appel ML est dans le chemin critique de la soumission.
//
// Ce que l'on ne journalise PAS : le payload envoyé. Il contient des données
// client (âge, wilaya, genre) et il est de toute façon déjà persisté —
// `Claim.mlInput` pour le canal de soumission, `PredictionLog.input` pour
// `/api/predict`. Le journal n'a pas à en garder un second exemplaire.
// ─────────────────────────────────────────────────────────────
function logMLResponse(
  prediction: MLPredictionOutput,
  meta: { durationMs: number; context?: MLCallContext },
): void {
  const probabilities = prediction.resolution?.probabilities ?? {}
  const contract      = prediction.contract

  log.info('ml.response', {
    ...meta.context,
    prediction:    prediction.resolution?.prediction,
    confidence:    prediction.resolution?.confidence ?? null,
    // Classes triées par score décroissant : le journal se lit sans retraitement.
    probabilities: Object.fromEntries(
      Object.entries(probabilities).sort((a, b) => b[1] - a[1]),
    ),
    riskFlag: prediction.risk_flag
      ? {
          isSuspicious:  prediction.risk_flag.is_suspicious,
          fraudScore:    prediction.risk_flag.fraud_score,
          clientARisque: prediction.risk_flag.client_a_risque,
        }
      : null,
    contract: contract
      ? {
          version:  contract.version,
          degraded: contract.degraded,
          coverage: contract.categorical_coverage,
          unknown:  contract.unknown_categories,
        }
      : null,
    durationMs: meta.durationMs,
  })
}

async function attempt(
  input:     object,
  timeoutMs: number,
  context?:  MLCallContext,
): Promise<MLResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const startedAt = Date.now()
  try {
    const res = await fetch(`${env.ML_API_URL}/predict`, {
      method:  'POST',
      headers: {
        'Content-Type':   'application/json',
        'X-Internal-Key': env.ML_INTERNAL_SECRET,
        // Version du vocabulaire sur lequel ce payload est construit. L'API ML
        // répond 409 si elle sert un autre contrat : mieux vaut un échec
        // explicite qu'une prédiction rendue sur des features mal alignées.
        [CONTRACT_VERSION_HEADER]: FEATURE_CONTRACT_VERSION,
      },
      body:   JSON.stringify(input),
      signal: controller.signal,
    })

    if (!res.ok) {
      const detail = await res.json().catch(() => ({}))
      // 409 = versions de contrat divergentes. Le rejouer à l'identique donnerait
      // le même refus : c'est un incident de déploiement, pas une panne passagère.
      if (res.status === 409) {
        log.error('ml.contract_version_mismatch', {
          ...context,
          webAppVersion: FEATURE_CONTRACT_VERSION,
          detail:        JSON.stringify(detail),
        })
      }
      log.warn('ml.response_error', {
        ...context,
        httpStatus: res.status,
        detail:     JSON.stringify(detail),
        durationMs: Date.now() - startedAt,
      })
      return {
        ok:        false,
        timedOut:  false,
        error:     `HTTP ${res.status} ${JSON.stringify(detail)}`,
        retryable: res.status >= 500 || res.status === 429,
        attempts:  1,
      }
    }

    const prediction = (await res.json()) as MLPredictionOutput

    // Contrat 3 classes : toute autre valeur (dont 'Refund') est une violation
    // du contrat ML → on traite la réponse comme un échec (mlFailed), sans
    // retry immédiat (rejouer le même input renverrait la même classe).
    const predicted = prediction?.resolution?.prediction
    if (!isAIDecision(predicted)) {
      log.error('ml.invalid_prediction_class', {
        ...context,
        prediction: String(predicted),
        expected:   'Exchange | Repair | Reject',
        durationMs: Date.now() - startedAt,
      })
      return {
        ok:        false,
        timedOut:  false,
        error:     `invalid_prediction_class: ${String(predicted)}`,
        retryable: false,
        attempts:  1,
      }
    }

    // Le modèle a répondu, mais sur un vecteur amputé : on le dit. C'était
    // exactement ce que `handle_unknown="ignore"` rendait invisible.
    const contractState = prediction?.contract
    if (contractState?.alert_features?.length) {
      log.error('ml.unknown_categories', {
        ...context,
        features:   contractState.alert_features,
        values:     contractState.unknown_categories,
        coverage:   contractState.categorical_coverage,
        version:    contractState.version,
      })
    }

    logMLResponse(prediction, { durationMs: Date.now() - startedAt, context })

    return { ok: true, prediction }
  } catch (err: unknown) {
    const name     = (err as { name?: string })?.name
    const timedOut = name === 'AbortError' || name === 'TimeoutError'
    log.warn('ml.response_unreachable', {
      ...context,
      timedOut,
      error:      String((err as { message?: string })?.message ?? err),
      durationMs: Date.now() - startedAt,
    })
    return {
      ok:        false,
      timedOut,
      error:     String((err as { message?: string })?.message ?? err),
      retryable: true,
      attempts:  1,
    }
  } finally {
    clearTimeout(timer)
  }
}

// ─────────────────────────────────────────────────────────────
// Construction du payload ML à partir des données métier d'une réclamation.
// Source unique de vérité du format ML — utilisé par le canal de soumission
// (return-submission). Fraud_Score, Customer_Past_Returns et Is_Suspicious
// sont des placeholders : ils sont recalculés à l'intérieur d'ingestClaim
// avant l'envoi effectif (cf. claim-ingestion.ts).
// ─────────────────────────────────────────────────────────────
export interface BuildMLPayloadInput {
  customerId:         string | null
  shopName:           string
  productCategory:    string | null
  productPrice:       number | null
  productQuantity:    number | null
  orderTotal:         number | null
  paymentMethod:      string
  shippingMethod:     string
  shippingCost:       number
  customerGender:     string
  customerAge:        number | null
  customerWilaya:     string
  reason:             string
  daysToReturn:       number
  returnWindowDays:   number
}

export interface MLPayload {
  Customer_ID:             string
  Customer_Gender:         string
  Customer_Age:            number
  Customer_Wilaya:         string
  Customer_Past_Returns:   number
  Shop_Name:               string
  Product_Category:        string
  Product_Price_DA:        number
  Order_Quantity:          number
  Total_Amount_DA:         number
  Payment_Method:          string
  Shipping_Method:         string
  Shipping_Cost_DA:        number
  Return_Reason:           string
  Days_to_Return:          number
  Shop_Return_Window_Days: number
  Within_Return_Policy:    0 | 1
  Fraud_Score:             number
  Is_Suspicious:           0 | 1
}

export function buildMLPayload(input: BuildMLPayloadInput): MLPayload {
  // Frontière unique de traduction : au-delà de cette fonction, toute valeur
  // catégorielle est exprimée dans le vocabulaire du modèle. `mlInput` persisté
  // — donc aussi ce qui repart au worker de reprise et au dataset — porte la
  // même forme que ce qui a été envoyé. C'est ce qui rend le train/serve
  // vérifiable au lieu d'être supposé (C-02).
  const payload: MLPayload = {
    Customer_ID:             input.customerId ?? '',
    Customer_Gender:         normalizeCustomerGender(input.customerGender),
    Customer_Age:            input.customerAge ?? 0,
    Customer_Wilaya:         normalizeCustomerWilaya(input.customerWilaya),
    Customer_Past_Returns:   0, // recalculé par ingestClaim
    // Nom réel de la boutique : hors vocabulaire par construction (le modèle a
    // appris Shop_001…Shop_080, des boutiques simulées). La valeur est envoyée
    // telle quelle et le contrat déclare cette divergence comme attendue.
    Shop_Name:               input.shopName,
    Product_Category:        normalizeProductCategory(input.productCategory),
    Product_Price_DA:        input.productPrice ?? input.orderTotal ?? 1,
    Order_Quantity:          input.productQuantity ?? 1,
    Total_Amount_DA:         input.orderTotal ?? input.productPrice ?? 1,
    Payment_Method:          normalizePaymentMethod(input.paymentMethod),
    Shipping_Method:         normalizeShippingMethod(input.shippingMethod),
    Shipping_Cost_DA:        input.shippingCost,
    Return_Reason:           normalizeReturnReason(input.reason),
    Days_to_Return:          input.daysToReturn,
    Shop_Return_Window_Days: input.returnWindowDays,
    // Calculé, plus codé en dur : depuis que la page hébergée accepte les
    // demandes hors délai (refusées d'office), la valeur varie réellement.
    // Définition volontairement limitée à la fenêtre de rétractation, la seule
    // règle que `Shop_Return_Window_Days` permet au modèle de recouper.
    Within_Return_Policy:    input.daysToReturn <= input.returnWindowDays ? 1 : 0,
    Fraud_Score:             0, // recalculé par ingestClaim
    // Customer_Satisfaction est volontairement absent : Flowmerce ne mesure
    // aucune satisfaction, et le modèle d'entrée de /predict (ReturnRequest)
    // ne l'expose pas. Le `3` qu'on envoyait était une valeur inventée,
    // ignorée à l'inférence et fausse dans le dataset.
    Is_Suspicious:           0, // recalculé par ingestClaim
  }

  // Diagnostic local, avec les mêmes règles que celles appliquées côté ML :
  // il repère une valeur non traduisible même quand le service ML est
  // indisponible, donc avant qu'elle ne se retrouve figée dans `mlInput`.
  const diagnosis = diagnoseCategories(payload as unknown as Record<string, unknown>)
  if (diagnosis.alerts.length) {
    log.warn('ml.payload_unknown_categories', {
      shopName: input.shopName,
      features: diagnosis.alerts,
      values:   diagnosis.unknown,
      coverage: diagnosis.coverage,
    })
  }

  return payload
}

// ─────────────────────────────────────────────────────────────
// /save_claim — Insertion d'une réclamation réelle côté ML.
// Source unique de vérité du contrat : le modèle Pydantic
// `ReclamationInput` (api/server.py). Les champs sont envoyés
// tels quels, sans recalcul.
//
// `Return_Shipping_Paid_By` et `Refund_Amount_DA` ne font PAS partie du
// contrat : aucun point d'entrée Flowmerce ne les collecte, ils ne valaient
// donc que la valeur neutre ('' / 0) et polluaient le dataset.
// ─────────────────────────────────────────────────────────────
/**
 * Origine du label `Resolution`, telle que l'API ML l'attend.
 * Miroir de `LabelSourceEnum` (Flowmerce-ML/api/server.py).
 */
export type LabelSource = 'human' | 'policy_rule' | 'model'

/** Origine côté base → origine côté dataset. */
export const DECISION_SOURCE_TO_LABEL_SOURCE: Record<string, LabelSource> = {
  HUMAN:       'human',
  POLICY_RULE: 'policy_rule',
  MODEL:       'model',
}

/**
 * Origines admises comme vérité terrain supervisée. Une réclamation dont la
 * résolution vient du modèle n'en fait pas partie : c'est ce qui casse la
 * boucle de rétroaction (C-04).
 */
export const GROUND_TRUTH_SOURCES = ['HUMAN', 'POLICY_RULE'] as const

export function isGroundTruth(resolutionSource: string | null | undefined): boolean {
  return (GROUND_TRUTH_SOURCES as readonly string[]).includes(resolutionSource ?? '')
}

export interface ReclamationInput {
  Order_ID:                 string
  Customer_ID:               string
  Customer_Age:              number
  Customer_Gender:           string
  Customer_Wilaya:           string
  Customer_Past_Returns:     number
  Shop_Name:                 string
  Product_Category:          string
  Product_Name:              string
  Product_Price_DA:          number
  Order_Quantity:            number
  Total_Amount_DA:           number
  Payment_Method:            string
  Shipping_Method:           string
  Shipping_Cost_DA:          number
  Order_Date:                 string
  Return_Date:                 string
  Days_to_Return:              number
  Shop_Return_Window_Days:     number
  Within_Return_Policy:        0 | 1
  Return_Reason:               string
  Resolution:                   'Exchange' | 'Reject' | 'Repair' | 'Refund'
  // Origine de `Resolution`. Obligatoire côté API ML : sans elle, une
  // recommandation du modèle serait indiscernable d'une décision humaine.
  Label_Source:                 LabelSource
  Fraud_Score:                   number
  Is_Suspicious:                  0 | 1
  Customer_Satisfaction?:         number | null
}

export type MLSaveClaimResult =
  | { ok: true;  message: string; order_id: string }
  | { ok: false; timedOut: boolean; error: string; status?: number }

// ─────────────────────────────────────────────────────────────
// Construction du payload ReclamationInput à partir d'une claim
// Flowmerce pour l'export global vers /save_claim.
// Utilise le mlInput persisté tel quel en complétant les champs
// requis absents avec les données de la claim (productName,
// orderDate, type) et des valeurs neutres (0, chaîne vide, date
// du jour). Aucun recalcul.
//
// Exception : les colonnes reprises ci-dessous directement du
// modèle Prisma `Claim` priment sur mlInput, la base faisant foi.
//   - Order_ID    ← claim.orderId
//   - Customer_ID ← claim.customerId
//   - Fraud_Score ← claim.fraudScore
// ─────────────────────────────────────────────────────────────
export interface BuildReclamationInputFromClaimInput {
  orderId: string
  customerId?: string | null
  fraudScore?: number | null
  productName: string | null
  orderDate: Date | null
  // Date de dépôt de la réclamation — sert de Return_Date quand le mlInput
  // persisté n'en contient pas (le formulaire ne collecte pas ce champ).
  createdAt?: Date | null
  type: 'EXCHANGE' | 'REFUND' | 'REPAIR' | null
  aiDecision: string | null
  // Origine de `aiDecision` (colonne `Claim.resolutionSource`). Elle voyage
  // jusqu'au dataset : c'est elle qui permet au pipeline d'entraînement de
  // refuser les labels que le modèle a produits lui-même (C-04).
  resolutionSource: string | null
  vendor: { companyName: string }
  mlInput: Record<string, unknown> | null
}


function toNum(v: unknown, fallback: number): number {
  if (v === null || v === undefined || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function toFlag(v: unknown, fallback: 0 | 1): 0 | 1 {
  if (v === true || v === 1 || v === '1' || v === 'true') return 1
  if (v === false || v === 0 || v === '0' || v === 'false') return 0
  return fallback
}

function toDateStr(v: unknown, fallback: string): string {
  if (v === null || v === undefined || v === '') return fallback
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString().slice(0, 10)
}

export function buildReclamationInputFromClaim(
  claim: BuildReclamationInputFromClaimInput,
): ReclamationInput {
  const ml  = claim.mlInput ?? {}
  const mlv = ml as Record<string, unknown>
  const today = new Date().toISOString().slice(0, 10)

  const shownResolution = claim.aiDecision ?? mlv.Resolution ?? null
  const resolution: ReclamationInput['Resolution'] =
    shownResolution === 'Exchange' ||
    shownResolution === 'Reject' ||
    shownResolution === 'Repair' ||
    shownResolution === 'Refund'
      ? shownResolution
      : claim.type
        ? TYPE_TO_RESOLUTION[claim.type]
        : 'Refund'

  return {
    // Colonne DB `Claim.orderId` : seule source de vérité. Elle est validée et
    // trimée au point d'entrée unique (/v1/returns, quel que soit le mode
    // d'authentification) et sert de clé de déduplication (vendorId, orderId).
    // `mlInput` n'est volontairement pas consulté : c'est un blob JSONB figé à
    // la création, qui ne porte pas Order_ID et ne doit pas primer sur la base.
    Order_ID:                 claim.orderId,
    // Colonne DB `Claim.customerId` (identifiant client côté boutique) : elle
    // fait foi ; `mlInput.Customer_ID` sert de repli pour les claims créées
    // avant l'ajout de la colonne.
    Customer_ID:               String(claim.customerId ?? mlv.Customer_ID ?? ''),
    Customer_Age:              toNum(mlv.Customer_Age, 0),
    Customer_Gender:           String(mlv.Customer_Gender ?? 'Unknown'),
    Customer_Wilaya:           String(mlv.Customer_Wilaya ?? 'Unknown'),
    Customer_Past_Returns:     toNum(mlv.Customer_Past_Returns, 0),
    Shop_Name:                 String(mlv.Shop_Name ?? claim.vendor.companyName),
    Product_Category:          String(mlv.Product_Category ?? 'Unknown'),
    Product_Name:              String(mlv.Product_Name ?? claim.productName ?? ''),
    Product_Price_DA:          toNum(mlv.Product_Price_DA, 1),
    Order_Quantity:            toNum(mlv.Order_Quantity, 1),
    Total_Amount_DA:           toNum(mlv.Total_Amount_DA, 1),
    Payment_Method:            String(mlv.Payment_Method ?? 'Unknown'),
    Shipping_Method:           String(mlv.Shipping_Method ?? 'Standard'),
    Shipping_Cost_DA:          toNum(mlv.Shipping_Cost_DA, 0),
    Order_Date:                toDateStr(
      mlv.Order_Date,
      claim.orderDate ? toDateStr(claim.orderDate.toISOString(), today) : today,
    ),
    Return_Date:               toDateStr(
      mlv.Return_Date,
      claim.createdAt ? toDateStr(claim.createdAt.toISOString(), today) : today,
    ),
    Days_to_Return:            toNum(mlv.Days_to_Return, 0),
    Shop_Return_Window_Days:   toNum(mlv.Shop_Return_Window_Days, 14),
    Within_Return_Policy:      toFlag(mlv.Within_Return_Policy, 1),
    Return_Reason:             String(mlv.Return_Reason ?? ''),
    Resolution:                resolution,
    // Une réclamation sans origine connue est traitée comme un label de modèle :
    // le doute joue contre l'entraînement, jamais en sa faveur.
    Label_Source:              DECISION_SOURCE_TO_LABEL_SOURCE[claim.resolutionSource ?? ''] ?? 'model',
    // Colonne DB `Claim.fraudScore` : calculée à l'ingestion par
    // computeFraudScore() et stockée sur la claim — c'est elle qui fait foi.
    // `mlInput.Fraud_Score` (figé à la création) n'est qu'un repli.
    Fraud_Score:               toNum(claim.fraudScore ?? mlv.Fraud_Score, 0),
    Is_Suspicious:             toFlag(mlv.Is_Suspicious, 0),
    // Toujours null, jamais lu depuis mlInput : la satisfaction n'est mesurée
    // nulle part dans Flowmerce. Les claims créées avant ce changement portent
    // encore le `3` en dur dans leur mlInput figé — le renvoyer ferait entrer
    // une note fabriquée dans le dataset. `null` dit la vérité : non mesuré.
    // Le champ est optionnel et nullable côté contrat /save_claim.
    Customer_Satisfaction:     null,
  }
}

export async function callMLSaveClaim(
  input: ReclamationInput,
  timeoutMs = 10_000,
): Promise<MLSaveClaimResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${env.ML_API_URL}/save_claim`, {
      method:  'POST',
      headers: {
        'Content-Type':   'application/json',
        'X-Internal-Key': env.ML_INTERNAL_SECRET,
      },
      body:   JSON.stringify(input),
      signal: controller.signal,
    })

    if (!res.ok) {
      const detail = await res.json().catch(() => ({}))
      return {
        ok:        false,
        timedOut:  false,
        error:     `HTTP ${res.status} ${JSON.stringify(detail)}`,
        status:    res.status,
      }
    }

    const data = (await res.json()) as { message?: string; order_id?: string }
    return {
      ok:       true,
      message:  data.message ?? 'ok',
      order_id: data.order_id ?? input.Order_ID,
    }
  } catch (err: unknown) {
    const name     = (err as { name?: string })?.name
    const timedOut = name === 'AbortError' || name === 'TimeoutError'
    return {
      ok:        false,
      timedOut,
      error:     String((err as { message?: string })?.message ?? err),
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function callMLPredict(
  input: object,
  opts:  CallOptions = {},
): Promise<MLResult> {
  const retries   = opts.retries   ?? 2
  const timeoutMs = opts.timeoutMs ?? 4_000

  let last: MLResult = { ok: false, timedOut: false, error: 'no_attempt', retryable: false, attempts: 0 }

  for (let i = 0; i <= retries; i++) {
    const r = await attempt(input, timeoutMs, opts.context)
    if (r.ok) return r

    last = { ...r, attempts: i + 1 }
    if (!r.retryable || i === retries) break

    const backoff = 250 * 2 ** i + Math.floor(Math.random() * 100)
    log.warn('ml.retry', {
      ...opts.context,
      attempt: i + 1, nextDelayMs: backoff, error: r.error,
    })
    await new Promise<void>((resolve) => setTimeout(resolve, backoff))
  }

  return last
}
