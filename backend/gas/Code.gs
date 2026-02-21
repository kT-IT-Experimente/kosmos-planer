/**
 * KOSMOS PLANER BACKEND (GAS)
 * This script manages the "Shadow Database" logic, pseudonymization, 
 * and the JSON API for the Kosmos Planer.
 */

const CONFIG = {
  // --- MANDATORY FOR STANDALONE SCRIPTS ---
  // If you see "Error 400" or "TypeError: ss is null", paste your Spreadsheet ID here:
  SPREADSHEET_ID: '', 
  
  // --- Planner Sheet Names (must match your Google Sheet tabs) ---
  PROGRAM_SHEET_NAME: 'Programm_Export',
  SPEAKERS_SHEET_NAME: '26_Kosmos_SprecherInnen',
  MODS_SHEET_NAME: '26_Kosmos_Moderation',
  STAGES_SHEET_NAME: 'Bühnen_Import',
  
  // --- Curation Sheet Names ---
  MASTER_SHEET_NAME: 'Master_Einreichungen',
  REVIEW_SHEET_NAME: 'Review_Kuratierung',
  MAPPING_SHEET_NAME: '_Internal_ID_Mapping_',
  CONFIG_USERS_SHEET_NAME: 'Config_Users',
  CONFIG_METADATA_SHEET_NAME: 'Config_Metadata',
  RATINGS_SHEET_NAME: 'Master_Ratings',
  ID_PREFIX: 'ANTIGRAV-',
  API_KEY: 'CHANGE_ME_IN_PRODUCTION'
};

/**
 * Robust Spreadsheet Access 
 * Works for both container-bound and standalone scripts.
 */
function getSS() {
  // 1. Try active spreadsheet (works if script is opened from Extensions menu)
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  
  // 2. Try ID fallback (works if script is standalone)
  if (CONFIG.SPREADSHEET_ID) {
    try {
      return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    } catch (e) {
      throw new Error("Ungültige SPREADSHEET_ID in Code.gs. Bitte ID prüfen.");
    }
  }
  
  throw new Error("Fehler: Skript ist nicht verknüpft. Bitte SPREADSHEET_ID in Code.gs (Zeile 4) eintragen.");
}

/**
 * Get the role of the current user
 * Roles: ADMIN, CURATOR, REVIEWER, GUEST
 */
/**
 * Get the role of the current user
 * Roles: ADMIN, CURATOR, REVIEWER, GUEST
 */
function getUserRole(emailOverride) {
  const email = emailOverride || Session.getActiveUser().getEmail();
  if (!email) return 'GUEST';
  
  const ss = getSS();
  const sheet = ss.getSheetByName(CONFIG.CONFIG_USERS_SHEET_NAME);
  if (!sheet) return 'GUEST';

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const userEmail = (data[i][0] || '').toString().toLowerCase().replace(/,/g, '').trim();
    if (userEmail === email.toLowerCase().trim()) {
      return (data[i][1] || 'REVIEWER').toString().toUpperCase().replace(/,/g, '').trim(); 
    }
  }
  return 'GUEST'; // Default if not found in list
}

/**
 * Get flexible metadata configuration (Bereiche, Themen, Tags, Formate)
 */
function getMetadataConfig() {
  const ss = getSS();
  const sheet = ss.getSheetByName(CONFIG.CONFIG_METADATA_SHEET_NAME);
  const metadata = { bereiche: [], themen: [], tags: [], formate: [] };
  
  if (!sheet) return metadata;
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => h.toString().toLowerCase().trim());
  
  data.slice(1).forEach(row => {
    headers.forEach((header, i) => {
      const val = row[i];
      if (val && metadata.hasOwnProperty(header)) {
        metadata[header].push(val.toString());
      }
    });
  });
  
  return metadata;
}

/**
 * Get aggregated ratings for all sessions
 */
