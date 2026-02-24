-- SQL скрипт для быстрого создания таблицы users в Supabase
-- Просто скопируйте этот код, вставьте в "SQL Editor" в вашем проекте Supabase и нажмите "Run".

CREATE TABLE IF NOT EXISTS public.users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  
  -- Основные поля
  telegram_id text UNIQUE NOT NULL,
  username text NOT NULL,
  photo_url text DEFAULT '',
  stones bigint DEFAULT 0,
  energy integer DEFAULT 1000,
  max_energy integer DEFAULT 1000,
  
  -- Массивы и вложенные объекты из MongoDB будут храниться в формате JSONB
  boosts jsonb DEFAULT '[]'::jsonb,
  skins jsonb DEFAULT '[]'::jsonb,
  tasks_completed jsonb DEFAULT '[]'::jsonb,
  invited_friends jsonb DEFAULT '[]'::jsonb,
  
  -- Игровые характеристики
  league text DEFAULT 'Pebble',
  ton_wallet text,
  referral_code text UNIQUE NOT NULL,
  referred_by text,
  energy_regen_rate integer DEFAULT 1,
  stones_per_click integer DEFAULT 1,
  auto_stones_per_second integer DEFAULT 0,
  
  -- Временные метки (храним как timestamptz для корректной работы с часовыми поясами)
  last_login timestamptz,
  last_auto_bot_update timestamptz DEFAULT now(),
  last_online timestamptz,
  last_energy_update timestamptz DEFAULT now(),
  refill_last_used timestamptz,
  boost_last_used timestamptz,
  boost_active_until timestamptz,
  last_click_time timestamptz,
  
  -- Прочие статусы
  is_premium boolean DEFAULT false,
  referral_bonus_claimed boolean DEFAULT false,
  referral_bonus bigint DEFAULT 0,
  airdrop_progress numeric DEFAULT 0
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS users_telegram_id_idx ON public.users (telegram_id);
CREATE INDEX IF NOT EXISTS users_referral_code_idx ON public.users (referral_code);
CREATE INDEX IF NOT EXISTS users_league_idx ON public.users (league);
