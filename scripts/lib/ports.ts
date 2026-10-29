import { createConnection } from "node:net";
import type { Diagnostic } from "./doctor";

async function probe(
  port: number,
  host: string,
): Promise<"open" | "closed" | "unknown"> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    const done = (status: "open" | "closed" | "unknown") => {
      socket.destroy();
      resolve(status);
    };
    socket.setTimeout(1000, () => done("unknown"));
    socket.once("connect", () => done("open"));
    socket.once("error", (err: NodeJS.ErrnoException) =>
      done(
        // No such loopback on this host (e.g. IPv6 disabled): nothing can listen there.
        [
          "ECONNREFUSED",
          "EADDRNOTAVAIL",
          "EAFNOSUPPORT",
          "ENETUNREACH",
        ].includes(err.code ?? "")
          ? "closed"
          : "unknown",
      ),
    );
  });
}
export async function portDiagnostics(): Promise<Diagnostic[]> {
  return Promise.all(
    [5173, 3001].map(async (port) => {
      const statuses = await Promise.all([
        probe(port, "127.0.0.1"),
        probe(port, "::1"),
      ]);
      const open = statuses.includes("open");
      const unknown = statuses.includes("unknown");
      return {
        id: `port-${port}`,
        status: open || unknown ? "blocked" : "ready",
        message: open
          ? `Port ${port} is occupied. Server identity is unverified; stop the appropriate process yourself before smoke. No server will be reused.`
          : unknown
            ? `Port ${port} could not be checked; retry with local network access.`
            : `Port ${port} is free.`,
      };
    }),
  );
}
