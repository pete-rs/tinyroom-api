import { Response } from 'express';
import { AuthRequest } from '../types';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export const verifyAuth = async (req: AuthRequest, res: Response) => {
  logger.info('=== VERIFY AUTH ENDPOINT CALLED ===', {
    authSub: req.auth?.sub,
    hasEmail: !!req.auth?.email,
    hasPhoneNumber: !!req.auth?.phone_number,
    existingUser: !!req.user
  });
  
  try {
    if (!req.auth?.sub) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid auth token');
    }

    let user = await prisma.user.findUnique({
      where: { auth0Id: req.auth.sub },
    });

    if (!user) {
      // Extract email from Auth0 token, or generate one for SMS auth
      let email = req.auth.email;
      
      // For SMS authentication, create a placeholder email
      if (!email && req.auth.sub.startsWith('sms|')) {
        // Extract phone number if available, otherwise use the auth0 sub
        const phoneNumber = req.auth.phone_number || req.auth.sub;
        email = `${phoneNumber.replace(/[^a-zA-Z0-9]/g, '')}@sms.placeholder`;
        console.log('SMS auth detected, using placeholder email:', email);
      }
      
      if (!email) {
        console.log('No email found in token and not SMS auth:', req.auth);
        return res.status(200).json({
          data: {
            user: null,
            profileComplete: false,
            message: 'Email not found in token',
          },
        });
      }

      // Create a partial user record
      console.log('Creating new user with email:', email);
      user = await prisma.user.create({
        data: {
          auth0Id: req.auth.sub,
          email,
          // These will be filled during profile completion
          username: `user_${Date.now()}`,
          firstName: '',
          dateOfBirth: new Date(0), // Unix epoch (1970-01-01) as placeholder
        },
      });
      console.log('User created successfully:', user.id);
    }

    // Check if profile is complete (has real username, firstName, and valid DOB)
    const profileComplete = user.firstName !== '' && 
                          !user.username.startsWith('user_') &&
                          user.dateOfBirth.getTime() !== new Date(0).getTime();

    res.json({
      data: {
        user,
        profileComplete,
      },
    });
  } catch (error: any) {
    console.error('Error in verifyAuth:', {
      error: error.message,
      code: error.code,
      auth0Id: req.auth?.sub,
      requestBody: req.body
    });
    throw error;
  }
};

export const completeProfile = async (req: AuthRequest, res: Response) => {
  try {
    logger.info('=== COMPLETE PROFILE ENDPOINT CALLED ===', {
      authSub: req.auth?.sub,
      hasEmail: !!req.auth?.email,
      userFromMiddleware: req.user?.id || 'Not found',
      requestFields: Object.keys(req.body)
    });
    
    let { username, firstName, dateOfBirth, avatarUrl } = req.body;

    if (!req.auth?.sub) {
      console.error('No auth.sub found in request');
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid auth token');
    }

    // Validate required fields
    if (!username || !firstName || !dateOfBirth) {
      throw new AppError(400, 'MISSING_FIELDS', 'Username, firstName, and dateOfBirth are required');
    }

    // Trim whitespace from username and firstName
    username = username.trim();
    firstName = firstName.trim();

    // Validate username format (no spaces, alphanumeric + underscore)
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      throw new AppError(400, 'INVALID_USERNAME', 'Username can only contain letters, numbers, and underscores');
    }

    // Validate username length
    if (username.length < 3 || username.length > 20) {
      throw new AppError(400, 'INVALID_USERNAME_LENGTH', 'Username must be between 3 and 20 characters');
    }

    // Validate date of birth (must be at least 13 years old)
    const dob = new Date(dateOfBirth);
    const age = (new Date().getTime() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (age < 13) {
      throw new AppError(400, 'AGE_REQUIREMENT', 'You must be at least 13 years old');
    }

    // Check if username is already taken
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser && existingUser.auth0Id !== req.auth.sub) {
      throw new AppError(409, 'USERNAME_TAKEN', 'Username is already taken');
    }

    // First check if user exists, create if not (for magic link flow)
    console.log('Checking if user exists with auth0Id:', req.auth.sub);
    let user = await prisma.user.findUnique({
      where: { auth0Id: req.auth.sub },
    });

    if (!user) {
      console.log('User not found, creating new user for magic link/SMS flow');
      // Extract email from token or use a placeholder
      let email = req.auth.email;
      
      // For SMS authentication, create a placeholder email
      if (!email && req.auth.sub.startsWith('sms|')) {
        const phoneNumber = req.auth.phone_number || req.auth.sub;
        email = `${phoneNumber.replace(/[^a-zA-Z0-9]/g, '')}@sms.placeholder`;
        console.log('SMS auth detected in profile completion, using placeholder email:', email);
      } else if (!email) {
        email = `${req.auth.sub}@placeholder.com`;
      }
      
      console.log('Using email for new user:', email);
      console.log('Creating user with data:', {
        auth0Id: req.auth.sub,
        email,
        username,
        firstName,
        dateOfBirth: dob.toISOString(),
        avatarUrl: avatarUrl || null
      });
      
      user = await prisma.user.create({
        data: {
          auth0Id: req.auth.sub,
          email,
          username,
          firstName,
          dateOfBirth: dob,
          avatarUrl: avatarUrl || null,
        },
      });
    } else {
      user = await prisma.user.update({
        where: { auth0Id: req.auth.sub },
        data: {
          username,
          firstName,
          dateOfBirth: dob,
          avatarUrl: avatarUrl || null,
        },
      });
    }

    console.log(`Profile completed for user ${user.id}: ${username}`);

    res.json({
      data: {
        user,
        profileComplete: true,
      },
    });
  } catch (error: any) {
    console.error('Error in completeProfile:', {
      error: error.message,
      code: error.code,
      auth0Id: req.auth?.sub,
      requestBody: req.body
    });
    throw error;
  }
};


export const checkUsername = async (req: AuthRequest, res: Response) => {
  try {
    let { username } = req.query;

    if (!username || typeof username !== 'string') {
      throw new AppError(400, 'INVALID_QUERY', 'Username query parameter is required');
    }

    // Trim whitespace
    username = username.trim();

    // Validate username format
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.json({
        data: {
          available: false,
          reason: 'Username can only contain letters, numbers, and underscores',
        },
      });
    }

    // Validate username length
    if (username.length < 3 || username.length > 20) {
      return res.json({
        data: {
          available: false,
          reason: 'Username must be between 3 and 20 characters',
        },
      });
    }

    // Check if username exists
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    res.json({
      data: {
        available: !existingUser,
        reason: existingUser ? 'Username is already taken' : null,
      },
    });
  } catch (error: any) {
    console.error('Error in completeProfile:', {
      error: error.message,
      code: error.code,
      auth0Id: req.auth?.sub,
      requestBody: req.body
    });
    throw error;
  }
};