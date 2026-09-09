# Roadcase – Bandinventar

PWA für das Equipment der Band: Produktgruppen, Geräte mit Inventarnummer, Zustandsdokumentation
mit Fotos, Verleih mit Übergabe- und Rückgabeprotokoll, Ausgabe in einstellbarem Detailgrad.
Alle Daten bleiben lokal im Browser, die App läuft offline.

## Veröffentlichen

1. Repository anlegen (public), diese acht Dateien ins Wurzelverzeichnis hochladen,
   der Ordner `icons` muss ein Ordner bleiben.
2. Settings → Pages → Source `Deploy from a branch`, Branch `main`, Ordner `/ (root)`, speichern.
3. Nach ein bis zwei Minuten läuft die Seite unter `https://<benutzer>.github.io/<repo>/`.

## Auf dem Handy installieren

- iPhone: Adresse in **Safari** öffnen, Teilen-Symbol → „Zum Home-Bildschirm" → „Hinzufügen".
- Android: in Chrome das Dreipunkt-Menü → „App installieren".

Die Daten hängen an der Adresse. Immer dieselbe URL nutzen und die App vom Startbildschirm öffnen.

## Nach Änderungen

Bei jeder Änderung an `app.js` oder `styles.css` die Cache-Version in `sw.js` hochzählen
(`roadcase-v2` → `roadcase-v3`), sonst liefert der Service Worker die alte Fassung aus.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Grundgerüst und Ansichten |
| `styles.css` | Gestaltung inklusive Druckstile |
| `app.js` | Datenbank, Ansichten, Verleih, Ausgabe |
| `sw.js` | Service Worker für den Offline-Betrieb |
| `manifest.webmanifest` | Installierbarkeit, Name, Icons |
| `icons/` | App-Icons (SVG, 192, 512) |
