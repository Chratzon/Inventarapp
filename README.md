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

- **QR-Code** mit dem Link `…/#/i/<Inventarnummer>`. Gescannt öffnet er die App direkt bei diesem
  Gerät, auch über die normale Kamera-App des Handys.
- **Barcode** in Code 128 mit der Inventarnummer, lesbar von jedem Handscanner.
- **Druckdatei**: „Etikett drucken" erzeugt einen Bogen zum Ausdrucken, „Etikett als SVG" speichert
  eine verlustfreie Vektordatei für Etikettendrucker oder Druckerei.

Unter Ausgabe → Etiketten entstehen Bögen für viele Geräte auf einmal: Größe 40 × 25, 60 × 35 oder
90 × 50 mm, Stückzahl je Gerät und Inhalt wählbar. Gedruckt wird maßstabsgetreu in Millimeter,
die gestrichelten Rahmen sind die Schnittkanten. Im Druckdialog die Skalierung auf 100 % stellen.

## Scannen

Das Symbol ▣ in der Kopfzeile öffnet den Scanner. Unter Android liest Chrome QR- und Barcodes
direkt in der App. iOS erlaubt das keinem Browser – dort die normale Kamera-App verwenden.
Ersatzweise lässt sich die Inventarnummer im Scanfenster eintippen.

## Inventarnummern

Sie entstehen aus dem Kürzel der Produktgruppe und laufen je Gruppe fortlaufend weiter:
`KAB-001`, `KAB-002`, `LIC-001`. Ohne eigenes Kürzel werden die ersten drei Buchstaben des
Gruppennamens verwendet. Die vorgeschlagene Nummer lässt sich beim Anlegen überschreiben.

## Wenn Änderungen nicht ankommen

Die App liefert Programmdateien zuerst aus dem Netz und fällt nur offline auf den Cache zurück.
Trotzdem gilt: bei jeder Änderung an `app.js`, `codes.js` oder `styles.css` die Cache-Version in
`sw.js` hochzählen (`roadcase-v3` → `roadcase-v4`). Unter Daten zeigt die App ihren Stand an;
steht dort ein alter Wert, läuft noch die vorherige Fassung. Dann die Seite einmal online öffnen,
schließen und neu starten – oder das Symbol vom Startbildschirm löschen und neu hinzufügen.

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
