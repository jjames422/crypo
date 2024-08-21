import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import db from '@/app/db';

const uploadsDir = path.join(process.cwd(), 'uploads', 'swift');

// Hard-coded exchange rates (Example: 1 EUR = 1.1 USD)
const exchangeRates = {
  EUR: 1.1,
  GBP: 1.25,
  // Add more currencies as needed
};

export async function POST(req) {
  try {
    const { fileId, userId } = await req.json();

    if (!fileId || !userId) {
      return NextResponse.json({ success: false, message: 'fileId and userId are required.' }, { status: 400 });
    }

    const filePath = path.join(uploadsDir, fileId);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ success: false, message: 'File not found' }, { status: 404 });
    }

    // Read the DOCX file content
    const paragraphs = await getParagraphsFromDocx(filePath);
    let swiftData = {};

    paragraphs.forEach(paragraph => {
      const text = paragraph.trim();
      // Updated dynamic parsing logic
      if (text.match(/TRN:/i)) {
        swiftData.trn = text.split(':').pop().trim();
      } else if (text.match(/Amount:/i)) {
        swiftData.amount = parseFloat(text.split(':').pop().trim().replace(/[^\d.-]/g, '')); // Extract numeric value
      } else if (text.match(/Currency:/i)) {
        swiftData.currency = text.split(':').pop().trim();
      } else if (text.match(/Sender Name:/i)) {
        swiftData.sender_name = text.split(':').pop().trim();
      } else if (text.match(/Beneficiary Name:/i)) {
        swiftData.beneficiary_name = text.split(':').pop().trim();
      } else if (matchDate(text)) {
        swiftData.date = matchDate(text);
      }
    });

    // Validate required fields
    const requiredFields = ['trn', 'amount', 'currency', 'sender_name', 'beneficiary_name', 'date'];
    for (const field of requiredFields) {
      if (!swiftData[field]) {
        return NextResponse.json({ success: false, message: `${field} is missing in the uploaded file.` }, { status: 400 });
      }
    }

    // Currency conversion to USD
    if (swiftData.currency !== 'USD') {
      console.log(`Converting ${swiftData.amount} ${swiftData.currency} to USD.`);
      const conversionRate = exchangeRates[swiftData.currency];
      if (!conversionRate) {
        return NextResponse.json({ success: false, message: `Conversion rate for ${swiftData.currency} is not available.` }, { status: 400 });
      }
      swiftData.amount = swiftData.amount * conversionRate;
      swiftData.currency = 'USD';
      console.log(`Conversion successful: ${swiftData.amount} USD.`);
    }

    // Convert the date format to YYYY-MM-DD
    swiftData.date = convertDateFormat(swiftData.date);

    // Insert parsed data into the swift_transfers table
    await db.none(
      `INSERT INTO swift_transfers 
        (user_id, trn, message_type, amount, currency, sender_name, beneficiary_name, date, created_at, updated_at) 
       VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
      [userId, swiftData.trn, 'MT103', swiftData.amount, swiftData.currency, swiftData.sender_name, swiftData.beneficiary_name, swiftData.date]
    );

    // Insert or update the user's cash balance
    const existingBalance = await db.oneOrNone(
      `SELECT balance FROM cash_balances WHERE user_id = $1`,
      [userId]
    );

    if (existingBalance) {
      // Update the existing balance
      await db.none(
        `UPDATE cash_balances 
         SET balance = balance + $1, updated_at = NOW() 
         WHERE user_id = $2`,
        [swiftData.amount, userId]
      );
      console.log(`Updated cash balance for user ${userId} by ${swiftData.amount} USD.`);
    } else {
      // Insert a new balance record
      await db.none(
        `INSERT INTO cash_balances (user_id, currency, balance, created_at, updated_at) 
         VALUES ($1, 'USD', $2, NOW(), NOW())`,
        [userId, swiftData.amount]
      );
      console.log(`Created new cash balance record for user ${userId} with ${swiftData.amount} USD.`);
    }

    return NextResponse.json({
      success: true,
      message: 'File processed and data inserted successfully.',
      data: swiftData
    }, { status: 200 });

  } catch (error) {
    console.error('Error processing file:', error);
    return NextResponse.json({ success: false, message: 'An error occurred while processing the file.' }, { status: 500 });
  }
}

// Helper function to extract paragraphs from DOCX file
async function getParagraphsFromDocx(filePath) {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value.split('\n').filter(paragraph => paragraph.trim() !== ''); // Splitting text into paragraphs
  } catch (error) {
    console.error('Error parsing DOCX file:', error);
    return [];
  }
}

// Helper function to match various date formats
function matchDate(text) {
  const datePatterns = [
    /\b\d{2}\/\d{2}\/\d{4}\b/, // Matches DD/MM/YYYY or MM/DD/YYYY
    /\b\d{4}\/\d{2}\/\d{2}\b/, // Matches YYYY/MM/DD
    /\b\d{2}-\d{2}-\d{4}\b/,   // Matches DD-MM-YYYY
    /\b[A-Za-z]+\s\d{1,2},\s\d{4}\b/ // Matches Month Day, Year
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }
  return null;
}

// Helper function to convert date format to YYYY-MM-DD
function convertDateFormat(dateString) {
  // Handle various date formats
  if (dateString.includes('/')) {
    // Assuming dateString is in DD/MM/YYYY format
    const [day, month, year] = dateString.split('/');
    return `${year}-${month}-${day}`;
  } else if (dateString.includes('-')) {
    // Assuming dateString is in DD-MM-YYYY format
    const [day, month, year] = dateString.split('-');
    return `${year}-${month}-${day}`;
  }
  return dateString; // If it's already in YYYY-MM-DD format
}
