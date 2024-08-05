require('dotenv').config({ path: '.env.local' });

const { Client } = require('pg');
const readline = require('readline');
const bcrypt = require('bcrypt');

// Use the DATABASE_URL environment variable
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

client.connect();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Prompt for user input
rl.question('Enter Username: ', (username) => {
  rl.question('Enter Email: ', (email) => {
    rl.question('Enter First Name: ', (firstName) => {
      rl.question('Enter Last Name: ', (lastName) => {
        rl.question('Enter Password: ', (password) => {
          // Hash the password
          bcrypt.hash(password, 10, (err, hash) => {
            if (err) {
              console.error('Error hashing password:', err);
              client.end();
              rl.close();
              return;
            }

            // Insert the user into the database
            const query = `
              INSERT INTO users (username, email, password_hash, phone_number, two_factor_enabled, account_type, status, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id
            `;
            const values = [
              username,
              email,
              hash, // store hashed password
              null, // phone_number
              false, // two_factor_enabled
              'regular', // account_type
              'active', // status
              new Date(), // created_at
              new Date() // updated_at
            ];

            client.query(query, values)
              .then(res => {
                console.log('User created with ID:', res.rows[0].id);
              })
              .catch(err => {
                console.error('Error inserting user:', err.stack);
              })
              .finally(() => {
                client.end();
                rl.close();
              });
          });
        });
      });
    });
  });
});
