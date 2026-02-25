import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import logger from "./logger";
import { supabase } from "./config/supabase";

import authRoutes from "./routes/auth";
import userRoutes from "./routes/user";
import gameRoutes from "./routes/game";
import leaderboardRoutes from "./routes/leaderboard";
import airdropRoutes from "./routes/airdrop";
import referralRoutes from "./routes/referral";
import earnRoutes from "./routes/earn";
import { userCache, activeConnections, leaderboardCache } from "./config/cache";
import bot from "./bot";

import { initSocketHandlers } from "./socket/socketHandler";
import { startBackgroundJobs } from "./jobs/backgroundJobs";

const app = express();
const server = createServer(app);
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || ["*"];

export const io = new Server(server, {
    cors: { origin: allowedOrigins },
    pingTimeout: 60000,
    pingInterval: 25000,
});

// Caches are now imported from ./config/cache

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

// Telegram Webhook
if (process.env.NODE_ENV === "production") {
    const webhookPath = `/api/telegram-webhook/${process.env.TELEGRAM_BOT_TOKEN?.slice(-10)}`;
    app.use(bot.webhookCallback(webhookPath));
    logger.info(`[Bot] Webhook middleware enabled at ${webhookPath}`);
}

app.get("/", (req, res) => {
    res.json({
        status: "online",
        environment: process.env.NODE_ENV,
        bot_webhook: process.env.NODE_ENV === "production",
        uptime: process.uptime()
    });
});

// Initialize Handlers & Jobs
initSocketHandlers(io, userCache, activeConnections, leaderboardCache);
startBackgroundJobs(io, userCache, leaderboardCache);

// Online log
setInterval(() => {
    logger.info(`[Status] Online users: ${activeConnections.size}`);
}, 30 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
    logger.info(`Server running on port ${PORT} (PID: ${process.pid})`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);

    // Проверка соединения с Supabase
    try {
        const { error } = await supabase.from("users").select("id").limit(1);
        if (error) {
            logger.error(`[Startup] Supabase connection check failed: ${error.message}`);
        } else {
            logger.info(`[Startup] Supabase connection successful.`);
        }
    } catch (e: any) {
        logger.error(`[Startup] Supabase connection error: ${e.message}`);
    }

    // Автоматическая установка Webhook в продакшене
    if (process.env.NODE_ENV === "production" && process.env.RENDER_EXTERNAL_URL) {
        const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/api/telegram-webhook/${process.env.TELEGRAM_BOT_TOKEN?.slice(-10)}`;
        try {
            await bot.telegram.setWebhook(webhookUrl);
            logger.info(`[Bot] Webhook successfully set to: ${webhookUrl}`);
        } catch (error) {
            logger.error(`[Bot] Failed to set webhook:`, error);
        }
    }
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
