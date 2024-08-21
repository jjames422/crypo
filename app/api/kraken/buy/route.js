import axios from 'axios';
import crypto from 'crypto';
import { Pool } from 'pg';
import BitcoinClient from 'bitcoin-core';

const API_KEY = process.env.KRAKEN_API_KEY;
const API_SECRET = process.env.KRAKEN_API_SECRET;
const API_URL = 'https://api.kraken.com';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

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

// API to Buy Bitcoin and Fund the On-Chain Wallet
export async function POST(req) {
  try {
    const { userId, withdrawalAmount } = await req.json();
    
    // Fetch the user's fiat balance
    const result = await pool.query('SELECT balance FROM cash_balances WHERE user_id = $1', [userId]);
    const fiatBalance = result.rows[0]?.balance || 0;

    // Assuming 1 BTC = $50,000, use real-time data instead in production
    const btcAmount = (withdrawalAmount / 50000).toFixed(8);

    if (fiatBalance >= withdrawalAmount) {
      // Place a Kraken buy order
      const krakenResponse = await krakenRequest('/0/private/AddOrder', {
        pair: 'XXBTZUSD',
        type: 'buy',
        ordertype: 'market',
        volume: btcAmount,
      });

      if (krakenResponse.error.length === 0) {
        // Update on-chain wallet
        const client = new BitcoinClient({ 
          network: 'mainnet',
          username: process.env.BITCOIN_RPC_USER,
          password: process.env.BITCOIN_RPC_PASSWORD,
        });

        const transactionId = await client.sendToAddress('YourOnChainWalletAddress', btcAmount);

        return new Response(JSON.stringify({ success: true, transactionId }), { status: 200 });
      } else {
        return new Response(JSON.stringify({ success: false, message: 'Kraken API error', errors: krakenResponse.error }), { status: 400 });
      }
    } else {
      return new Response(JSON.stringify({ success: false, message: 'Insufficient fiat balance' }), { status: 400 });
    }
  } catch (error) {
    console.error('Error processing request:', error);
    return new Response(JSON.stringify({ success: false, message: 'An internal server error occurred' }), { status: 500 });
  }
}
