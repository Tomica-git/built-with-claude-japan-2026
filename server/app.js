import express from "express";
import { publicEntry, refreshSummary, submitMorning } from "./journal.js";
import { createStore } from "./store.js";
import { todayInTokyo } from "../shared/vocab.js";

function asyncRoute(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function createApp({
  dataDir,
  reflect,
  publicDir,
  sharedDir,
  hasApiKey,
  now,
} = {}) {
  const store = createStore(dataDir);
  const clock = now ?? (() => new Date());
  const keyConfigured = hasApiKey ?? Boolean(process.env.ANTHROPIC_API_KEY);
  const app = express();

  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "32kb" }));

  function today() {
    return todayInTokyo(clock());
  }

  app.get(
    "/api/bootstrap",
    asyncRoute(async (_req, res) => {
      const [entries, manual] = await Promise.all([store.list(), store.getManual()]);
      res.json({
        today: today(),
        hasApiKey: keyConfigured,
        entries: entries.map(publicEntry),
        manual,
      });
    }),
  );

  app.post(
    "/api/entries",
    asyncRoute(async (req, res) => {
      try {
        const result = await submitMorning({
          store,
          reflect,
          input: req.body,
          today: clock(),
        });
        res.json(result);
      } catch (error) {
        if (error.code === "VALIDATION") {
          res.status(400).json({
            saved: false,
            message: error.message,
            fields: error.fields,
          });
          return;
        }
        throw error;
      }
    }),
  );

  app.post(
    "/api/entries/:date/reflect",
    asyncRoute(async (req, res) => {
      try {
        const result = await refreshSummary({
          store,
          reflect,
          date: req.params.date,
        });
        res.json(result);
      } catch (error) {
        if (error.code === "NOT_FOUND") {
          res.status(404).json({ saved: false, message: error.message });
          return;
        }
        throw error;
      }
    }),
  );

  app.use("/api", (_req, res) => {
    res.status(404).json({ message: "見つかりません" });
  });

  app.use("/shared", express.static(sharedDir));
  app.use(express.static(publicDir));

  app.use((error, req, res, _next) => {
    if (error?.type === "entity.parse.failed" || error instanceof SyntaxError) {
      res.status(400).json({ message: "JSON を読めませんでした" });
      return;
    }
    console.error(error);
    if (req.path.startsWith("/api")) {
      res.status(500).json({ message: "サーバで問題が起きました" });
      return;
    }
    res.status(500).type("text").send("サーバで問題が起きました");
  });

  return app;
}
