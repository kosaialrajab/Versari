import { Router, type IRouter } from "express";
import connectionsRouter from "./connections";
import dashboardRouter from "./dashboard";
import meetupsRouter from "./meetups";
import profilesRouter from "./profiles";

const router: IRouter = Router();
router.use(connectionsRouter);
router.use(dashboardRouter);
router.use(meetupsRouter);
router.use(profilesRouter);

export default router;
