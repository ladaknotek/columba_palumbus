# Cursor update

Tento update je určený pro větev `refactor/react-foundation` po commitu
`Add note preview and playback sound styles`.

Nahraď pouze tyto soubory:

- `src/app/App.tsx`
- `src/domain/score.ts`
- `src/features/editor/ScoreRenderer.tsx`
- `src/styles/app.css`

## Co se změnilo

- Kliknutí do **aktivní osnovy** nastaví modrý vkládací kurzor na konkrétní takt a dobu.
- Při přepnutí S/A/T/B se kurzor přesune za poslední notu zvoleného hlasu.
- Kliknutí na existující notu ji jen vybere pro text; nové noty se nezačnou omylem zapisovat přes ni.
- Kurzor zohlední celou a půlovou notu, takže další zápis pokračuje za jejich délkou.
- Když kurzor dojede za konec stránky, aplikace rovnou přidá další čtyři takty, aby bylo kam psát.
- Backspace vrátí kurzor na místo právě smazané noty.

## Ověření

1. Napiš několik not do sopránu, přepni na alt a ověř, že alt začíná na taktu 1.
2. Přepni zpět na soprán a ověř, že kurzor skočí za poslední sopránovou notu.
3. Klikni do horní aktivní osnovy na třetí takt a zapiš tón — má se vložit právě tam.
4. V režimu 2 osnov klikáš do řádku aktivního hlasu: S/A nahoře, T/B dole.
5. U čtyř taktů zapiš poslední notu na konec a ověř, že se objeví další systém pod ním.
