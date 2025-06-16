import { Response } from 'express';
import { AuthRequest } from '../types';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

export const verifyAuth = async (req: AuthRequest, res: Response) => {
  console.log('=== VERIFY AUTH ENDPOINT CALLED ===');
  console.log('Auth data:', req.auth);
  console.log('Existing user:', req.user ? 'Yes' : 'No');
  
  try {
    if (!req.auth?.sub) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid auth token');
    }

    let user = await prisma.user.findUnique({
      where: { auth0Id: req.auth.sub },
    });

    if (!user) {
      // Extract email from Auth0 token
      const email = req.auth.email;
      
      if (!email) {
        console.log('No email found in token:', req.auth);
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
  } catch (error) {
    throw error;
  }
};

export const completeProfile = async (req: AuthRequest, res: Response) => {
  try {
    let { username, firstName, dateOfBirth, avatarUrl } = req.body;

    if (!req.auth?.sub) {
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

    const user = await prisma.user.update({
      where: { auth0Id: req.auth.sub },
      data: {
        username,
        firstName,
        dateOfBirth: dob,
        avatarUrl: avatarUrl || null, // Optional avatar URL
      },
    });

    console.log(`Profile completed for user ${user.id}: ${username}`);

    res.json({
      data: {
        user,
        profileComplete: true,
      },
    });
  } catch (error) {
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
  } catch (error) {
    throw error;
  }
};