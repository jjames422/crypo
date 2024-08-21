#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' }); // Load environment variables from .env.local
const { Pool } = require('pg');
const readline = require('readline');

// Initialize PostgreSQL client
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Prompt the user for input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Enter user ID: ', async (userId) => {
  try {
    // Check fiat balances
    const fiatResult = await pool.query(
      'SELECT currency, balance FROM cash_balances WHERE user_id = $1',
      [userId]
    );

    // Check crypto balances and addresses
    const cryptoResult = await pool.query(
      `SELECT c.symbol, w.balance, w.address FROM wallets w 
       JOIN cryptocurrencies c ON w.crypto_id = c.id 
       WHERE w.user_id = $1`,
      [userId]
    );

    console.log(`User ID: ${userId}`);
    console.log('Fiat Balances:');
    fiatResult.rows.forEach(row => {
      console.log(`${row.currency}: ${row.balance}`);
    });

    console.log('Crypto Balances:');
    cryptoResult.rows.forEach(row => {
      console.log(`${row.symbol}: ${row.balance} (Address: ${row.address})`);
    });

    rl.close();
  } catch (err) {
    console.error('Error fetching user assets:', err);
    rl.close();
  }
});
