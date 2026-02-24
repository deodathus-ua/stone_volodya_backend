// src/socket/socketHandler.ts
import { Server } from "socket.io";
import { supabase } from "../config/supabase";
import { updateUserAndCache, sendUserResponse, recalculateBoostStats } from "../utils/userUtils";
import axios from "axios";

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
        console.error(`[socketHandler] Error fetching photo for ${telegramId}:`, error);
        return "";
    }
};

export const initSocketHandlers = (
    io: Server, 
    userCache: Map<string, any>, 
    activeConnections: Map<string, string>,
    leaderboardCache: Map<string, any[]>
) => {
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
                console.log(`User logged in via socket: ${user.username}`);
                // Пересчитываем boost-статы из массива boosts (фикс рассинхронизации)
                recalculateBoostStats(user);
                const photoUrl = await fetchTelegramPhoto(telegramId);
                await updateUserAndCache(user, userCache, {
                    photo_url: photoUrl,
                    last_online: new Date(),
                    energy_regen_rate: user.energy_regen_rate,
                    stones_per_click: user.stones_per_click,
                    max_energy: user.max_energy,
                    auto_stones_per_second: user.auto_stones_per_second
                });
                user.photo_url = photoUrl;
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
                        const updates: any = {
                            last_online: new Date()
                        };
                        if (cachedUser) {
                            updates.stones = cachedUser.stones;
                            updates.league = cachedUser.league;
                            updates.last_auto_bot_update = cachedUser.lastAutoBotUpdate;
                        }
                        await updateUserAndCache(user, userCache, updates);
                    }
                    activeConnections.delete(telegramId);
                    userCache.delete(telegramId);
                    break;
                }
            }
        });
    });
};
