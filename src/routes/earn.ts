import { Router } from "express";
import { completeTask } from "../controllers/earnController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

router.post("/completeTask", authMiddleware, completeTask);

export default router;
