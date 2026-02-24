// src/middleware/authMiddleware.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

import { AuthRequest } from "../types/shared";


export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Unauthorized: token is required" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "your_jwt_secret_12345") as { telegramId: string };
        req.user = { telegramId: decoded.telegramId };
        next();
    } catch (error) {
        console.error("[authMiddleware] Error verifying token:", error);
        res.status(401).json({ error: "Unauthorized: invalid token" });
    }
};