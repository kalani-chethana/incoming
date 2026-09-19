import { Router } from "express";
import serialnumberRoutes from "./serialnumber.routes.js";

const router = Router();

router.use("/", serialnumberRoutes);

export default router;
export { serialnumberRoutes };

