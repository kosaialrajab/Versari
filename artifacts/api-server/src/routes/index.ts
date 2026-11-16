import { Router, type IRouter } from "express";
import healthRouter from "./health";
import versariRouter from "./versari";

const router: IRouter = Router();

router.use(healthRouter);
router.use(versariRouter);

export default router;
