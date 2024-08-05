import { NextResponse } from 'next/server';
import BitcoinCore from 'bitcoin-core';
import db from '@/app/db';
import crypto from 'crypto';
import { bech32 } from 'bech32';

// Configure the Bitcoin Core client
const bitcoinClient = new BitcoinCore({
  network: 'mainnet',
  username: process.env.BITCOIN_RPC_USER,
  password: process.env.BITCOIN_RPC_PASSWORD,
  host: '127.0.0.1',
  port: 8332,
});

// Function to get the crypto network ID and crypto ID from the database
async function getCryptoNetworkAndCryptoId(cryptoName, network) {
  const result = await db.oneOrNone(
    'SELECT cn.id as crypto_network_id, c.id as crypto_id FROM crypto_networks cn JOIN cryptocurrencies c ON cn.crypto_id = c.id WHERE (c.name = $1 OR c.symbol = $1) AND cn.network = $2',
    [cryptoName, network]
  );
  if (!result) throw new Error('Cryptocurrency network not found');
  return result;
}

// Function to validate Bitcoin address
function isValidBitcoinAddress(address) {
  try {
    const decoded = bech32.decode(address);
    return decoded.prefix === 'bc';
  } catch (error) {
    return false;
  }
}

// Function to create a Bitcoin wallet
async function createBitcoinWallet(userId, cryptoNetworkId, cryptoId) {
  const walletName = `wallet_${userId}_${cryptoNetworkId}`;

  // Check if the wallet already exists in Bitcoin Core
  const existingWallets = await bitcoinClient.command('listwallets');
  if (existingWallets.includes(walletName)) {
    throw new Error('Wallet already exists on Bitcoin Core');
  }

  // Create the wallet in Bitcoin Core
  await bitcoinClient.command('createwallet', walletName);

  // Use the wallet-specific RPC path for further commands
  const walletClient = new BitcoinCore({
    network: 'mainnet',
    username: process.env.BITCOIN_RPC_USER,
    password: process.env.BITCOIN_RPC_PASSWORD,
    host: '127.0.0.1',
    port: 8332,
    wallet: walletName // Specify the wallet RPC path
  });

  // Get a new Bitcoin address from the wallet
  const address = await walletClient.command('getnewaddress', '', 'bech32');

  // Validate the Bitcoin address
  if (!isValidBitcoinAddress(address)) {
    throw new Error('Invalid Bitcoin address format');
  }

  // Insert the wallet into the database
  const walletId = await db.one(
    `INSERT INTO wallets (user_id, crypto_network_id, crypto_id, address, balance)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [userId, cryptoNetworkId, cryptoId, address, 0]
  );

  return address;
}

export async function POST(req) {
  try {
    const { userId, cryptoName, network } = await req.json();
    const { crypto_network_id: cryptoNetworkId, crypto_id: cryptoId } = await getCryptoNetworkAndCryptoId(cryptoName, network);

    // Check if the wallet already exists for the user and crypto network
    const existingWallet = await db.oneOrNone(
      'SELECT address FROM wallets WHERE user_id = $1 AND crypto_network_id = $2',
      [userId, cryptoNetworkId]
    );

    if (existingWallet) {
      return NextResponse.json({ success: true, address: existingWallet.address }, { status: 200 });
    }

    let walletAddress;
    if (network === 'Bitcoin') {
      walletAddress = await createBitcoinWallet(userId, cryptoNetworkId, cryptoId);
    } else {
      return NextResponse.json({ success: false, message: 'Unsupported network' }, { status: 400 });
    }

    return NextResponse.json({ success: true, address: walletAddress }, { status: 200 });
  } catch (error) {
    console.error('Error creating wallet:', error);
    return NextResponse.json({ success: false, message: error.message || 'An error occurred while creating the wallet' }, { status: 500 });
  }
}
