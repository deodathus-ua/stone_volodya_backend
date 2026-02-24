// src/controllers/referralController.ts
import { supabase } from "../config/supabase";
import { IInvitedFriend } from "../types/database";

interface Friend {
    telegramId: string;
    username: string;
    stones: number;
    isPremium: boolean;
    photoUrl: string;
}

/**
 * Получает список друзей, приглашенных пользователем.
 * Оптимизировано: выбор только необходимых полей вместо select("*").
 */
export const getReferralFriends = async (telegramId: string): Promise<{ invitedFriends: Friend[]; totalBonus: number }> => {
    // Выбираем только нужные поля для текущего юзера
    const { data: user, error } = await supabase
        .from("users")
        .select("id, invited_friends, referral_bonus")
        .eq("telegram_id", telegramId)
        .single();

    if (error || !user) {
        throw new Error("User not found");
    }

    const friendsData: Friend[] = [];
    if (user.invited_friends && user.invited_friends.length > 0) {
        const friendIds = user.invited_friends.map((f: IInvitedFriend) => f.user);
        
        // Оптимизация: запрос друзей только с нужными полями
        const { data: friends } = await supabase
            .from("users")
            .select("telegram_id, username, stones, is_premium, photo_url")
            .in("id", friendIds);
        
        if (friends) {
            for (const friend of friends) {
                friendsData.push({
                    telegramId: friend.telegram_id,
                    username: friend.username,
                    stones: friend.stones,
                    isPremium: friend.is_premium || false,
                    photoUrl: friend.photo_url || "",
                });
            }
        }
    }

    const totalBonus = user.referral_bonus || 0;

    return { invitedFriends: friendsData, totalBonus };
};