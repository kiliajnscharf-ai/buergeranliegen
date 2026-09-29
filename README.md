# Bürger-Anliegen Bad Pyrmont

Einfache Browser-App für Bürgerinnen und Bürger in Bad Pyrmont, um Anliegen an den SPD-Ortsverein zu richten.

## Was die App macht

- **Bürger-Modus:** Thema, Dringlichkeit und Text eingeben, optional Name/Ort/Standort, dann Anliegen per WhatsApp weiterleiten.
- **Bürger-Link mit QR-Code:** Hajo kann einen Link oder einen QR-Code weitergeben. Der Link öffnet direkt den Bürger-Modus.
- **Helfer-Bereich:** lokale Verwaltung von Anliegen, Ideen und Terminen im Browser (optional PDF und KI-Hilfe).

## Datenschutz

- Es werden **keine persönlichen Daten auf diesem Server gespeichert**.
- Die App läuft **nur im Browser** (statische Webseite).
- Bürger-Nachrichten gehen über WhatsApp; Helfer-Daten bleiben lokal im Browser (`localStorage`).
- Der QR-Code wird im Browser erzeugt, ohne fremden Dienst.
- Kein Service Worker, kein Manifest, keine PWA – bewusst kein Offline-Zwang.

## Nutzung

Einfach die veröffentlichte Seite im Browser öffnen (auch auf dem iPhone). Keine Installation nötig.

Version 2.4.0 (öffentliche Web-Version, ohne eingebauten API-Schlüssel).
