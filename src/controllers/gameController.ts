import { Request, Response } from "express";
import { supabase } from "../config/supabase";
import { IUser, IBoost, IInvitedFriend } from "../types/database";
import { io, userCache } from "../server";
import { updateUserAndCache, sendUserResponse } from "../utils/userUtils";
import { REFERRAL_BONUS_PERCENT } from "../config/gameConfig";
import { AuthRequest } from "../types/shared";



import { BOOST_CONFIG, LEAGUES, BoostName } from "../config/gameConfig";

export const getBoostCost = (boostName: BoostName, level: number): number => {
    const config = BOOST_CONFIG[boostName];
    if (!config) return 0;
    return config.costs[Math.min(level, config.costs.length - 1)] || 0;
};

export const getBoostBonus = (boostName: BoostName, level: number): string => {
    const config = BOOST_CONFIG[boostName];
    if (!config) return "";
    const effect = config.calcEffect(level);
    
    switch (boostName) {
        case "MultiTap": return `+${effect} stones/click`;
        case "AutoBot": return `+${effect} stones/sec`;
        case "BatteryPack": return `+${effect} max energy`;
        case "RechargeSpeed": return `+${effect} energy/sec`;
        case "Refill": return effect as string;
        case "Boost": return effect as string;
        default: return "";
    }
};


const updateEnergy = (user: IUser, now: Date): void => {
    const lastUpdate = user.last_energy_update ? new Date(user.last_energy_update) : now;
    const timeDiff = Math.floor((now.getTime() - lastUpdate.getTime()) / 1000);
    user.energy = Math.min(user.max_energy, user.energy + timeDiff * user.energy_regen_rate);
    user.last_energy_update = now;
};

const handleReferralBonus = async (user: IUser, stonesEarned: number): Promise<void> => {
    if (!user.referred_by) return;

    const { data: referrer } = await supabase.from("users").select("*").eq("referral_code", user.referred_by).single();
    if (!referrer) return;

    const bonus = Math.floor(stonesEarned * REFERRAL_BONUS_PERCENT);
    referrer.stones += bonus;
    referrer.referral_bonus = (referrer.referral_bonus || 0) + bonus;

    if (!referrer.invited_friends) referrer.invited_friends = [];

    const invitedFriend = referrer.invited_friends.find(
        (f: IInvitedFriend) => f.user === user.id
    );
    if (!invitedFriend) {
        referrer.invited_friends.push({ user: user.id, lastReferralStones: bonus });
    } else {
        invitedFriend.lastReferralStones += bonus;
    }

    await updateUserAndCache(referrer, userCache);
    io.to(referrer.telegram_id).emit("userUpdate", sendUserResponse(referrer));
};

