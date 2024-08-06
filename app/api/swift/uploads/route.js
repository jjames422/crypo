import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import formidable from 'formidable';
import mammoth from 'mammoth';
import db from '@/app/db';

const uploadDir = path.join(process.cwd(), 'uploads/swift');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

export async function POST(req) {
  try {
    const form = formidable({ uploadDir, keepExtensions: true });

    return new Promise((resolve, reject) => {
      form.parse(req, async (err, fields, files) => {
        if (err) {
          console.error('File upload error:', err);
          resolve(NextResponse.json({ success: false, message: 'An error occurred while uploading the file.' }, { status: 500 }));
          return;
        }

        const file = files.file;
        const filePath = path.join(uploadDir, file.newFilename);

        // Parse the SWIFT file and extract details
        const parsedData = await parseSwiftFile(filePath);

        // Store the extracted information in the swift_transfers_temp table
        await db.none(
          `INSERT INTO swift_transfers_temp 
            (trn, message_type, amount, currency, sender_name, date, bic_sender, swift_code, created_at, updated_at) 
           VALUES 
            ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
          [parsedData.trn, parsedData.message_type, parsedData.amount, parsedData.currency, parsedData.sender_name, parsedData.date, parsedData.bic_sender, parsedData.swift_code]
        );

        resolve(NextResponse.json({
          success: true,
          message: 'File uploaded and parsed successfully. Waiting for manual mapping.',
          data: parsedData
        }, { status: 200 }));
      });
    });

  } catch (error) {
    console.error('Error handling file upload:', error);
    return NextResponse.json({ success: false, message: 'An error occurred while processing the file.' }, { status: 500 });
  }
}

// Function to parse the SWIFT file using mammoth
async function parseSwiftFile(filePath) {
  try {
    // Read the DOCX file using Mammoth
    const { value: text } = await mammoth.extractRawText({ path: filePath });

    // Initialize an object to store the parsed data
    const swiftData = {
      trn: '',
      message_type: 'MT103',
      amount: '',
      currency: '',
      sender_name: '',
      date: '',
      bic_sender: '',
      swift_code: ''
    };

    // Split the text into lines for easier processing
    const lines = text.split('\n');

    // Iterate over each line to extract data
    lines.forEach(line => {
      if (line.includes('Transaction Reference Number')) {
        swiftData.trn = line.split(':').pop().trim();
      } else if (line.includes('Amount')) {
        swiftData.amount = line.split(':').pop().trim().replace(/[^\d.-]/g, '');
      } else if (line.includes('Currency')) {
        swiftData.currency = line.split(':').pop().trim();
      } else if (line.includes('Sender Name')) {
        swiftData.sender_name = line.split(':').pop().trim();
      } else if (line.includes('Date')) {
        swiftData.date = line.split(':').pop().trim();
      } else if (line.includes('BIC Sender')) {
        swiftData.bic_sender = line.split(':').pop().trim();
      } else if (line.includes('SWIFT Code')) {
        swiftData.swift_code = line.split(':').pop().trim();
      }
    });

    // Validate the parsed data
    const requiredFields = ['trn', 'amount', 'currency', 'sender_name', 'date', 'bic_sender', 'swift_code'];
    requiredFields.forEach(field => {
      if (!swiftData[field]) {
        throw new Error(`${field} is missing in the uploaded file.`);
      }
    });

    return swiftData;

  } catch (error) {
    console.error('Error parsing SWIFT file:', error);
    throw new Error('An error occurred while parsing the SWIFT file.');
  }
}
