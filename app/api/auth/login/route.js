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

    // Check if the user exists
    const user = await db.oneOrNone('SELECT id, username, password FROM users WHERE username = $1', [username]);
    if (!user) {
      return new Response(JSON.stringify({ success: false, message: 'Invalid credentials' }), { status: 401 });
    }

    // Compare the provided password with the stored hashed password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return new Response(JSON.stringify({ success: false, message: 'Invalid credentials' }), { status: 401 });
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });

    return new Response(JSON.stringify({ success: true, token }), { status: 200 });
  } catch (error) {
    console.error('Error logging in:', error);
    return new Response(JSON.stringify({ success: false, message: 'An error occurred during login' }), { status: 500 });
  }
}
