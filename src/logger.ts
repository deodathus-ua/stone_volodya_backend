import { createLogger, format, transports } from "winston";
import fs from "fs";
import path from "path";

const logDir = "logs";
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

const logger = createLogger({
    level: "debug", // Изменил на debug, чтобы видеть всё
    format: format.combine(
        format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        format.errors({ stack: true }), // Добавляем стек ошибок
        format.printf(({ timestamp, level, message, stack }) => {
            return stack 
                ? `${timestamp} [${level.toUpperCase()}] ${message}\n${stack}`
                : `${timestamp} [${level.toUpperCase()}] ${message}`;
        })
    ),
    transports: [
        // Логи в консоль с цветами для удобства
        new transports.Console({
            format: format.combine(
                format.colorize(),
                format.printf(({ timestamp, level, message, stack }) => {
                    return stack 
                        ? `${timestamp} [${level}] ${message}\n${stack}`
                        : `${timestamp} [${level}] ${message}`;
                })
            ),
        }),
        // Логи в файл (все уровни)
        new transports.File({
            filename: path.join(logDir, "app.log"),
            level: "debug",
        }),
        // Ошибки в отдельный файл
        new transports.File({
            filename: path.join(logDir, "errors.log"),
            level: "error",
        }),
    ],
});

export default logger;