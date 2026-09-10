# Roadcase – Bandinventar

PWA für das Equipment der Band: Produktgruppen, Geräte mit Inventarnummer, Zustandsdokumentation
mit Fotos, Verleih mit Übergabe- und Rückgabeprotokoll, QR- und Barcode-Etiketten, Scanfunktion,
Ausgabe in einstellbarem Detailgrad. Alle Daten bleiben lokal im Browser, die App läuft offline.

## Veröffentlichen

1. Repository anlegen (public), diese Dateien ins Wurzelverzeichnis hochladen,
   der Ordner `icons` muss ein Ordner bleiben.
2. Settings → Pages → Source `Deploy from a branch`, Branch `main`, Ordner `/ (root)`, speichern.
3. Nach ein bis zwei Minuten läuft die Seite unter `https://<benutzer>.github.io/<repo>/`.

## Auf dem Handy installieren

- iPhone: Adresse in **Safari** öffnen, Teilen-Symbol → „Zum Home-Bildschirm" → „Hinzufügen".
- Android: in Chrome das Dreipunkt-Menü → „App installieren".

Die Daten hängen an der Adresse. Immer dieselbe URL nutzen und die App vom Startbildschirm öffnen.

## Codes und Etiketten

Jedes Gerät bekommt automatisch drei Dinge, sichtbar in der Detailansicht unter „Etikett und Codes":

- **QR-Code** mit dem Link `…/#/i/<Inventarnummer>`. Wird er gescannt, öffnet sich die App direkt
  bei diesem Gerät — auch mit der normalen Kamera-App des Handys.
- **Barcode** in Code 128 mit der Inventarnummer, lesbar von jedem Handscanner.
- **Druckdatei**: „Etikett drucken" erzeugt einen Bogen zum Ausdrucken, „Etikett als SVG" speichert
  eine verlustfreie Vektordatei für Etikettendrucker oder Druckerei.

Unter Ausgabe → Etiketten lassen sich Bögen für viele Geräte auf einmal erzeugen: Größe
40 × 25, 60 × 35 oder 90 × 50 mm, Stückzahl je Gerät und Inhalt (QR, Barcode, Bezeichnung) wählbar.
Gedruckt wird maßstabsgetreu in Millimeter, die gestrichelten Rahmen sind die Schnittkanten.
Wichtig: im Druckdialog die Skalierung auf 100 % stellen, nicht „an Seite anpassen".

## Scannen

Das Symbol ▣ oben in der Kopfzeile öffnet den Scanner. Unter Android liest Chrome QR- und
Barcodes direkt in der App. iOS erlaubt das keinem Browser — dort die normale Kamera-App
verwenden, die den QR-Code liest und die App am richtigen Gerät öffnet. Ersatzweise lässt sich
die Inventarnummer im Scanfenster eintippen.

## Nach Änderungen

Bei jeder Änderung an `app.js`, `codes.js` oder `styles.css` die Cache-Version in `sw.js` hochzählen
(`roadcase-v3` → `roadcase-v4`), sonst liefert der Service Worker die alte Fassung aus.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Grundgerüst und Ansichten |
| `styles.css` | Gestaltung inklusive Druckstile |
| `app.js` | Datenbank, Ansichten, Verleih, Etiketten, Ausgabe |
| `codes.js` | QR- und Code-128-Erzeugung, ohne Fremdbibliothek |
| `sw.js` | Service Worker für den Offline-Betrieb |
| `manifest.webmanifest` | Installierbarkeit, Name, Icons |
| `icons/` | App-Icons (SVG, 192, 512) |
