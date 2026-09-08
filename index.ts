import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

process.on("uncaughtException", (e) => console.error("UNCAUGHT", e));
process.on("unhandledRejection", (e) => console.error("UNHANDLED", e));

console.log("BOOT", {
  node: process.version,
  db: process.env.DATABASE_URL
    ? process.env.DATABASE_URL.split("@")[1]?.split("/")[0]
    : "MISSING",
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
  let capturedJsonResponse: Record<string, any> | undefined;

  const originalResJson = res.json.bind(res);
  res.json = function (bodyJson: any, ...args: any[]) {
    capturedJsonResponse = bodyJson;
    return originalResJson(bodyJson, ...args);
  } as any;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      log(logLine);
    }
  });

  next();
});

app.get("/__auth_test", (_req, res) => res.send("ok"));

(async () => {
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
    const { setupVite } = await import("./vite");
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
})();
