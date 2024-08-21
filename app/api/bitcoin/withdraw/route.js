import { Pool } from 'pg';
import { exec } from 'child_process';
import { NextResponse } from 'next/server';

// Initialize PostgreSQL client
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Function to load the wallet
async function loadWallet(walletName) {
  return new Promise((resolve, reject) => {
    exec(`bitcoin-cli loadwallet "${walletName}"`, (error, stdout, stderr) => {
      if (error) {
        if (stderr.includes('is it being used by another instance of Bitcoin Core?')) {
          return reject(`Wallet is currently locked or in use: ${stderr || error.message}`);
        }
        return reject(`Failed to load wallet ${walletName}: ${stderr || error.message}`);
      }
      resolve(stdout.trim());
    });
  });
}

// Function to send Bitcoin on-chain
async function sendBitcoin(walletName, address, amount) {
  return new Promise((resolve, reject) => {
    exec(`bitcoin-cli -rpcwallet=${walletName} sendtoaddress ${address} ${amount}`, (error, stdout, stderr) => {
      if (error) {
        return reject(stderr || error.message);
      }
      resolve(stdout.trim());
    });
  });
}

export async function POST(req) {
  try {
    const { userId, withdrawalAmount, withdrawalAddress } = await req.json();

    if (!userId || !withdrawalAmount || !withdrawalAddress) {
      return NextResponse.json({ success: false, message: 'Invalid data' }, { status: 400 });
    }

    // Fetch the user's wallet and balance
    const userWalletResult = await pool.query(
      'SELECT * FROM wallets WHERE user_id = $1 AND crypto_id = 1 AND crypto_network_id = 5', // BTC on the specific network
      [userId]
    );

    const userWallet = userWalletResult.rows[0];
    if (!userWallet || !userWallet.wallet_name) {
      return NextResponse.json({ success: false, message: 'User wallet not found or wallet name is missing' }, { status: 404 });
    }

    if (userWallet.balance < withdrawalAmount) {
      return NextResponse.json({ success: false, message: 'Insufficient Bitcoin balance' }, { status: 400 });
    }

    // Load the wallet
    await loadWallet(userWallet.wallet_name);

    // Start a transaction
    await pool.query('BEGIN');

    try {
      // Send Bitcoin on-chain
      const transactionId = await sendBitcoin(userWallet.wallet_name, withdrawalAddress, withdrawalAmount);

      // Deduct Bitcoin from user's off-chain balance
      await pool.query(
        'UPDATE wallets SET balance = balance - $1 WHERE id = $2',
        [withdrawalAmount, userWallet.id]
      );

      // Record the transaction
      await pool.query(
        `INSERT INTO transactions (wallet_id, amount, type, status, transaction_hash, created_at) 
         VALUES ($1, $2, 'withdrawal', 'completed', $3, NOW())`,
        [userWallet.id, withdrawalAmount, transactionId]
      );

      await pool.query('COMMIT');

      return NextResponse.json({
        success: true,
        transactionId,
        withdrawalAmount,
        withdrawalAddress,
      }, { status: 200 });

    } catch (error) {
      await pool.query('ROLLBACK');
      console.error('Transaction failed:', error);
      return NextResponse.json({ success: false, message: 'An error occurred during withdrawal' }, { status: 500 });
    }

  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json({ success: false, message: 'An internal server error occurred' }, { status: 500 });
  }
}
