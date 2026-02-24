-- SQL RPC функции для атомарных операций в Supabase
-- Эти функции нужно выполнить в SQL Editor в панели Supabase.

-- 1. Атомарное начисление камней (решает проблему race conditions)
CREATE OR REPLACE FUNCTION add_stones(
    p_telegram_id TEXT,
    p_amount BIGINT
) RETURNS VOID AS $$
BEGIN
    UPDATE public.users
    SET stones = stones + p_amount
    WHERE telegram_id = p_telegram_id;
END;
$$ LANGUAGE plpgsql;

-- 2. Атомарное начисление реферального бонуса (предотвращает потерю данных реферера)
CREATE OR REPLACE FUNCTION add_referral_bonus_rpc(
    p_referral_code TEXT,
    p_bonus BIGINT,
    p_friend_id UUID
) RETURNS VOID AS $$
BEGIN
    UPDATE public.users
    SET stones = stones + p_bonus,
        referral_bonus = referral_bonus + p_bonus
    WHERE referral_code = p_referral_code;
    
    -- Примечание: Обновление JSONB массива invited_friends через RPC сложнее, 
    -- в данной версии ограничиваемся балансом для критической стабильности.
END;
$$ LANGUAGE plpgsql;
