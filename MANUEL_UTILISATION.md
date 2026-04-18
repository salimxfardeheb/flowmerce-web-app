# Manuel d'utilisation — Plateforme Flomerce

## Table des matières

1. [Présentation](#1-présentation)
2. [Inscription vendeur](#2-inscription-vendeur)
3. [Connexion](#3-connexion)
4. [Tableau de bord](#4-tableau-de-bord)
5. [Politique de retours](#5-politique-de-retours)
6. [Clés API](#6-clés-api)
7. [Réclamations clients](#7-réclamations-clients)
8. [Espace administrateur](#8-espace-administrateur)
9. [Référence API](#9-référence-api)

---

## 1. Présentation

Flomerce est une plateforme B2B de gestion des retours et réclamations e-commerce. Elle permet aux vendeurs de :

- Configurer leur politique de retours
- Recevoir et traiter les réclamations de leurs clients via API
- Déléguer la validation à un moteur d'intelligence artificielle
- Gérer les accès API de leur intégration

---

## 2. Inscription vendeur

**URL :** `/auth/register`

Remplissez le formulaire avec les informations suivantes :

| Champ | Obligatoire | Description |
|-------|-------------|-------------|
| Nom complet | Oui | Nom du responsable du compte |
| Email | Oui | Adresse email de connexion |
| Mot de passe | Oui | Minimum 8 caractères |
| Nom de l'entreprise | Oui | Raison sociale |
| SIRET | Non | Numéro SIRET de l'entreprise |
| Téléphone | Oui | Minimum 8 caractères |
| Adresse | Oui | Adresse postale complète |
| Site web | Non | URL du site (doit commencer par `https://`) |

Après soumission, votre compte passe en statut **En attente**. Un administrateur Flomerce examinera votre dossier et vous recevrez une notification par email.

---

## 3. Connexion

**URL :** `/auth/login`

Entrez votre **email** et **mot de passe** puis cliquez sur **Se connecter**. Vous serez redirigé vers votre tableau de bord.

---

## 4. Tableau de bord

**URL :** `/dashboard`

### Bandeau de statut du compte

Tant que votre compte n'est pas approuvé, un bandeau indique l'état de votre inscription :

| Statut | Couleur | Signification |
|--------|---------|---------------|
| En attente | Jaune | Votre dossier est en cours d'examen |
| Documents demandés | Orange | Des justificatifs supplémentaires sont requis |
| Rejeté | Rouge | Votre inscription a été refusée (motif affiché) |
| Approuvé | — | Accès complet à la plateforme |

### Statistiques (compte approuvé)

Trois indicateurs sont affichés en temps réel :

- **Réclamations totales** — nombre de réclamations reçues
- **En attente** — réclamations non encore traitées
- **Clés API actives** — nombre de clés d'accès actives

### Accès rapides

| Lien | Destination |
|------|-------------|
| Configurer / Modifier la politique | `/dashboard/return-policy` |
| Gérer les clés API | `/dashboard/api-keys` |
| Voir les réclamations | `/dashboard/claims` |

---

## 5. Politique de retours

**URL :** `/dashboard/return-policy`

> Accessible uniquement aux comptes avec statut **Approuvé**.

Configurez les règles qui s'appliquent à vos clients lors du dépôt d'une réclamation.

### Refus à la livraison

Activez ou désactivez via le toggle la possibilité pour vos clients de **refuser un colis à la livraison**.

### Délai maximum de réclamation

Utilisez le curseur pour définir le nombre de jours après la livraison pendant lesquels un client peut soumettre une réclamation.

- Plage : **1 à 90 jours**
- Défaut : **14 jours**

### Types de réclamations acceptées

Sélectionnez un ou plusieurs types (au moins un obligatoire) :

| Type | Description |
|------|-------------|
| Échange | Le client souhaite échanger le produit |
| Remboursement | Le client demande un remboursement |
| Réparation | Le client demande une réparation |

### Mode de validation

| Mode | Description |
|------|-------------|
| Manuel | Vous traitez chaque réclamation vous-même depuis le dashboard |
| Automatique IA | Le moteur IA analyse et statue automatiquement sur les réclamations |

Cliquez sur **Sauvegarder la politique** pour appliquer les changements.

---

## 6. Clés API

**URL :** `/dashboard/api-keys`

Les clés API permettent à votre système e-commerce d'envoyer des réclamations à Flomerce via l'API REST.

### Créer une clé

1. Cliquez sur **+ Nouvelle clé**
2. Saisissez un nom descriptif (ex : `Production`, `Staging`)
3. Cliquez sur **Créer**

> La clé générée est au format `flk_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`

### Copier une clé

Cliquez sur le bouton **Copier** à droite de la clé pour la copier dans le presse-papiers.

### Révoquer une clé

Cliquez sur **Révoquer** en haut à droite de la carte de la clé. Cette action est **irréversible** — toute intégration utilisant cette clé perdra immédiatement l'accès.

### Utilisation dans les requêtes API

Ajoutez votre clé dans le header HTTP de chaque requête :

```http
Authorization: Bearer flk_votre_cle_api
```

---

## 7. Réclamations clients

**URL :** `/dashboard/claims`

### Vue d'ensemble

Le tableau liste toutes les réclamations soumises par vos clients via l'API. Chaque ligne contient :

| Colonne | Description |
|---------|-------------|
| Client | Nom et email du client |
| Commande | Identifiant de la commande |
| Type | Échange / Remboursement / Réparation |
| Statut | État de la réclamation |
| Score IA | Niveau de confiance du moteur IA (0–100 %) |
| Date | Date de soumission |

### Filtres par statut

Utilisez les boutons en haut du tableau pour filtrer par statut :

| Statut | Signification |
|--------|---------------|
| Toutes | Affiche toutes les réclamations |
| En attente | Réclamations non traitées |
| Approuvée | Réclamations acceptées |
| Rejetée | Réclamations refusées |
| En cours | Réclamations en traitement |

### Score IA

La barre de progression indique le score de confiance calculé par le modèle ML :

| Score | Couleur | Interprétation |
|-------|---------|----------------|
| ≥ 70 % | Vert | Réclamation probablement légitime |
| 40 – 69 % | Jaune | À examiner avec attention |
| < 40 % | Rouge | Réclamation potentiellement frauduleuse |

### Traitement manuel d'une réclamation

Pour les réclamations en statut **En attente**, deux boutons apparaissent :

- **Approuver** — accepte la réclamation
- **Rejeter** — refuse la réclamation

> Si le mode de validation est **Automatique IA**, les réclamations sont traitées automatiquement sans intervention manuelle.

---

## 8. Espace administrateur

**URL :** `/admin/vendors`

> Accessible uniquement aux comptes avec le rôle **ADMIN**.

### Vue d'ensemble

Affiche tous les vendeurs inscrits avec leurs informations :

- Nom de l'entreprise et statut
- Nom et email du responsable
- Téléphone, SIRET, adresse, date d'inscription

Trois compteurs en haut indiquent le nombre de vendeurs **En attente**, **Approuvés** et **Rejetés**.

### Actions sur un vendeur en attente

Pour chaque vendeur au statut **En attente**, trois actions sont disponibles :

| Action | Description |
|--------|-------------|
| Approuver | Active le compte vendeur — accès complet immédiat |
| Demander docs | Passe le statut en "Documents demandés" avec un message explicatif |
| Refuser | Rejette l'inscription avec un motif obligatoire |

Les actions **Demander docs** et **Refuser** ouvrent une modale pour saisir un message qui sera visible par le vendeur dans son tableau de bord.

---

## 9. Référence API

### Authentification

Toutes les requêtes doivent inclure le header :

```http
Authorization: Bearer flk_votre_cle_api
```

### Soumettre une réclamation

```http
POST /api/claims
Content-Type: application/json
Authorization: Bearer flk_votre_cle_api
```

**Corps de la requête :**

```json
{
  "orderId": "CMD-2024-001",
  "customerName": "Jean Dupont",
  "customerEmail": "jean@exemple.com",
  "type": "REFUND"
}
```

**Types acceptés :** `EXCHANGE` | `REFUND` | `REPAIR`

### Mettre à jour le statut d'une réclamation

```http
PATCH /api/claims/:claimId
Content-Type: application/json
Authorization: Bearer flk_votre_cle_api
```

**Corps de la requête :**

```json
{
  "status": "APPROVED"
}
```

**Statuts valides :** `APPROVED` | `REJECTED` | `IN_PROGRESS`

---

*Flomerce — Plateforme de gestion intelligente des retours e-commerce*

Compte administrateur
Champ	Valeur
Email	admin@flomerce.com
Mot de passe	admin123!
Rôle	ADMIN
Compte vendeur de démo (bonus)
Champ	Valeur
Email	vendeur@demo.com
Mot de passe	vendor123!
