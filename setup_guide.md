# Step-by-Step GAS Setup Guide 🚀

Follow these steps to set up the Google Apps Script (GAS) backend for your Kosmos Festival Curation system.

## 1. Create the Google Spreadsheet
1. Go to [sheets.new](https://sheets.new) or open your existing Google Sheet.
2. Create the following sheets (tabs) at the bottom:
   - `Master_Einreichungen`: This is where your Google Form responses go.
   - `Review_Kuratierung`: The anonymized view for curators.
   - `_Internal_ID_Mapping_`: Hidden sheet for pseudonymization logic.
   - `Config_Users`: For Access Control (Roles).

## 2. Configure `Config_Users` Sheet
Add these headers to the first row of `Config_Users`:
- `Email` | `Role`

Add your email and set the role to `ADMIN`.

## 3. Open the Script Editor
1. In your Google Sheet, click on **Extensions** > **Apps Script**.
2. A new tab will open with the script editor.

## 4. Add the Code
1. Delete any code in the `Code.gs` file and paste the content from:
   [backend/gas/Code.gs](file:///Users/enrique/Library/Mobile%20Documents/com~apple~CloudDocs/Programieren/Kosmos%20Planer/kosmos-planer/backend/gas/Code.gs)
2. Create a new HTML file: Click **+** (plus icon) next to "Files", select **HTML**, and name it `Sidebar`.
3. Paste the content from:
   [backend/gas/Sidebar.html](file:///Users/enrique/Library/Mobile%20Documents/com~apple~CloudDocs/Programieren/Kosmos%20Planer/kosmos-planer/backend/gas/Sidebar.html)

## 5. Deploy as Web App
1. Click the blue **Deploy** button > **New deployment**.
2. Select type: **Web app**.
3. **Description**: Kosmos Curation API.
4. **Execute as**: Me.
5. **Who has access**: Internal (if your organization is Workspace) or **Anyone** (if you want external curators, but the script will verify the email).
6. Click **Deploy**.
7. **Copy the Web App URL**. You will need this for the Kosmos Planer settings.

## 6. Authorization
- Apps Script will ask for permission to access your Google Sheets. Click **Review Permissions**, select your account, then **Advanced** > **Go to [Project Name] (unsafe)** and click **Allow**.

## 7. Configuration in Kosmos Planer
1. Open your local [Kosmos Planer](http://localhost:5173).
2. Open **Settings** (Gear icon ⚙️).
3. Paste your **Web App URL** into the `Curation API URL` field.
4. Set the **Spreadsheet ID** (the ID from your browser's address bar for the sheet).
5. Click **Speichern & Reload**.
