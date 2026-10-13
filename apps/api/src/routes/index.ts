import { Router, type IRouter } from "express";
import healthRouter from "./health";
import accountsRouter from "./accounts";
import proxyRouter from "./proxy";
import proxiesRouter from "./proxies";
import browserRouter from "./browser";
import authRouter from "./auth";

import devicesRouter from "./devices";

const router: IRouter = Router();

router.use("/", healthRouter);
router.use("/auth", authRouter);
router.use("/devices", devicesRouter);
router.use("/accounts/:id/browser", browserRouter);
router.use("/accounts", accountsRouter);
router.use("/proxy", proxyRouter);
router.use("/proxies", proxiesRouter);

export default router;
