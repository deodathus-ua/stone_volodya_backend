// src/services/energyService.ts
import { IUser } from "../types/database";

/**
 * Рассчитывает и обновляет текущую энергию пользователя на основе прошедшего времени.
 * Мутирует объект user.
 */
export const recalculateEnergy = (user: IUser, now: Date): void => {
    if (!user.last_energy_update) {
        user.last_energy_update = now;
        return;
    }
    const lastUpdate = new Date(user.last_energy_update);
    const timeDiff = Math.floor((now.getTime() - lastUpdate.getTime()) / 1000);
    
    if (timeDiff > 0) {
        const energyGained = timeDiff * user.energy_regen_rate;
        user.energy = Math.min(user.max_energy, user.energy + energyGained);
        user.last_energy_update = now;
    }
};
