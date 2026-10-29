import { KIT_ROLES } from "@kit/contracts";
import { createBrowserRouter, Navigate } from "react-router";
import { LoginPage } from "../auth/LoginPage";
import { RequireAuth } from "../auth/RequireAuth";
import { RequireRole } from "../auth/RequireRole";
import { BookingsPage } from "../features/bookings/BookingsPage";
import { BookPage } from "../features/bookings/BookPage";
import { FamilyPage } from "../features/family/FamilyPage";
import { MePage } from "../features/me/MePage";
import { ServicePage } from "../features/service/ServicePage";
import { App } from "./App";
import { HomePage } from "./HomePage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: App,
    children: [
      { index: true, Component: HomePage },
      { path: "login", Component: LoginPage },
      // Public: browsing and starting a booking needs no account.
      { path: "book", Component: BookPage },
      {
        // Everything under here requires a session. Add protected pages as children.
        Component: RequireAuth,
        children: [
          { path: "dashboard", element: <Navigate to="/bookings" replace /> },
          { path: "bookings", Component: BookingsPage },
          { path: "family", Component: FamilyPage },
          { path: "me", Component: MePage },
          {
            // Role-gated for experience; the API checks permissions on every call.
            Component: () => <RequireRole role={KIT_ROLES.customerService} />,
            children: [{ path: "service", Component: ServicePage }],
          },
        ],
      },
    ],
  },
]);
