# Quartet Workspace — React foundation

Tato verze je záměrný přechod ze statického `index.html` na jedinou React/Vite aplikaci.

## Spuštění

```powershell
npm.cmd install --registry=https://registry.npmjs.org/
npm.cmd run dev
```

## Co zůstává funkční

- SATB hlasy a 2/4 osnovy;
- pět linek v každé osnově;
- lokální autosave, nový projekt, export/import `.quartet.json`;
- zápis přes C D E F G A H, klikací B-griff vstup;
- text připojený k vybrané notě;
- přehrávání a stop;
- Ctrl + kolečko nad editorem pro zoom;
- automatické přidání dalších čtyř taktů při zápisu na konci.

## Důležité soubory

- `src/main.tsx` — jediný vstup do Reactu.
- `src/app/App.tsx` — sestavení aplikace a její stav.
- `src/domain/score.ts` — datový model skladby.
- `src/features/editor/ScoreRenderer.tsx` — kreslení papíru, systémů, osnov a not.
- `src/features/playback/playbackEngine.ts` — přehrávání přes Web Audio API.
- `src/features/projects/projectStorage.ts` — localStorage a import/export souborů.

## Záměr refaktoru

`index.html` obsahuje jen `#root` a načtení `src/main.tsx`. Nesmí v něm zůstat žádný editorový HTML, CSS ani JavaScript. Tím se nebude míchat stará statická aplikace s Reactovou.
