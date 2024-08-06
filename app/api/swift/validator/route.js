import { NextResponse } from 'next/server';
import fetch from 'node-fetch';

export async function POST(req) {
  try {
    const { bic } = await req.json();

    // Validate the input
    if (!bic || typeof bic !== 'string') {
      return NextResponse.json({ success: false, message: 'Invalid BIC/SWIFT code' }, { status: 400 });
    }

    // Prepare the request to AAAPIs BIC validation API
    const apiUrl = process.env.AAAPIS_BIC_API_URL;
    const apiToken = process.env.AAAPIS_BIC_API_TOKEN;

    const response = await fetch(`${apiUrl}?key=${apiToken}&bic=${bic}`);
    const data = await response.json();

    if (!data.success) {
      return NextResponse.json({ success: false, message: 'BIC/SWIFT code is not valid' }, { status: 400 });
    }

    // Return the validated BIC/SWIFT code data
    return NextResponse.json({ success: true, data: data.result }, { status: 200 });

  } catch (error) {
    console.error('Error validating BIC/SWIFT code:', error);
    return NextResponse.json({ success: false, message: 'An error occurred while validating the BIC/SWIFT code' }, { status: 500 });
  }
}
