import { NextResponse } from 'next/server';
import BitcoinCore from 'bitcoin-core';
import db from '@/app/db'; // Assuming you have a db module for database interactions

// Configure the Bitcoin Core client
const bitcoinClient = new BitcoinCore({
  network: 'mainnet',
  username: process.env.BITCOIN_RPC_USER,
  password: process.env.BITCOIN_RPC_PASSWORD,
  host: '127.0.0.1',
  port: 8332,
});

export async function POST(req) {
  try {
    const { userId, amount, recipientAddress } = await req.json();

    // Validate input
    if (!userId || !amount || !recipientAddress) {
      return NextResponse.json({ success: false, message: 'Missing required parameters' }, { status: 400 });
    }

    // Retrieve the user's wallet information from the database
    const userWallet = await db.oneOrNone('SELECT address FROM wallets WHERE user_id = $1 AND crypto_network_id = $2', [userId, 1]); // Assuming 1 is the crypto_network_id for Bitcoin

    if (!userWallet) {
      return NextResponse.json({ success: false, message: 'User wallet not found' }, { status: 404 });
    }

    // Check if the user has sufficient balance for the withdrawal
    const walletBalance = await bitcoinClient.command('getbalance', userWallet.address);
    if (walletBalance < amount) {
      return NextResponse.json({ success: false, message: 'Insufficient balance' }, { status: 400 });
    }

    // Create a transaction to send the Bitcoin to the recipient address
    const transactionId = await bitcoinClient.command('sendtoaddress', recipientAddress, amount);

    // Record the transaction in the database
    await db.none(
      `INSERT INTO transactions (user_id, crypto_network_id, amount, to_address, tx_id, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [userId, 1, amount, recipientAddress, transactionId, 'pending']
    );

    return NextResponse.json({ success: true, transactionId }, { status: 200 });
  } catch (error) {
    console.error('Error executing on-chain transaction:', error);
    return NextResponse.json({ success: false, message: error.message || 'An error occurred while executing the transaction' }, { status: 500 });
  }
}
