import fetch from 'node-fetch';
import db from '@/app/db';
import { exec } from 'child_process';

export async function getBitcoinExchangeRate(fiatCurrency) {
  // Replace this with a call to a real API for current exchange rates
  const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=${fiatCurrency}`);
  const data = await response.json();
  
  return data.bitcoin[fiatCurrency.toLowerCase()];
}

export async function creditUserBitcoinWallet(userId, amountInBitcoin) {
  // Adjust the query to match your table's structure
  const userWallet = await db.wallets.findUnique({
    where: {
      user_id: userId,
      crypto_network_id: 5, // Assuming 5 is the ID for Bitcoin's network
    },
  });

  if (!userWallet) {
    throw new Error('User wallet not found');
  }

  // Use bitcoin-cli or RPC to send Bitcoin to the user's address
  return new Promise((resolve, reject) => {
    exec(`bitcoin-cli sendtoaddress ${userWallet.address} ${amountInBitcoin}`, (error, stdout, stderr) => {
      if (error) {
        return reject(error);
      }
      resolve(stdout.trim());
    });
  });
}
