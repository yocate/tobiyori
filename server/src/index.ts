import "dotenv/config";
import express from "express";
import cors from "cors";
import authRouter from "./routes/auth";
import activitiesRouter from "./routes/activities";
import applicationsRouter from "./routes/applications";
import organizationsRouter from "./routes/organizations";
import reportsRouter from "./routes/reports";
import adminRouter from "./routes/admin";
import communitiesRouter from "./routes/communities";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/activities", activitiesRouter);
app.use("/api/applications", applicationsRouter);
app.use("/api/organizations", organizationsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/communities", communitiesRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "サーバーエラーが発生しました" });
});

const port = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port}`);
});
