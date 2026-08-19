// Must be required before any route file creates a Router(): it patches
// Express so a rejected promise in an async handler reaches the error
// middleware below instead of crashing the process (Express 4 has no native
// handling for this, unlike Express 5).
import "express-async-errors";

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

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
