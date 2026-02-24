import dotenv from "dotenv";
dotenv.config();

import { Telegraf } from "telegraf";
import { supabase } from "./config/supabase";
import { IUser, IInvitedFriend } from "./types/database";
import { generateReferralCode } from "./utils/referralCode";
import { updateUserAndCache } from "./utils/userUtils";
import { userCache } from "./server";
import path from "path";
import fs from "fs";

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

// Путь к фото в папке assets (предполагается, что у вас есть файл, например, welcome.jpg в assets)
const welcomeImagePath = path.join(__dirname, "../assets/welcome.jpg");

bot.start(async (ctx) => {
    const referralCode = ctx.startPayload || "";
    const telegramId = ctx.from.id.toString();

    try {
        let { data: user } = await supabase.from("users").select("*").eq("telegram_id", telegramId).single();
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
                console.error("[bot] Error fetching user profile photos:", error);
                return "";
            }
        };

        if (!user) {
            const photoUrl = await getPhotoUrl();
            const { data: newUser } = await supabase.from("users").insert({
                telegram_id: telegramId,
                username: ctx.from.username || ctx.from.first_name || `Miner_${Math.random().toString(36).substring(7)}`,
                photo_url: photoUrl,
                referral_code: await generateReferralCode(),
                referred_by: referralCode || undefined,
                is_premium: !!ctx.from.is_premium,
                stones: 0,
                energy: 1000,
                league: "Pebble",
                last_auto_bot_update: now,
                last_online: now,
                refill_last_used: now,
                boost_last_used: now,
            }).select().single();
            user = newUser;

            if (referralCode) {
                const { data: referrer } = await supabase.from("users").select("*").eq("referral_code", referralCode).single();
                if (referrer) {
                    const bonus = user.is_premium ? 10000 : 1000;
                    if (!referrer.invited_friends) referrer.invited_friends = [];
                    referrer.invited_friends.push({ user: user.id, lastReferralStones: 0 });
                    referrer.stones += bonus;
                    referrer.referral_bonus = (referrer.referral_bonus || 0) + bonus;
                    await updateUserAndCache(referrer, userCache);
                    
                    user.stones += bonus;
                }
            }
        } else {
            // Обновляем данные существующего пользователя
            user.username = ctx.from.username || ctx.from.first_name || user.username;
            user.is_premium = !!ctx.from.is_premium;
            user.last_online = now;
            user.photo_url = await getPhotoUrl(); // Обновляем photo_url при каждом входе

            // Возобновление бустов раз в сутки
            if (!user.refill_last_used || (now.getTime() - new Date(user.refill_last_used).getTime()) >= 24 * 60 * 60 * 1000) {
                user.refill_last_used = now;
            }
            if (!user.boost_last_used || (now.getTime() - new Date(user.boost_last_used).getTime()) >= 24 * 60 * 60 * 1000) {
                user.boost_last_used = now;
            }
        }

        await updateUserAndCache(user, userCache);

        const miniAppUrl = `https://t.me/StoneVolodyaCoinBot/stone_volodya_game?startapp=${user.referral_code}`;

        // Проверяем наличие изображения в assets и отправляем его с сообщением
        if (fs.existsSync(welcomeImagePath)) {
            await ctx.replyWithPhoto(
                { source: fs.createReadStream(welcomeImagePath) },
                {
                    caption: "Welcome to the Great Stone World of Wonders! Ancient treasures, mighty stones and incredible adventures await you here. Click the button below and start your journey to the top!",
                    reply_markup: {
                        inline_keyboard: [[{ text: "Join Stone World", url: miniAppUrl }]],
                    },
                }
            );
        } else {
            // Если изображения нет, отправляем только текст
            await ctx.reply(
                "Welcome to the Great Stone World of Wonders! Ancient treasures, mighty stones and incredible adventures await you here. Click the button below and start your journey to the top!",
                {
                    reply_markup: {
                        inline_keyboard: [[{ text: "Join Stone World", url: miniAppUrl }]],
                    },
                }
            );
        }
    } catch (error) {
        console.error("[bot] Error processing /start:", error);
        await ctx.reply("Something went wrong in Stone World. Try again!");
    }
});

bot.launch();
console.log("Telegram bot is running...");

export default bot;