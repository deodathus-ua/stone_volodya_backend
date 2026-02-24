// src/types/shared.ts
import { Request } from "express";

export interface AuthRequest extends Request {
    user?: { telegramId: string };
}

/**
 * Interface for partial user updates to prevent overwriting all fields
 */
export type UserUpdateFields = Partial<{
    stones: number;
    energy: number;
    max_energy: number;
    stones_per_click: number;
    energy_regen_rate: number;
    auto_stones_per_second: number;
    league: string;
    photo_url: string;
    username: string;
    last_login: Date | string;
    last_auto_bot_update: Date | string;
    last_online: Date | string;
    last_energy_update: Date | string;
    refill_last_used: Date | string;
    boost_last_used: Date | string;
    boost_active_until: Date | string;
    last_click_time: Date | string;
    referral_bonus: number;
    airdrop_progress: number;
    tasks_completed: string[];
    skins: string[];
}>;
