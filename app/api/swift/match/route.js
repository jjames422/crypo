// /app/api/swift/match/route.js

import { NextResponse } from 'next/server';
import db from '@/app/db';

export async function POST(req) {
  try {
    const { referenceCode, swiftTransferId } = await req.json();

    // Fetch the user transfer request by reference code
    const transferRequest = await db.oneOrNone(
      'SELECT id, user_id, amount, currency FROM transfer_requests WHERE reference_code = $1 AND status = 'pending'',
      [referenceCode]
    );

    if (!transferRequest) {
      return NextResponse.json({ success: false, message: 'Reference code not found or transfer request already processed' }, { status: 404 });
    }

    // Fetch the SWIFT transfer details from the temporary table
    const swiftTransfer = await db.oneOrNone(
      'SELECT * FROM swift_transfers_temp WHERE id = $1',
      [swiftTransferId]
    );

    if (!swiftTransfer) {
      return NextResponse.json({ success: false, message: 'SWIFT transfer record not found' }, { status: 404 });
    }

    // Match and process the transfer
    await db.tx(async t => {
      // Insert into the swift_transfers table
      await t.none(
        `INSERT INTO swift_transfers 
          (user_id, trn, message_type, amount, currency, sender_name, date, created_at, updated_at, bic_sender, swift_code) 
         VALUES 
          ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), $8, $9)`,
        [transferRequest.user_id, swiftTransfer.trn, swiftTransfer.message_type, swiftTransfer.amount, swiftTransfer.currency, swiftTransfer.sender_name, swiftTransfer.date, swiftTransfer.bic_sender, swiftTransfer.swift_code]
      );

      // Update user's cash balance
      await t.none(
        `INSERT INTO cash_balances (user_id, currency, balance, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         ON CONFLICT (user_id, currency)
         DO UPDATE SET balance = cash_balances.balance + EXCLUDED.balance, updated_at = NOW();`,
        [transferRequest.user_id, transferRequest.currency, transferRequest.amount]
      );

      // Update the transfer request status
      await t.none(
        'UPDATE transfer_requests SET status = $1, updated_at = NOW() WHERE id = $2',
        ['completed', transferRequest.id]
      );

      // Delete the temporary swift transfer record
      await t.none(
        'DELETE FROM swift_transfers_temp WHERE id = $1',
        [swiftTransferId]
      );
    });

    return NextResponse.json({ success: true, message: 'Transfer matched and processed successfully' }, { status: 200 });

  } catch (error) {
    console.error('Error matching and processing transfer:', error);
    return NextResponse.json({ success: false, message: 'An error occurred while processing the transfer' }, { status: 500 });
  }
}
