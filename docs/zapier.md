# Zapier Webhook

Thoughtify exposes an HTTPS Cloud Function `zapierWebhook` that allows Zaps to send updates back into the platform.

## Endpoint

```
POST https://us-central1-<YOUR-PROJECT-ID>.cloudfunctions.net/zapierWebhook
```

## Authentication

Requests must include the shared secret in the `x-zapier-secret` header. Define the secret in your Firebase environment as `ZAPIER_WEBHOOK_SECRET`.

```
headers:
  Content-Type: application/json
  x-zapier-secret: <YOUR_SHARED_SECRET>
```

## Payload

Send a JSON payload representing the data you want to record. The function stores every payload in the `auditLog` collection. Optional fields allow automatic updates:

- `hypothesisId` with `auditEntry` – appends an entry to the hypothesis `auditLog`.
- `taskId` with `status` – updates a task's status.

Example payload:

```json
{
  "hypothesisId": "abc123",
  "auditEntry": { "reason": "Latest metric", "delta": 0.1 },
  "taskId": "task456",
  "status": "done"
}
```

Each Zap should be configured to POST to the endpoint above with the header secret so Thoughtify can ingest updates securely.
