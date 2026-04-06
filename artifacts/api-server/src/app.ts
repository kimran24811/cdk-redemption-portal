import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Serve the built frontend in production (placed next to the server bundle)
const __dirname = dirname(fileURLToPath(import.meta.url));
const staticDir = join(__dirname, "public");
if (existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get("/{*path}", (_req, res) => {
    res.sendFile(join(staticDir, "index.html"));
  });
}

export default app;
