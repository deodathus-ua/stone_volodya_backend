export interface IBoost {
    name: string;
    level: number;
    count?: number;
}

export interface IInvitedFriend {
    user: string; // uuid
    lastReferralStones: number;
}

export interface IUser {
    id: string; // uuid
    telegram_id: string;
    username: string;
    photo_url: string;
    stones: number;
    energy: number;
    max_energy: number;
    boosts: IBoost[];
    skins: string[];
    tasks_completed: string[];
    invited_friends: IInvitedFriend[];
    league: string;
    ton_wallet?: string;
    referral_code: string;
    referred_by?: string;
    energy_regen_rate: number;
    stones_per_click: number;
    auto_stones_per_second: number;
    last_login?: Date;
    last_auto_bot_update: Date;
    last_online?: Date;
    last_energy_update: Date;
    refill_last_used?: Date;
    boost_last_used?: Date;
    boost_active_until?: Date;
    last_click_time?: Date;
    is_premium: boolean;
    referral_bonus_claimed: boolean;
    referral_bonus: number;
    airdrop_progress: number;
}
