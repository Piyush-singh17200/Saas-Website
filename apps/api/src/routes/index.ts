import { Router } from "express";
import { healthRouter } from "./health.router.js";

export const apiV1Router: Router = Router();

apiV1Router.use("/", healthRouter);
