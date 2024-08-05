// app/api/auth/register/route.js
import bcrypt from 'bcrypt';
import db from '@/app/db';
import jwt from 'jsonwebtoken';

export async function POST(req) {
  try {
    const { username, password } = await req.json();

    // Validate input
    if (!username || !password) {
      return new Response(JSON.stringify({ success: false, message: 'Username and password are required' }), { status: 400 });
    }

    // Check if the user already exists
    const existingUser = await db.oneOrNone('SELECT id FROM users WHERE username = $1', [username]);
    if (existingUser) {
      return new Response(JSON.stringify({ success: false, message: 'Username already exists' }), { status: 400 });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the new user into the database
    const user = await db.one(
      `INSERT INTO users (username, password)
       VALUES ($1, $2) RETURNING id, username`,
      [username, hashedPassword]
    );

    // Generate JWT token
    const token = jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });

    return new Response(JSON.stringify({ success: true, token }), { status: 201 });
  } catch (error) {
    console.error('Error registering user:', error);
    return new Response(JSON.stringify({ success: false, message: 'An error occurred during registration' }), { status: 500 });
  }
}
