import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

// Create a single instance of Prisma Client
export const prisma = global.prisma || new PrismaClient({
  // Enable query logging in development
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  // Explicit connection pool configuration
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Connection pool configuration via DATABASE_URL
// Add these to your DATABASE_URL: ?connection_limit=10&pool_timeout=20&connect_timeout=10
// Example: postgresql://user:pass@host:port/db?connection_limit=10&pool_timeout=20

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// Ensure we only have one instance and handle cleanup
if (process.env.NODE_ENV === 'development') {
  process.setMaxListeners(0); // Disable max listeners warning in dev
  
  // Handle graceful shutdown
  const cleanup = async () => {
    await prisma.$disconnect();
  };
  
  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);
}

// Log database connection info on startup
async function connectWithRetry(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await prisma.$connect();
      console.log('✅ Database connected successfully');
      return;
    } catch (err) {
      console.error(`❌ Database connection attempt ${i + 1} failed:`, err);
      if (i < retries - 1) {
        console.log(`Retrying in ${(i + 1) * 2} seconds...`);
        await new Promise(resolve => setTimeout(resolve, (i + 1) * 2000));
      } else {
        console.error('Failed to connect to database after all retries');
        process.exit(1);
      }
    }
  }
}

connectWithRetry();