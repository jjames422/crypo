import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import formidable from 'formidable';

// Define the upload directory
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
      form.parse(req, (err, fields, files) => {
        if (err) {
          console.error('File upload error:', err);
          resolve(NextResponse.json({ success: false, message: 'An error occurred while uploading the file.' }, { status: 500 }));
        }

        const file = files.file;
        const filePath = path.join(uploadDir, file.newFilename);

        // Rename and move the uploaded file to the desired location
        fs.renameSync(file.filepath, filePath);

        resolve(NextResponse.json({
          success: true,
          message: 'File uploaded successfully.',
          filePath: `/uploads/${file.newFilename}`,
        }, { status: 200 }));
      });
    });

  } catch (error) {
    console.error('Error handling file upload:', error);
    return NextResponse.json({ success: false, message: 'An error occurred while uploading the file.' }, { status: 500 });
  }
}
