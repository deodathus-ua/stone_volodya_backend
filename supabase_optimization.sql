-- Оптимизация базы данных: Индексы и SQL-представления
-- Выполните этот скрипт в SQL Editor вашей панели Supabase.

-- 1. Индекс для ускорения поиска рефералов
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON public.users (referred_by);

-- 2. Составной индекс для лидербордов (фильтрация по лиге + сортировка по камням)
CREATE INDEX IF NOT EXISTS idx_users_league_stones ON public.users (league, stones DESC);

-- 3. Индекс для поиска по telegram_id (уже должен быть первичным ключом, но на случай если нет)
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_id ON public.users (telegram_id);

-- 4. Оптимизированное представление для лидерборда (без лишних полей)
CREATE OR REPLACE VIEW public.leaderboard_view AS
SELECT 
    telegram_id, 
    username, 
    stones, 
    league,
    photo_url
FROM 
    public.users
ORDER BY 
    stones DESC;
