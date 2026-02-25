// src/bot.ts
import dotenv from "dotenv";
dotenv.config();

import { Telegraf } from "telegraf";
import { supabase } from "./config/supabase";
import { updateUserAndCache } from "./utils/userUtils";
import { userCache } from "./config/cache";
import { registerNewUser } from "./services/userRegistrationService";
import path from "path";
import fs from "fs";
import logger from "./logger";

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);
const welcomeImagePath = path.join(__dirname, "../assets/welcome.jpg");

bot.start(async (ctx) => {
    const referralCode = ctx.startPayload || "";
    const telegramId = ctx.from.id.toString();

    try {
        const now = new Date();

        // Функция для получения актуального photo_url
        const getPhotoUrl = async () => {
            try {
                const photos = await ctx.telegram.getUserProfilePhotos(ctx.from.id, 0, 1);
                if (photos.total_count > 0) {
                    const fileId = photos.photos[0][0].file_id;
                    const file = await ctx.telegram.getFile(fileId);
                    return `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
                }
                return "";
            } catch (error) {
                logger.error("[bot] Error fetching user profile photos:", error);
                return "";
            }
        };

        let { data: user, error: fetchError } = await supabase.from("users").select("*").eq("telegram_id", telegramId).single();

        if (fetchError && fetchError.code !== 'PGRST116') {
            logger.error(`[bot] Critical Supabase error fetching user ${telegramId}:`, fetchError);
            await ctx.reply("Stone World is currently performing maintenance. Please try again later!");
            return;
        }

        if (!user) {
            // Централизованная регистрация через сервис
            user = await registerNewUser({
                telegramId,
                username: ctx.from.username || ctx.from.first_name || `Miner_${telegramId.slice(-4)}`,
                photoUrl: await getPhotoUrl(),
                isPremium: !!ctx.from.is_premium,
                referralCode: referralCode || undefined
            });
        } else {
            // Обновление существующего пользователя (Partial Update)
            const updates: any = {
                last_online: now,
                photo_url: await getPhotoUrl(),
                username: ctx.from.username || ctx.from.first_name || user.username,
                is_premium: !!ctx.from.is_premium
            };
            
            await updateUserAndCache(user, userCache, updates);
        }

        const miniAppUrl = `https://t.me/StoneVolodyaCoinBot/stone_volodya_game?startapp=${user.referral_code}`;

        const welcomeText = "Welcome to the Great Stone World of Wonders! Ancient treasures, mighty stones and incredible adventures await you here. Click the button below and start your journey to the top!";
        const keyboard = {
            inline_keyboard: [[{ text: "Join Stone World", url: miniAppUrl }]],
        };

        if (fs.existsSync(welcomeImagePath)) {
            await ctx.replyWithPhoto({ source: fs.createReadStream(welcomeImagePath) }, {
                caption: welcomeText,
                reply_markup: keyboard,
            });
        } else {
            await ctx.reply(welcomeText, { reply_markup: keyboard });
        }
    } catch (error) {
        logger.error("[bot] Error processing /start:", error);
        await ctx.reply("Something went wrong in Stone World. Try again!");
    }
});

// Функция для безопасного запуска бота
// Функция для безопасного запуска бота (только для ПОЛЛИНГА)
export const launchBot = async () => {
    try {
        await bot.launch({ dropPendingUpdates: true });
        logger.info(`Telegram bot started in POLLING mode (PID: ${process.pid})...`);
    } catch (error: any) {
        if (error.response && error.response.error_code === 409) {
            logger.warn(`Telegram bot conflict (PID: ${process.pid}): Another instance is running. Retrying in 10 seconds...`);
            setTimeout(launchBot, 10000);
        } else {
            logger.error(`[bot] Failed to launch (PID: ${process.pid}):`, error);
            setTimeout(launchBot, 30000);
        }
    }
};

// В продакшене (на Render) будем использовать Webhooks через server.ts
// В разработке по-прежнему можно использовать Polling
const isProduction = process.env.NODE_ENV === "production" || process.env.RENDER === "true";

logger.debug(`[bot] Environment check: NODE_ENV=${process.env.NODE_ENV}, RENDER=${process.env.RENDER}, isProduction=${isProduction}`);

if (!isProduction) {
    launchBot();
} else {
    logger.info(`[bot] Polling disabled (Production environment detected). Webhooks should be used.`);
}

// Graceful shutdown
const handleShutdown = (signal: string) => {
    logger.info(`${signal} received. Stopping bot (PID: ${process.pid})...`);
    bot.stop(signal);
};

process.once('SIGINT', () => handleShutdown('SIGINT'));
process.once('SIGTERM', () => handleShutdown('SIGTERM'));
process.once('SIGUSR2', () => handleShutdown('SIGUSR2')); // nodemon

export default bot;