function getAggregatedRatings() {
  const ss = getSS();
  const sheet = ss.getSheetByName(CONFIG.RATINGS_SHEET_NAME) || ss.insertSheet(CONFIG.RATINGS_SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  
  const aggregation = {}; // sessionId -> { avgScore, count, comments: [] }
  
  for (let i = 1; i < data.length; i++) {
    const [user, sessionId, score, comment] = data[i];
    if (!aggregation[sessionId]) {
      aggregation[sessionId] = { sum: 0, count: 0, comments: [] };
    }
    aggregation[sessionId].sum += Number(score);
    aggregation[sessionId].count += 1;
    if (comment) aggregation[sessionId].comments.push(`${user}: ${comment}`);
  }
  
  return aggregation;
}

/**
 * Triggered on Form Submit
 */
function onFormSubmit(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.MASTER_SHEET_NAME);
  syncToReviewSheet();
}

/**
 * Main Sync Function: Master -> Review Sheet
 * Pseudonymizes names and filters out sensitive columns.
 */
function syncToReviewSheet() {
  const ss = getSS();
  const masterSheet = ss.getSheetByName(CONFIG.MASTER_SHEET_NAME);
  const reviewSheet = ss.getSheetByName(CONFIG.REVIEW_SHEET_NAME) || createReviewSheet(ss);
  const mappingSheet = ss.getSheetByName(CONFIG.MAPPING_SHEET_NAME) || createMappingSheet(ss);

  const masterData = masterSheet.getDataRange().getValues();
  const headers = masterData[0];
  const rows = masterData.slice(1);

  // Define which columns to keep and which to pseudonymize
  // For this example, let's assume:
  // Col 0: Timestamp
  // Col 1: Email (REMOVE)
  // Col 2: Name (PSEUDONYMIZE)
  // Col 3: Title (KEEP)
  // Col 4: Description (KEEP)
  
  // Updated headers to include Format, Thema, Bereich
  const reviewHeaders = ['ID', 'Timestamp', 'Title', 'Description', 'Format', 'Thema', 'Bereich', 'Score', 'Comments', 'Status'];
  reviewSheet.clear();
  reviewSheet.appendRow(reviewHeaders);

  const mappingData = mappingSheet.getDataRange().getValues();
  const nameToIdMap = {};
  mappingData.forEach(row => nameToIdMap[row[0]] = row[1]);

  const outputRows = [];
  
  rows.forEach(row => {
    const timestamp = row[0];
    const realName = row[2];
    const title = row[3];
    const description = row[4];
    const format = row[5] || 'Talk'; // Assuming Col 5 is Format
    const thema = row[6] || 'Unkategorisiert'; // Assuming Col 6 is Thema
    const bereich = row[7] || 'Gesellschaft'; // Assuming Col 7 is Bereich

    let id = nameToIdMap[realName];
    if (!id) {
      id = CONFIG.ID_PREFIX + Utilities.getUuid().substring(0, 8).toUpperCase();
      mappingSheet.appendRow([realName, id]);
      nameToIdMap[realName] = id;
    }

    // Default values for Score/Comments/Status if not exists
    outputRows.push([id, timestamp, title, description, format, thema, bereich, '', '', 'Vorschlag']);
  });

  if (outputRows.length > 0) {
    reviewSheet.getRange(2, 1, outputRows.length, reviewHeaders.length).setValues(outputRows);
  }
}

/**
 * Update Metadata for a session (Format, Bereich, Thema)
 */
function updateMetadata(id, field, value) {
  const ss = getSS();
  const sheet = ss.getSheetByName(CONFIG.REVIEW_SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => h.toLowerCase());
  const colIdx = headers.indexOf(field.toLowerCase()) + 1;
  
  if (colIdx === 0) return "Feld nicht gefunden";
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.getRange(i + 1, colIdx).setValue(value);
      return "Synchronisiert";
    }
  }
  return "ID nicht gefunden";
}

