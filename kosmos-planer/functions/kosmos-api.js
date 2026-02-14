import { google } from 'googleapis';

// Authentifizierung mit Google Service Account (Environment Variables)
const getAuth = () => {
  // Diese Variablen müssen in Netlify unter "Site configuration > Environment variables" gesetzt werden
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  // Private Key muss Zeilenumbrüche korrekt behandeln (\n)
  const privateKey = process.env.GOOGLE_PRIVATE_KEY 
    ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') 
    : undefined;

  if (!clientEmail || !privateKey) {
    throw new Error('Server-Konfiguration fehlt (Google Credentials)');
  }

  const auth = new google.auth.JWT(
    clientEmail,
    null,
    privateKey,
    ['https://www.googleapis.com/auth/spreadsheets']
  );

  return auth;
};

// Einfache Benutzer-Validierung
const checkAuth = (headers) => {
  const authHeader = headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  
  // Wir nutzen eine Umgebungsvariable für erlaubte Passwörter (komma-separiert)
  // z.B. "geheim123,admin2024"
  const allowedPasswords = (process.env.APP_PASSWORDS || '').split(',');
  
  if (!token || !allowedPasswords.includes(token)) {
    return false;
  }
  return true;
};

export const handler = async (event, context) => {
  // 1. Sicherheit: Prüfen ob der Nutzer das App-Passwort hat
  if (!checkAuth(event.headers)) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Falsches Passwort. Zugriff verweigert.' }),
    };
  }

  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SPREADSHEET_ID; // Zentral hinterlegt

    // GET Request: Daten Laden
    if (event.httpMethod === 'GET') {
      const ranges = [
        `'26_Kosmos_SprecherInnen'!A2:I`,
        `'26_Kosmos_Moderation'!A2:C`,
        `'Programm_Export'!A2:N`,
        `'Bühnen_Import'!A2:H`
      ];

      const response = await sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges,
      });

      return {
        statusCode: 200,
        body: JSON.stringify(response.data),
      };
    }

    // POST Request: Daten Speichern
    if (event.httpMethod === 'POST') {
      const { range, values } = JSON.parse(event.body);

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        resource: { values },
      });

      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Gespeichert' }),
      };
    }

    return { statusCode: 405, body: 'Method Not Allowed' };

  } catch (error) {
    console.error('API Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
