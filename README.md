# InvoiceMaker

Application de bureau (Electron) qui transforme des **devis PDF** en **brouillons de factures
Odoo** — simple, en français, sans compétence technique requise.

## Fonctionnement

1. **Configuration** — un assistant guide la connexion à Odoo Online (adresse, base, clé API).
   La clé API est chiffrée localement (trousseau du système via `safeStorage`).
2. **Import** — glissez un ou plusieurs devis PDF. Lecture hors-ligne, sans coût ni service tiers.
3. **Vérifier & corriger** — chaque ligne est associée automatiquement à un produit Odoo
   (correspondance exacte / à vérifier / à associer via un sélecteur de recherche). Client
   rattaché ou créé en un clic. Totaux recalculés et comparés au devis.
4. **Création** — les factures sont créées en **brouillon** (`account.move`, non validées) pour
   contrôle final dans Odoo.

## Développement

```bash
npm install
npm run dev        # lance l'app en développement
npm test           # tests du parseur
npm run typecheck  # vérification TypeScript
npm run package    # build + installeur (electron-builder)
```

### Tester le parseur sur un vrai PDF

Placez un fichier `samples/exemple-devis.pdf` puis lancez `npm test` — un test d'extraction
réel s'exécutera automatiquement (sinon il est ignoré). Le dossier `samples/` est ignoré par
git : aucun document réel n'est jamais versionné.

## Architecture

- `src/main` — processus principal : lecture PDF (`parser.ts`), client Odoo XML-RPC (`odoo.ts`),
  stockage chiffré (`store.ts`), handlers IPC (`index.ts`).
- `src/preload` — pont IPC typé exposé sur `window.api`.
- `src/renderer` — interface React + Tailwind (assistant, import, vérification, résultat).
- `src/shared/types.ts` — contrat de types partagé entre les processus.

Tout accès réseau/fichier se fait dans le processus principal ; le rendu communique uniquement
via le pont `preload` (`contextIsolation` activé).
