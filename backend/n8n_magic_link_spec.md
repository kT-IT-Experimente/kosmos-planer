# n8n Magic Link Workflow Specification

## Endpoint 1: `POST /auth/request-magic-link`

### Webhook Node
- Path: `/auth/request-magic-link`
- Method: POST
- Response mode: lastNode

### Input Body
```json
{
  "email": "user@example.com",
  "adminInvite": false  // true when sent from Admin Dashboard
}
```

### Logic Flow

1. **Read Open Call Status** (Google Sheets)
   - Sheet: `Config_Users`, Cell: `D1`
   - Value: `"OPEN"` or `"CLOSED"`

2. **Check if user exists** (Google Sheets)
   - Sheet: `Config_Users`, search column A for `email`
   - If found: get existing role from column B

3. **Decision: Allow or reject?**
   - If `adminInvite === true` → always allow (admin bypass)
   - If Open Call = `"OPEN"` → allow (self-registration)
   - If Open Call = `"CLOSED"` AND user exists → allow (returning user)
   - If Open Call = `"CLOSED"` AND user does NOT exist → reject

4. **Generate JWT Token** (Code Node / Crypto)
   ```javascript
   const jwt = require('jsonwebtoken');
   const SECRET = $env.MAGIC_LINK_SECRET; // set in n8n environment
   const token = jwt.sign(
     { email, role: existingRole || 'TEILNEHMENDE' },
     SECRET,
     { expiresIn: '7d' }
   );
   ```

5. **Send Email** (Gmail / SMTP Node)
   - To: `email`
   - Subject: `Dein Login-Link für Kosmos Planner`
   - Body (HTML):
   ```html
   <h2>Hallo!</h2>
   <p>Hier ist dein persönlicher Login-Link für den Kosmos Planner:</p>
   <p><a href="https://YOUR_SITE_URL/?magic={{token}}">Jetzt einloggen →</a></p>
   <p>Der Link ist <strong>7 Tage</strong> gültig.</p>
   <p><small>Falls du diesen Link nicht angefordert hast, kannst du diese Email ignorieren.</small></p>
   ```

6. **Response**
   ```json
   { "ok": true, "message": "Magic Link gesendet" }
   ```
   or on reject:
   ```json
   { "ok": false, "error": "Der Open Call ist geschlossen. Nur eingeladene Personen können sich anmelden." }
   ```

---

## Endpoint 2: `POST /auth/verify-magic`

### Webhook Node
- Path: `/auth/verify-magic`
- Method: POST
- Response mode: lastNode

### Input Body
```json
{ "token": "eyJhbGciOiJIUzI1..." }
```

### Logic Flow

1. **Verify JWT** (Code Node)
   ```javascript
   const jwt = require('jsonwebtoken');
   const SECRET = $env.MAGIC_LINK_SECRET;
   try {
     const decoded = jwt.verify(token, SECRET);
     // decoded: { email, role, iat, exp }
   } catch (err) {
     return { ok: false, error: 'Token ungültig oder abgelaufen' };
   }
   ```

2. **Check if user exists in Config_Users** (Google Sheets)
   - Sheet: `Config_Users`, search for `email`

3. **If user does NOT exist → Create** (Google Sheets Append)
   - Append row: `[email, "TEILNEHMENDE", "", ISO_TIMESTAMP]`
   - Set `isNewUser = true`

4. **If user exists → Read current role** (Google Sheets)
   - Use the role from Config_Users (may have been updated by Admin)
   - Set `isNewUser = false`

5. **Response**
   ```json
   {
     "ok": true,
     "email": "user@example.com",
     "role": "TEILNEHMENDE",
     "name": "",
     "isNewUser": true
   }
   ```

---

## n8n Environment Variable

Set in n8n Settings → Environment Variables:
```
MAGIC_LINK_SECRET = <random 32+ char string>
```

Example: `openssl rand -hex 32`

---

## Required n8n Packages

The `jsonwebtoken` package must be available in n8n. If using Docker:
```bash
docker exec -it n8n npm install jsonwebtoken
```

Or set in `docker-compose.yml`:
```yaml
environment:
  - NODE_FUNCTION_ALLOW_EXTERNAL=jsonwebtoken
```
