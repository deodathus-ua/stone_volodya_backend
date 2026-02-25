import { Request, Response } from "express";
import { supabase } from "../config/supabase";
import { IUser, IBoost, IInvitedFriend } from "../types/database";
import { io, userCache } from "../server";
import { updateUserAndCache, sendUserResponse, recalculateBoostStats } from "../utils/userUtils";
import { AuthRequest } from "../types/shared";
import logger from "../logger";
import { recalculateEnergy } from "../services/energyService";
import { calculateAutoAccrual } from "../services/autoAccrualService";
import { addReferralEarningBonus } from "../services/referralService";




import { BOOST_CONFIG, LEAGUES, BoostName, EARN_TASKS } from "../config/gameConfig";


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




export const updateBalance = async (req: AuthRequest, res: Response) => {
    const telegramId = req.user!.telegramId;
    const { stones, energy, isAutobot = false } = req.body;

    if (!telegramId) return res.status(400).json({ error: "telegramId is required" });

    try {
        const { data: user } = await supabase.from("users").select("*").eq("telegram_id", telegramId).single();
        if (!user) return res.status(404).json({ error: "User not found" });

        // Пересчитываем boost-статы из актуального массива boosts
        recalculateBoostStats(user);

        const now = new Date();

        // Anti-cheat: check click speed (DISABLED for batched clicks and multi-touch)
        // if (!isAutobot && user.last_click_time) {
        //     const timeSinceLastClick = (now.getTime() - new Date(user.last_click_time).getTime()) / 1000;
        //     if (timeSinceLastClick < 0.2) {
        //         return res.status(400).json({ error: "Clicking too fast!" });
        //     }
        // }

        // 1. Recalculate Energy (Service)
        recalculateEnergy(user, now);

        // 2. Handle Auto-Bot Accrual (Service)
        const { stonesEarned: autoStones, boostMultiplier } = calculateAutoAccrual(user, now);
        let totalStonesGained = autoStones;

        if (autoStones > 0) {
            user.stones += autoStones;
            user.last_auto_bot_update = now;
            const referrer = await addReferralEarningBonus(user, autoStones);
            if (referrer) {
                await updateUserAndCache(referrer, userCache);
                io.to(referrer.telegram_id).emit("userUpdate", sendUserResponse(referrer));
            }
        }

        const parsedStones = Number(stones) || 0;

        // 3. Handle Clicks / Rewards
        if (parsedStones > 0) {
            if (isAutobot) {
                const clickReward = parsedStones * boostMultiplier;
                user.stones += clickReward;
                totalStonesGained += clickReward;
            } else {
                // Рассчитываем, сколько кликов пришло в пакете `stones`
                const clicksRepresented = Math.max(1, Math.ceil(parsedStones / user.stones_per_click));
                const energyCostPerClick = Math.ceil(Math.pow(user.stones_per_click, 1.2) / 10);
                const totalEnergyCost = clicksRepresented * energyCostPerClick;

                if (user.energy < totalEnergyCost) {
                    // Разрешаем частичное восстановление, если прислали больше тапов, чем есть энергии
                    const allowClicks = Math.floor(user.energy / energyCostPerClick);
                    if (allowClicks > 0) {
                        const allowedStones = allowClicks * user.stones_per_click;
                        const clickReward = allowedStones * boostMultiplier;
                        user.stones += clickReward;
                        user.energy -= allowClicks * energyCostPerClick;
                        totalStonesGained += clickReward;
                    } 
                    // Если энергии не хватает даже на 1 клик, не падаем с ошибкой 400, 
                    // а просто пропускаем начисление, чтобы не зависал интерфейс.
                } else {
                    const clickReward = parsedStones * boostMultiplier;
                    user.stones += clickReward;
                    user.energy -= totalEnergyCost;
                    totalStonesGained += clickReward;
                }
            }
        }

        // 4. Update Referrer for Clicks if any
        if (totalStonesGained > autoStones) {
             const referrer = await addReferralEarningBonus(user, totalStonesGained - autoStones);
             if (referrer) {
                 await updateUserAndCache(referrer, userCache);
                 io.to(referrer.telegram_id).emit("userUpdate", sendUserResponse(referrer));
             }
        }

        user.last_click_time = now;
        
        // Use Partial Update for performance and stability
        await updateUserAndCache(user, userCache, {
            stones: user.stones,
            energy: user.energy,
            last_auto_bot_update: user.last_auto_bot_update,
            last_energy_update: user.last_energy_update,
            last_click_time: user.last_click_time
        });

        const response = sendUserResponse(user);
        res.json(response);
        io.to(telegramId).emit("userUpdate", response);
    } catch (error) {
        logger.error(`[updateBalance] Critical error for user ${req.user?.telegramId}:`, error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const applyBoost = async (req: AuthRequest, res: Response) => {
    const telegramId = req.user!.telegramId;
    const { boostName } = req.body;


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

        await updateUserAndCache(user, userCache, {
            stones: user.stones,
            boosts: user.boosts,
            energy_regen_rate: user.energy_regen_rate,
            stones_per_click: user.stones_per_click,
            max_energy: user.max_energy,
            auto_stones_per_second: user.auto_stones_per_second
        });
        const response = sendUserResponse(user);
        res.json(response);
        io.to(telegramId).emit("userUpdate", response);
    } catch (error) {
        logger.error(`[applyBoost] Error for user ${req.user?.telegramId}:`, error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const useRefill = async (req: AuthRequest, res: Response) => {
    const telegramId = req.user!.telegramId;


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

        await updateUserAndCache(user, userCache, {
            energy: user.energy,
            refill_last_used: now
        });
        const response = sendUserResponse(user);
        res.json(response);
        io.to(telegramId).emit("userUpdate", response);
    } catch (error) {
        logger.error(`[useRefill] Error for user ${req.user?.telegramId}:`, error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const useBoost = async (req: AuthRequest, res: Response) => {
    const telegramId = req.user!.telegramId;


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

        await updateUserAndCache(user, userCache, {
            boost_last_used: now,
            boost_active_until: user.boost_active_until
        });
        const response = sendUserResponse(user);
        res.json(response);
        io.to(telegramId).emit("userUpdate", response);
    } catch (error) {
        logger.error(`[useBoost] Error for user ${req.user?.telegramId}:`, error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const buySkin = async (req: AuthRequest, res: Response) => {
    const telegramId = req.user!.telegramId;
    const { skinName } = req.body;


    if (!telegramId || !skinName) {
        return res.status(400).json({ error: "telegramId and skinName are required" });
    }

    try {
        const { data: user } = await supabase.from("users").select("*").eq("telegram_id", telegramId).single();
        if (!user) return res.status(404).json({ error: "User not found" });

        recalculateEnergy(user, new Date());

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

        await updateUserAndCache(user, userCache, {
            stones: user.stones,
            skins: user.skins
        });
        res.json(sendUserResponse(user));
    } catch (error) {
        logger.error(`[buySkin] Error for user ${req.user?.telegramId}:`, error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const completeTask = async (req: AuthRequest, res: Response) => {
    const telegramId = req.user!.telegramId;
    const { taskName, reward } = req.body;


    if (!telegramId || !taskName || typeof reward !== "number" || reward <= 0) {
        return res.status(400).json({ error: "telegramId, taskName, and valid reward are required" });
    }

    try {
        const { data: user } = await supabase.from("users").select("*").eq("telegram_id", telegramId).single();
        if (!user) return res.status(404).json({ error: "User not found" });

        recalculateEnergy(user, new Date());

        if (!user.tasks_completed) user.tasks_completed = [];

        const configReward = EARN_TASKS[taskName];
        if (!configReward) return res.status(400).json({ error: "Invalid task name" });

        if (user.tasks_completed.includes(taskName)) {
            return res.status(400).json({ error: "Task already completed" });
        }

        user.tasks_completed.push(taskName);
        user.stones += configReward;



        await updateUserAndCache(user, userCache);
        res.json(sendUserResponse(user));
    } catch (error) {
        logger.error(`[completeTask] Error for user ${req.user?.telegramId}:`, error);
        res.status(500).json({ error: "Internal server error" });
    }
};
