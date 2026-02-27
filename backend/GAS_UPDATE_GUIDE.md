# GAS Update-Anleitung: Sanity.io-kompatible Timestamps 🚀

So aktualisierst du das Google Apps Script Backend mit den neuen `_updatedAt`/`_lastModified` Funktionen.

## Schritt 1: Apps Script Editor öffnen

1. Öffne dein [Kosmos_Programm_Master Google Sheet](https://docs.google.com/spreadsheets/d/1u12ILaBSj5B3Iy3yh6DYyanSIp7UQjimOBw61yYVmME/)
2. Klicke auf **Extensions** → **Apps Script**
3. Der Script Editor öffnet sich in einem neuen Tab

## Schritt 2: Code.gs aktualisieren

1. Im Script Editor siehst du die Datei `Code.gs` links in der Dateiliste
2. **Markiere den gesamten Code** (`Cmd+A`) und **lösche ihn**
3. Kopiere den kompletten Inhalt aus der lokalen Datei:
   [backend/gas/Code.gs](file:///Users/enrique/Library/Mobile%20Documents/com~apple~CloudDocs/Programieren/Kosmos%20Planer/kosmos-planer/backend/gas/Code.gs)
4. **Füge ihn ein** (`Cmd+V`)
5. Klicke **Speichern** (`Cmd+S`)

## Schritt 3: GDPR_Audit_Log Sheet erstellen (optional)

1. Gehe zurück zum Google Sheet
2. Erstelle einen neuen Tab unten: Klick auf **+**
3. Benenne ihn `GDPR_Audit_Log`
4. Füge in Zeile 1 folgende Header ein:

| A | B | C | D |
|---|---|---|---|
| Action | Email_Hash | Timestamp | Details |

## Schritt 4: Neues Deployment erstellen

> ⚠️ **Wichtig:** Du musst ein **neues** Deployment erstellen, nicht das alte aktualisieren!

1. Im Script Editor: Klicke auf **Deploy** → **New deployment**
2. Klicke auf das ⚙️ Zahnrad neben "Select type" → wähle **Web app**
3. Konfiguration:
   - **Description**: `Kosmos API v2 — Sanity-kompatibel`
   - **Execute as**: `Me` (dein Account)
   - **Who has access**: `Anyone` (oder `Anyone within [Organisation]`)
4. Klicke **Deploy**
5. **Kopiere die neue Web App URL** — sie sieht so aus:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

## Schritt 5: Berechtigungen bestätigen

Beim ersten Mal nach dem Update:
1. Google fragt nach Berechtigungen → Klicke **Review Permissions**
2. Wähle deinen Account
3. Klicke **Advanced** → **Go to [Projektname] (unsafe)**
4. Klicke **Allow**

> Die neue Berechtigung `DriveApp` wird benötigt, weil `getSheetLastModified()` jetzt das Datei-Änderungsdatum aus Google Drive liest.

## Schritt 6: URL im Kosmos Planer aktualisieren

1. Öffne den Kosmos Planer (localhost oder Netlify)
2. Klicke auf ⚙️ **Settings**
3. Ersetze die **Curation API URL** mit der neuen Web App URL
4. Klicke **Speichern & Reload**

## Was ist neu?

Die API-Antwort enthält jetzt:

```json
{
  "sessions": [
    {
      "id": "ANTIGRAV-0001",
      "title": "...",
      "_updatedAt": "2026-02-27T19:00:00Z",
      "_createdAt": "2026-02-20T10:30:00Z"
    }
  ],
  "_lastModified": "2026-02-27T19:45:00Z",
  "_totalCount": 42,
  "_filteredCount": 42,
  "_since": null,
  "userRole": "ADMIN"
}
```

### Inkrementeller Sync testen

Füge `?since=2026-02-27T00:00:00Z` an die URL an → du erhältst nur Sessions, die nach diesem Zeitpunkt geändert wurden.

### Sanity.io Kompatibilität

Die Timestamps sind direkt in Sanity GROQ nutzbar:
```groq
*[dateTime(_updatedAt) > dateTime("2026-02-27T18:00:00Z")]
```
