import { NextResponse } from 'next/server';
import axios from 'axios';
import crypto from 'crypto';

const API_KEY = process.env.KRAKEN_API_KEY;
const API_SECRET = process.env.KRAKEN_API_SECRET;
const API_URL = 'https://api.kraken.com';

function signMessage(path, request, secret) {
    const message = request.nonce + JSON.stringify(request);
    const secret_buffer = Buffer.from(secret, 'base64');
    const hash = crypto.createHash('sha256').update(request.nonce + message).digest('binary');
    const hmac = crypto.createHmac('sha512', secret_buffer);
    const signature = hmac.update(path + hash, 'binary').digest('base64');
    return signature;
}

async function krakenRequest(path, data) {
    const url = `${API_URL}${path}`;
    data.nonce = Date.now() * 1000;

    const headers = {
        'API-Key': API_KEY,
        'API-Sign': signMessage(path, data, API_SECRET),
    };

    try {
        const response = await axios.post(url, new URLSearchParams(data), { headers });
        return response.data;
    } catch (error) {
        console.error('Kraken API error:', error);
        throw error;
    }
}

async function checkBalance() {
    const data = { asset: 'XBT' };
    const response = await krakenRequest('/0/private/Balance', data);
    return response.result?.XXBT || 0;  // Handle potential undefined values
}

async function withdrawBitcoin(address, amount) {
    const data = {
        asset: 'XBT',
        key: address,
        amount: amount.toString(),
    };
    return await krakenRequest('/0/private/Withdraw', data);
}

export async function POST(req) {
    try {
        const { userId, withdrawalAddress, withdrawalAmount } = await req.json();

        if (!userId || !withdrawalAddress || !withdrawalAmount) {
            return NextResponse.json({ success: false, message: 'Invalid data' }, { status: 400 });
        }

        const balance = await checkBalance();
        console.log('Current Balance:', balance);

        if (balance >= withdrawalAmount) {
            const withdrawal = await withdrawBitcoin(withdrawalAddress, withdrawalAmount);
            return NextResponse.json({ success: true, message: 'Withdrawal Successful', data: withdrawal });
        } else {
            return NextResponse.json({ success: false, message: 'Insufficient funds' }, { status: 400 });
        }
    } catch (error) {
        console.error('An error occurred:', error);
        return NextResponse.json({ success: false, message: 'An error occurred during withdrawal' }, { status: 500 });
    }
}
