const APP_WEBHOOK_URL = "https://your-app.example.com/api/tasks/webhook";
const WEBHOOK_SECRET = "replace-with-the-same-secret";

function onEdit(e) {
  notifyTaskApp_("edit", e);
}

function onChange(e) {
  notifyTaskApp_("change", e);
}

function notifyTaskApp_(eventType, e) {
  const payload = {
    eventType,
    spreadsheetId: SpreadsheetApp.getActive().getId(),
    sheetName: e && e.range ? e.range.getSheet().getName() : "",
    rangeA1: e && e.range ? e.range.getA1Notation() : "",
    editedAt: new Date().toISOString(),
  };

  UrlFetchApp.fetch(APP_WEBHOOK_URL, {
    method: "post",
    contentType: "application/json",
    headers: {
      "x-task-webhook-secret": WEBHOOK_SECRET,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}
