// src/controllers/airdropController.ts
import { Response } from "express";
import { supabase } from "../config/supabase";
import { TonClient, WalletContractV4, internal, JettonMaster, JettonWallet, Address, toNano, beginCell } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { IUser } from "../types/database";
import { updateUserAndCache, sendUserResponse } from "../utils/userUtils";

import { userCache } from "../server";
import { AuthRequest } from "../types/shared";

const AIRDROP_AMOUNT = 10000;
const AIRDROP_REQUIRED_PROGRESS = 500_000; 
const airdropLocks: { [telegramId: string]: boolean } = {};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Добавление прогресса аирдропа.
 * Оптимизировано: выбор конкретных полей.
 */
export const addAirdropProgress = async (req: AuthRequest, res: Response) => {
    const telegramId = req.user?.telegramId;
    const { stonesToAdd } = req.body;

    if (!telegramId) return res.status(400).json({ message: "telegramId is required" });
    if (typeof stonesToAdd !== "number" || stonesToAdd <= 0) {
        return res.status(400).json({ message: "Invalid stonesToAdd value" });
    }

    try {
        const { data: user, error } = await supabase
            .from("users")
            .select("telegram_id, stones, airdrop_progress, username, energy, league, tasks_completed, skins")
            .eq("telegram_id", telegramId)
            .single();

        if (error || !user) return res.status(404).json({ message: "User not found" });

        if (user.stones < stonesToAdd) {
            return res.status(400).json({ message: "Not enough stones" });
        }

        user.stones -= stonesToAdd;
        const newProgress = Math.min((user.airdrop_progress || 0) + stonesToAdd, AIRDROP_REQUIRED_PROGRESS);
        
        await updateUserAndCache(user as unknown as IUser, userCache, {
            stones: user.stones,
            airdrop_progress: newProgress
        });

        res.json(sendUserResponse(user as unknown as IUser));
    } catch (error) {
        console.error("[addAirdropProgress] Failed to add progress:", error);
        res.status(500).json({ message: "Failed to add airdrop progress" });
    }
};

/**
 * Клейм аирдропа через TON транзакцию.
 * Исправлена ошибка с tonWallet/ton_wallet.
 */
export const claimAirdrop = async (req: AuthRequest, res: Response) => {
    const telegramId = req.user!.telegramId;
    if (airdropLocks[telegramId]) return res.status(429).json({ message: "Another Airdrop claim is in progress" });

    airdropLocks[telegramId] = true;

    try {
        const { data: user, error } = await supabase
            .from("users")
            .select("*") // Здесь берем все, так как отправка TON требует много данных
            .eq("telegram_id", telegramId)
            .single();

        if (error || !user) return res.status(404).json({ message: "User not found" });
        if (!user.ton_wallet) return res.status(400).json({ message: "TON wallet not connected" });
        
        if (!user.tasks_completed) user.tasks_completed = [];
        if (user.tasks_completed.includes("airdrop")) return res.status(400).json({ message: "Airdrop already claimed" });
        
        if ((user.airdrop_progress || 0) < AIRDROP_REQUIRED_PROGRESS) {
            return res.status(400).json({ message: "Not enough progress to claim airdrop" });
        }

        const client = new TonClient({
            endpoint: "https://toncenter.com/api/v2/jsonRPC",
            apiKey: process.env.TONCENTER_API_KEY,
        });

        const OWNER_MNEMONIC = process.env.OWNER_MNEMONIC!;
        const SV_COIN_CONTRACT_ADDRESS = process.env.SV_COIN_CONTRACT_ADDRESS!;
        const mnemonicWords = OWNER_MNEMONIC.split(" ");
        const keyPair = await mnemonicToPrivateKey(mnemonicWords);
        const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
        const walletContract = client.open(wallet);

        const jettonMaster = JettonMaster.create(Address.parse(SV_COIN_CONTRACT_ADDRESS));
        const jettonContract = client.open(jettonMaster);

        await sleep(1000);
        const ownerJettonWalletAddress = await jettonContract.getWalletAddress(wallet.address);

        await sleep(1000);
        const userWalletAddress = Address.parse(user.ton_wallet); // Исправлено с tonWallet

        const transferBody = beginCell()
            .storeUint(0xf8a7ea5, 32)
            .storeUint(0, 64)
            .storeCoins(BigInt(AIRDROP_AMOUNT * 10 ** 9))
            .storeAddress(userWalletAddress)
            .storeAddress(wallet.address)
            .storeMaybeRef(null)
            .storeCoins(toNano("0"))
            .storeMaybeRef(null)
            .endCell();

        await sleep(1000);
        const seqno = await walletContract.getSeqno();
        await walletContract.sendTransfer({
            seqno,
            secretKey: keyPair.secretKey,
            messages: [internal({ to: ownerJettonWalletAddress, value: toNano("0.05"), body: transferBody })],
        });

        user.airdrop_progress = 0;
        user.tasks_completed.push("airdrop");
        
        await updateUserAndCache(user as unknown as IUser, userCache, {
            airdrop_progress: 0,
            tasks_completed: user.tasks_completed
        });
        
        res.json(sendUserResponse(user));
    } catch (error) {
        console.error("[claimAirdrop] Failed to send Airdrop transaction:", error);
        res.status(500).json({ message: "Failed to send Airdrop transaction" });
    } finally {
        delete airdropLocks[telegramId];
    }
};