function createReviewSheet(ss) {
  const sheet = ss.insertSheet(CONFIG.REVIEW_SHEET_NAME);
  return sheet;
}

function createMappingSheet(ss) {
  const sheet = ss.insertSheet(CONFIG.MAPPING_SHEET_NAME);
  sheet.hideSheet();
  return sheet;
}

/**
 * JSON API Endpoint
 */
/**
 * JSON API Endpoint
 */
function doGet(e) {
  const email = e.parameter.email || "";
  const role = getUserRole(email);
  const ss = getSS();
  
  // --- Option A: Read from Master_Einreichungen directly ---
  // Falls back to Review_Kuratierung if Master doesn't exist
  const SENSITIVE_FIELDS = ['e-mail-adresse', 'email', 'bio', 'webseite', 'webseite/social', 'webseite / social media'];
  
  let sourceSheet = ss.getSheetByName(CONFIG.MASTER_SHEET_NAME);
  if (!sourceSheet) {
    sourceSheet = ss.getSheetByName(CONFIG.REVIEW_SHEET_NAME);
  }
  
  if (!sourceSheet) {
    return ContentService.createTextOutput(JSON.stringify({
      sessions: [],
      metadata: getMetadataConfig(),
      userRole: role,
      error: 'Keine Einreichungs-Tabelle gefunden. Bitte Master_Einreichungen oder Review_Kuratierung anlegen.'
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const data = sourceSheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);
  
  const aggregations = (role === 'ADMIN' || role === 'CURATOR') ? getAggregatedRatings() : {};

  const program = rows.map((row, idx) => {
    const obj = {};
    headers.forEach((header, i) => {
      const key = header.toString().toLowerCase().trim();
      
      // --- ROLE-BASED FIELD FILTERING ---
      // Only ADMIN sees sensitive fields; everyone else gets them stripped
      if (role !== 'ADMIN' && SENSITIVE_FIELDS.includes(key)) {
        return; // Skip this field entirely
      }
      
      obj[key] = row[i];
    });
    
    // Ensure every session has an ID
    if (!obj.id && !obj.zeitstempel) {
      obj.id = 'session-' + idx;
    } else if (!obj.id && obj.zeitstempel) {
      // For Form submissions: generate a stable ID from timestamp + title
      obj.id = CONFIG.ID_PREFIX + (idx + 1).toString().padStart(4, '0');
    }
    
    // Enrich with aggregated ratings if admin/curator
    if (aggregations[obj.id]) {
      obj.average_score = (aggregations[obj.id].sum / aggregations[obj.id].count).toFixed(1);
      obj.review_count = aggregations[obj.id].count;
      obj.all_comments = aggregations[obj.id].comments;
    }
    
    return obj;
  });

  // Filter based on status only for non-admins
  const filteredProgram = (role === 'ADMIN' || role === 'CURATOR') 
    ? program 
    : program.filter(item => {
        const status = (item.status || '').toString().toLowerCase();
        return status === 'akzeptiert' || status === 'fixiert';
      });

  const result = {
    sessions: filteredProgram,
    metadata: getMetadataConfig(),
    userRole: role
  };

  // Optionally include full planner data (to bypass frontend Auth issues)
  const includePlanner = e.parameter.includePlanner === 'true';
  if (includePlanner && (role === 'ADMIN' || role === 'CURATOR')) {
    result.plannerData = getPlannerSheets();
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Fetch all Planner-specific sheets for the frontend
 */
function getPlannerSheets() {
  const ss = getSS();
  const sheetsToFetch = [
    { key: 'speakers', name: CONFIG.SPEAKERS_SHEET_NAME || '26_Kosmos_SprecherInnen' },
    { key: 'mods', name: CONFIG.MODS_SHEET_NAME || '26_Kosmos_Moderation' },
    { key: 'stages', name: CONFIG.STAGES_SHEET_NAME || 'Bühnen_Import' },
    { key: 'program', name: CONFIG.PROGRAM_SHEET_NAME || 'Programm_Export' }
  ];
  
  const data = {};
  sheetsToFetch.forEach(s => {
    const sheet = ss.getSheetByName(s.name);
    if (sheet) {
      data[s.key] = { 
        name: s.name, 
        values: sheet.getDataRange().getValues() 
      };
    } else {
      data[s.key] = { name: s.name, values: [] };
    }
  });
  return data;
}

/**
 * Sidebar Interface Call
 */
function showReviewerSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
      .setTitle('Kurations-Tool')
      .setWidth(300);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Get ID from currently selected row
 */
function getSelectedSessionId() {
  const ss = getSS();
  const sheet = ss.getActiveSheet();
  if (sheet.getName() !== CONFIG.REVIEW_SHEET_NAME) return null;
  
  const activeRow = sheet.getActiveCell().getRow();
  if (activeRow < 2) return null;
  
  return sheet.getRange(activeRow, 1).getValue();
}

/**
 * Update Review (Now stores per-user ratings)
 */
function updateReview(sessionData) {
  const user = Session.getActiveUser().getEmail();
  const ss = getSS();
  const ratingsSheet = ss.getSheetByName(CONFIG.RATINGS_SHEET_NAME) || ss.insertSheet(CONFIG.RATINGS_SHEET_NAME);
  
  // Update per-user rating sheet
  ratingsSheet.appendRow([user, sessionData.id, sessionData.score, sessionData.comments, new Date()]);

  // Update central status if ADMIN/CURATOR
  const role = getUserRole();
  if (role === 'ADMIN' || role === 'CURATOR') {
    const sheet = ss.getSheetByName(CONFIG.REVIEW_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => h.toLowerCase());
    const statusIdx = headers.indexOf('status') + 1;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === sessionData.id) {
        if (statusIdx > 0) sheet.getRange(i + 1, statusIdx).setValue(sessionData.status);
        break;
      }
    }
  }
  
  return "Bewertung erfolgreich gespeichert!";
}

/**
 * Handle POST requests (Status updates, Metadata edits)
 */
function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    const email = postData.email || "";
    const role = getUserRole(email);
    
    // Allow REVIEWERS to add ratings, but only ADMIN/CURATOR to update metadata/status
    if (postData.action === 'addRating' || postData.field === 'score' || postData.field === 'comment') {
       if (role === 'GUEST') {
         return ContentService.createTextOutput(JSON.stringify({ error: "GUEST darf nicht bewerten" }))
          .setMimeType(ContentService.MimeType.JSON);
       }
       const ss = getSS();
       const ratingsSheet = ss.getSheetByName(CONFIG.RATINGS_SHEET_NAME) || ss.insertSheet(CONFIG.RATINGS_SHEET_NAME);
       const score = postData.field === 'score' ? postData.value : '';
       const comment = postData.field === 'comment' ? postData.value : '';
       ratingsSheet.appendRow([email, postData.id, score, comment, new Date()]);
       return ContentService.createTextOutput(JSON.stringify({ success: true, result: "Bewertung gespeichert" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (role !== 'ADMIN' && role !== 'CURATOR') {
      return ContentService.createTextOutput(JSON.stringify({ error: "Keine Berechtigung" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    let result = "";
    if (postData.action === 'updateStatus') {
      const ss = getSS();
      const sheet = ss.getSheetByName(CONFIG.REVIEW_SHEET_NAME);
      const data = sheet.getDataRange().getValues();
      const headers = data[0].map(h => h.toLowerCase());
      const statusIdx = headers.indexOf('status') + 1;
      
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === postData.id) {
          if (statusIdx > 0) sheet.getRange(i + 1, statusIdx).setValue(postData.status);
          result = "Status synchronisiert";
          break;
        }
      }
    } else if (postData.action === 'updateMetadata') {
      result = updateMetadata(postData.id, postData.field, postData.value);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ success: true, result: result }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
