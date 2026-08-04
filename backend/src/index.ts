import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import connectDB from './config/db';

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log('\n🚀 AI Interview Backend Started');
    console.log('═'.repeat(45));
    console.log(`   Server:    http://localhost:${PORT}`);
    console.log(`   API:       http://localhost:${PORT}/api`);
    console.log(`   Health:    http://localhost:${PORT}/api/health`);
    console.log(`   Frontend:  ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
    console.log('═'.repeat(45) + '\n');
  });
};

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
