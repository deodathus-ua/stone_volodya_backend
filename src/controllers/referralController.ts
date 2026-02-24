import { supabase } from "../config/supabase";
import { IInvitedFriend } from "../types/database";

interface Friend {
    telegramId: string;
    username: string;
    stones: number;
    isPremium: boolean;
    photo_url: string;
}

export const getReferralFriends = async (telegramId: string): Promise<{ invitedFriends: Friend[]; totalBonus: number }> => {
    const { data: user } = await supabase.from("users").select("*").eq("telegram_id", telegramId).single();
    if (!user) {
        throw new Error("User not found");
    }

    const friendsData: Friend[] = [];
    if (user.invited_friends && user.invited_friends.length > 0) {
        const friendIds = user.invited_friends.map((f: IInvitedFriend) => f.user);
        const { data: friends } = await supabase.from("users").select("*").in("id", friendIds);
        
        if (friends) {
            for (const friend of friends) {
                friendsData.push({
                    telegramId: friend.telegram_id,
                    username: friend.username,
                    stones: friend.stones,
                    isPremium: friend.is_premium || false,
                    photo_url: friend.photo_url || "",
                });
            }
        }
    }

    const totalBonus = user.referral_bonus || 0;

    return { invitedFriends: friendsData, totalBonus };
};