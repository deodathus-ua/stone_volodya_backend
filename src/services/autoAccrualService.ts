// src/services/autoAccrualService.ts
import { IUser } from "../types/database";
import { BOOST_MULTIPLIER } from "../config/gameConfig";

export interface AccrualResult {
    stonesEarned: number;
    boostMultiplier: number;
    timeDiff: number;
}

/**
 * Рассчитывает сколько stones заработал авто-бот за период с последнего обновления.
 * НЕ мутирует объект user.
 */
export const calculateAutoAccrual = (user: IUser, now: Date): AccrualResult => {
    const boostActiveUntil = user.boost_active_until ? new Date(user.boost_active_until) : null;
    const boostMultiplier = boostActiveUntil && now < boostActiveUntil ? BOOST_MULTIPLIER : 1;

    if (user.auto_stones_per_second <= 0) {
        return { stonesEarned: 0, boostMultiplier, timeDiff: 0 };
    }

    const lastUpdate = user.last_auto_bot_update ? new Date(user.last_auto_bot_update) : now;
    const timeDiff = Math.floor((now.getTime() - lastUpdate.getTime()) / 1000);

    if (timeDiff <= 0) {
        return { stonesEarned: 0, boostMultiplier, timeDiff: 0 };
    }

    const stonesEarned = Math.floor(user.auto_stones_per_second * timeDiff * boostMultiplier);

    return { stonesEarned, boostMultiplier, timeDiff };
};

/**
 * Применяет расчет авто-начислений к объекту пользователя.
 * Мутирует объект user.
 */
export const applyAutoAccrual = (user: IUser, now: Date): number => {
    const { stonesEarned } = calculateAutoAccrual(user, now);
    if (stonesEarned > 0) {
        user.stones += stonesEarned;
        user.last_auto_bot_update = now;
    }
    return stonesEarned;
};
