# Seeded flows

`npm run seed` imports any `demo-*.json` flow placed here into the project named by `.env`, and
`npm run reset` removes the ones it imported. This demo has none: it signs in with TravelCorp's own
flows, which you import once by hand. See [`../customer-flows/`](../customer-flows/README.md).
