/**
 * P1 Maths Game -> Google Sheet sync.
 *
 * Receives one JSON "attempt" row per finished game from the site (fire-and-
 * forget POST from shared.js's logAttempt(); the site does not wait for or
 * read the response) and appends it to a sheet called "Attempts" in whatever
 * spreadsheet this script is bound to.
 *
 * Setup: see docs/teacher-data-setup.md for the full click-by-click guide.
 * Quick version: create a Google Sheet -> Extensions -> Apps Script -> paste
 * this whole file -> run setup() once (approve the permissions prompt) ->
 * Deploy -> New deployment -> Web app (Execute as: Me, Who has access:
 * Anyone) -> copy the URL -> paste it into the game's teacher panel as the
 * "Google Sheet link".
 */

var SHEET_NAME = 'Attempts';
var LOCK_TIMEOUT_MS = 30 * 1000; // up to ~25 iPads can submit at once
var MAX_PAYLOAD_BYTES = 5 * 1024; // generous headroom over one attempt row's real size
var TIMEZONE = 'Asia/Hong_Kong';

var HEADERS = [
  'Date', 'Time', 'Name', 'Email', 'Game', 'Level', 'Score', 'Stars',
  'Accuracy', 'Mistakes', 'Max combo', 'Duration (s)', 'Kind', 'Mode key', 'UID'
];

// Readable game names for the sheet; falls back to the raw key for anything
// unrecognised so a future game doesn't silently disappear from the sheet.
var GAME_LABELS = {
  market: 'Math Market',
  numbers: 'Number Shop',
  bonds: 'Rod Town'
};

/** Web app entry point: POST one attempt as JSON in the request body. */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return textResponse('error: no body');
    }
    var raw = e.postData.contents;
    if (raw.length > MAX_PAYLOAD_BYTES) {
      return textResponse('error: payload too large');
    }

    var data;
    try {
      data = JSON.parse(raw);
    } catch (parseErr) {
      return textResponse('error: invalid JSON');
    }

    if (!data || !data.uid) {
      return textResponse('error: missing uid');
    }

    appendAttemptRow(data);
    return textResponse('ok');
  } catch (err) {
    // Never let an unexpected error surface a stack trace to the public
    // endpoint; log it for the teacher to find in Apps Script's executions
    // list instead.
    console.error('doPost failed: ' + err);
    return textResponse('error: ' + err);
  }
}

/** Health check: open the deployed URL in a browser to confirm it is live. */
function doGet() {
  return textResponse('Rod Town sheet endpoint is working');
}

function textResponse(text) {
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Appends one row to the Attempts sheet, creating the sheet/header if this
 * is the first row ever. Uses a script lock so rows from many iPads
 * submitting at the same moment don't overwrite each other.
 */
function appendAttemptRow(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(LOCK_TIMEOUT_MS);
  try {
    var sheet = getOrCreateSheet();
    var row = buildRow(data);
    sheet.appendRow(row);
  } finally {
    lock.releaseLock();
  }
}

/** Builds one sheet row in HEADERS order from a parsed attempt payload. */
function buildRow(data) {
  var dt = parseTimestamp(data.ts);
  var dateStr = dt ? Utilities.formatDate(dt, TIMEZONE, 'yyyy-MM-dd') : (data.day || '');
  var timeStr = dt ? Utilities.formatDate(dt, TIMEZONE, 'HH:mm:ss') : '';

  return [
    dateStr,
    timeStr,
    orBlank(data.name),
    orBlank(data.email),
    gameLabel(data.game),
    orBlank(data.modeLabel || data.mode),
    orBlank(data.score),
    orBlank(data.stars),
    orBlank(data.accuracy),
    orBlank(data.mistakes),
    orBlank(data.maxCombo),
    orBlank(data.durationSec),
    orBlank(data.kind),
    orBlank(data.mode),
    orBlank(data.uid)
  ];
}

function gameLabel(game) {
  return GAME_LABELS[game] || game || '';
}

/** null/undefined -> '' so the sheet shows a clean blank instead of "null". */
function orBlank(v) {
  return (v === null || v === undefined) ? '' : v;
}

/** Accepts an ISO 8601 string (what the site sends); returns a Date or null. */
function parseTimestamp(ts) {
  if (!ts) return null;
  var d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}

function getOrCreateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    writeHeader(sheet);
  }
  return sheet;
}

function writeHeader(sheet) {
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
}

/**
 * Run this once by hand (select "setup" in the Apps Script toolbar, click
 * Run) before the first deployment. It creates the Attempts sheet if needed,
 * writes the header row, and formats it (bold, frozen, sensible column
 * widths) so the sheet looks right from the very first real row.
 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  writeHeader(sheet);

  var headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  headerRange.setFontWeight('bold');
  sheet.setFrozenRows(1);

  var widths = [90, 80, 140, 220, 110, 220, 70, 60, 80, 80, 90, 100, 70, 100, 220];
  for (var i = 0; i < widths.length; i++) {
    sheet.setColumnWidth(i + 1, widths[i]);
  }

  SpreadsheetApp.flush();
}
