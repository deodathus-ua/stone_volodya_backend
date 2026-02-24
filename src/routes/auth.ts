// src/routes/auth.ts
import { Router, Request, Response } from "express";
import { supabase } from "../config/supabase";
import { generateReferralCode } from "../utils/referralCode";
import { generateToken } from "../utils/jwt";
import { updateUserAndCache } from "../utils/userUtils";
import { userCache } from "../server";
import { REFERRAL_SIGNUP_BONUS } from "../config/gameConfig";


const router = Router();

const parseInitData = (initData: string) => {
    const params = new URLSearchParams(initData);
    const userStr = params.get("user");
    if (!userStr) throw new Error("User data not found in initData");
    return JSON.parse(decodeURIComponent(userStr));
};

router.post("/login", async (req: Request, res: Response) => {
    const { initData, referralCode: bodyReferralCode } = req.body;
    if (!initData) return res.status(400).json({ error: "initData is required" });

    let telegramUser;
    try {
        telegramUser = parseInitData(initData);
    } catch (error) {
        console.error("[authRoutes] Failed to parse initData:", error);
        return res.status(400).json({ error: "Invalid initData" });
    }

    const telegramId = telegramUser.id.toString();
    let { data: user } = await supabase.from("users").select("*").eq("telegram_id", telegramId).single();
    let referralCode = bodyReferralCode || new URLSearchParams(initData).get("start_param");

    if (!user) {
        const newReferralCode = await generateReferralCode();
        const { data: newUser } = await supabase.from("users").insert({
            telegram_id: telegramId,
            username: telegramUser.username || telegramUser.first_name || `Miner_${Math.random().toString(36).substring(7)}`,
            photo_url: telegramUser.photo_url || "",
            referral_code: newReferralCode,
            referred_by: referralCode || undefined,
            is_premium: !!telegramUser.is_premium || telegramUser.allows_write_to_pm === true,
            stones: 0,
            energy: 1000,
            league: "Pebble",
            last_auto_bot_update: new Date(),
            last_online: new Date(),
        }).select().single();
        user = newUser;

        if (referralCode) {
            const { data: referrer } = await supabase.from("users").select("*").eq("referral_code", referralCode).single();
            if (referrer) {
                const bonus = user.is_premium ? REFERRAL_SIGNUP_BONUS.premium : REFERRAL_SIGNUP_BONUS.regular;
                if (!referrer.invited_friends) referrer.invited_friends = [];
                referrer.invited_friends.push({ user: user.id, lastReferralStones: 0 });
                referrer.stones += bonus;
                referrer.referral_bonus = (referrer.referral_bonus || 0) + bonus;
                user.stones += bonus;
                await updateUserAndCache(referrer, userCache); // Используем утилиту
            }
        }
        await updateUserAndCache(user, userCache); // Сохраняем нового пользователя
    }

    const token = generateToken(telegramId);
    res.status(200).json({ token, user });
});

export default router;