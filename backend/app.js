const express = require('express');
const cors = require('cors');
const path = require('path');

// Import routes
const authRoutes = require('./routes/authRoutes');
const scenarioRoutes = require('./routes/scenarioRoutes');
const adminRoutes = require('./routes/adminRoutes');
const challengeRoutes = require('./routes/challengeRoutes');
const socialRoutes = require('./routes/socialRoutes');

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the root directory
app.use(express.static(path.join(__dirname, '..'))); 

// Serve uploaded files from backend/uploads at the /uploads URL path
// This ensures paths like "/uploads/profiles/xyz.jpg" resolve correctly
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API routes
app.get('/api', (req, res) => {
  res.send('Welcome to CarbonPlay-API! Your API is running correctly.');
});

// Mount route handlers
app.use('/api/auth', authRoutes);
app.use('/api', scenarioRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', challengeRoutes);
app.use('/api/social', socialRoutes);

// Serve the index.html for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// Export the Express app
module.exports = app;
