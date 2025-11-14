require('dotenv').config();
const mysql = require('mysql2/promise');

// Create a connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'carbonplay',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test the database connection
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('Connected to MySQL database successfully.');
    console.log('Database:', process.env.DB_NAME || 'carbonplay');
    console.log('Host:', process.env.DB_HOST || 'localhost');
    connection.release();
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    console.error('Connection details:', {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      database: process.env.DB_NAME || 'carbonplay',
      port: process.env.DB_PORT || 3306
    });
    return false;
  }
};

// Initialize the connection
testConnection();

module.exports = {
  query: (sql, params) => pool.query(sql, params),
  testConnection,
  pool
};
