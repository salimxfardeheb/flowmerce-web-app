// lib/wilayas.ts — Flowmerce
//
// Référentiel des wilayas d'Algérie — donnée de référence **produit**, à ne pas
// confondre avec le vocabulaire appris par le modèle (`lib/ml/feature-contract.json`).
//
//   ce fichier            ce que Flowmerce sait reconnaître et normaliser
//   feature-contract.json ce que le modèle déployé a appris
//
// Les deux ne coïncident pas, et c'est normal : le modèle actuel n'a vu que 24
// wilayas dans son dataset d'entraînement. Une wilaya reconnue ici mais absente
// du contrat part quand même au modèle sous sa forme canonique — elle est alors
// signalée comme hors vocabulaire (`contract.unknown_categories`) au lieu d'être
// écrasée en `Unknown`, et elle entre telle quelle dans le dataset. C'est ce qui
// permettra à un réentraînement futur de l'apprendre.
//
// Découpage administratif : 58 wilayas depuis la réforme de 2019, qui a érigé en
// wilayas 10 des circonscriptions administratives déléguées du Sud.

export interface Wilaya {
  /** Code officiel, 01 à 58. */
  code: string
  /** Nom canonique. Orthographe accentuée — celle du dataset d'entraînement. */
  name: string
}

export const WILAYAS: readonly Wilaya[] = [
  { code: '01', name: 'Adrar' },
  { code: '02', name: 'Chlef' },
  { code: '03', name: 'Laghouat' },
  { code: '04', name: 'Oum El Bouaghi' },
  { code: '05', name: 'Batna' },
  { code: '06', name: 'Béjaïa' },
  { code: '07', name: 'Biskra' },
  { code: '08', name: 'Béchar' },
  { code: '09', name: 'Blida' },
  { code: '10', name: 'Bouira' },
  { code: '11', name: 'Tamanrasset' },
  { code: '12', name: 'Tébessa' },
  { code: '13', name: 'Tlemcen' },
  { code: '14', name: 'Tiaret' },
  { code: '15', name: 'Tizi Ouzou' },
  { code: '16', name: 'Alger' },
  { code: '17', name: 'Djelfa' },
  { code: '18', name: 'Jijel' },
  { code: '19', name: 'Sétif' },
  { code: '20', name: 'Saïda' },
  { code: '21', name: 'Skikda' },
  { code: '22', name: 'Sidi Bel Abbès' },
  { code: '23', name: 'Annaba' },
  { code: '24', name: 'Guelma' },
  { code: '25', name: 'Constantine' },
  { code: '26', name: 'Médéa' },
  { code: '27', name: 'Mostaganem' },
  { code: '28', name: "M'Sila" },
  { code: '29', name: 'Mascara' },
  { code: '30', name: 'Ouargla' },
  { code: '31', name: 'Oran' },
  { code: '32', name: 'El Bayadh' },
  { code: '33', name: 'Illizi' },
  { code: '34', name: 'Bordj Bou Arréridj' },
  { code: '35', name: 'Boumerdès' },
  { code: '36', name: 'El Tarf' },
  { code: '37', name: 'Tindouf' },
  { code: '38', name: 'Tissemsilt' },
  { code: '39', name: 'El Oued' },
  { code: '40', name: 'Khenchela' },
  { code: '41', name: 'Souk Ahras' },
  { code: '42', name: 'Tipaza' },
  { code: '43', name: 'Mila' },
  { code: '44', name: 'Aïn Defla' },
  { code: '45', name: 'Naâma' },
  { code: '46', name: 'Aïn Témouchent' },
  { code: '47', name: 'Ghardaïa' },
  { code: '48', name: 'Relizane' },
  // Créées en 2019 à partir des circonscriptions administratives déléguées.
  { code: '49', name: 'Timimoun' },
  { code: '50', name: 'Bordj Badji Mokhtar' },
  { code: '51', name: 'Ouled Djellal' },
  { code: '52', name: 'Béni Abbès' },
  { code: '53', name: 'In Salah' },
  { code: '54', name: 'In Guezzam' },
  { code: '55', name: 'Touggourt' },
  { code: '56', name: 'Djanet' },
  { code: '57', name: "El M'Ghair" },
  { code: '58', name: 'El Meniaa' },
] as const

/**
 * Circonscriptions administratives déléguées et grandes daïras — **ce ne sont
 * pas des wilayas**. Elles sont reconnues en entrée (une boutique peut très bien
 * écrire « Bou Saâda ») et rattachées à leur wilaya de tutelle.
 *
 * Les rattacher plutôt que d'en faire des valeurs canoniques distinctes évite
 * de fragmenter la donnée : le modèle verrait sinon « Bou Saâda » et « M'Sila »
 * comme deux territoires sans rapport.
 */
export const WILAYA_ALIASES: Record<string, string> = {
  // Circonscriptions administratives déléguées restantes
  'Aflou':                'Laghouat',
  'Barika':               'Batna',
  'Messaad':              'Djelfa',
  'Aïn Oussara':          'Djelfa',
  'Ksar Chellala':        'Tiaret',
  'Bou Saâda':            "M'Sila",
  'Ksar El Boukhari':     'Médéa',
  'El Abiodh Sidi Cheikh': 'El Bayadh',
  'Bir El Ater':          'Tébessa',
  'El Aricha':            'Tlemcen',
  'El Kantara':           'Biskra',

  // Variantes d'usage courantes
  'Alger Centre':         'Alger',
  'El Djazaïr':           'Alger',
  'Bejaia':               'Béjaïa',
  'Setif':                'Sétif',
  'Constantine Ville':    'Constantine',
}

export const WILAYA_NAMES: readonly string[] = WILAYAS.map((w) => w.name)
