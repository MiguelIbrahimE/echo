// Server.ts
import "express-async-errors";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { env } from "@common/env";
import { routes } from "./routes";
import { errorHandler } from "@common/errorHandler";

const app = express();
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "5mb" }));
app.use(morgan("dev"));
app.use("/api/v1", routes);
app.use(errorHandler);

app.listen(env.PORT, () => console.log(`API running on :${env.PORT}`));
