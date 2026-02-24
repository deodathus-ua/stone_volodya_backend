// src/controllers/userController.ts
import { Response } from "express";
import { supabase } from "../config/supabase";
import { sendUserResponse, updateUserAndCache, recalculateBoostStats } from "../utils/userUtils";
import { userCache } from "../server";
import { AuthRequest } from "../types/shared";
import { IUser } from "../types/database";

/**
 * Получает профиль пользователя.
 * Оптимизировано: выбор конкретных полей.
 */
export const getProfile = async (req: AuthRequest, res: Response) => {
    const { data: user, error } = await supabase
        .from("users")
        .select("*") // Для профиля обычно нужны все поля для инициализации фронта
        .eq("telegram_id", req.user!.telegramId)
        .single();
        
    if (error || !user) return res.status(404).json({ message: "User not found" });

    // Пересчёт boost-статов и сохранение в БД (фикс рассинхронизации)
    recalculateBoostStats(user);
    await updateUserAndCache(user, userCache, {
        energy_regen_rate: user.energy_regen_rate,
        stones_per_click: user.stones_per_click,
        max_energy: user.max_energy,
        auto_stones_per_second: user.auto_stones_per_second
    });

    res.json(sendUserResponse(user));
};

/**
 * Привязывает TON кошелек к аккаунту.
 * Использует Partial Update.
 */
export const connectTonWallet = async (req: AuthRequest, res: Response) => {
    const { tonWallet } = req.body;
    
    if (!tonWallet) return res.status(400).json({ error: "tonWallet is required" });

    const { data: user, error } = await supabase
        .from("users")
        .select("*")
        .eq("telegram_id", req.user!.telegramId)
        .single();

    if (error || !user) return res.status(404).json({ message: "User not found" });

    await updateUserAndCache(user, userCache, {
        ton_wallet: tonWallet
    });

    res.json({ message: "TON wallet connected", ...sendUserResponse(user) });
};