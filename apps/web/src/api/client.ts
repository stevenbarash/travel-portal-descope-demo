import { getSessionToken } from "@descope/react-sdk";
import { ApiError as ApiErrorSchema } from "@kit/contracts";
import type { z } from "zod";

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

/**
 * Fetch wrapper for the kit API. In header mode it attaches the session JWT as a Bearer
 * token; in cookie mode the browser sends the DS cookie by itself. Same-origin via the Vite
 * proxy in dev, so `credentials: "include"` is harmless and correct for both.
 */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getSessionToken();
  if (token && !headers.has("authorization"))
    headers.set("authorization", `Bearer ${token}`);
  if (init.body && !headers.has("content-type"))
    headers.set("content-type", "application/json");

  const res = await fetch(path, { ...init, headers, credentials: "include" });
  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(await res.json().catch(() => null));
    throw new ApiRequestError(
      res.status,
      parsed.success ? parsed.data.error : "unknown",
      parsed.success ? parsed.data.message : res.statusText,
    );
  }
  return res;
}

/** GET + parse with a contract schema. */
export async function apiGet<T extends z.ZodType>(
  path: string,
  schema: T,
): Promise<z.output<T>> {
  const res = await apiFetch(path);
  return schema.parse(await res.json());
}
