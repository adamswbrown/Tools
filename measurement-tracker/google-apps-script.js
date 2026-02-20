/**
 * Google Apps Script - Measurement Tracker
 *
 * SETUP:
 * 1. Open your Google Spreadsheet
 * 2. Go to Extensions > Apps Script
 * 3. Delete any existing code and paste this entire file
 * 4. Click Deploy > New deployment
 * 5. Select "Web app" as the type
 * 6. Set "Execute as" to "Me"
 * 7. Set "Who has access" to "Anyone"
 * 8. Click Deploy and authorize when prompted
 * 9. Copy the Web App URL and paste it into the app's Settings page
 *
 * SPREADSHEET HEADERS (Row 1):
 * Timestamp | Name | Date | Left Arm | Right Arm | Waist | Left Leg | Right Leg | Chest | Hips
 */

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);

  sheet.appendRow([
    data.timestamp,
    data.name,
    data.date,
    data.leftArm,
    data.rightArm,
    data.waist,
    data.leftLeg,
    data.rightLeg,
    data.chest,
    data.hips
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}
