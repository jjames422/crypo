const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' }); // Load environment variables from .env.local file

// Create a new pool using your connection string
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Ensure this is correctly set up in your .env.local file
});

// Function to get table schema information
async function getTableSchema() {
  try {
    const tables = await pool.query(`
      SELECT table_name, column_name, data_type, ordinal_position
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position;
    `);

    const relationships = await pool.query(`
      SELECT
        tc.constraint_name, tc.table_name, kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE constraint_type = 'FOREIGN KEY'
      ORDER BY tc.table_name;
    `);

    const tableIds = await pool.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE column_name = 'id' AND table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log("Tables and Columns:");
    console.table(tables.rows);

    console.log("Foreign Key Relationships:");
    console.table(relationships.rows);

    console.log("Table IDs:");
    console.table(tableIds.rows);

  } catch (error) {
    console.error('Error fetching schema and relationships:', error);
  } finally {
    pool.end();
  }
}

// Execute the function to get schema information
getTableSchema();
