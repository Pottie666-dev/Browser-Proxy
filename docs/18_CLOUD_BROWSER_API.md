# Cloud Browser API

```text
POST   /api/cloud-browser/sessions
GET    /api/cloud-browser/sessions/:id
POST   /api/cloud-browser/sessions/:id/resume
POST   /api/cloud-browser/sessions/:id/pause
DELETE /api/cloud-browser/sessions/:id
```

## Create Session Body

```json
{
  "accountId": "ACCOUNT_ID",
  "browser": "chromium",
  "persistent": true,
  "proxyId": null
}
```

Statuses: queued, starting, ready, paused, stopping, stopped, failed.
