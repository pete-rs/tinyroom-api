import { Response } from 'express';
import { AuthRequest } from '../types';
import { AppError } from '../middleware/errorHandler';
import { HoroscopeService } from '../services/horoscopeService';

export const generateHoroscope = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;

    console.log('🔮 [Horoscope] Request received:', {
      roomId,
      userId: req.user?.id,
      timestamp: new Date().toISOString(),
    });

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Generate horoscope for the requesting user
    const horoscopeData = await HoroscopeService.generateHoroscope(req.user.id);

    console.log('🔮 [Horoscope] API response payload:', {
      roomId,
      userId: req.user.id,
      theme: horoscopeData.theme,
      readingCount: horoscopeData.readings.length,
      reading: horoscopeData.readings[0] ? {
        name: horoscopeData.readings[0].name,
        sign: horoscopeData.readings[0].sign,
        horoscopePreview: horoscopeData.readings[0].horoscope.substring(0, 50) + '...',
      } : null,
    });

    res.json({
      data: horoscopeData,
    });
  } catch (error) {
    console.error('❌ [Horoscope] Error generating horoscope:', error);
    throw new AppError(500, 'HOROSCOPE_GENERATION_FAILED', 'Failed to generate horoscope');
  }
};