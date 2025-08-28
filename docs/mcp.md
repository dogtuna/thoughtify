# MCP Server Authentication

Tool requests to the MCP Cloud Function require an `Authorization` header.

Use one of the following formats:

- **Firebase ID token**: `Authorization: Bearer <ID_TOKEN>`
- **API key**: `Authorization: ApiKey <API_KEY>`

The API key must match the `MCP_API_KEY` environment variable or secret
configured for the function. Requests without a valid token or key receive
`401 Unauthorized`.

## Configuration

- `MCP_CALL_TIMEOUT_MS` &mdash; maximum time in milliseconds to wait for a
  callable function to respond. Defaults to `120000` if unset.
