import { Router } from "express";
import { updateBalance, applyBoost, buySkin, completeTask, useRefill, useBoost } from "../controllers/gameController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

router.use(authMiddleware);

router.post("/update-balance", updateBalance);
router.post("/apply-boost", applyBoost);
router.post("/buy-skin", buySkin);
router.post("/complete-task", completeTask);
router.post("/use-refill", useRefill);
router.post("/use-boost", useBoost);

export default router;
