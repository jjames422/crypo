Zk05svs@exchange:~/crypo$ cat app/api/bitcoin/buy/route.js 
import { Pool } from 'pg';
import { NextResponse } from 'next/server';

// Initialize PostgreSQL client
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Fetch current Bitcoin exchange rate
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

    // Fetch the user's cash balance
    const userCashBalanceResult = await pool.query(
      'SELECT balance FROM cash_balances WHERE user_id = $1 AND currency = $2',
      [userId, fiatCurrency]
    );
    
    const userCashBalance = userCashBalanceResult.rows[0]?.balance;

    if (!userCashBalance || userCashBalance < amountInFiat) {
      return NextResponse.json({ success: false, message: 'Insufficient funds' }, { status: 400 });
    }

    // Start a transaction
    await pool.query('BEGIN');

    try {
      // Deduct fiat from user's cash balance
      await pool.query(
        'UPDATE cash_balances SET balance = balance - $1 WHERE user_id = $2 AND currency = $3',
        [amountInFiat, userId, fiatCurrency]
      );

      // Increase Bitcoin balance in user's wallet (this is off-chain)
      await pool.query(
        'UPDATE wallets SET balance = balance + $1 WHERE user_id = $2 AND crypto_network_id = 5',
        [amountInBitcoin, userId]
      );

      // Record the cash transaction
      await pool.query(
        `INSERT INTO cash_transactions (user_id, type, method, amount, status, created_at) 
         VALUES ($1, 'buy', 'fiat', $2, 'completed', NOW())`,
        [userId, amountInFiat]
      );

      // Insert the order into the orders table
      const orderResult = await pool.query(
        `INSERT INTO orders (user_id, trading_pair_id, type, amount, price, status, order_type, created_at) 
         VALUES ($1, $2, 'market', $3, $4, 'completed', 'buy', NOW()) 
         RETURNING id`,
        [userId, 1, amountInBitcoin, exchangeRate]  // Assume trading_pair_id for BTC/USD is 1
      );
      
      const orderId = orderResult.rows[0].id;

      await pool.query('COMMIT');

      return NextResponse.json({
        success: true,
        orderId,
        amountInFiat,
        amountInBitcoin,
        exchangeRate,
      }, { status: 200 });

    } catch (error) {
      await pool.query('ROLLBACK');
      console.error('Transaction failed:', error);
      return NextResponse.json({ success: false, message: 'An error occurred while buying Bitcoin' }, { status: 500 });
    }

  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json({ success: false, message: 'An internal server error occurred' }, { status: 500 });
  }
}
Zk05svs@exchange:~/crypo$ 
