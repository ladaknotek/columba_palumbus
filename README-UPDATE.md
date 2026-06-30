# Quartet Workspace — update: pohledy, B-griff a živý zápis

Tento balíček je určený jako **overlay** pro větev:

```text
refactor/react-foundation
19f7ca0 add cursor placement
```

Rozbal jeho obsah přímo do kořene repozitáře a potvrď přepsání souborů.
Balíček neobsahuje `node_modules`.

## Jednorázově po rozbalení

Do terminálu ve VS Code v kořeni projektu:

```powershell
npm.cmd install
npm.cmd run dev
```

`package-lock.json` v tomto balíčku používá veřejný npm registry, ne interní adresu z dřívějšího prostředí.

## Co přibylo

### 1. Pohled na partiturou nebo samostatný hlas

V nástrojové liště:

```text
Pohled: [ Partitura ] [ Aktivní hlas ]
```

`Aktivní hlas` zobrazí samostatný part právě zvoleného S/A/T/B hlasu. Volba 2/4 osnovy se týká pouze pohledu `Partitura`.

### 2. Skutečně oddělené A4 stránky

Partitura nyní skládá systémy do samostatných bílých A4 stránek pod sebe:

- 2 osnovy: 4 systémy na stránku;
- 4 osnovy: 2 systémy na stránku;
- samostatný hlas: 6 systémů na stránku.

### 3. Dva styly vstupu

```text
Zápis: [ C D E F G A H ] [ B-griff ]
```

- klasický režim: `c d e f g a h`;
- B-griff: chromatická řada v pořadí, které jsi zadal:

```text
q a y w s x e d c r f v t g b z h n u j m i k , o l . p ů -
```

B-griff panel má zobrazení fyzických řad české QWERTZ klávesnice. Klikání myší funguje v obou stylech.

### 4. Posuvná B-griff poloha

Nad virtuální klaviaturou je například:

```text
q = C4   [−12] [−1] [+1] [+12]
```

Posouvá se celé rozložení; nejde o vlastnost skladby, ale uživatelské nastavení uložené lokálně v prohlížeči.

### 5. Živý zápis s metronomem

V nástrojové liště:

```text
Režim: [ Krokový ] [ Živý ]
Kvantizace: [¼] [⅛] [1/16]
[♪ Metronom] [● Záznam]
```

Postup:

1. Přepni na `Živý`.
2. Nastav tempo a kvantizaci.
3. Klikni `● Záznam`.
4. Hraj na počítačové klávesnici nebo drž tlačítka virtuální klaviatury.
5. Stisk určí začátek noty, puštění určí její délku; oboje se zaokrouhlí na zvolenou rytmickou mřížku.

Záznam se nyní ukládá na jemnější tickovou osu (16 ticků na takt). Tím už je datový model připravený na osminy, šestnáctiny a později i tuplety.

## Důležité omezení této verze

- živý zápis je zatím určený pro **jeden aktivní hlas**, tedy monofonně;
- metronom začíná rovnou, zatím bez odpočítávacího taktu;
- rytmus se ukládá správně, ale grafika not je stále jednoduchý renderer bez praporců, trámců a ligatur;
- staré projekty v1 se při načtení automaticky převedou na novou tickovou strukturu, takže se neztratí.

## Ověření před commitem

- `C D E…` zapisuje noty;
- v B-griffu funguje uvedená mapa a posun `q`;
- klikací vstup funguje i bez fyzické klávesnice;
- `Aktivní hlas` zobrazí jen vybraný part;
- po zaplnění stránky vznikne nová A4;
- živý záznam zapíše délku noty;
- stávající přehrávání, export/import a autosave zůstaly funkční.

## Doporučený commit

```powershell
git add .
git commit -m "Add score views B-griff input and live recording"
git push
```