export const updateBalance = async (req: AuthRequest, res: Response) => {
    const { telegramId, stones, energy, isAutobot = false } = req.body;

    if (!telegramId || typeof telegramId !== "string") {
        return res.status(400).json({ error: "Valid telegramId is required" });
    }

    try {
        const { data: user } = await supabase.from("users").select("*").eq("telegram_id", telegramId).single();
        if (!user) return res.status(404).json({ error: "User not found" });

        const cachedUser = userCache.get(telegramId) || {
            stones: user.stones,
            autoStonesPerSecond: user.auto_stones_per_second,
            lastAutoBotUpdate: user.last_auto_bot_update ? new Date(user.last_auto_bot_update) : new Date(),
            league: user.league,
        };
        const now = new Date();

        const boostActiveUntil = user.boost_active_until ? new Date(user.boost_active_until) : null;
        const boostMultiplier = boostActiveUntil && now < boostActiveUntil ? 2 : 1;

        if (!isAutobot && user.last_click_time) {
            const timeSinceLastClick = (now.getTime() - new Date(user.last_click_time).getTime()) / 1000;
            if (timeSinceLastClick < 0.2) {
                return res.status(400).json({ error: "Clicking too fast!" });
            }
        }
        user.last_click_time = now;

        updateEnergy(user, now);

        if (user.auto_stones_per_second > 0) {
            const lastAutoUpdate = user.last_auto_bot_update ? new Date(user.last_auto_bot_update) : now;
            const timeDiff = Math.floor((now.getTime() - lastAutoUpdate.getTime()) / 1000);
            if (timeDiff > 0) {
                const stonesEarned = Math.floor(user.auto_stones_per_second * timeDiff * boostMultiplier);
                cachedUser.stones += stonesEarned;
                await handleReferralBonus(user, stonesEarned);
                user.last_auto_bot_update = now;
            }
        }

        if (typeof stones === "number" && stones > 0) {
            const stonesEarned = stones * boostMultiplier;
            if (isAutobot) {
                cachedUser.stones += stonesEarned;
            } else {
                const energyCostPerClick = Math.ceil(Math.pow(user.stones_per_click, 1.2) / 10);
                if (user.energy < energyCostPerClick) {
                    return res.status(400).json({ error: `Not enough energy, required: ${energyCostPerClick}` });
                }
                cachedUser.stones += stonesEarned;
                user.energy -= energyCostPerClick;
                await handleReferralBonus(user, stonesEarned);
            }
        }

        if (typeof energy === "number") {
            user.energy = Math.max(0, Math.min(energy, user.max_energy));
        }

        user.stones = cachedUser.stones;
        await updateUserAndCache(user, userCache);
        const response = sendUserResponse(user);
        res.json(response);
        io.to(telegramId).emit("userUpdate", response);
    } catch (error) {
        console.error("[updateBalance] Error:", error instanceof Error ? error.message : error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const applyBoost = async (req: Request, res: Response) => {
    const { telegramId, boostName } = req.body;

    if (!telegramId || !boostName || !Object.values(["RechargeSpeed", "BatteryPack", "MultiTap", "AutoBot"]).includes(boostName)) {
        return res.status(400).json({ error: "Valid telegramId and boostName required" });
    }

    try {
        const { data: user } = await supabase.from("users").select("*").eq("telegram_id", telegramId).single();
        if (!user) return res.status(404).json({ error: "User not found" });

        if (!user.boosts) user.boosts = [];

        let boost = user.boosts.find((b: IBoost) => b.name === boostName);
        if (!boost) {
            boost = { name: boostName as BoostName, level: 0 };
            user.boosts.push(boost);
        }

        const cost = getBoostCost(boostName as BoostName, boost.level);
        if (cost > 0 && user.stones < cost) {
            return res.status(400).json({ error: `Not enough stones, required: ${cost}` });
        }

        const maxLevel = 10;
        if (boost.level >= maxLevel) {
            return res.status(400).json({ error: `${boostName} max level (${maxLevel}) reached` });
        }

        if (cost > 0) user.stones -= cost;
        boost.level += 1;

        user.energy_regen_rate = 1 + (user.boosts.find((b: IBoost) => b.name === "RechargeSpeed")?.level || 0);
        user.stones_per_click = 2 + 2 * (user.boosts.find((b: IBoost) => b.name === "MultiTap")?.level || 0);
        user.max_energy = 1000 + 500 * (user.boosts.find((b: IBoost) => b.name === "BatteryPack")?.level || 0);
        user.auto_stones_per_second = 1 + (user.boosts.find((b: IBoost) => b.name === "AutoBot")?.level || 0);

        await updateUserAndCache(user, userCache);
        const response = sendUserResponse(user);
        res.json(response);
        io.to(telegramId).emit("userUpdate", response);
    } catch (error) {
        console.error("[applyBoost] Error:", error instanceof Error ? error.message : error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const useRefill = async (req: Request, res: Response) => {
    const { telegramId } = req.body;

    if (!telegramId) return res.status(400).json({ error: "telegramId required" });

    try {
        const { data: user } = await supabase.from("users").select("*").eq("telegram_id", telegramId).single();
        if (!user) return res.status(404).json({ error: "User not found" });

        const now = new Date();
        const oneDayMs = 24 * 60 * 60 * 1000;
        if (user.refill_last_used && (now.getTime() - new Date(user.refill_last_used).getTime()) < oneDayMs) {
            return res.status(400).json({ error: "Refill available once per day" });
        }

        user.energy = user.max_energy;
        user.refill_last_used = now;

        await updateUserAndCache(user, userCache);
        const response = sendUserResponse(user);
        res.json(response);
        io.to(telegramId).emit("userUpdate", response);
    } catch (error) {
        console.error("[useRefill] Error:", error instanceof Error ? error.message : error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const useBoost = async (req: Request, res: Response) => {
    const { telegramId } = req.body;

    if (!telegramId) return res.status(400).json({ error: "telegramId required" });

    try {
        const { data: user } = await supabase.from("users").select("*").eq("telegram_id", telegramId).single();
        if (!user) return res.status(404).json({ error: "User not found" });

        const now = new Date();
        const oneDayMs = 24 * 60 * 60 * 1000;
        if (user.boost_last_used && (now.getTime() - new Date(user.boost_last_used).getTime()) < oneDayMs) {
            return res.status(400).json({ error: "Boost available once per day" });
        }

        user.boost_last_used = now;
        user.boost_active_until = new Date(now.getTime() + 60 * 1000);

        await updateUserAndCache(user, userCache);
        const response = sendUserResponse(user);
        res.json(response);
        io.to(telegramId).emit("userUpdate", response);
    } catch (error) {
        console.error("[useBoost] Error:", error instanceof Error ? error.message : error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const buySkin = async (req: Request, res: Response) => {
    const { telegramId, skinName } = req.body;

    if (!telegramId || !skinName) {
        return res.status(400).json({ error: "telegramId and skinName are required" });
    }

    try {
        const { data: user } = await supabase.from("users").select("*").eq("telegram_id", telegramId).single();
        if (!user) return res.status(404).json({ error: "User not found" });

        updateEnergy(user, new Date());

        if (!user.skins) user.skins = [];

        if (user.skins.includes(skinName)) {
            return res.status(400).json({ error: "Skin already owned" });
        }

        const cost = 1000;
        if (user.stones < cost) {
            return res.status(400).json({ error: `Not enough stones, required: ${cost}` });
        }

        user.stones -= cost;
        user.skins.push(skinName);

        await updateUserAndCache(user, userCache);
        res.json(sendUserResponse(user));
    } catch (error) {
        console.error("[buySkin] Error:", error instanceof Error ? error.message : error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const completeTask = async (req: Request, res: Response) => {
    const { telegramId, taskName, reward } = req.body;

    if (!telegramId || !taskName || typeof reward !== "number" || reward <= 0) {
        return res.status(400).json({ error: "telegramId, taskName, and valid reward are required" });
    }

    try {
        const { data: user } = await supabase.from("users").select("*").eq("telegram_id", telegramId).single();
        if (!user) return res.status(404).json({ error: "User not found" });

        updateEnergy(user, new Date());

        if (!user.tasks_completed) user.tasks_completed = [];

        if (user.tasks_completed.includes(taskName)) {
            return res.status(400).json({ error: "Task already completed" });
        }

        user.tasks_completed.push(taskName);
        user.stones += reward;

        await updateUserAndCache(user, userCache);
        res.json(sendUserResponse(user));
    } catch (error) {
        console.error("[completeTask] Error:", error instanceof Error ? error.message : error);
        res.status(500).json({ error: "Internal server error" });
    }
};
