# Review: SiteBlocker Free

## Kurzfazit

Die Extension trifft einen echten und sinnvollen Usecase: nicht nur Domains blocken, sondern innerhalb einer Domain gezielt produktive Unterseiten erlauben oder verbieten. Genau diese Granularität ist das eigentliche Produktmerkmal. Technisch funktioniert der Kern bereits, aber die Umsetzung ist noch stark "single-script driven": viel Logik steckt in wenigen großen Dateien, Verantwortlichkeiten sind vermischt, die Matching-Regeln sind nur teilweise konsistent, und die UI kommuniziert das wichtigste Feature nicht klar genug.

Das Projekt ist aktuell klassisch als Chrome-Extension in Vanilla HTML, CSS und JavaScript gebaut. Das ist für eine Chrome-Extension völlig legitim. Frameworks sind dafür nicht verboten, aber in diesem Repo gibt es keinen Bundler, kein Build-Setup und keine Komponentenschicht. Realistisch arbeitet das Projekt daher heute in Vanilla JS. Wenn man diesen Weg beibehält, sollte man die Struktur trotzdem deutlich modularer machen.

## Verstandener Usecase

Die Anwendung ist nicht einfach ein "Website Blocker", sondern eher ein regelbasierter Navigationsfilter:

- Ganze Domains können dauerhaft oder zeitgesteuert blockiert werden.
- Für eine Domain können Unterseiten explizit erlaubt oder verboten werden.
- Der wichtigste Praxisfall ist: die Plattform blocken, aber eine produktive Route zulassen, etwa `reddit.com` blocken, aber `/comments` erlauben.
- Zusätzlich wird SPA-Navigation abgefangen, damit clientseitige Routen nicht am Blocking vorbei navigieren.

Das ist ein gutes Produktfundament. Der Review unten bewertet daher nicht nur "funktioniert oder nicht", sondern ob Code und UX dieser Kernidee gerecht werden.

## 1. Codequalität nach SOLID / Clean Code

### Gesamturteil

Der Code ist verständlich genug, um ihn nachzuvollziehen, aber er ist strukturell deutlich zu monolithisch. Vor allem `js/background.js` und `js/options.js` übernehmen gleichzeitig Datenmodell, Validierung, Rendering, Event-Steuerung und Geschäftslogik. Für eine kleine Extension ist das anfangs normal. Für ein Feature wie Subpage-Whitelist/Blacklist wird diese Form aber schnell teuer: neue Regeln, Fehlerbehandlung, Tests und UX-Änderungen werden unnötig riskant.

### Was bereits solide ist

- Die Kernlogik ist an einer Stelle konzentriert und nicht über viele Dateien verstreut.
- Regeln werden beim Laden normalisiert, statt überall blind auf optionale Felder zu vertrauen (`js/background.js:117-133`, `js/options.js:624-640`).
- Die zeitliche Aktivierung ist als eigene Funktion extrahiert (`js/background.js:87-113`).
- Der SPA-Fallback über `webNavigation.onHistoryStateUpdated` ist sinnvoll, weil DNR allein nicht jede Client-Navigation sauber abdeckt (`js/background.js:685-701`).

### Hauptprobleme

#### 1. Zu große Funktionen und zu viele Verantwortlichkeiten

`convertToDNRRules()` in `js/background.js:190-466` ist das beste Beispiel. Die Funktion:

- validiert Domains
- filtert Regeln zeitlich
- entscheidet über Verhaltensmodi
- erzeugt Pattern-Strings
- baut DNR-Regelobjekte
- kennt Sonderfälle für Querys, Slashes und Wildcards

Das verletzt zwar nicht mechanisch jede SOLID-Regel, aber klar das Single-Responsibility-Prinzip. Diese Funktion ist heute schon schwer zu testen und wird mit jedem Spezialfall fragiler.

Gleiches gilt für `options.js`: eine einzige DOMContentLoaded-Closure verwaltet fast die gesamte UI-Lebensdauer (`js/options.js:3-670`). Dort sind Datenhaltung, DOM-Referenzen, Rendering, Validation und Event-Wiring eng verkoppelt.

#### 2. Duplizierte Logik zwischen Background und Options

