import express from "express";
import { supabase } from "./config/supabase";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/user";
import gameRoutes from "./routes/game";
import leaderboardRoutes from "./routes/leaderboard";
import airdropRoutes from "./routes/airdrop";
import referralRoutes from "./routes/referral";
import earnRoutes from "./routes/earn";
import { IUser, IInvitedFriend } from "./types/database";
import "./bot";
import { getLeagueByStones, updateUserAndCache, sendUserResponse } from "./utils/userUtils";
import axios from "axios";
import { REFERRAL_BONUS_PERCENT } from "./config/gameConfig";

dotenv.config();

const app = express();
const server = createServer(app);
export const io = new Server(server, {
    cors: { origin: "*" },
    pingTimeout: 60000,
    pingInterval: 25000,
});

export const userCache = new Map<string, { stones: number; autoStonesPerSecond: number; lastAutoBotUpdate: Date; league: string }>();
const activeConnections = new Map<string, string>();
const leaderboardCache = new Map<string, any[]>();

app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/airdrop", airdropRoutes);
app.use("/api/referral", referralRoutes);
app.use("/api/earn", earnRoutes);

app.get("/", (req, res) => {
    res.send("Server is running!");
});

// Функция для получения photo_url через Telegram API
const fetchTelegramPhoto = async (telegramId: string): Promise<string> => {
    try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const profilePhotosResponse = await axios.get(`https://api.telegram.org/bot${botToken}/getUserProfilePhotos`, {
            params: { user_id: telegramId, limit: 1 },
        });

        const photos = profilePhotosResponse.data.result.photos;
        if (!photos || photos.length === 0) return "";

        const fileId = photos[0][0].file_id;
        const fileResponse = await axios.get(`https://api.telegram.org/bot${botToken}/getFile`, {
            params: { file_id: fileId },
        });

        const filePath = fileResponse.data.result.file_path;
        return `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    } catch (error) {
        console.error(`[server] Error fetching photo for ${telegramId}:`, error);
        return "";
    }
};

io.on("connection", (socket) => {
    let hasJoined = false;

    socket.on("join", async (telegramId: string) => {
        if (!telegramId || hasJoined) return;
        hasJoined = true;

        const existingSocketId = activeConnections.get(telegramId);
        if (existingSocketId && existingSocketId !== socket.id) {
            io.sockets.sockets.get(existingSocketId)?.disconnect(true);
        }

        activeConnections.set(telegramId, socket.id);
        socket.join(telegramId);

        const { data: user } = await supabase.from("users").select("*").eq("telegram_id", telegramId).single();
        if (user) {
            console.log(`User logged in: ${user.username}`);
            user.photo_url = await fetchTelegramPhoto(telegramId); // Обновляем photo_url при входе
            await updateUserAndCache(user, userCache);
            io.to(telegramId).emit("userUpdate", sendUserResponse(user));
        }
    });

    socket.on("getLeaderboard", async ({ league }) => {
        if (leaderboardCache.has(league)) {
            socket.emit("leaderboard", leaderboardCache.get(league));
        } else {
            const { data: players } = await supabase.from("users").select("telegram_id, username, stones").eq("league", league).order("stones", { ascending: false }).limit(100);
            const mappedPlayers = players?.map(p => ({ telegramId: p.telegram_id, username: p.username, stones: p.stones })) || [];
            leaderboardCache.set(league, mappedPlayers);
            socket.emit("leaderboard", mappedPlayers);
        }
    });

    socket.on("disconnect", async () => {
        for (const [telegramId, socketId] of activeConnections.entries()) {
            if (socketId === socket.id) {
                const { data: user } = await supabase.from("users").select("*").eq("telegram_id", telegramId).single();
                if (user) {
                    const cachedUser = userCache.get(telegramId);
                    if (cachedUser) {
                        user.stones = cachedUser.stones;
                        user.league = cachedUser.league;
                        user.last_auto_bot_update = cachedUser.lastAutoBotUpdate;
                    }
                    user.last_online = new Date();
                    await updateUserAndCache(user, userCache);
                }
                activeConnections.delete(telegramId);
                userCache.delete(telegramId);
                break;
            }
        }
    });
});

import { LEAGUES } from "./config/gameConfig";

// Обновление лидерборда каждые 5 минут
setInterval(async () => {
    const leagues = LEAGUES.map(l => l.name);
    for (const league of leagues) {
        const { data: players } = await supabase.from("users").select("telegram_id, username, stones").eq("league", league).order("stones", { ascending: false }).limit(100);
        const mappedPlayers = players?.map(p => ({ telegramId: p.telegram_id, username: p.username, stones: p.stones })) || [];
        leaderboardCache.set(league, mappedPlayers);
    }
    console.log("[Leaderboard Update] Cached leaderboards refreshed.");
}, 5 * 60 * 1000);

// Фоновая обработка всех пользователей (раз в 30 минут) с батчами
const updateAllUsers = async () => {
    const now = new Date();
    console.log("[Background Update] Starting user update...");

    // Pagination/batching in Supabase
    const batchSize = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
        const { data: users, error } = await supabase.from("users").select("*").range(from, from + batchSize - 1);
        if (error || !users || users.length === 0) {
            hasMore = false;
            break;
        }
        
        await Promise.all(users.map(async (user: IUser) => {
            const lastUpdate = user.last_auto_bot_update ? new Date(user.last_auto_bot_update) : now;
            const timeDiff = Math.floor((now.getTime() - lastUpdate.getTime()) / 1000);
            if (user.auto_stones_per_second > 0 && timeDiff > 0) {
                const boostActiveUntil = user.boost_active_until ? new Date(user.boost_active_until) : null;
                const boostMultiplier = boostActiveUntil && now < boostActiveUntil ? 2 : 1;
                const newStones = Math.floor(user.auto_stones_per_second * timeDiff * boostMultiplier);
                user.stones += newStones;
                user.last_auto_bot_update = now;

                if (user.referred_by) {
                    const { data: referrer } = await supabase.from("users").select("*").eq("referral_code", user.referred_by).single();
                    if (referrer) {
                        const bonus = Math.floor(newStones * REFERRAL_BONUS_PERCENT);
                        referrer.stones += bonus;
                        referrer.referral_bonus = (referrer.referral_bonus || 0) + bonus;

                        const invitedFriend = referrer.invited_friends.find((f: IInvitedFriend) => f.user === user.id);
                        if (!invitedFriend) {
                            referrer.invited_friends.push({ user: user.id, lastReferralStones: bonus });
                        } else {
                            invitedFriend.lastReferralStones += bonus;
                        }
                        await updateUserAndCache(referrer, userCache);
                        io.to(referrer.telegram_id).emit("userUpdate", sendUserResponse(referrer));
                    }
                }
            }
            user.league = getLeagueByStones(user.stones);
            await updateUserAndCache(user, userCache);
        }));

        if (users.length < batchSize) {
            hasMore = false;
        } else {
            from += batchSize;
        }
    }
    console.log("[Background Update] All users updated.");
};

// Запуск фонового обновления каждые 30 минут
setInterval(updateAllUsers, 30 * 60 * 1000);

// Лог онлайна каждые 30 минут
setInterval(() => {
    const onlineCount = activeConnections.size;
    console.log(`Online users: ${onlineCount}`);
}, 30 * 60 * 1000);

const start = async () => {
    try {
        server.listen(process.env.PORT || 3000, () => {
            console.log(`Server running on port ${process.env.PORT || 3000}`);
        });
    } catch (error) {
        console.error("Failed to start server:", error);
    }
};

start();