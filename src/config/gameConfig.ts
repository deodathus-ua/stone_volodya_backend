// src/config/gameConfig.ts

export const LEAGUES = [
    { name: "Pebble", minStones: 0 },
    { name: "Gravel", minStones: 5_000 },
    { name: "Cobblestone", minStones: 50_000 },
    { name: "Boulder", minStones: 100_000 },
    { name: "Quartz", minStones: 500_000 },
    { name: "Granite", minStones: 1_000_000 },
    { name: "Obsidian", minStones: 10_000_000 },
    { name: "Marble", minStones: 50_000_000 },
    { name: "Bedrock", minStones: 100_000_000 },
] as const;

export type BoostName = "RechargeSpeed" | "BatteryPack" | "MultiTap" | "AutoBot" | "Refill" | "Boost";

export const BOOST_CONFIG: Record<string, { costs: number[]; maxLevel: number; calcEffect: (level: number) => number | string }> = {
    MultiTap: {
        costs: [500, 700, 1000, 1400, 2000, 3400, 4700, 6500, 9000, 13000, 18000],
        maxLevel: 10,
        calcEffect: (level: number) => 2 + 2 * level, // stones/click (Base 2)
    },
    AutoBot: {
        costs: [5000, 9000, 16000, 29000, 52000, 83000, 150000, 270000, 490000, 880000, 1300000],
        maxLevel: 10,
        calcEffect: (level: number) => 1 + level, // stones/sec (Base 1)
    },
    BatteryPack: {
        costs: [750, 1050, 1500, 2100, 3000, 7400, 10000, 14000, 20000, 28000, 38000],
        maxLevel: 10,
        calcEffect: (level: number) => 1000 + 500 * level, // max energy
    },
    RechargeSpeed: {
        costs: [300, 400, 500, 700, 900, 2000, 2600, 3400, 4500, 6000, 13000],
        maxLevel: 10,
        calcEffect: (level: number) => 1 + level, // energy/sec
    },
    Refill: {
        costs: [0],
        maxLevel: 1,
        calcEffect: () => "Full energy refill",
    },
    Boost: {
        costs: [0],
        maxLevel: 1,
        calcEffect: () => "Double taps and auto-taps for 1 minute",
    },
};

export const EARN_TASKS: Record<string, number> = {
    "join_telegram": 1000,
    "follow_twitter": 1000,
    "vote_coinmarketcap": 1200,
    "join_reddit": 1000,
    "share_tiktok": 1000,
};

export const REFERRAL_BONUS_PERCENT = 0.05;
export const REFERRAL_SIGNUP_BONUS = { regular: 1000, premium: 10000 };
export const BOOST_DURATION_MS = 60 * 1000;
export const BOOST_MULTIPLIER = 2;
export const REFILL_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const MAX_ENERGY_DEFAULT = 1000;
export const STONES_PER_CLICK_DEFAULT = 1;
export const ENERGY_REGEN_RATE_DEFAULT = 1;