`validateDomainInput()` existiert zweimal, einmal in `js/background.js:157-187` und einmal in `js/options.js:534-564`. Das ist ein klassischer Drift-Kandidat. Sobald sich Validierungsregeln ändern, laufen UI und Service Worker auseinander.

Auch die Regel-Normalisierung (`subpageMode`, Whitelist, Blacklist Defaultwerte) ist in beiden Dateien separat vorhanden (`js/background.js:121-127`, `js/options.js:628-633`).

Empfehlung:

- Ein gemeinsames `rule-model.js`
- Funktionen wie `normalizeRule`, `validateDomain`, `normalizePattern`, `isRuleTimeActive`
- Verwendung in Background und Options gleichermaßen

#### 3. Inkonsistente Matching-Semantik

Der kritischste technische Punkt ist die unterschiedliche Semantik zwischen DNR-Regelerzeugung und Laufzeitprüfung.

Beispiele:

- In DNR wird in Whitelist/Blacklist teils mit `*path*` gearbeitet, also faktisch mit unscharfer Teilstring-Suche (`js/background.js:343-349`, `428-433`).
- In der SPA-Laufzeitprüfung verwendet `urlMatchesPattern()` bei normalen Pfaden ebenfalls `includes(pattern)` (`js/background.js:71-80`).

Das führt zu Nebeneffekten:

- `/comments` matcht nicht nur `/comments`, sondern auch URLs wie `/bestcomments`, `/foo/comments-bar` oder Querystrings, in denen das Teilstück auftaucht.
- Das Produktversprechen "ich erlaube gezielt `/comments`" ist damit technisch nicht sauber modelliert, sondern eher "ich erlaube jede URL, die irgendwo `/comments` enthält".

Für genau dieses Produkt ist das zu unpräzise. Hier sollte ein explizites Pattern-Modell her:

- `exact`
- `prefix`
- `path-segment`
- optional `wildcard`

Und dieses Modell muss sowohl in DNR als auch im SPA-Fallback identisch interpretiert werden.

#### 4. DNR-Logik und Runtime-Logik können auseinanderlaufen

Die Extension hat zwei Blocking-Wege:

- DNR-Regeln
- programmatische Prüfung über `getActiveBlockingRuleForUrl()`

Das ist verständlich, aber gefährlich, weil zwei unabhängige Interpretationen derselben Regeln existieren (`js/background.js:189-466` vs. `595-683`). Sobald dort ein Edge Case nur an einer Stelle gefixt wird, entsteht inkonsistentes Verhalten.

Empfehlung:

- Ein gemeinsames Regelmodell
- Eine gemeinsame Matching-Bibliothek
- DNR-Regeln nur als abgeleitete technische Repräsentation
- dieselbe Pattern-Semantik in beiden Pfaden

#### 5. Toter oder nicht mehr passender Code

`blocked.js` versucht `blockedUrlElement` zu lesen und zu befüllen (`js/blocked.js:2`, `8-19`). In `html/blocked.html` existiert aber kein Element mit `id="blockedUrl"` (`html/blocked.html:60-68`). Das ist ein klares Zeichen dafür, dass UI und Skript nicht mehr synchron sind.

Ähnlich auffällig:

- `normalizePath()` in `js/background.js:27-34` wird nicht verwendet.
- Mehrere alte Kommentare deuten auf Zwischenstände hin, die nicht mehr sauber aufgeräumt wurden.

Das ist kein großer Bug, aber ein klarer Clean-Code-Mangel.

#### 6. Sehr viel Logging im Produktivcode

`js/background.js` enthält sehr viele `console.log()`- und `console.warn()`-Ausgaben über fast alle Pfade hinweg. Für das Debuggen war das sicher hilfreich. Im Dauerbetrieb ist das aber zu viel:

- erschwert Fehlersuche, weil Signal im Lärm untergeht
- macht die Datei länger als nötig
- deutet oft darauf hin, dass Tests oder klarere Hilfsstrukturen fehlen

Besser:

- ein kleines `debugLog()`-Wrapper mit Flag
- oder gezieltes Logging nur an Fehler- und Übergangspunkten

#### 7. UI-State ist implizit und dadurch fragil

In `options.js` wird Editierzustand über viele lose Variablen plus `editState` gesteuert. Zusätzlich werden Controls bei Edit wechseln, deaktiviert, geleert, neu gerendert und dynamisch eingefügt (`js/options.js:387-475`).

