import { Request, Response } from "express";
import { supabase } from "../config/supabase";
import axios from "axios";
import logger from "../logger";

const fetchTelegramPhoto = async (photoUrl: string): Promise<string> => {
    try {
        if (!photoUrl || typeof photoUrl !== "string") {
            return "";
        }

        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        let filePath = "";

        if (photoUrl.includes(`/file/bot${botToken}/`)) {
            filePath = photoUrl.split(`/file/bot${botToken}/`)[1];
        } else if (photoUrl.includes("/file/")) {
            filePath = photoUrl.split("/file/")[1];
        } else {
            return photoUrl;
        }

        if (!filePath) {
            return "";
        }

        const telegramApiUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

        const response = await axios.get(telegramApiUrl, { responseType: "arraybuffer" });
        const base64Image = Buffer.from(response.data, "binary").toString("base64");
        return `data:image/jpeg;base64,${base64Image}`;
    } catch (error) {
        return "";
    }
};

export const getLeaderboard = async (req: Request, res: Response) => {
    const { league } = req.query;

    try {
        const { data: players } = await supabase
            .from("users")
            .select("telegram_id, username, stones, photo_url, is_premium")
            .eq("league", league)
            .order("stones", { ascending: false })
            .limit(100);

        if (!players) {
            return res.json([]);
        }

        logger.info(`Fetched ${players.length} players for league: ${league}`);

        const playersWithPhotos = await Promise.all(
            players.map(async (player) => {
                let photoBase64 = "";
                if (player.photo_url) {
                    photoBase64 = await fetchTelegramPhoto(player.photo_url);
                }
                return {
                    telegramId: player.telegram_id,
                    username: player.username,
                    stones: player.stones,
                    photo_url: photoBase64 || player.photo_url,
                    isPremium: player.is_premium || false,
                };
            })
        );

        res.json(playersWithPhotos);
    } catch (error) {
        logger.error(`Error in getLeaderboard: ${error instanceof Error ? error.message : String(error)}`);
        res.status(500).json({ message: "Error fetching leaderboard" });
    }
};