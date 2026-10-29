# connectors — routes a Descope flow calls

`POST /api/connectors/lookup` (`routes.ts`, mounted at `/api/connectors` in `app.ts`) is called by
a Descope **Generic HTTP connector** from inside a flow (server to server, no session),
authenticated by the `x-connector-secret` header matching `CONNECTOR_SECRET` (constant-time;
unset → 503, missing or wrong → 401, invalid body → 400 naming the fields only). It answers a flat
decision the flow branches on:

```
POST /api/connectors/lookup
x-connector-secret: <CONNECTOR_SECRET>
{ "email": "ada@example.com", "externalId"?: "M-2002" }
→ 200 { "allowed": true, "reason": "match", "customerId": "CUST-1001", "plan": "Gold" }
```

Lookup runs against `SAMPLE_DIRECTORY` in `directory.ts` (a stand-in for the customer's system of
record); email matching is case-insensitive.

| Email                 | Outcome                                                   |
| --------------------- | --------------------------------------------------------- |
| `ada@example.com`     | `match`                                                   |
| `grace@example.com`   | `match` only with `externalId: "M-2002"`, else `no_match` |
| `mallory@example.com` | `blocked`                                                 |
| anything else         | `no_match`                                                |

Nothing from the body is logged or echoed. Setup (secret, `pnpm tunnel`, console connector, flow
step.
