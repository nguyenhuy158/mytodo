# Google Sheet Events

Use this when you want Google Sheets edits to notify the app right away. The app still serves the UI through `/api/tasks`, but Apps Script can call `/api/tasks/webhook` after a sheet edit so the server refreshes its Google Sheet cache immediately.

## App Env

Set this on the app server and redeploy:

```dotenv
TASK_WEBHOOK_SECRET=replace-with-a-random-webhook-secret
```

Generate a strong value with:

```sh
openssl rand -base64 32
```

## Apps Script Source

The Apps Script code lives in [`../apps-script/task-webhook.gs`](../apps-script/task-webhook.gs).

## Apps Script

Paste the source file into the Apps Script project attached to the Google Sheet, then update `APP_WEBHOOK_URL` and `WEBHOOK_SECRET`.

```js
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
```

## Trigger Setup

Simple `onEdit` triggers usually cannot use services that require authorization, so create installable triggers:

1. Open Apps Script from the Google Sheet.
2. Go to **Triggers**.
3. Add a trigger for `onEdit`, event source **From spreadsheet**, event type **On edit**.
4. Add another trigger for `onChange`, event source **From spreadsheet**, event type **On change** if you want inserts, deletes, and structural changes to refresh too.
5. Authorize the script when Google asks.

For local development, the Google script must call a public URL. Use the deployed app URL, or expose localhost through a temporary tunnel.
