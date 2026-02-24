// src/services/userRegistrationService.ts
import { supabase } from "../config/supabase";
import { generateReferralCode } from "../utils/referralCode";
import { addSignupReferralBonus } from "./referralService";
import { IUser } from "../types/database";
import { updateUserAndCache } from "../utils/userUtils";
import { userCache } from "../server";

interface CreateUserParams {
    telegramId: string;
    username: string;
    photoUrl?: string;
    isPremium: boolean;
    referralCode?: string;
}

/**
 * Централизованная логика регистрации нового пользователя.
 */
export const registerNewUser = async (params: CreateUserParams): Promise<IUser> => {
    const newRefCode = await generateReferralCode();
    const now = new Date();

    const { data: newUser, error } = await supabase.from("users").insert({
        telegram_id: params.telegramId,
        username: params.username,
        photo_url: params.photoUrl || "",
        referral_code: newRefCode,
        referred_by: params.referralCode || undefined,
        is_premium: params.isPremium,
        stones: 0,
        energy: 1000,
        max_energy: 1000,
        league: "Pebble",
        stones_per_click: 2,
        energy_regen_rate: 1,
        auto_stones_per_second: 1,
        boosts: [],
        skins: [],
        tasks_completed: [],
        invited_friends: [],
        referral_bonus: 0,
        airdrop_progress: 0,
        last_auto_bot_update: now,
        last_online: now,
        last_energy_update: now,
    }).select().single();

    if (error || !newUser) {
        throw new Error(`Failed to create user: ${error?.message}`);
    }

    if (params.referralCode) {
        const referrer = await addSignupReferralBonus(newUser, params.referralCode);
        if (referrer) {
            await updateUserAndCache(referrer, userCache);
        }
        // Обновляем самого пользователя (т.к. addSignupReferralBonus изменил его камни)
        await updateUserAndCache(newUser, userCache);
    } else {
        await updateUserAndCache(newUser, userCache);
    }

    return newUser;
};
