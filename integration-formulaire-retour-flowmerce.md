# Intégration du formulaire de retour Flowmerce

> Guide d'intégration pour toute plateforme e-commerce (Shopify, WooCommerce, Magento,
> PrestaShop, boutique custom…) souhaitant déléguer à Flowmerce la gestion de son
> formulaire de retour et de sa politique de retour.

## 1. Principe général

Flowmerce est la **source de vérité unique** pour tout ce qui concerne les retours :

- Le formulaire (champs, motifs, résolutions proposées) est **généré dynamiquement** à
  partir du compte vendeur et de sa politique de retour configurée sur Flowmerce.
- Votre boutique **ne code jamais en dur** les champs, motifs ou règles de validation :
  elle récupère le JSON du formulaire et le restitue tel quel.
- Votre boutique conserve uniquement une **trace locale** de la demande (identifiant de
  commande, `claim_id` renvoyé par Flowmerce, statut) — aucune logique métier de retour
  n'est dupliquée côté boutique.

### Flux en deux étapes

```
1. GET  /api/v1/return-form      → récupère la définition du formulaire (JSON)
                                     → rendu dynamique côté boutique
2. POST /api/claims/create        → envoie les réponses du client
                                     → Flowmerce répond avec un claim_id + statut
```

Il n'y a rien d'autre à connaître côté Flowmerce : pas d'identifiant de boutique à
transmettre dans l'URL, pas de configuration à synchroniser manuellement. La **clé API**
suffit à elle seule à identifier le vendeur.

---

## 2. Prérequis

- Un compte vendeur Flowmerce avec le statut **APPROVED**.
- Une **clé API** générée depuis votre tableau de bord Flowmerce.
- Une politique de retour (`ReturnPolicy`) configurée sur Flowmerce (délai de retour,
  types de résolution acceptés, motifs acceptés, catégories exclues…). Si aucune
  politique n'est configurée, Flowmerce applique des valeurs par défaut raisonnables.

⚠️ La clé API **ne doit jamais** être exposée côté client (navigateur, app mobile). Tous
les appels à Flowmerce doivent passer par votre backend.

---

## 3. Authentification

Chaque appel à l'API Flowmerce doit inclure la clé API dans l'en-tête `x-api-key` :

```
x-api-key: <VOTRE_CLE_API_FLOWMERCE>
```

