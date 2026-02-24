import { Request, Response } from "express";
import { supabase } from "../config/supabase";
import { IUser } from "../types/database";
import { userCache } from "../server";
import { updateUserAndCache, sendUserResponse } from "../utils/userUtils";
import { EARN_TASKS } from "../config/gameConfig";
import { AuthRequest } from "../types/shared";



export const completeTask = async (req: AuthRequest, res: Response) => {
    const telegramId = req.user!.telegramId;
    const { taskName } = req.body;


    if (!telegramId) return res.status(400).json({ error: "telegramId is required" });
    if (!taskName) return res.status(400).json({ error: "taskName is required" });
    if (!EARN_TASKS[taskName]) return res.status(400).json({ error: "Invalid task name" });

    try {
        const { data: user } = await supabase.from("users").select("*").eq("telegram_id", telegramId).single();
        if (!user) return res.status(404).json({ error: "User not found" });

        if (!user.tasks_completed) user.tasks_completed = [];

        // Проверка, завершена ли задача
        if (user.tasks_completed.includes(taskName)) {
            return res.status(400).json({ error: "Task already completed" });
        }

        // Восстановление энергии
        const now = new Date();
        const lastUpdate = user.last_energy_update ? new Date(user.last_energy_update) : now;
        const timeDiff = Math.floor((now.getTime() - lastUpdate.getTime()) / 1000);
        user.energy = Math.min(user.max_energy, user.energy + timeDiff * user.energy_regen_rate);
        user.last_energy_update = now;

        // Начисление награды и отметка задачи
        const reward = EARN_TASKS[taskName];
        user.stones += reward;
        user.tasks_completed.push(taskName);

        await updateUserAndCache(user, userCache, {
            stones: user.stones,
            energy: user.energy,
            last_energy_update: user.last_energy_update,
            tasks_completed: user.tasks_completed
        });
        res.json(sendUserResponse(user));
    } catch (error) {
        console.error("[completeTask] Error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};