# Roadcase – Bandinventar

PWA für das Equipment der Band: Produktgruppen, einzeln angelegte Geräte mit Inventarnummer, Zustandsdokumentation mit Fotos, Verleih mit Übergabe- und Rückgabeprotokoll, Ausgabe in einstellbarem Detailgrad.

Alle Daten liegen ausschließlich lokal im Browser (IndexedDB). Kein Server, kein Konto, offline nutzbar.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html` | Grundgerüst und Ansichten |
| `styles.css` | Gestaltung, inklusive Druckstile |
| `app.js` | Datenbank, Ansichten, Verleih, Ausgabe |
| `sw.js` | Service Worker, App-Shell offline |
| `manifest.webmanifest` | Installierbarkeit |
| `icons/` | App-Icons (SVG + PNG, auch maskable) |
| `.nojekyll` | verhindert Jekyll-Verarbeitung auf GitHub Pages |

## Funktionen

**Produktgruppen** – Name, Kürzel, Farbe. Aus dem Kürzel entstehen fortlaufende Inventarnummern (`KAB-001`, `LIC-004`). Über „Daten → Startgruppen anlegen" kommen Kabel, Licht, Mikrofone, Backline, Cases und Zubehör auf einen Schlag rein.

**Geräte** – jedes Objekt einzeln: Bezeichnung, Gruppe, Inventarnummer (automatisch, überschreibbar), Hersteller, Modell, Seriennummer, Anzahl, Kaufdatum, Wert, Zustand, Status, Lagerort, Bemerkung, Fotos.

**Historie** – je Gerät Einträge vom Typ Notiz, Schaden, Reparatur, Wartung, Ausgabe, Rückgabe, jeweils mit Datum, Text und Fotos. Offene Schäden sind in der Liste als roter Punkt sichtbar; eine Reparatur kann sie in einem Schritt schließen.

**Verleih** – Entleiher, Kontakt, Anlass, Ausgabe- und Rückgabedatum, Geräteauswahl. Bei der Ausgabe hältst du den Zustand je Gerät mit Fotos fest, die Geräte gehen automatisch auf „Verliehen". Bei der Rückgabe stehen die Ausgabefotos direkt neben dem Rückgabe-Check: Zustand wählen, Schaden ankreuzen, Fotos machen. Angekreuzte Schäden erzeugen automatisch einen Historieneintrag am Gerät und setzen es auf „Defekt".

**Ausgabe** – Umfang wählen (alles, einzelne Gruppen oder handverlesene Geräte) und Detailgrad einstellen: kompakte Tabelle oder ausführlich je Gerät, technische Daten, Anschaffung und Wert, Zustand und Status, Historie (ohne / nur offene Schäden / vollständig), Fotos (ohne / Titelfoto / alle). Ergebnis: Druckvorschau (daraus PDF), HTML-Datei mit eingebetteten Fotos oder CSV für Excel. Übergabe- und Rückgabeprotokolle mit Unterschriftszeilen kommen aus dem jeweiligen Verleih.

**Daten** – Sicherung als JSON mit oder ohne Fotos, Wiedereinlesen, komplettes Löschen, Anzeige des belegten Speichers.

## Deploy auf GitHub Pages

1. Neues Repository anlegen, zum Beispiel `roadcase`. Sichtbarkeit public, sonst funktioniert Pages nur im bezahlten Plan.
2. Alle Dateien ins Wurzelverzeichnis hochladen: `index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `.nojekyll` und den Ordner `icons/`. Die Datei `roadcase-einzeldatei.html` wird dort nicht gebraucht.
3. Settings → Pages → Source: `Deploy from a branch`, Branch `main`, Ordner `/ (root)`, speichern. Nach ein bis zwei Minuten läuft die Seite unter `https://<benutzer>.github.io/<repo>/`.
4. Optional statt Schritt 3: Source auf `GitHub Actions` stellen, dann übernimmt `.github/workflows/pages.yml` die Veröffentlichung.

Alle Pfade sind relativ, das Repository kann also beliebig heißen.

## Auf dem Smartphone installieren

Die Pages-Adresse am Handy öffnen, dann:

- **iPhone/iPad:** in **Safari** öffnen (Chrome kann das unter iOS nicht), Teilen-Symbol → „Zum Home-Bildschirm" → „Hinzufügen".
- **Android:** in Chrome das Dreipunkt-Menü → „App installieren".

Danach startet Roadcase im Vollbild mit eigenem Icon und läuft ohne Netz. In der App unter „Daten → Installation erklären" steht dieselbe Anleitung noch einmal.

Wichtig: die Daten hängen an der Adresse. Immer dieselbe URL verwenden und die App vom Startbildschirm aus öffnen, sonst startet sie mit leerem Inventar. Ein Wechsel des Repository-Namens bedeutet ein leeres Inventar — dann vorher eine Sicherung exportieren und danach wieder einlesen. Nach einer Änderung an `app.js` oder `styles.css` die Version in `sw.js` hochzählen (`roadcase-v1` → `roadcase-v2`), sonst liefert der Cache die alte Fassung aus.

## Hinweise

- Fotos werden vor dem Speichern auf max. 1400 px verkleinert (JPEG, Qualität 0,72). Ein Bild landet damit bei grob 150–350 KB.
- Der Browser darf lokale Daten bei Platzmangel verwerfen. Die App fordert dauerhaften Speicher an, trotzdem gehört eine Sicherung nach größeren Erfassungsrunden zur Routine.
- Im privaten Modus mancher Browser ist IndexedDB gesperrt; die App zeigt dann einen Hinweis statt der Liste.
- Fotoaufnahme über die Kamera funktioniert nur über HTTPS oder `localhost` — auf GitHub Pages also gegeben.
