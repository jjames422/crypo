import { NextResponse } from 'next/server';
import db from '@/app/db'; // Assuming you have a db connection set up
import { v4 as uuidv4 } from 'uuid';

export async function POST(req) {
  try {
    const { userId } = await req.json();
    
    // Generate a unique reference code
    const referenceCode = uuidv4();

    // Store the reference code in the transaction_references table
    await db.none(
      `INSERT INTO transaction_references (user_id, reference_code, swift_transfer_id, created_at, updated_at)
       VALUES ($1, $2, NULL, NOW(), NOW())`,
      [userId, referenceCode]
    );

    return NextResponse.json({ success: true, referenceCode }, { status: 200 });
  } catch (error) {
    console.error('Error processing transfer request:', error);
    return NextResponse.json({ success: false, message: 'An error occurred while processing the transfer request' }, { status: 500 });
  }
}
