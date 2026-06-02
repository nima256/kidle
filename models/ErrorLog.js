const mongoose = require('mongoose');

const errorLogSchema = new mongoose.Schema({
  statusCode: Number,
  message: String,
  url: String,
  method: String,
  ip: String,
  userAgent: String,
  referer: String,
  stack: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ErrorLog', errorLogSchema);
