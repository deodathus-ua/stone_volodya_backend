// src/services/referralService.ts
import { supabase } from "../config/supabase";
import { IUser, IInvitedFriend } from "../types/database";
import { REFERRAL_BONUS_PERCENT, REFERRAL_SIGNUP_BONUS } from "../config/gameConfig";

/**
 * Начисляет реферальный бонус рефереру от заработка приглашенного друга.
 * Возвращает объект реферера, если он был обновлен, иначе null.
 */
export const addReferralEarningBonus = async (
    user: IUser,
    stonesEarned: number
): Promise<IUser | null> => {
    if (!user.referred_by || stonesEarned <= 0) return null;

    const { data: referrer, error } = await supabase
        .from("users")
        .select("*")
        .eq("referral_code", user.referred_by)
        .single();

    if (error || !referrer) return null;

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
        invitedFriend.lastReferralStones = (invitedFriend.lastReferralStones || 0) + bonus;
    }

    return referrer;
};

/**
 * Начисляет бонус за регистрацию по реферальной ссылке.
 */
export const addSignupReferralBonus = async (
    newUser: IUser,
    referralCodeFromUrl: string
): Promise<IUser | null> => {
    const { data: referrer, error } = await supabase
        .from("users")
        .select("*")
        .eq("referral_code", referralCodeFromUrl)
        .single();

    if (error || !referrer) return null;

    const bonus = newUser.is_premium ? REFERRAL_SIGNUP_BONUS.premium : REFERRAL_SIGNUP_BONUS.regular;
    
    if (!referrer.invited_friends) referrer.invited_friends = [];
    referrer.invited_friends.push({ user: newUser.id, lastReferralStones: 0 });
    
    referrer.stones += bonus;
    referrer.referral_bonus = (referrer.referral_bonus || 0) + bonus;
    
    // Бонус также начисляется самому новому пользователю
    newUser.stones += bonus;

    return referrer;
};
