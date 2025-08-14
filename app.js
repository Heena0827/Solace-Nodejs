import fs from 'fs';
import https from 'https';
import express from 'express';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import path from 'path';

import messageRoutes from './routes/messageRoutes.js';
import { connectAndConsume } from './services/queueConsumer.js';

function safeReadFile(filePath, maxSizeBytes = 1024 * 1024) { // 1MB limit
  const resolvedPath = path.resolve(filePath);
  const stats = fs.statSync(resolvedPath);

  if (!stats.isFile()) {
    throw new Error('Invalid certificate file path');
  }
  if (stats.size > maxSizeBytes) {
    throw new Error('Certificate file too large');
  }
  return fs.readFileSync(resolvedPath);
}

dotenv.config();

const app = express();

app.use(bodyParser.json({ limit: '1mb' }));
app.use(express.text({ type: ['application/xml', 'text/xml'] }));

// Register all routes
app.use('/NotificationService', messageRoutes);

// Always connect and ready to consume
connectAndConsume([
  process.env.QUEUE_NAME_BACKEND,
  process.env.QUEUE_NAME_APIM
]);
const PORT = process.env.PORT || 3000;

// Load certificate and key
const sslOptions = {
  secureProtocol: 'TLSv1_2_method',
  key: safeReadFile('./tls.key'),
  cert: safeReadFile('./tls.crt')
};

// Start HTTPS server
https.createServer(sslOptions, app).listen(PORT, () => {
  console.log(`HTTPS server running on port ${PORT}`);
});
