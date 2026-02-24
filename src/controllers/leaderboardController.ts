// src/controllers/leaderboardController.ts
import { Request, Response } from "express";
import { supabase } from "../config/supabase";
import logger from "../logger";

/**
 * Возвращает лидерборд для указанной лиги.
 * Оптимизировано: убрана тяжелая конвертация фото в Base64 на сервере.
 */
export const getLeaderboard = async (req: Request, res: Response) => {
    const { league } = req.query;

    if (!league) {
        return res.status(400).json({ error: "League is required" });
    }

    try {
        // Оптимизация: выбор только необходимых полей
        const { data: players, error } = await supabase
            .from("users")
            .select("telegram_id, username, stones, photo_url, is_premium")
            .eq("league", league)
            .order("stones", { ascending: false })
            .limit(100);

        if (error) throw error;

        if (!players) {
            return res.json([]);
        }

        // logger.info(`Fetched ${players.length} players for league: ${league}`);

        // Маппим результат без тяжелой обработки фото
        const result = players.map((player) => ({
            telegramId: player.telegram_id,
            username: player.username,
            stones: player.stones,
            photoUrl: player.photo_url || "",
            isPremium: player.is_premium || false,
        }));

        res.json(result);
    } catch (error) {
        logger.error(`Error in getLeaderboard: ${error instanceof Error ? error.message : String(error)}`);
        res.status(500).json({ message: "Error fetching leaderboard" });
    }
};