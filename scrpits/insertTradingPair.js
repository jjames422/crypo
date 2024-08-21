require('dotenv').config();
const { Pool } = require('pg');

// Initialize PostgreSQL client
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Function to get crypto_id for a given symbol (e.g., BTC, USD)
async function getCryptoId(symbol) {
  try {
    const result = await pool.query(
      'SELECT id FROM cryptocurrencies WHERE symbol = $1',
      [symbol]
    );
    return result.rows[0]?.id;
  } catch (error) {
    console.error(`Error fetching crypto_id for ${symbol}:`, error);
  }
}

// Insert trading pair into the database
async function insertTradingPair(baseSymbol, quoteSymbol) {
  try {
    const baseCurrencyId = await getCryptoId(baseSymbol);
    const quoteCurrencyId = await getCryptoId(quoteSymbol);

    if (!baseCurrencyId || !quoteCurrencyId) {
      throw new Error('Base or quote currency not found');
    }

    await pool.query(
      `INSERT INTO trading_pairs (base_currency_id, quote_currency_id, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())`,
      [baseCurrencyId, quoteCurrencyId]
    );

    console.log(`Trading pair ${baseSymbol}/${quoteSymbol} inserted successfully`);
  } catch (error) {
    console.error('Error inserting trading pair:', error);
  } finally {
    pool.end(); // Close the database connection
  }
}

// Insert the BTC/USD trading pair
insertTradingPair('BTC', 'USD');
