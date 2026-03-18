import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import workersRouter from "./workers.js";
import authRouter from "./auth.js";
import adminRouter from "./admin.js";
import complianceRouter from "./compliance.js";
import portalRouter from "./portal.js";
import auditRouter from "./audit.js";
import payrollRouter from "./payroll.js";
import clientsRouter from "./clients.js";
import { twofaRouter } from "./twofa.js";
import notificationsRouter from "./notifications.js";
import workerNotesRouter from "./worker-notes.js";
import eejMobileRouter from "./eej-mobile.js";
import eejAuthRouter from "./eej-auth.js";

const router: IRouter = Router();

router.use(eejAuthRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(complianceRouter);
router.use(portalRouter);
router.use(auditRouter);
router.use(payrollRouter);
router.use(clientsRouter);
router.use(twofaRouter);
router.use(notificationsRouter);
router.use(workerNotesRouter);
router.use(healthRouter);
router.use(workersRouter);
router.use(eejMobileRouter);

export default router;
