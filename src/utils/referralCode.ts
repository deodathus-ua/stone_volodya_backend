// src/utils/referralCode.ts
import { customAlphabet } from "nanoid/non-secure";
import { supabase } from "../config/supabase";

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const nanoid = customAlphabet(alphabet, 8);

export const generateReferralCode = async (): Promise<string> => {
    let referralCode: string;
    let isUnique = false;

    do {
        referralCode = nanoid();
        const { data: existingUser } = await supabase.from("users").select("id").eq("referral_code", referralCode).single();
        isUnique = !existingUser;
    } while (!isUnique);

    return referralCode;
};