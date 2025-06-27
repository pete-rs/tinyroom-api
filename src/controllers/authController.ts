import { Response } from 'express';
import { AuthRequest } from '../types';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

export const verifyAuth = async (req: AuthRequest, res: Response) => {
  console.log('=== VERIFY AUTH ENDPOINT CALLED ===');
  console.log('Auth data:', JSON.stringify(req.auth, null, 2));
  console.log('Auth token sub:', req.auth?.sub);
  console.log('Auth token email:', req.auth?.email);
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

export const completeProfile = async (req: AuthRequest, res: Response) => {
  try {
    console.log('=== COMPLETE PROFILE ENDPOINT CALLED ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Auth token data:', JSON.stringify(req.auth, null, 2));
    console.log('Auth sub:', req.auth?.sub);
    console.log('Auth email:', req.auth?.email);
    console.log('User from middleware:', req.user ? `Found (ID: ${req.user.id})` : 'Not found');
    
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
      console.log('User not found, creating new user for magic link flow');
      // Extract email from token or use a placeholder
      const email = req.auth.email || `${req.auth.sub}@placeholder.com`;
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

// Debug endpoint to see what Auth0 sends
export const debugAuth = async (req: AuthRequest, res: Response) => {
  console.log('=== DEBUG AUTH ENDPOINT ===');
  console.log('Full auth object:', JSON.stringify(req.auth, null, 2));
  console.log('User from DB:', req.user ? {
    id: req.user.id,
    auth0Id: req.user.auth0Id,
    email: req.user.email,
    username: req.user.username
  } : 'Not found');
  
  res.json({
    auth: req.auth,
    userExists: !!req.user,
    user: req.user ? {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email
    } : null
  });
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