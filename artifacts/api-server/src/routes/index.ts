import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import workersRouter from "./workers.js";
import authRouter from "./auth.js";
import adminRouter from "./admin.js";
import complianceRouter from "./compliance.js";
import portalRouter from "./portal.js";
import auditRouter from "./audit.js";
import payrollRouter from "./payroll.js";

const router: IRouter = Router();

router.use(authRouter);
router.use(adminRouter);
router.use(complianceRouter);
router.use(portalRouter);
router.use(auditRouter);
router.use(payrollRouter);
router.use(healthRouter);
router.use(workersRouter);

export default router;