> L'endpoint de récupération du formulaire accepte aussi `Authorization: Bearer
> <clé>`, mais l'endpoint de soumission n'accepte **que** `x-api-key`. Pour rester
> compatible avec les deux, utilisez systématiquement `x-api-key`.

---

## 4. Étape 1 — Récupérer la définition du formulaire

```
GET /api/v1/return-form
x-api-key: <VOTRE_CLE_API_FLOWMERCE>
```

### Réponse `200`

```json
{
  "version": 1,
  "title": "Demande de retour",
  "description": "Complétez le formulaire ci-dessous pour soumettre votre demande de retour.",
  "sections": [
    {
      "id": "order",
      "title": "Informations de commande",
      "description": "Renseignez les informations de la commande concernée.",
      "fields": [
        { "id": "order_id", "type": "text", "label": "Numéro de commande", "required": true, "options": [], "validation": { "maxLength": 200 }, "defaultValue": null },
        { "id": "customer_id", "type": "text", "label": "Identifiant client", "required": false, "options": [], "validation": { "maxLength": 100 }, "defaultValue": null },
        { "id": "customer_name", "type": "text", "label": "Nom complet", "required": true, "options": [], "validation": { "maxLength": 200 }, "defaultValue": null },
        { "id": "customer_email", "type": "email", "label": "Adresse e-mail", "required": true, "options": [], "validation": { "maxLength": 254, "pattern": "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$" }, "defaultValue": null },
        { "id": "customer_phone", "type": "tel", "label": "Téléphone", "required": false, "options": [], "validation": {}, "defaultValue": null },
        { "id": "customer_wilaya", "type": "text", "label": "Wilaya", "required": true, "options": [], "validation": { "maxLength": 100 }, "defaultValue": null },
        { "id": "product_name", "type": "text", "label": "Produit", "required": true, "options": [], "validation": { "maxLength": 500 }, "defaultValue": null },
        { "id": "payment_method", "type": "select", "label": "Mode de paiement", "required": true, "options": [{ "value": "Cash on Delivery", "label": "Paiement à la livraison" }, { "value": "Card", "label": "Carte bancaire (CIB / Edahabia)" }, { "value": "CCP", "label": "Versement CCP" }, { "value": "Bank Transfer", "label": "Virement bancaire" }], "validation": { "minLength": 1 }, "defaultValue": null },
        { "id": "shipping_method", "type": "text", "label": "Mode de livraison", "required": true, "options": [], "validation": { "maxLength": 100 }, "defaultValue": null },
        { "id": "shipping_cost", "type": "number", "label": "Frais de livraison (DA)", "required": false, "options": [], "validation": { "min": 0 }, "defaultValue": null },
        { "id": "order_date", "type": "date", "label": "Date de commande", "required": false, "options": [], "validation": {}, "defaultValue": null }
      ]
    },
    {
      "id": "reason",
      "title": "Motif du retour",
      "fields": [
        { "id": "reason", "type": "select", "label": "Motif du retour", "required": true, "options": [{ "value": "Produit défectueux", "label": "Produit défectueux", "description": "Le produit est endommagé ou ne fonctionne pas" }], "validation": { "minLength": 1 } }
      ]
    },
    {
      "id": "resolution",
      "title": "Résolution souhaitée",
      "fields": [
        { "id": "desired_resolution", "type": "select", "label": "Résolution souhaitée", "required": true, "options": [{ "value": "REFUND", "label": "Remboursement", "description": "Je souhaite être remboursé(e)" }], "validation": { "minLength": 1 } }
      ]
    },
    {
      "id": "description",
      "title": "Détails de la demande",
      "fields": [
        { "id": "description", "type": "textarea", "label": "Description", "required": false, "options": [], "validation": { "maxLength": 2000 } }
      ]
    }
  ],
  "meta": {
    "shop": { "name": "Ma Boutique", "slug": "ma-boutique", "website": null },
    "policy": {
      "max_claim_days": 14,
      "processing_days": 5,
      "allow_refusal_on_delivery": false,
      "partial_refund_enabled": false,
      "non_refundable_categories": [],
      "exchange_only_categories": []
    }
  }
}
```

### Structure du JSON

| Clé | Description |
|---|---|
| `version` | Version du contrat de formulaire. Si votre intégration ne sait pas gérer une version renvoyée, affichez un message plutôt que de deviner le rendu. |
| `title` / `description` | Titre et texte d'intro à afficher en haut du formulaire. |
| `sections[]` | Groupes de champs à afficher dans l'ordre, chacun avec `id`, `title`, `description?`, `fields[]`. |
| `sections[].fields[]` | Champs du formulaire (voir table des types ci-dessous). |
| `meta.shop` | Informations de la boutique telles que connues par Flowmerce. |
| `meta.policy` | Résumé lisible de la politique de retour active (délai, remboursement partiel, catégories exclues…) — utile pour afficher des messages d'information au client avant qu'il ne remplisse le formulaire. |

### Types de champs (`field.type`)

| Type | Rendu attendu |
|---|---|
| `text`, `email`, `tel`, `number`, `date` | Champ de saisie simple |
| `textarea` | Zone de texte multi-lignes |
| `select` | Liste déroulante à choix unique (`field.options`) |
| `radio` | Boutons radio (`field.options`) |
| `checkbox` | Cases à cocher (une ou plusieurs sélections) |
| `switch` / `boolean` | Interrupteur on/off |
| `image`, `video`, `file` | Upload de fichier (voir §6) |
| `barcode`, `qr` | Capture photo (scan) |
| `signature` | Pad de signature |

Chaque champ peut porter :
- `required` : booléen — rend le champ obligatoire.
- `options[]` : pour `select` / `radio` / `checkbox` — `{ value, label, description? }`.
- `validation` : règles pilotées par le JSON (`minLength`, `maxLength`, `min`, `max`,
  `regex`, `allowedExtensions`, `maxFileSize`, `minItems`, `maxItems`).
- `defaultValue`, `placeholder`, `helpText`.

**Règle d'intégration essentielle : ne jamais coder en dur la liste des motifs, des
résolutions ou les règles de validation.** Elles proviennent entièrement du JSON et
peuvent changer si le vendeur modifie sa politique de retour sur Flowmerce.

### Mise en cache

Le formulaire ne change que lorsque le vendeur modifie sa politique de retour. Il est
recommandé de mettre en cache la réponse côté serveur (TTL de l'ordre de 5 minutes) pour
éviter un appel Flowmerce à chaque ouverture du formulaire par un client.

---

## 5. Étape 2 — Soumettre une demande de retour

```
POST /api/claims/create
x-api-key: <VOTRE_CLE_API_FLOWMERCE>
Content-Type: application/json
```

### Corps de la requête

```json
{
  "shop_id": "identifiant-interne-a-votre-boutique",
  "order_id": "CMD-1234",
  "customer_name": "Ahmed Benali",
  "customer_email": "client@exemple.com",
  "customer_phone": "0555123456",
  "product_name": "Nike Air Max",
  "order_date": "2026-07-15",
  "reason": "Produit défectueux",
  "desired_resolution": "REFUND",
  "description": "Le produit est arrivé endommagé, la semelle est décollée."
}
```

| Champ | Obligatoire | Notes |
|---|---|---|
| `shop_id` | oui | Chaîne non vide identifiant la commande/boutique dans votre propre système. |
| `order_id` | oui | Numéro de commande côté boutique. |
| `customer_name` | oui | Rejeté si contient du HTML. |
| `customer_email` | oui | Doit être un email valide. |
| `customer_phone` | non | |
| `product_name` | oui | |
| `order_date` | non | Format date ISO ; sert au calcul du délai de retour vs. la politique. |
| `reason` | oui | **Voir avertissement ci-dessous.** |
| `desired_resolution` | oui | `EXCHANGE`, `REFUND` ou `REPAIR` (insensible à la casse). |
| `description` | oui | Entre 10 et 2000 caractères, sans HTML. |

Champs optionnels supplémentaires pris en compte s'ils sont fournis (améliorent la
précision de l'analyse automatique) : `customer_id`, `order_total`, `product_price`,
`product_quantity`, `product_category`, `customer_age`, `customer_gender`,
`customer_wilaya`, `payment_method`, `shipping_method`, `shipping_cost`,
`order_address`.

> `customer_id` (votre identifiant client interne), `customer_wilaya`,
> `payment_method`, `shipping_method` et `shipping_cost` sont conservés sur la
> réclamation et exportés vers le moteur ML (`Customer_ID`, `Customer_Wilaya`,
> `Payment_Method`, `Shipping_Method`, `Shipping_Cost_DA`). Transmettez-les dès que
> vous les connaissez : le formulaire générique les demande désormais au client
> (`customer_wilaya`, `payment_method` et `shipping_method` y sont **requis**), et
> toute valeur que vous fournissez évite au client d'avoir à la ressaisir.

### Réponse `201`

```json
{
  "success": true,
  "claim_id": "clm_9f2e1c...",
  "status": "PENDING",
  "customer_past_returns": 0,
  "message": "Votre demande de retour a été enregistrée."
}
```

Conservez `claim_id` et `status` dans votre système : c'est votre unique trace du
retour. `status` peut valoir `PENDING`, `APPROVED`, `REJECTED` ou `IN_PROGRESS`.

### Erreurs possibles

| Code | Signification |
|---|---|
| `400` | Champ requis manquant ou invalide (voir `error`). |
| `401` | Clé API manquante ou invalide/révoquée. |
| `403` | Compte vendeur non encore approuvé par Flowmerce. |
| `409` | Une demande de retour existe déjà pour cette commande. |
| `422` | Retour refusé par la politique du vendeur (hors délai, catégorie exclue, type non accepté…) — `error` contient le message, `code` un identifiant machine. |
| `429` | Trop de tentatives (par commande, ou par client sur 24h). |

---

## 6. Upload de fichiers (photos, vidéos, signature)

Il n'existe pas encore d'API d'upload publique côté Flowmerce. Si votre formulaire
affiche des champs `image` / `video` / `file` / `signature`, votre boutique doit gérer
l'upload elle-même (stockage propre ou service tiers de type Cloudinary) et transmettre
l'**URL** obtenue comme valeur de réponse (`answers.<field_id> = "https://…"`).

---

## 7. Suivi du statut d'une demande

Il n'existe pas aujourd'hui d'endpoint public de consultation de statut ni de mécanisme
de notification (webhook) sortant de Flowmerce. En attendant, prévoyez côté boutique un
état "en attente" par défaut et rapprochez-vous de l'équipe Flowmerce pour connaître la
disponibilité de ces fonctionnalités.

---

## 8. Points d'attention connus (à date de cette documentation)

- **Format du motif (`reason`)** : le formulaire (`GET /api/v1/return-form`) propose des
  motifs en français (ex. `"Produit défectueux"`), alors que l'endpoint de soumission
  (`POST /api/claims/create`) valide actuellement `reason` contre une liste de codes
  différente (`DEFECTIVE`, `WRONG_ITEM`, `DESCRIPTION`, `CHANGE_MIND`). Une demande
  construite strictement à partir des valeurs du formulaire peut donc être rejetée avec
  `Raison invalide`. Vérifiez ce point avec l'équipe Flowmerce avant mise en production ;
  en attendant, testez vos soumissions avec chaque motif proposé par le formulaire pour
  confirmer lesquels sont acceptés.
- **`shop_id`** : requis par `POST /api/claims/create` mais non recoupé avec votre
  compte Flowmerce (c'est la clé API qui identifie le vendeur). Toute chaîne non vide de
  votre côté suffit actuellement.

---

## 9. Bonnes pratiques d'intégration

- Ne jamais exposer `FLOWMERCE_API_KEY` côté client : tous les appels passent par votre
  backend, qui relaie ensuite au client uniquement le JSON du formulaire et les erreurs.
- Gérer explicitement les 5 états côté UI : chargement, erreur réseau/API, formulaire
  vide, version de formulaire non supportée, succès.
- Revalider côté client les règles de `field.validation` avant envoi, mais ne jamais
  faire confiance uniquement au client — Flowmerce revalide aussi côté serveur.
- Rafraîchir le cache du formulaire si le vendeur signale une politique de retour mise à
  jour et que le changement n'apparaît pas après le TTL habituel.
