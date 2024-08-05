// app/api/swift/process/route.js
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import db from '@/app/db';

export async function POST(req) {
  try {
    const { fileName, userId } = await req.json();
    const filePath = path.join(process.cwd(), 'uploads', fileName);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ success: false, message: 'File not found' });
    }

    // Example: Parse the SWIFT file and extract data (adjust according to your file format)
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const parsedData = parseSwiftFile(fileContent);

    // Check if the transaction already exists in the system
    const existingTransaction = await db.oneOrNone(
      'SELECT id FROM swift_transfers WHERE trn = $1',
      [parsedData.trn]
    );

    if (existingTransaction) {
      return NextResponse.json({ success: false, message: 'Transaction already exists' });
    }

    // Insert the SWIFT transaction data into the database
    await db.none(
      `INSERT INTO swift_transfers (user_id, trn, message_type, amount, currency, sender_name, beneficiary_name, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, parsedData.trn, parsedData.messageType, parsedData.amount, parsedData.currency, parsedData.senderName, parsedData.beneficiaryName, parsedData.date]
    );

    // Update the user's fiat balance
    await db.none(
      `UPDATE cash_balances SET balance = balance + $1 WHERE user_id = $2 AND currency = $3`,
      [parsedData.amount, userId, 'USD']
    );

    return NextResponse.json({ success: true, message: 'SWIFT file processed and balance updated' });
  } catch (error) {
    console.error('Error processing SWIFT file:', error);
    return NextResponse.json({ success: false, message: 'An error occurred while processing the SWIFT file' });
  }
}

// Example function to parse a SWIFT file (adjust according to your file format)
function parseSwiftFile(fileContent) {
  // Implement your file parsing logic here
  return {
    trn: '1234567890',
    messageType: '103',
    amount: 1000,
    currency: 'USD',
    senderName: 'Sender Name',
    beneficiaryName: 'Beneficiary Name',
    date: new Date(),
  };
}
