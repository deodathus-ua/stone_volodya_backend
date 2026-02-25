// src/server.ts
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import logger from "./logger";

import authRoutes from "./routes/auth";
import userRoutes from "./routes/user";
import gameRoutes from "./routes/game";
import leaderboardRoutes from "./routes/leaderboard";
import airdropRoutes from "./routes/airdrop";
import referralRoutes from "./routes/referral";
import earnRoutes from "./routes/earn";
import "./bot";

import { initSocketHandlers } from "./socket/socketHandler";
import { startBackgroundJobs } from "./jobs/backgroundJobs";

dotenv.config();

const app = express();
const server = createServer(app);
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || ["*"];

export const io = new Server(server, {
    cors: { origin: allowedOrigins },
    pingTimeout: 60000,
    pingInterval: 25000,
});

export const userCache = new Map<string, { 
    stones: number; 
    autoStonesPerSecond: number; 
    lastAutoBotUpdate: Date; 
    league: string 
}>();
const activeConnections = new Map<string, string>();
const leaderboardCache = new Map<string, any[]>();

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Middleware для логирования всех входящих запросов
app.use((req, res, next) => {
    logger.debug(`[HTTP] ${req.method} ${req.url}`);
    next();
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/airdrop", airdropRoutes);
app.use("/api/referral", referralRoutes);
app.use("/api/earn", earnRoutes);

app.get("/", (req, res) => {
    res.send("Stone Volodya Server is running!");
});

// Initialize Handlers & Jobs
initSocketHandlers(io, userCache, activeConnections, leaderboardCache);
startBackgroundJobs(io, userCache, leaderboardCache);

// Online log
setInterval(() => {
    logger.info(`[Status] Online users: ${activeConnections.size}`);
}, 30 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Глобальные обработчики для выявления причин падения без консоли
process.on("uncaughtException", (error) => {
    logger.error(`[FATAL] Uncaught Exception: ${error.message}`);
    logger.error(error.stack || "No stack trace available");
    // Даем логгеру время записать файл перед выходом
    setTimeout(() => process.exit(1), 1000);
});

process.on("unhandledRejection", (reason, promise) => {
    logger.error(`[FATAL] Unhandled Rejection at: ${promise} reason: ${reason}`);
    // Здесь мы не выходим, но логируем критическую проблему
});

export default server;
