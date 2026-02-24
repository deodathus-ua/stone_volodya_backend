// src/middleware/authMiddleware.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

import { AuthRequest } from "../types/shared";


export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Unauthorized: token is required" });

    try {
        if (!process.env.JWT_SECRET) {
            console.error("[authMiddleware] JWT_SECRET is not defined in environment variables");
            return res.status(500).json({ error: "Internal server error: configuration missing" });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET) as { telegramId: string };

        req.user = { telegramId: decoded.telegramId };
        next();
    } catch (error) {
        console.error("[authMiddleware] Error verifying token:", error);
        res.status(401).json({ error: "Unauthorized: invalid token" });
    }
};