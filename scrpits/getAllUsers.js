// File: scrpits/getAllUsers.js

require('dotenv').config({ path: '.env.local' });  // Load environment variables from .env.local
const { Client } = require('pg');

// Use the connection string from environment variables
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1); // Exit the script with a failure code
}

const client = new Client({
  connectionString: connectionString,
});

async function getAllUsers() {
  try {
    // Connect to the PostgreSQL database
    await client.connect();
    console.log('Connected to the database');

    // Query to get all users from the users table
    const res = await client.query('SELECT * FROM users');
    
    // Log the users
    console.log('Users:', res.rows);

    // Optionally, you can return the users or process them further
    return res.rows;
  } catch (err) {
    console.error('Error retrieving users:', err);
  } finally {
    // Close the database connection
    await client.end();
    console.log('Database connection closed');
  }
}

// Execute the function
getAllUsers();
