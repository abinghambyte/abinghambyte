import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { aesGcmEncryptor, devKeyFromPassphrase } from "../crypto/field.ts";
import { createMemoryStore } from "../store/memory.ts";
import { createMemoryNavSessions, createWebhookNavigator } from "../nav/webhook.ts";
import { sentryFlow } from "../nav/fixtures.ts";
import { facilities as demoFacilities } from "../demo/fixtures.ts";
import { createApi, type ApiRequest } from "./router.ts";
import type { Facility } from "../worker/check.ts";

/**
 * Thin node:http server wrapping the pure router (zero deps). For the demo it
 * seeds a facility and exposes the Twilio voice webhook driven by the nav engine.
 * Production swaps createMemoryStore → Postgres and adds real Twilio call setup.
 *
 *   node --experimental-strip-types src/api/server.ts   # PORT env optional
 */

export function buildDemoApi(baseUrl: string) {
  const store = createMemoryStore(aesGcmEncryptor(devKeyFromPassphrase("api-demo")));
  const sentry = demoFacilities.find((f) => f.id === "fac_sentry_b") as Facility;
  store.addFacility({ ...sentry, resultsAfter: "00:00", timezone: "America/Denver" });

  const sessions = createMemoryNavSessions();
  const nav = createWebhookNavigator(sessions);
  const flowFor = (facilityId: string) => (facilityId === "fac_sentry_b" ? sentryFlow : undefined);

  return createApi({ store, sessions, nav, flowFor, now: () => new Date(), baseUrl });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

export function startServer(port: number, baseUrl: string) {
  const api = buildDemoApi(baseUrl);
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", baseUrl);
    const body = req.method === "POST" ? await readBody(req) : "";
    const out = api.handle({ method: req.method ?? "GET", path: url.pathname, body } as ApiRequest);
    res.writeHead(out.status, { "content-type": out.contentType });
    res.end(out.body);
  });
  server.listen(port);
  return server;
}

// Run directly: `node --experimental-strip-types src/api/server.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8787);
  const baseUrl = `http://localhost:${port}`;
  startServer(port, baseUrl);
  console.log(`Clearline API on ${baseUrl}  (POST /enroll, GET /users/:id/status, POST /twilio/voice/:callSid)`);
}
