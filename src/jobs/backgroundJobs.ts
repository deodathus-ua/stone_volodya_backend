// src/jobs/backgroundJobs.ts
import { Server } from "socket.io";
import { supabase } from "../config/supabase";
import { LEAGUES, REFERRAL_BONUS_PERCENT } from "../config/gameConfig";
import { IUser, IInvitedFriend } from "../types/database";
import { updateUserAndCache, sendUserResponse, getLeagueByStones } from "../utils/userUtils";

export const startBackgroundJobs = (
    io: Server, 
    userCache: Map<string, any>, 
    leaderboardCache: Map<string, any[]>
) => {
    // Обновление лидерборда каждые 5 минут
    setInterval(async () => {
        console.log("[Leaderboard Update] Starting...");
        const leagues = LEAGUES.map(l => l.name);
        for (const league of leagues) {
            const { data: players } = await supabase.from("users").select("telegram_id, username, stones").eq("league", league).order("stones", { ascending: false }).limit(100);
            const mappedPlayers = players?.map(p => ({ telegramId: p.telegram_id, username: p.username, stones: p.stones })) || [];
            leaderboardCache.set(league, mappedPlayers);
        }
        console.log("[Leaderboard Update] Cached leaderboards refreshed.");
    }, 5 * 60 * 1000);

    // Фоновая обработка всех пользователей (раз в 30 минут)
    const updateAllUsers = async () => {
        const now = new Date();
        console.log("[Background Update] Starting user update...");

        const batchSize = 1000;
        let from = 0;
        let hasMore = true;

        while (hasMore) {
            const { data: users, error } = await supabase.from("users").select("*").range(from, from + batchSize - 1);
            if (error || !users || users.length === 0) {
                hasMore = false;
                break;
            }
            
            await Promise.allSettled(users.map(async (user: IUser) => {
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

                            const invitedFriend = referrer.invited_friends?.find((f: IInvitedFriend) => f.user === user.id);
                            if (!invitedFriend) {
                                if (!referrer.invited_friends) referrer.invited_friends = [];
                                referrer.invited_friends.push({ user: user.id, lastReferralStones: bonus });
                            } else {
                                invitedFriend.lastReferralStones += bonus;
                            }
                            await updateUserAndCache(referrer, userCache, {
                                stones: referrer.stones,
                                referral_bonus: referrer.referral_bonus,
                                invited_friends: referrer.invited_friends
                            });
                            io.to(referrer.telegram_id).emit("userUpdate", sendUserResponse(referrer));
                        }
                    }
                }
                user.league = getLeagueByStones(user.stones);
                await updateUserAndCache(user, userCache, {
                    stones: user.stones,
                    league: user.league,
                    last_auto_bot_update: user.last_auto_bot_update
                });
            }));

            if (users.length < batchSize) {
                hasMore = false;
            } else {
                from += batchSize;
            }
        }
        console.log("[Background Update] All users updated.");
    };

    setInterval(updateAllUsers, 30 * 60 * 1000);

    // Лог онлайна каждые 30 минут
    setInterval(() => {
        // Мы передадим активные коннекты если нужно, но пока просто лог в server.ts оставим или тут заглушку
    }, 30 * 60 * 1000);
};
