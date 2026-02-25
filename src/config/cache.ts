// src/config/cache.ts

/**
 * userCache is moved here to break the circular dependency between server.ts and bot.ts.
 */
export const userCache = new Map<string, { 
    stones: number; 
    autoStonesPerSecond: number; 
    lastAutoBotUpdate: Date; 
    league: string 
}>();

export const activeConnections = new Map<string, string>();
export const leaderboardCache = new Map<string, any[]>();