Das funktioniert, ist aber fehleranfällig:

- Add-Form und Edit-Form sind faktisch dasselbe UI
- beim Editieren werden andere Bereiche disabled statt klar getrennt
- Rendering und Zustandsübergänge sind eng verknüpft

Das ist kein SOLID-Verstoß im akademischen Sinn, aber ein typischer Maintainability-Schmerz.

Besser wäre:

- ein klarer `RuleStore`
- ein `renderRuleList()`
- ein separates `renderEditor(rule)`
- ein expliziter Zustand wie `mode: "create" | "edit"`

#### 8. Styling ist zu stark im HTML eingebettet

Das Template in `html/options.html:70-197` enthält viele Inline-Styles. Dadurch sind Struktur, Verhalten und Gestaltung vermischt.

Nachteile:

- Theme-Änderungen werden mühsam
- Wiederverwendbarkeit sinkt
- visuelle Konsistenz lässt sich schlechter absichern

Für eine langfristig sauberere Basis sollten diese Styles vollständig nach `css/options.css` wandern.

#### 9. Fehlende Tests für den wichtigsten Produktkern

Gerade die Pattern-Logik schreit nach Tests:

- Whitelist `/comments`
- Blacklist `/shorts`
- Slash am Ende
- Queryparameter
- Wildcards
- `www` vs. root domain
- Overnight-Schedule
- SPA-Navigation

Aktuell ist das Verhalten nur im Code eingebettet, aber nicht abgesichert. Bei einem Produkt, dessen Hauptwert aus Regelpräzision kommt, ist das der größte Engineering-Risikofaktor.

### Verbesserungsvorschläge für die Codebasis

#### Priorität A

- `rule-model.js` einführen: Normalisierung, Validierung, Pattern-Typen
- `matching.js` einführen: eine einzige Quelle für URL-Matching
- `convertToDNRRules()` in kleine Builder-Funktionen zerlegen
- `options.js` in `store`, `view`, `editor`, `validators` trennen
- tote Pfade und alte Kommentare entfernen

#### Priorität B

- formale Tests für Matching und Zeitregeln
- Logging auf Debug-Modus reduzieren
- alle Inline-Styles aus HTML nach CSS ziehen
- UI-Copy konsolidieren und vereinfachen

#### Priorität C

- Typisierung über JSDoc oder einen späteren TypeScript-Schritt
- klare Datenmigration für künftige Regelformate
- dedizierte Error- und Success-Feedback-Komponente statt `alert()`

## 2. UX / UI Review

### Bewertungsbasis

Ich habe nicht nur den Code gelesen, sondern die Extension tatsächlich geladen und die UI geprüft:

- Standardzustand der Options-Seite
- Editierzustand mit Whitelist und `/comments`
- Blocked-Seite

Verwendete Screenshots im Repo:

- `review-options-default.png`
- `review-options-whitelist-edit.png`
- `review-blocked-page.png`

### Positiv

- Die Oberfläche wirkt leichtgewichtig und technisch unkompliziert.
- Das Grundlayout ist ohne Ablenkung.
- Die Kernaktionen sind schnell erreichbar.
- Die Blocked-Seite ist sofort verständlich.

### Hauptprobleme im UX

#### 1. Das wichtigste Feature ist im UI nicht sichtbar genug

Der eigentliche USP ist Subpage-Whitelist/Blacklist. Im Standardzustand sieht man davon fast nichts. Die UI vermittelt zuerst nur: "man kann Domains blocken". Das besondere Produktversprechen bleibt versteckt, bis man aktiv auf `Edit` geht.

Das ist aus Produktsicht suboptimal. Wer den Store-Eintrag nicht genau gelesen hat, erkennt den Mehrwert nicht.

Verbesserung:

- direkt oberhalb der Listen eine kurze Erklärung mit Beispiel
- etwa: "Block reddit.com, allow /comments" oder "Block youtube.com, only block /shorts"
- Subpage-Regeln als sichtbaren Teil des Produkts kommunizieren, nicht als versteckte Expertenfunktion

#### 2. Die Informationsarchitektur ist zu flach

Die Options-Seite besteht aktuell im Wesentlichen aus zwei weißen Karten mit Formularen. Es fehlt visuelle Hierarchie:

