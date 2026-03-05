// db/database.js
// Connects to MongoDB Atlas via Mongoose.
// Call connectDB() once at server startup.

const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in .env — please paste your Atlas connection string.');
  }

  try {
    await mongoose.connect(uri);
    console.log('✅ MongoDB Atlas connected successfully');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
}

module.exports = { connectDB };
