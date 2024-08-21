import Client from 'bitcoin-core';
import { Pool } from 'pg';
import { NextResponse } from 'next/server';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function getBitcoinExchangeRate(fiatCurrency) {
  const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=${fiatCurrency}`);
  const data = await response.json();
  return data.bitcoin[fiatCurrency.toLowerCase()];
}

export async function POST(req) {
  try {
    const { userId, amountInFiat, fiatCurrency } = await req.json();

    if (!userId || !amountInFiat || !fiatCurrency) {
      return NextResponse.json({ success: false, message: 'Invalid data' }, { status: 400 });
    }

    const exchangeRate = await getBitcoinExchangeRate(fiatCurrency);
    const amountInBitcoin = amountInFiat / exchangeRate;

    console.log(`Calculated amountInBitcoin: ${amountInBitcoin}`);

    if (amountInBitcoin <= 0) {
      return NextResponse.json({ success: false, message: 'Invalid amount calculated' }, { status: 400 });
    }

    const userCashBalanceResult = await pool.query(
      'SELECT balance FROM cash_balances WHERE user_id = $1 AND currency = $2',
      [userId, fiatCurrency]
    );

    const userCashBalance = userCashBalanceResult.rows[0]?.balance;

    if (!userCashBalance || userCashBalance < amountInFiat) {
      return NextResponse.json({ success: false, message: 'Insufficient funds' }, { status: 400 });
    }

    await pool.query('BEGIN');

    try {
      await pool.query(
        'UPDATE cash_balances SET balance = balance - $1 WHERE user_id = $2 AND currency = $3',
        [amountInFiat, userId, fiatCurrency]
      );

      const client = new Client({
        network: 'mainnet',
        username: process.env.BITCOIN_RPC_USER,
        password: process.env.BITCOIN_RPC_PASSWORD,
        host: process.env.BITCOIN_CORE_RPC_HOST,
        port: process.env.BITCOIN_CORE_RPC_PORT,
      });

      const walletResult = await pool.query('SELECT wallet_name FROM wallets WHERE user_id = $1 AND crypto_network_id = 5', [userId]);
      const walletName = walletResult.rows[0]?.wallet_name;

      if (!walletName) {
        throw new Error('Wallet not found for the user');
      }

      // Load the wallet and send the transaction
      await client.command('loadwallet', walletName);
      const transaction = await client.command('sendtoaddress', 'bc1qg0a0yjdadmrdvhaemkrt8y38z9ccs8fc2uglmv', amountInBitcoin);
      console.log(`Transaction successful: ${transaction}`);

      await pool.query(
        `INSERT INTO transactions (wallet_id, amount, type, status, transaction_hash, network, created_at, updated_at) 
         VALUES ((SELECT id FROM wallets WHERE user_id = $1 AND crypto_network_id = 5), $2, 'buy', 'completed', $3, 'bitcoin', NOW(), NOW())`,
        [userId, amountInBitcoin, transaction]
      );

      await pool.query('COMMIT');

      return NextResponse.json({
        success: true,
        transaction,
        amountInFiat,
        amountInBitcoin,
        exchangeRate,
      }, { status: 200 });

    } catch (error) {
      await pool.query('ROLLBACK');
      console.error('Transaction failed:', error.message);
      return NextResponse.json({ success: false, message: `Transaction failed: ${error.message}` }, { status: 500 });
    }

  } catch (error) {
    console.error('Error processing request:', error.message);
    return NextResponse.json({ success: false, message: `An internal server error occurred: ${error.message}` }, { status: 500 });
  }
}
