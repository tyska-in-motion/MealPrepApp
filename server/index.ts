import express, { type Request, Response, NextFunction } from "express";
import { serveStatic } from "./static";
import { createServer } from "http";
import zlib from "zlib";

import fs from "fs";

if (typeof process.loadEnvFile === "function" && fs.existsSync(".env")) {
  process.loadEnvFile(".env");
}

process.on("uncaughtException", (e) => console.error("UNCAUGHT", e));
process.on("unhandledRejection", (e) => console.error("UNHANDLED", e));

function getDatabaseLogTarget(value?: string) {
  if (!value) return "MISSING";

  try {
    const parsed = new URL(value);
    const databaseName = parsed.pathname.replace(/^\//, "") || "<missing-db>";
    return `${parsed.hostname}/${databaseName}`;
  } catch {
    return "INVALID_DATABASE_URL_FORMAT";
  }
}

console.log("BOOT", {
  node: process.version,
  db: getDatabaseLogTarget(process.env.DATABASE_URL),
});

const USER = process.env.APP_USERNAME;
const PASS = process.env.APP_PASSWORD;

console.log("AUTH", {
  nodeEnv: process.env.NODE_ENV,
  hasUser: !!USER,
  hasPass: !!PASS,
});

// Fail fast in prod if creds are missing (prevents “it doesn’t ask for password” confusion)
if (process.env.NODE_ENV === "production" && (!USER || !PASS)) {
  throw new Error("Missing APP_USERNAME / APP_PASSWORD in production env");
}

const app = express();
const httpServer = createServer(app);

// Basic Auth protection (prod only)
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    const auth = req.headers.authorization;

    if (!auth) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Protected"');
      return res.status(401).send("Auth required");
    }

    const [type, encoded] = auth.split(" ");
    if (type !== "Basic" || !encoded) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Protected"');
      return res.status(401).send("Invalid auth");
    }

    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    const user = sep >= 0 ? decoded.slice(0, sep) : "";
    const pass = sep >= 0 ? decoded.slice(sep + 1) : "";

    if (user === USER && pass === PASS) return next();

    res.setHeader("WWW-Authenticate", 'Basic realm="Protected"');
    return res.status(401).send("Invalid credentials");
  });
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let responseBytes = 0;
  let originalBytes = 0;
  let responseCompressed = false;

  const originalResJson = res.json.bind(res);
  res.json = function (bodyJson: any, ...args: any[]) {
    const json = JSON.stringify(bodyJson);
    originalBytes = Buffer.byteLength(json);

    const acceptsGzip = req.headers["accept-encoding"]?.includes("gzip");
    if (acceptsGzip && originalBytes >= 1024 && !res.getHeader("Content-Encoding")) {
      const compressed = zlib.gzipSync(Buffer.from(json));
      responseBytes = compressed.length;
      responseCompressed = true;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Vary", "Accept-Encoding");
      res.setHeader("Content-Length", String(compressed.length));
      return res.send(compressed);
    }

    responseBytes = originalBytes;
    return (originalResJson as any)(bodyJson, ...args);
  } as any;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const sentBytes = responseBytes || Number(res.getHeader("Content-Length") || 0);
      const compressionSuffix = responseCompressed ? ` gzip=${sentBytes}B original=${originalBytes}B` : ` bytes=${sentBytes}B`;
      const logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms ::${compressionSuffix}`;
      log(logLine);
    }
  });

  next();
});

app.get("/__auth_test", (_req, res) => res.send("ok"));

(async () => {
  const { ensureDbCompat } = await import("./db");

  await ensureDbCompat();
  log("database compatibility check completed", "db");

  const { registerRoutes } = await import("./routes");
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("❌ Express error:", err);
    res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite-dev");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );

})().catch((err) => {
  console.error("❌ Startup failed:", err);
  if (err?.message?.includes("database") || err?.code) {
    console.error(
      "If this is Supabase pooler, verify DATABASE_URL uses the pooler host, port 6543, database postgres, and username postgres.<project-ref>.",
    );
  }
  process.exit(1);
});
