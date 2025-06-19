import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma = global.prisma || new PrismaClient({
  // Enable query logging in development
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

// Connection pool configuration via DATABASE_URL
// Add these to your DATABASE_URL: ?connection_limit=10&pool_timeout=20&connect_timeout=10
// Example: postgresql://user:pass@host:port/db?connection_limit=10&pool_timeout=20

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// Log database connection info on startup
prisma.$connect().then(() => {
  console.log('✅ Database connected successfully');
}).catch((err) => {
  console.error('❌ Database connection failed:', err);
});