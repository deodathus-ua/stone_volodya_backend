import { supabase } from "../config/supabase";
import { IUser } from "../types/database";

export const getLeagueByStones = (stones: number): string => {
    if (stones >= 100_000_000) return "Bedrock";
    if (stones >= 50_000_000) return "Marble";
    if (stones >= 10_000_000) return "Obsidian";
    if (stones >= 1_000_000) return "Granite";
    if (stones >= 500_000) return "Quartz";
    if (stones >= 100_000) return "Boulder";
    if (stones >= 50_000) return "Cobblestone";
    if (stones >= 5_000) return "Gravel";
    return "Pebble";
};

export const updateUserAndCache = async (
    user: IUser,
    userCache: Map<string, { stones: number; autoStonesPerSecond: number; lastAutoBotUpdate: Date; league: string }>
) => {
    user.league = getLeagueByStones(user.stones);
    user.last_auto_bot_update = new Date();
    
    // Convert to snake_case if we map locally, but IUser uses snake_case mostly anyway.
    const { error } = await supabase
        .from("users")
        .update({
            stones: user.stones,
            energy: user.energy,
            last_auto_bot_update: new Date(user.last_auto_bot_update).toISOString(),
            league: user.league,
            skins: user.skins,
            boosts: user.boosts,
            tasks_completed: user.tasks_completed,
            invited_friends: user.invited_friends,
            energy_regen_rate: user.energy_regen_rate,
            stones_per_click: user.stones_per_click,
            auto_stones_per_second: user.auto_stones_per_second,
            max_energy: user.max_energy,
            referral_bonus: user.referral_bonus,
            last_energy_update: user.last_energy_update ? new Date(user.last_energy_update).toISOString() : undefined,
            boost_active_until: user.boost_active_until ? new Date(user.boost_active_until).toISOString() : undefined,
            boost_last_used: user.boost_last_used ? new Date(user.boost_last_used).toISOString() : undefined,
            refill_last_used: user.refill_last_used ? new Date(user.refill_last_used).toISOString() : undefined,
            last_click_time: user.last_click_time ? new Date(user.last_click_time).toISOString() : undefined,
            last_online: user.last_online ? new Date(user.last_online).toISOString() : undefined,
            last_login: user.last_login ? new Date(user.last_login).toISOString() : undefined,
        })
        .eq("telegram_id", user.telegram_id);
        
    if (error) {
        console.error("Error updating user in Supabase:", error);
    }

    userCache.set(user.telegram_id, {
        stones: user.stones,
        autoStonesPerSecond: user.auto_stones_per_second,
        lastAutoBotUpdate: user.last_auto_bot_update,
        league: user.league,
    });
    return user;
};

export const sendUserResponse = (user: IUser) => {
    return {
        telegramId: user.telegram_id,
        username: user.username,
        stones: user.stones,
        energy: user.energy,
        boosts: user.boosts,
        skins: user.skins,
        tasksCompleted: user.tasks_completed,
        league: user.league,
        referralCode: user.referral_code,
        energyRegenRate: user.energy_regen_rate,
        stonesPerClick: user.stones_per_click,
        autoStonesPerSecond: user.auto_stones_per_second,
        maxEnergy: user.max_energy,
        lastAutoBotUpdate: new Date(user.last_auto_bot_update).toISOString(),
        referralBonus: user.referral_bonus || 0,
        airdropProgress: user.airdrop_progress,
    };
};