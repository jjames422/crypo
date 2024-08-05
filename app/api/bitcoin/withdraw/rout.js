// app/api/bitcoin/withdraw/route.js
import BitcoinCore from 'bitcoin-core';
import db from '@/app/db';

// Initialize Bitcoin Core client
const bitcoinClient = new BitcoinCore({
  network: 'mainnet',
  username: process.env.BITCOIN_RPC_USER,
  password: process.env.BITCOIN_RPC_PASSWORD,
  port: 8332,
  host: '127.0.0.1'
});

export async function POST(req) {
  try {
    const { userId, address, amount } = await req.json();

    // Validate input
    if (!userId || !address || !amount) {
      return new Response(JSON.stringify({ success: false, message: 'Missing required parameters' }), { status: 400 });
    }

    // Check if user has enough balance
    const userWallet = await db.oneOrNone(
      'SELECT balance FROM wallets WHERE user_id = $1 AND crypto_network_id = (SELECT id FROM crypto_networks WHERE network = $2)',
      [userId, 'Bitcoin']
    );

    if (!userWallet || userWallet.balance < amount) {
      return new Response(JSON.stringify({ success: false, message: 'Insufficient balance' }), { status: 400 });
    }

    // Send the Bitcoin to the specified address
    const txId = await bitcoinClient.command('sendtoaddress', address, amount);

    // Update user's balance
    await db.none(
      'UPDATE wallets SET balance = balance - $1 WHERE user_id = $2 AND crypto_network_id = (SELECT id FROM crypto_networks WHERE network = $3)',
      [amount, userId, 'Bitcoin']
    );

    return new Response(JSON.stringify({ success: true, transactionId: tx
