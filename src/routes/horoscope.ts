import { Router } from 'express';
import { generateHoroscope } from '../controllers/horoscopeController';
import { authMiddleware, requireCompleteProfile } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// All routes require authentication and complete profile
router.use(authMiddleware as any, requireCompleteProfile as any);

// Generate horoscope for the authenticated user in a specific room
router.post('/rooms/:roomId/generate', asyncHandler(generateHoroscope));

export default router;