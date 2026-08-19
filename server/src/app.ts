// Must be required before any route file creates a Router(): it patches
// Express so a rejected promise in an async handler reaches the error
// middleware below instead of crashing the process (Express 4 has no native
// handling for this, unlike Express 5).
import "express-async-errors";

import path from "path";
import fs from "fs";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import metaRoutes from "./routes/meta";
import targetRoutes from "./routes/targets";
import scoringTemplateRoutes from "./routes/scoringTemplates";
import teamRoutes from "./routes/teams";
import driveRoutes from "./routes/drives";
import candidateRoutes from "./routes/candidates";
import interviewScoreRoutes from "./routes/interviewScores";
import candidateStatusRoutes from "./routes/candidateStatus";
import reportRoutes from "./routes/reports";

export function createApp() {
  const app = express();
  const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

  // Render (and most hosts) terminate TLS at a proxy in front of this
  // process, which otherwise sees plain HTTP — without this, Express has no
  // way to know the original request was actually HTTPS.
  app.set("trust proxy", 1);

  app.use(cors({ origin: clientOrigin, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/meta", metaRoutes);
  app.use("/api/targets", targetRoutes);
  app.use("/api/scoring-templates", scoringTemplateRoutes);
  app.use("/api/teams", teamRoutes);
  app.use("/api/drives", driveRoutes);
  app.use("/api/candidates", candidateRoutes);
  app.use("/api/interview-scores", interviewScoreRoutes);
  app.use("/api/candidate-status", candidateStatusRoutes);
  app.use("/api/reports", reportRoutes);

  // Serves the built client from the same origin as the API in production,
  // so there's no cross-origin cookie to get right and only one service to
  // deploy. In local dev this directory doesn't exist (the client runs
  // separately via `vite dev`), so this is a no-op there.
  const clientDist = path.join(__dirname, "../../client/dist");
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    // Anything not already matched by an /api route or a static asset above
    // is a client-side route (React Router) — serve index.html and let the
    // client handle it, so a hard refresh on e.g. /drives/:id doesn't 404.
    app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  }

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
