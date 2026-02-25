import nacl from "tweetnacl";
import crypto from "crypto";
import logger from "../logger";

interface TelegramUser {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
    allows_write_to_pm?: boolean;
    is_premium?: boolean;
    language_code?: string;
}

interface VerificationResult {
    user: TelegramUser;
}

const TELEGRAM_PUBLIC_KEY = Buffer.from(
    process.env.TELEGRAM_PUBLIC_KEY || "e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d",
    "hex"
);
const BOT_ID = process.env.BOT_ID || "7930848670";
const MAX_AGE_SECONDS = 86400; // 24 часа

/**
 * Верификация через HMAC-SHA256 (Стандартный способ Telegram)
 */
const verifyHMAC = (initData: string, botToken: string): TelegramUser | null => {
    try {
        const params = new URLSearchParams(initData);
        const hash = params.get("hash");
        if (!hash) return null;

        params.delete("hash");
        params.delete("signature"); // На всякий случай

        const dataCheckString = Array.from(params.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join("\n");

        const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
        const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

        if (calculatedHash !== hash) return null;

        const userString = params.get("user");
        if (!userString) return null;

        return JSON.parse(decodeURIComponent(userString));
    } catch (e) {
        return null;
    }
};

/**
 * Верификация через Ed25519 (Новый способ через signature)
 */
const verifyEd25519 = (initData: string): TelegramUser | null => {
    try {
        const params = new URLSearchParams(initData);
        const signature = params.get("signature");
        if (!signature) return null;

        params.delete("hash");
        params.delete("signature");

        const dataCheckString = [
            `${BOT_ID}:WebAppData`,
            ...Array.from(params.entries())
                .sort()
                .map(([key, value]) => `${key}=${value}`),
        ].join("\n");

        const isValid = nacl.sign.detached.verify(
            Buffer.from(dataCheckString),
            Buffer.from(signature, "base64url"),
            TELEGRAM_PUBLIC_KEY
        );

        if (!isValid) return null;

        const userString = params.get("user");
        if (!userString) return null;

        return JSON.parse(decodeURIComponent(userString));
    } catch (e) {
        return null;
    }
};

export const verifyTelegramInitData = async (initData: string, botToken: string): Promise<VerificationResult | null> => {
    if (!initData || !botToken) return null;

    const params = new URLSearchParams(initData);
    const authDate = params.get("auth_date");
    if (!authDate) return null;

    const authTimestamp = parseInt(authDate, 10);
    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (currentTimestamp - authTimestamp > MAX_AGE_SECONDS) {
        logger.debug("[verifyTelegramInitData] initData too old");
        return null;
    }

    // Пробуем Ed25519 (новый метод)
    let user = verifyEd25519(initData);
    
    // Если не вышло, пробуем HMAC (классический метод)
    if (!user) {
        user = verifyHMAC(initData, botToken);
    }

    if (user) {
        return { user };
    }

    logger.warn("[verifyTelegramInitData] All verification methods failed");
    return null;
};
