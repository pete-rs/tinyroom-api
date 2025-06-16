import express, { Request, Response } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { asyncHandler } from './utils/asyncHandler';

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import roomRoutes from './routes/rooms';
import uploadRoutes from './routes/upload';
import notificationRoutes from './routes/notifications';
import horoscopeRoutes from './routes/horoscope';
import messageRoutes from './routes/messages';

const app = express();

// Middleware
app.use(cors({
  origin: '*', // Allow all origins in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
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

// Test endpoint for debugging
app.post('/api/test/token', asyncHandler(async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.json({ 
      error: 'No authorization header',
      headers: req.headers 
    });
  }
  
  const parts = authHeader.split(' ');
  const token = parts.length === 2 ? parts[1] : authHeader;
  const jwtParts = token.split('.');
  
  // Try to decode the token header if it looks like a JWT
  let tokenInfo: any = {};
  if (jwtParts.length === 3) {
    try {
      const header = JSON.parse(Buffer.from(jwtParts[0], 'base64').toString());
      tokenInfo.header = header;
      tokenInfo.isOpaque = header.alg === 'dir' && header.enc;
    } catch (e) {
      tokenInfo.headerDecodeError = 'Failed to decode token header';
    }
  }
  
  res.json({
    authHeader: authHeader.substring(0, 50) + '...',
    headerParts: parts.map((p, i) => i === 1 ? p.substring(0, 20) + '...' : p),
    token: {
      preview: token.substring(0, 20) + '...' + token.substring(token.length - 20),
      length: token.length,
      parts: jwtParts.length,
      isValidJWTFormat: jwtParts.length === 3,
      tokenType: jwtParts.length === 3 ? (tokenInfo.isOpaque ? 'Opaque (encrypted)' : 'JWT') : 'Unknown'
    },
    tokenInfo,
    auth0Config: {
      domain: config.auth0.domain,
      audience: config.auth0.audience
    }
  });
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/horoscope', horoscopeRoutes);
app.use('/api', messageRoutes);

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