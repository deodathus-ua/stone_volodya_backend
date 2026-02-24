// src/controllers/userController.ts
import { Request, Response } from "express";
import { supabase } from "../config/supabase";
import { sendUserResponse, updateUserAndCache } from "../utils/userUtils";
import { userCache } from "../server";

import { AuthRequest } from "../types/shared";


export const getProfile = async (req: AuthRequest, res: Response) => {
    const { data: user } = await supabase.from("users").select("*").eq("telegram_id", req.user!.telegramId).single();
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(sendUserResponse(user)); // Используем стандартный ответ
};

export const connectTonWallet = async (req: AuthRequest, res: Response) => {
    const { tonWallet } = req.body;
    const { data: user } = await supabase.from("users").select("*").eq("telegram_id", req.user!.telegramId).single();
    if (!user) return res.status(404).json({ message: "User not found" });

    user.ton_wallet = tonWallet;
    await updateUserAndCache(user, userCache);
    res.json({ message: "TON wallet connected", ...sendUserResponse(user) }); // Добавляем полный ответ
};