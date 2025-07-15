import express, { Request, Response } from 'express';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { asyncHandler } from './utils/asyncHandler';
import { logger } from './utils/logger';

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import userSearchRoutes from './routes/userSearch';
import roomRoutes from './routes/rooms';
import uploadRoutes from './routes/upload';
import notificationRoutes from './routes/notifications';
import notificationSettingsRoutes from './routes/notificationSettings';
import horoscopeRoutes from './routes/horoscope';
import followRoutes from './routes/follow';
import roomReactionRoutes from './routes/roomReactions';
import roomCommentRoutes from './routes/roomComments';

const app = express();

// Compression middleware - compress all responses
app.use(compression({
  filter: (req, res) => {
    // Don't compress responses with this request header
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Fallback to standard filter function
    return compression.filter(req, res);
  },
  level: 6, // Balanced compression level (1-9, default 6)
}));

// Middleware
app.use(cors({
  origin: '*', // Allow all origins in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request deduplication middleware (for GET and idempotent operations)
// TEMPORARILY DISABLED: May be causing connection pool issues
// app.use(requestDeduplicator.middleware());

// Request logging middleware
app.use((req, res, next) => {
  logger.request(req.method, req.path, {
    query: req.query,
    body: req.method !== 'GET' ? req.body : undefined
  });
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: 'Too many requests from this IP, please try again later.',
});

app.use('/api/', limiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Database latency test
app.get('/db-test', asyncHandler(async (req: Request, res: Response) => {
  const { prisma } = await import('./config/prisma');
  const start = Date.now();
  
  try {
    // Simple query to test database latency
    await prisma.$queryRaw`SELECT 1`;
    const duration = Date.now() - start;
    
    res.json({
      status: 'ok',
      latency: `${duration}ms`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const duration = Date.now() - start;
    res.status(500).json({
      status: 'error',
      latency: `${duration}ms`,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}));


// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/users', userSearchRoutes); // Mention search routes
app.use('/api/rooms', roomRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/notifications', notificationSettingsRoutes); // Player ID update
app.use('/api/horoscope', horoscopeRoutes);
app.use('/api', followRoutes);
app.use('/api', roomReactionRoutes);
app.use('/api', roomCommentRoutes);

// Error handling
app.use(errorHandler as any);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found',
    },
  });
});

export default app;