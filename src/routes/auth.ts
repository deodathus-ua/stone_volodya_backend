// src/routes/auth.ts
import { Router, Request, Response } from "express";
import { supabase } from "../config/supabase";
import { generateToken } from "../utils/jwt";
import { updateUserAndCache, sendUserResponse, recalculateBoostStats } from "../utils/userUtils";
import { userCache } from "../server";
import { registerNewUser } from "../services/userRegistrationService";
import logger from "../logger";

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
        logger.error("[authRoutes] Failed to parse initData:", error);
        return res.status(400).json({ error: "Invalid initData" });
    }

    const telegramId = telegramUser.id.toString();
    let referralCode = bodyReferralCode || new URLSearchParams(initData).get("start_param");

    try {
        let { data: user, error: fetchError } = await supabase.from("users").select("*").eq("telegram_id", telegramId).single();

        if (fetchError && fetchError.code !== 'PGRST116') {
            logger.error(`[authRoutes] Critical Supabase error fetching user ${telegramId}:`, fetchError);
            return res.status(503).json({ error: "Service Unavailable" });
        }

        if (!user) {
            // Регистрация через централизованный сервис
            user = await registerNewUser({
                telegramId,
                username: telegramUser.username || telegramUser.first_name || `Miner_${telegramId.slice(-4)}`,
                photoUrl: telegramUser.photo_url || "",
                isPremium: !!telegramUser.is_premium || telegramUser.allows_write_to_pm === true,
                referralCode: referralCode || undefined
            });
        } else {
            // Пересчитываем boost-статы для существующего пользователя
            recalculateBoostStats(user);
            await updateUserAndCache(user, userCache, {
                last_online: new Date(),
                username: telegramUser.username || telegramUser.first_name || user.username,
                is_premium: !!telegramUser.is_premium || telegramUser.allows_write_to_pm === true,
                energy_regen_rate: user.energy_regen_rate,
                stones_per_click: user.stones_per_click,
                max_energy: user.max_energy,
                auto_stones_per_second: user.auto_stones_per_second
            });
        }

        const token = generateToken(telegramId);
        res.status(200).json({ token, user: sendUserResponse(user) });
    } catch (error) {
        logger.error("[authRoutes] Login error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;