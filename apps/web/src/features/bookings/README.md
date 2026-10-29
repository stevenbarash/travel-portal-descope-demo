# bookings — TravelCorp's domain entity

A trip to a destination (destination, hotel or apartment, arrival, nights, guests), owned by one customer
account. Renamed from the kit's `items` exemplar.

| Layer      | File                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| Contract   | `packages/contracts/src/index.ts` (`Booking`, `BookingList`, `CreateBooking`, `UpdateBooking`, `DESTINATIONS`) |
| Repository | `apps/api/src/features/bookings/repo.ts` (`BookingsRepo` + in-memory impl)                                     |
| Routes     | `apps/api/src/features/bookings/routes.ts` (`/api/bookings`)                                                   |
| Pages      | `BookPage.tsx` (`/book`, public), `BookingsPage.tsx` (`/bookings`)                                             |
| Tests      | `apps/api/src/features/bookings/routes.test.ts`, `e2e/booking.spec.ts`                                         |
- **Ownership is the check.** Scope is `user:<sub>` from the validated JWT; a customer only ever
  sees their own bookings.
- **One profile, many bookings.** The seeded guest persona (`guest@example.com` and the presenter's
  `+guest` demo login) is a returning customer: the API creates three bookings for it on first
  read (`isReturningGuest`). New sign-ups start empty.
- **Book a break (`/book`).** The draft lives in `localStorage` (`draft.ts`). "Continue to book"
  embeds the login flow (`VITE_DESCOPE_FLOW_ID`, TravelCorp's `tp-sign-up-or-in`) with
  `form={email, displayName, applePay}` as flow input, then returns to the confirm step.
