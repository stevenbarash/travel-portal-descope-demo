# Seeded flows

`pnpm seed` imports any `demo-*.json` flow placed here into the project named by `.env`, and
`pnpm reset` removes the ones it imported. This demo has none: it signs in with Travel Portal's own
flows, which you import once by hand. See [`../customer-flows/`](../customer-flows/README.md).