- keine Einordnung
- kein Intro
- keine gruppierten Regelkarten
- keine erkennbare Trennung zwischen "Regel anlegen" und "Bestehende Regeln verwalten"

Im Screenshot wirkt die Seite dadurch leer, aber nicht klar.

Verbesserung:

- eine kompakte Hero-Zeile mit Nutzenversprechen
- darunter klar getrennt:
  - "Neue Regel hinzufügen"
  - "Aktive Regeln"
- pro Regel eine eigene Karte statt nur Listeneintrag

#### 3. Der Editiermodus ist funktional, aber mental anstrengend

Im Editiermodus wird das normale Formular gleichzeitig zum Bearbeitungsformular. Andere Felder werden disabled. Die Subpage-Sektion erscheint mitten im Flow.

Das führt zu mehreren UX-Problemen:

- unklar, ob man gerade "neu erstellt" oder "bestehende Regel bearbeitet"
- disabled Inputs wirken eher wie ein technischer Zustand als wie eine bewusst gestaltete Bearbeitungserfahrung
- die Save/Cancel-Logik sitzt nur innerhalb der Subpage-Sektion, obwohl man eigentlich die ganze Regel bearbeitet

Verbesserung:

- Bearbeitung als eigene Karte oder Modal/Drawer
- klarer Titel wie "Regel bearbeiten"
- Hauptdaten der Regel oben, Subpage-Strategie darunter
- Save/Cancel an einer eindeutigen Stelle

#### 4. Die Copy ist zu lang und an manchen Stellen zu technisch

Die Texte im Template erklären zwar die Funktion, aber sie sind zu ausführlich und visuell schwer scannbar (`html/options.html:93-196`). Gerade im Editierzustand wirkt das wie eine technische Erklärung, nicht wie eine gut geführte UX.

Statt:

- lange Paragraphen
- viele Klammererklärungen
- komplette Sätze in jedem Abschnitt

wäre besser:

- kurze Ein-Satz-Erklärung
- ein Beispiel direkt im Label
- ein kleines Pattern-Hinweisfeld darunter

Beispiel:

- `Whitelist: Domain blocken, diese Pfade erlauben`
- Hilfetext: `Beispiel: /comments oder /wiki/*`

#### 5. Visuelle Sprache ist generisch und wenig präzise

Die UI sieht nicht kaputt aus, aber sehr standardisiert und generisch:

- blassgrauer Hintergrund
- weiße Karten
- Standard-Systemschrift
- Standard-Buttons
- sehr wenig Kontrast in der Hierarchie

Gerade für ein Produkt rund um Fokus, Disziplin und Regelklarheit dürfte die Oberfläche deutlich entschiedener auftreten. Momentan wirkt sie eher wie ein Formular-Prototype.

Verbesserung:

- stärkere visuelle Hierarchie
- konsequente Farbsemantik
- klarere Status-Badges
- bessere Typografie
- weniger "leere Fläche", mehr Struktur

#### 6. Bestehende Regeln sind zu wenig informativ

Ein Listeneintrag zeigt im Wesentlichen nur:

- Domain
- optional Zeitspanne
- optional "Whitelisting 1 subpage"

Das ist zu wenig für ein Regelprodukt. Ein Nutzer sollte auf einen Blick sehen:

- Aktivität: immer / zeitgesteuert
- Strategie: ganze Domain / Whitelist / Blacklist
- Details: wie viele Ausnahmen
- ggf. Beispielpfad direkt sichtbar

Verbesserung:

- Regelkarten mit Badges
- z. B. `Always`, `Whitelist`, `1 exception`
- erste 1-2 Pfade direkt anzeigen

#### 7. Keine guten Empty States

Wenn keine Regeln existieren, bleiben die Listen leer (`js/options.js:310-313`). Das ist verschenktes UX-Potenzial.

Ein guter Empty State sollte erklären:

- was man hier konfigurieren kann
- worin sich "Always" und "Scheduled" unterscheiden
- warum Subpage-Ausnahmen nützlich sind

#### 8. `alert()` ist UX-technisch schwach

Die Eingabefehler und Deduplikationshinweise laufen über Browser-Alerts (`js/options.js:145-156`, `167-178`, `229-256`, `572-616`). Das unterbricht den Flow und wirkt billig.

Besser:

- Inline-Fehlermeldungen unter dem Feld
- kurze Statusmeldungen im Formular
- Success-Toast nach Speichern

