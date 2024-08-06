import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import formidable from 'formidable';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import db from '@/app/db'; // Ensure this is the correct path for your database connection

const uploadDir = path.join(process.cwd(), 'uploads');

// Ensure the upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

export async function POST(req) {
  try {
    const form = new formidable.IncomingForm();
    form.uploadDir = uploadDir;
    form.keepExtensions = true;

    return new Promise((resolve, reject) => {
      form.parse(req, async (err, fields, files) => {
        if (err) {
          console.error('File upload error:', err);
          resolve(NextResponse.json({ success: false, message: 'An error occurred while uploading the file.' }, { status: 500 }));
        }

        const file = files.file;
        const filePath = path.join(uploadDir, file.newFilename);

        // Rename and move the uploaded file to the desired location
        fs.renameSync(file.filepath, filePath);

        // Read the DOCX file content
        const fileContent = fs.readFileSync(filePath);
        const paragraphs = getParagraphsFromDocx(fileContent);
        let swiftData = {};

        paragraphs.forEach(paragraph => {
          const text = paragraph.trim();
          // Implement dynamic parsing logic
          if (text.match(/Transaction Reference Number/i)) {
            swiftData.trn = text.split(':').pop().trim();
          } else if (text.match(/Amount/i)) {
            swiftData.amount = text.split(':').pop().trim().replace(/[^\d.-]/g, ''); // Extract numeric value
          } else if (text.match(/Currency/i)) {
            swiftData.currency = text.split(':').pop().trim();
          } else if (text.match(/Sender Name/i)) {
            swiftData.sender_name = text.split(':').pop().trim();
          } else if (text.match(/Beneficiary Name/i)) {
            swiftData.beneficiary_name = text.split(':').pop().trim();
          } else if (text.match(/Date/i)) {
            swiftData.date = text.split(':').pop().trim();
          }
        });

        // Validate required fields
        const requiredFields = ['trn', 'amount', 'currency', 'sender_name', 'beneficiary_name', 'date'];
        for (const field of requiredFields) {
          if (!swiftData[field]) {
            return resolve(NextResponse.json({ success: false, message: `${field} is missing in the uploaded file.` }, { status: 400 }));
          }
        }

        // Get user ID from the beneficiary name
        const userId = await getUserIdFromBeneficiary(swiftData.beneficiary_name);
        if (!userId) {
          return resolve(NextResponse.json({ success: false, message: 'Beneficiary not found in the database.' }, { status: 404 }));
        }

        // Insert parsed data into the database
        await db.none(
          `INSERT INTO swift_transfers 
            (user_id, trn, message_type, amount, currency, sender_name, beneficiary_name, date, created_at, updated_at) 
           VALUES 
            ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
          [userId, swiftData.trn, 'MT103', swiftData.amount, swiftData.currency, swiftData.sender_name, swiftData.beneficiary_name, swiftData.date]
        );

        resolve(NextResponse.json({
          success: true,
          message: 'File uploaded and parsed successfully.',
          data: swiftData
        }, { status: 200 }));
      });
    });

  } catch (error) {
    console.error('Error handling file upload:', error);
    return NextResponse.json({ success: false, message: 'An error occurred while processing the file.' }, { status: 500 });
  }
}

// Helper function to extract paragraphs from DOCX file
function getParagraphsFromDocx(fileContent) {
  // Implement the logic to read and parse DOCX content into paragraphs
  // Use a library like 'docx' or 'mammoth' to handle DOCX parsing
  // This is a placeholder function and needs to be implemented based on your requirements
  return []; // Return an array of paragraphs
}

// Helper function to get user_id based on the beneficiary name
async function getUserIdFromBeneficiary(beneficiaryName) {
  const result = await db.oneOrNone(
    'SELECT id FROM users WHERE beneficiary_name = $1',
    [beneficiaryName]
  );
  return result ? result.id : null;
}
