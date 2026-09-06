const APP_VERSION = "0.1.0";
const SERVICE_WORKER_CACHE = "yijing-static-v68";

// A deployment probe must reflect the running server rather than a cached
// response. It intentionally contains no user data or learning conclusions.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      status: "ok",
      service: "易境",
      appVersion: APP_VERSION,
      serviceWorkerCache: SERVICE_WORKER_CACHE,
      storage: "postgresql",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