#### 9. Die Blocked-Seite ist zu generisch

Die Blocked-Seite ist sauber, aber sehr minimal (`html/blocked.html:60-68`). Im Screenshot ist sofort klar, dass etwas blockiert wurde, aber die Seite nutzt den Moment nicht gut aus.

Was fehlt:

- welche Regel gegriffen hat
- welche URL blockiert wurde
- ob die Sperre permanent oder zeitgesteuert ist
- wann die Seite wieder verfügbar ist, falls es eine Zeitregel ist

Dazu kommt: Der JS-Code will die blockierte URL anzeigen, aber das Markup enthält das Element nicht (`js/blocked.js:2-19` vs. `html/blocked.html:60-68`).

Verbesserung:

- blockierte URL sichtbar machen
- optional den Regeltyp anzeigen
- bei Zeitregeln: "Wieder erlaubt ab 18:00"
- CTA "Zur Regel bearbeiten" statt nur generischem "Change Settings"

### Konkrete UX-Empfehlung für ein besseres Layout

Ich würde die Options-Seite so umstrukturieren:

#### Bereich 1: Kopfbereich

- Produktname
- kurze Ein-Satz-Erklärung
- direkt darunter ein Beispiel-Chip:
  - `Block reddit.com`
  - `Allow /comments`

#### Bereich 2: Neue Regel anlegen

- eine einzige Karte für neue Regeln
- zuerst Regeltyp wählen: `Always` oder `Scheduled`
- dann Domain
- dann optional "Subpage strategy"
- Standardtext: "By default, the whole domain is blocked"

#### Bereich 3: Aktive Regeln

- jede Regel als Karte
- Badges für Typ und Strategie
- kurze Vorschau der Pfade
- Aktionen klar getrennt: `Edit`, `Delete`

#### Bereich 4: Hilfe für Pattern

- kleines Hilfefeld mit 4 Beispielen:
  - `/comments`
  - `/wiki/*`
  - `/shorts`
  - `/?feed=home`

Das würde den Produktkern wesentlich klarer machen.

## 3. Antwort auf die Framework-Frage

Für dieses Projekt gilt heute praktisch: ja, ihr arbeitet in Vanilla HTML/CSS/JS. Nicht weil Chrome-Extensions keine Frameworks könnten, sondern weil dieses Repo kein Build-System dafür vorbereitet.

Wichtig ist aber:

- Frameworks sind in Chrome-Extensions grundsätzlich möglich
- React, Vue oder Svelte würden einen Bundler brauchen
- für diese konkrete Codebasis ist Vanilla aktuell die richtige Beschreibung

Das heißt nicht, dass die Struktur simpel bleiben muss. Auch in Vanilla JS kann man sauber modularisieren.

## 4. Empfohlene Reihenfolge der Verbesserungen

### Phase 1: Grundlage stabilisieren

- gemeinsames Regelmodell extrahieren
- Matching-Semantik schärfen
- doppelte Validierung entfernen
- tote UI-/JS-Pfade bereinigen
- Alerts durch Inline-Feedback ersetzen

### Phase 2: UX klarziehen

- neue Informationsarchitektur für Options-Seite
- Regelkarten statt nackter Listen
- Editiermodus als klar separierter Bereich
- Empty States und Pattern-Beispiele hinzufügen
- Blocked-Seite um URL und Regelkontext erweitern

### Phase 3: Wartbarkeit erhöhen

- Tests für Pattern-Matching und Zeitregeln
- kleinere Module in `js/`
- CSS aus Inline-Styles lösen
- optional später TypeScript oder JSDoc-Typisierung

## Schlussbewertung

Die Extension hat einen guten Kern und ein tatsächlich differenzierendes Feature. Das größte Problem ist nicht, dass "nichts funktioniert", sondern dass Produktlogik, Regelmodell und UI noch nicht präzise genug aufeinander abgestimmt sind.

Technisch ist vor allem das Matching-Modell der entscheidende Punkt. UX-seitig ist das Hauptproblem, dass das beste Feature zu versteckt und die Bearbeitungserfahrung zu technisch wirkt. Wenn ihr genau diese zwei Ebenen schärft, kann aus der aktuellen funktionalen Extension ein deutlich professionelleres Produkt werden.
