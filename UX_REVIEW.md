# UX Review: SiteBlocker Free

## Rolle und Maßstab

Diese Review bewertet die Extension aus Sicht eines kritischen Senior Product Designers. Maßstab ist nicht, ob die Oberfläche "modern" wirkt, sondern ob sie schnell verständlich ist, Vertrauen schafft und Nutzer mit minimaler mentaler Last zu einer korrekten Regel führt.

## Was das Produkt tun soll

SiteBlocker Free ist kein einfacher Website-Blocker, sondern ein Regelwerk fuer fokussiertes Browsen:

- Ganze Domains blockieren
- Domains nur zu bestimmten Uhrzeiten blockieren
- Innerhalb einer Domain gezielt Pfade erlauben oder blockieren
- Bestehende Regeln pruefen, bearbeiten und loeschen
- Auf einer Blocked-Page erklaeren, warum eine Seite gerade gesperrt ist

Der Kernnutzen liegt nicht im reinen "Website blocken", sondern in der kontrollierten Ausnahme:

- `youtube.com` blockieren, aber einen bestimmten Kurs-Link erlauben
- `reddit.com` blockieren, aber `/comments` erlauben
- `youtube.com` offen lassen, aber `/shorts` blockieren

Genau dieser differenzierte Anwendungsfall muss in der UX sofort sichtbar und leicht bedienbar sein.

## Nutzeraufgaben

Die UI muss vor allem diese Aufgaben unterstuetzen:

1. Schnell verstehen, welche Arten von Regeln es gibt.
2. In wenigen Sekunden eine neue Regel korrekt anlegen.
3. Verstehen, ob eine Regel die ganze Domain oder nur Teilbereiche betrifft.
4. Verstehen, wann eine Regel aktiv ist.
5. Bestehende Regeln sicher pruefen und anpassen.
6. Im Block-Fall erkennen, was gesperrt wurde und was als Naechstes zu tun ist.

## Gepruefte Oberflaechen

- Options-Seite
- Regel-Editor
- Regelkarten
- Empty State
- Blocked-Page

## Zusammenfassung

Die aktuelle App hat die richtigen Features, praesentiert sie aber mit zu hoher kognitiver Last. Das UI versucht gleichzeitig zu erklaeren, zu konfigurieren und zu bestaetigen. Dadurch wirkt es voll, textlastig und schwer scannbar. Die Folge: der Nutzer muss die Seite lesen, statt sie intuitiv zu bedienen.

## Schwere UX-Probleme

### 1. Zu viel Erklaerung vor zu wenig Handlung

Die Seite startet mit sehr viel Text, mehreren Panels und Beispielchips, bevor der Nutzer eine klare, lineare Aufgabe bekommt. Das erzeugt Reibung direkt am Einstieg.

Folgen:

- Der Blick findet keinen klaren Startpunkt.
- Das Produkt fuehlt sich komplexer an, als es sein muesste.
- Einfache Aufgaben wie "reddit.com immer blocken" wirken unnötig schwer.

### 2. Die wichtigste Produktlogik ist nicht einfach genug visualisiert

Whitelist- und Blacklist-Modi sind der eigentliche Mehrwert des Produkts. In der aktuellen UI muessen Nutzer jedoch die Texte lesen, um den Unterschied sicher zu verstehen.

Folgen:

- "Whole domain", "Whitelist paths" und "Blacklist paths" fuehlen sich technisch statt alltagsnah an.
- Nutzer muessen Logik interpretieren statt nur eine klare Entscheidung treffen.
- Fehler beim Erstellen einer Regel werden wahrscheinlicher.

### 3. Die Seite ist visuell ueberladen

Der Screen arbeitet gleichzeitig mit:

- dunklem Hintergrund
- mehreren Panel-Ebenen
- dichten Border-Strukturen
- vielen Badges
- grossen Textbloecken
- starken Hell-Dunkel-Wechseln zwischen Editor und Regelkarten

Folgen:

- geringe visuelle Ruhe
- schlechtere Lesbarkeit ueber laengere Strecken
- "Dashboard"-Anmutung statt klares Werkzeug

### 4. Lesefluss und Hierarchie sind zu schwach

Wichtige Inhalte konkurrieren visuell miteinander. Metriken, Editor, Hilfe, Beispiele und Regelkarten beanspruchen fast dieselbe Aufmerksamkeit.

Folgen:

- Nutzer wissen nicht sofort, was primär und was sekundär ist.
- Statusinformationen und Bedienung sind nicht sauber getrennt.
- Das Produkt wirkt schwerer, als es funktional ist.

### 5. Die Regelvorschau ist noch nicht konkret genug

Nutzer muessen sicher verstehen koennen, was eine Regel spaeter tut. Die aktuelle Vorschau hilft, ist aber noch zu abstrakt und zu textnah.

Es fehlt eine wirklich klare, natuerliche Formulierung wie:

- "Block reddit.com den ganzen Tag."
- "Block youtube.com von 08:00 bis 12:00, ausser /watch?v=..."
- "Lass youtube.com offen, blocke aber /shorts."

### 6. Die Regelkarten sind noch zu dicht

