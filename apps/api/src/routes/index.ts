import { Router, type IRouter } from "express";
import healthRouter from "./health";
import accountsRouter from "./accounts";
import proxyRouter from "./proxy";

const router: IRouter = Router();

router.use("/", healthRouter);
router.use("/accounts", accountsRouter);
router.use("/proxy", proxyRouter);

export default router;
