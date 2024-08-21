import { Pool } from 'pg';
import { exec } from 'child_process';
import { NextResponse } from 'next/server';

// Initialize PostgreSQL client
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Function to load a Bitcoin wallet
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

// Function to get on-chain balance
async function getOnChainBalance(walletName) {
  return new Promise((resolve, reject) => {
    exec(`bitcoin-cli -rpcwallet=${walletName} getbalance`, (error, stdout, stderr) => {
      if (error) {
        return reject(stderr || error.message);
      }
      resolve(parseFloat(stdout.trim()));
    });
  });
}

export async function POST(req) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ success: false, message: 'Invalid data: userId is required' }, { status: 400 });
    }

    // Fetch the user's wallet details
    const userWalletResult = await pool.query(
      'SELECT * FROM wallets WHERE user_id = $1 AND crypto_id = 1', // Assuming 1 is the crypto_id for Bitcoin
      [userId]
    );

    const userWallet = userWalletResult.rows[0];
    if (!userWallet || !userWallet.wallet_name) {
      return NextResponse.json({ success: false, message: 'User wallet not found or wallet name is missing' }, { status: 404 });
    }

    // Load the wallet
    try {
      await loadWallet(userWallet.wallet_name);
    } catch (loadError) {
      console.error('Error loading wallet:', loadError);
      return NextResponse.json({ success: false, message: loadError }, { status: 500 });
    }

    // Get the on-chain balance
    let onChainBalance;
    try {
      onChainBalance = await getOnChainBalance(userWallet.wallet_name);
    } catch (balanceError) {
      console.error('Error fetching on-chain balance:', balanceError);
      return NextResponse.json({ success: false, message: 'Failed to fetch on-chain balance' }, { status: 500 });
    }

    // Sync off-chain balance with on-chain balance if they differ
    if (onChainBalance !== parseFloat(userWallet.balance)) {
      await pool.query(
        'UPDATE wallets SET balance = $1 WHERE id = $2',
        [onChainBalance, userWallet.id]
      );
    }

    return NextResponse.json({
      success: true,
      userId,
      offChainBalance: userWallet.balance,
      onChainBalance,
    }, { status: 200 });

  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json({ success: false, message: 'An internal server error occurred' }, { status: 500 });
  }
}