Die Karten enthalten viele Elemente gleichzeitig: Domain, Badges, Text, zwei Detailboxen und Aktionen. Das ist informativer als eine simple Liste, aber noch immer anstrengend.

Folgen:

- Scanbarkeit leidet
- Karten wirken schwer
- wichtige Informationen sind nicht schnell genug priorisiert

### 7. Mobile und enge Viewports fuehlen sich komprimiert an

Durch viele uebereinanderliegende Card-Layer, dense Controls und viele horizontale UI-Elemente steigt auf kleineren Breiten die visuelle Last nochmals.

### 8. Die Blocked-Page ist funktional, aber noch nicht hilfreich genug

Eine Blocked-Page ist ein emotionaler Moment: der Nutzer wollte etwas oeffnen und wurde gestoppt. In diesem Moment muss die UI maximal klar sein.

Die Seite braucht daher:

- eindeutige Benennung der blockierten URL
- klaren Regelkontext
- klare Aussage, ob die Sperre zeitlich endet
- einen offensichtlichen naechsten Schritt

## UX-Ziele fuer das Redesign

### Primäre Ziele

- Weniger mentale Last
- Bessere Lesbarkeit
- Schnellere Verstehbarkeit
- Klarere Priorisierung
- Deutlich einfachere Regelbildung

### Designprinzipien

- Ein Screen, ein Hauptfokus
- Kurze Copy statt Erklaerblaecke
- Hoher Kontrast bei Text, sanfter Kontrast bei Flaechen
- Logik in alltagsnaher Sprache
- Vorschau in natuerlichen Saetzen
- Bestehende Regeln als ruhig lesbare Zusammenfassungen

## Konkrete Umsetzungsanweisungen

### Options-Seite

- Hero drastisch vereinfachen
- weniger dekorative Panels
- klare Zweiteilung in "Neue Regel" und "Bestehende Regeln"
- Hilfe nur dort zeigen, wo sie gebraucht wird
- Inputs gross, ruhig und klar beschriftet
- Moduswahl als deutliche inhaltliche Entscheidung, nicht als technische Radiogruppe
- Pfad-Modi mit alltagsnaher Sprache formulieren
- Live-Vorschau in natuerlicher Sprache
- Regelkarten visuell entschlacken
- Statistik kleiner und unaufdringlicher integrieren

### Copy

- kuerzer
- konkreter
- weniger technisch
- mehr Nutzenbezug

### Blocked-Page

- Block-Grund prominent
- URL gut lesbar
- Regeltyp und Zeitkontext klar
- klare CTA-Struktur

## Akzeptanzkriterien fuer Runde 1

- Ein neuer Nutzer versteht innerhalb weniger Sekunden, wie er eine einfache Domain-Regel erstellt.
- Ein Nutzer versteht ohne langes Lesen den Unterschied zwischen Domain blocken, Pfade erlauben und Pfade blocken.
- Eine bestehende Regel laesst sich auf einen Blick erfassen.
- Die Seite wirkt nicht mehr ueberfordernd.
- Die Blocked-Page erklaert den Zustand klarer als vorher.

## Review nach Umsetzung

### Iteration 1: Ergebnis

Die erste Umsetzung hat die groessten UX-Probleme deutlich reduziert:

- Die Seite ist ruhiger und besser lesbar.
- Der Einstieg ist klarer.
- Die Regelarten sind in alltagsnaher Sprache formuliert.
- Die Live-Vorschau erklaert Regeln wesentlich besser.
- Bestehende Regeln lassen sich schneller scannen.
- Die Blocked-Page ist klarer und hilfreicher.

### Verbleibende Probleme nach Iteration 1

Es gab noch einen wichtigen Restpunkt:

- Der gleiche Editor wurde fuer "Erstellen" und "Bearbeiten" genutzt. Das war schon besser als vorher, aber der Zustand konnte noch klarer benannt werden.

### Iteration 2: Nachschaerfung

Dieser Punkt wurde im zweiten Durchgang adressiert:

- Der Editor markiert jetzt explizit, ob gerade eine neue Regel erstellt oder eine bestehende Regel bearbeitet wird.

### Finaler Produktdesigner-Befund

Aus UX-Sicht hat die App jetzt keine grossen Probleme mehr.

Die wichtigsten Gruende:

- Der Screen startet mit einer klaren Produkterklaerung statt mit einem ueberfrachteten Dashboard.
- Die Hauptaufgabe "Regel erstellen" hat einen deutlichen Fokus.
- Whitelist- und Blacklist-Logik sind viel schneller zu verstehen.
- Die Regelvorschau formuliert Konsequenzen in natuerlicher Sprache.
- Bestehende Regeln sind ruhiger aufgebaut und besser lesbar.
- Die Blocked-Page erklaert den Zustand klar und nennt den naechsten Schritt.

### Was nur noch kleinere Restthemen sind

- Weitere Feinarbeit an Texten fuer sehr unerfahrene Nutzer
- Optional spaeter Filter oder Sortierung bei vielen Regeln
- Optional spaeter visuelle Gruppierung fuer sehr grosse Regelsammlungen

Diese Punkte sind keine grossen UX-Blocker mehr. Der aktuelle Stand ist fuer den Produktkern klar, belastbar und deutlich nutzerfreundlicher als der Ausgangspunkt.
