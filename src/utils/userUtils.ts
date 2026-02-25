// src/utils/userUtils.ts
import { supabase } from "../config/supabase";
import { IUser, IBoost } from "../types/database";
import { LEAGUES } from "../config/gameConfig";
import { UserUpdateFields } from "../types/shared";
import logger from "../logger";

export const getLeagueByStones = (stones: number): string => {
    for (let i = LEAGUES.length - 1; i >= 0; i--) {
        if (stones >= LEAGUES[i].minStones) return LEAGUES[i].name;
    }
    return LEAGUES[0].name;
};

/**
 * Пересчитывает производные поля из массива boosts.
 * Гарантирует синхронизацию между boosts и числовыми полями.
 * Мутирует объект user.
 */
export const recalculateBoostStats = (user: IUser): void => {
    try {
        const boosts = user.boosts || [];
        const findLevel = (name: string) => boosts.find((b: IBoost) => b.name === name)?.level || 0;

        user.energy_regen_rate = 1 + findLevel("RechargeSpeed");
        user.stones_per_click = 2 + 2 * findLevel("MultiTap");
        user.max_energy = 1000 + 500 * findLevel("BatteryPack");
        user.auto_stones_per_second = 1 + findLevel("AutoBot");
    } catch (e: any) {
        logger.error(`[recalculateBoostStats] Failed for user ${user?.telegram_id}: ${e.message}`);
    }
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
            boosts: user.boosts,
            photo_url: user.photo_url,
            username: user.username,
            is_premium: user.is_premium,
            airdrop_progress: user.airdrop_progress,
            ton_wallet: user.ton_wallet,
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
        logger.error(`[updateUserAndCache] Error updating user ${user.telegram_id} in Supabase: ${error.message}`);
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
    try {
        // Пересчитываем производные поля из boosts перед отправкой
        recalculateBoostStats(user);

        return {
            telegramId: user.telegram_id,
            username: user.username,
            photoUrl: user.photo_url || "",
            stones: user.stones || 0,
            energy: user.energy || 0,
            boosts: user.boosts || [],
            skins: user.skins || [],
            tasksCompleted: user.tasks_completed || [],
            invitedFriends: user.invited_friends || [],
            league: user.league || "Pebble",
            referralCode: user.referral_code || "",
            energyRegenRate: user.energy_regen_rate || 1,
            stonesPerClick: user.stones_per_click || 1,
            autoStonesPerSecond: user.auto_stones_per_second || 0,
            maxEnergy: user.max_energy || 1000,
            lastAutoBotUpdate: user.last_auto_bot_update ? new Date(user.last_auto_bot_update).toISOString() : new Date().toISOString(),
            lastClickTime: user.last_click_time ? new Date(user.last_click_time).toISOString() : null,
            lastOnline: user.last_online ? new Date(user.last_online).toISOString() : null,
            boostActiveUntil: user.boost_active_until ? new Date(user.boost_active_until).toISOString() : null,
            boostLastUsed: user.boost_last_used ? new Date(user.boost_last_used).toISOString() : null,
            refillLastUsed: user.refill_last_used ? new Date(user.refill_last_used).toISOString() : null,
            isPremium: user.is_premium || false,
            referralBonus: user.referral_bonus || 0,
            airdropProgress: user.airdrop_progress || 0,
            tonWallet: user.ton_wallet || "",
        };
    } catch (e: any) {
        logger.error(`[sendUserResponse] Error parsing user details: ${e.message}`, { userTelegramId: user?.telegram_id });
        throw e;
    }
};