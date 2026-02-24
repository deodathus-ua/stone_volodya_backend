// src/utils/userUtils.ts
import { supabase } from "../config/supabase";
import { IUser } from "../types/database";
import { LEAGUES } from "../config/gameConfig";
import { UserUpdateFields } from "../types/shared";

export const getLeagueByStones = (stones: number): string => {
    for (let i = LEAGUES.length - 1; i >= 0; i--) {
        if (stones >= LEAGUES[i].minStones) return LEAGUES[i].name;
    }
    return LEAGUES[0].name;
};

/**
 * Обновляет данные пользователя в Supabase и кэше.
 * Поддерживает частичные обновления (updates) для предотвращения race conditions.
 */
export const updateUserAndCache = async (
    user: IUser,
    userCache: Map<string, { stones: number; autoStonesPerSecond: number; lastAutoBotUpdate: Date; league: string }>,
    updates: UserUpdateFields = {}
): Promise<IUser> => {
    // 1. Применяем обновления к локальному объекту user
    Object.assign(user, updates);

    // Авто-пересчет лиги при изменении камней
    if (updates.stones !== undefined) {
        user.league = getLeagueByStones(user.stones);
    }

    // 2. Формируем объект для БД (только измененные поля)
    const dbUpdates: any = { ...updates };
    
    // Если переданы конкретные поля, обновляем только их. 
    // Если объект пустой (legacy call), обновляем весь объект.
    const isPartial = Object.keys(updates).length > 0;

    if (isPartial) {
        // Конвертируем Date в ISO string
        for (const key in dbUpdates) {
            if (dbUpdates[key] instanceof Date) {
                dbUpdates[key] = dbUpdates[key].toISOString();
            }
        }
    } else {
        // Legacy fallback: полное обновление (не рекомендуется)
        Object.assign(dbUpdates, {
            stones: user.stones,
            energy: user.energy,
            last_auto_bot_update: user.last_auto_bot_update ? new Date(user.last_auto_bot_update).toISOString() : new Date().toISOString(),
            league: user.league,
            skins: user.skins,
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
        });
    }

    const { error } = await supabase
        .from("users")
        .update(dbUpdates)
        .eq("telegram_id", user.telegram_id);
        
    if (error) {
        console.error(`[updateUserAndCache] Error updating user ${user.telegram_id} in Supabase:`, error);
    }

    // 3. Обновляем кэш
    userCache.set(user.telegram_id, {
        stones: user.stones,
        autoStonesPerSecond: user.auto_stones_per_second,
        lastAutoBotUpdate: user.last_auto_bot_update ? new Date(user.last_auto_bot_update) : new Date(),
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
        lastAutoBotUpdate: user.last_auto_bot_update ? new Date(user.last_auto_bot_update).toISOString() : new Date().toISOString(),
        referralBonus: user.referral_bonus || 0,
        airdropProgress: user.airdrop_progress,
        tonWallet: user.ton_wallet,
    };
};