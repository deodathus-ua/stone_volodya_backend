// src/controllers/authController.ts
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { supabase } from "../config/supabase";
import { verifyTelegramInitData } from "../utils/telegramAuth";
import { registerNewUser } from "../services/userRegistrationService";

/**
 * Логин пользователя через Telegram Init Data.
 * Оптимизировано: используется единый сервис регистрации, выбор конкретных полей.
 */
export const login = async (req: Request, res: Response) => {
    const { initData, referralCode } = req.body;
    
    // 1. Верификация данных от Telegram
    const result = await verifyTelegramInitData(initData, process.env.TELEGRAM_BOT_TOKEN!);
    if (!result) return res.status(401).json({ message: "Invalid Telegram data" });

    const { user: tgUser } = result;
    const telegramId = tgUser.id.toString();

    // 2. Поиск или регистрация пользователя
    let { data: dbUser, error } = await supabase
        .from("users")
        .select("telegram_id, username, stones")
        .eq("telegram_id", telegramId)
        .single();

    if (error || !dbUser) {
        // Регистрация нового пользователя через сервис (соблюдаем DRY)
        dbUser = await registerNewUser({
            telegramId,
            username: tgUser.username || tgUser.first_name || `Miner_${telegramId.slice(-4)}`,
            isPremium: tgUser.is_premium || false,
            referralCode: referralCode || undefined
        });
    }

    // 3. Генерация токена
    if (!process.env.JWT_SECRET) {
        return res.status(500).json({ error: "JWT_SECRET not configured" });
    }

    const token = jwt.sign({ telegramId }, process.env.JWT_SECRET, { expiresIn: "30d" });
    
    res.json({ 
        token, 
        user: { 
            telegramId: dbUser.telegram_id, 
            username: dbUser.username, 
            stones: dbUser.stones 
        } 
    });
};