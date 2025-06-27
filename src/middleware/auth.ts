import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import { config } from '../config';
import { prisma } from '../config/prisma';
import { AuthRequest } from '../types';
import fetch from 'node-fetch';

const jwksClient = jwksRsa({
  jwksUri: `https://${config.auth0.domain}/.well-known/jwks.json`,
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 5,
});

// Simple in-memory cache for opaque tokens
interface TokenCacheEntry {
  userInfo: any;
  expiresAt: number;
}

const opaqueTokenCache = new Map<string, TokenCacheEntry>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  jwksClient.getSigningKey(header.kid!, (err, key) => {
    if (err) {
      callback(err);
    } else {
      const signingKey = key?.getPublicKey();
      callback(null, signingKey);
    }
  });
}

// Validate opaque token by calling Auth0's userinfo endpoint with caching
async function validateOpaqueToken(token: string): Promise<{ valid: boolean; userInfo?: any; error?: string }> {
  try {
    // Check cache first
    const cached = opaqueTokenCache.get(token);
    if (cached && cached.expiresAt > Date.now()) {
      console.log('Using cached opaque token validation');
      return { valid: true, userInfo: cached.userInfo };
    }
    
    console.log('Attempting to validate opaque token via /userinfo endpoint...');
    
    const response = await fetch(`https://${config.auth0.domain}/userinfo`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.ok) {
      const userInfo = await response.json();
      console.log('Opaque token validated successfully:', { sub: userInfo.sub });
      
      // Cache the result
      opaqueTokenCache.set(token, {
        userInfo,
        expiresAt: Date.now() + CACHE_DURATION
      });
      
      // Clean up old cache entries periodically
      if (opaqueTokenCache.size > 100) {
        const now = Date.now();
        for (const [key, value] of opaqueTokenCache.entries()) {
          if (value.expiresAt < now) {
            opaqueTokenCache.delete(key);
          }
        }
      }
      
      return { valid: true, userInfo };
    } else {
      const error = await response.text();
      console.error('Opaque token validation failed:', response.status, error);
      
      // If rate limited, try to use an expired cache entry as fallback
      if (response.status === 429 && cached) {
        console.warn('Rate limited but using expired cache entry as fallback');
        return { valid: true, userInfo: cached.userInfo };
      }
      
      return { valid: false, error: `Auth0 returned ${response.status}: ${error}` };
    }
  } catch (error: any) {
    console.error('Error validating opaque token:', error);
    return { valid: false, error: error.message };
  }
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  
  console.log('Auth Middleware - Headers received:', {
    authorization: authHeader ? `${authHeader.substring(0, 20)}...` : 'none',
    contentType: req.headers['content-type'],
    origin: req.headers.origin
  });
  
  if (!authHeader) {
    return res.status(401).json({
      error: {
        code: 'NO_AUTH_HEADER',
        message: 'Authorization header missing',
      },
    });
  }

  // Extract token from "Bearer <token>" format
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      error: {
        code: 'INVALID_AUTH_HEADER',
        message: 'Authorization header must be in format: Bearer <token>',
      },
    });
  }

  const token = parts[1];
  console.log('Token extracted:', {
    length: token.length,
    preview: `${token.substring(0, 20)}...${token.substring(token.length - 20)}`,
  });

  // Check if it's a JWT (has 3 parts) or opaque token
  const jwtParts = token.split('.');
  const isJWT = jwtParts.length === 3;
  
  console.log('Token type detection:', {
    partsCount: jwtParts.length,
    isJWT,
    tokenType: isJWT ? 'JWT' : 'Opaque'
  });

  try {
    let auth0Id: string;
    let email: string | undefined;
    
    if (isJWT) {
      // Handle JWT token
      console.log('Processing as JWT token...');
      
      const decoded = await new Promise<jwt.JwtPayload>((resolve, reject) => {
        jwt.verify(
          token,
          getKey,
          {
            audience: config.auth0.audience,
            issuer: `https://${config.auth0.domain}/`,
            algorithms: ['RS256'],
          },
          (err, decoded) => {
            if (err) {
              console.error('JWT verification error:', err.name, err.message);
              reject(err);
            } else {
              console.log('JWT verified successfully:', { sub: (decoded as jwt.JwtPayload).sub });
              resolve(decoded as jwt.JwtPayload);
            }
          }
        );
      });

      // Log the entire decoded JWT payload for debugging
      console.log('Full JWT payload:', JSON.stringify(decoded, null, 2));
      console.log('JWT claims:', {
        sub: decoded.sub,
        email: decoded.email,
        email_verified: decoded.email_verified,
        iss: decoded.iss,
        aud: decoded.aud,
        iat: decoded.iat,
        exp: decoded.exp,
        // Log any custom claims
        ...Object.keys(decoded).reduce((acc, key) => {
          if (!['sub', 'email', 'email_verified', 'iss', 'aud', 'iat', 'exp'].includes(key)) {
            acc[key] = decoded[key];
          }
          return acc;
        }, {} as any)
      });
      
      req.auth = decoded as { sub: string; [key: string]: any };
      auth0Id = decoded.sub!;
      email = decoded.email;
      
      // If email is missing from JWT (common with magic link), fetch from userinfo
      if (!email && decoded.scope?.includes('email')) {
        console.log('Email missing from JWT, fetching from userinfo endpoint...');
        try {
          const userInfoResponse = await fetch(
            `https://${config.auth0.domain}/userinfo`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );
          
          if (userInfoResponse.ok) {
            const userInfo = await userInfoResponse.json();
            console.log('UserInfo response:', JSON.stringify(userInfo, null, 2));
            email = userInfo.email;
            req.auth.email = email;
            req.auth.email_verified = userInfo.email_verified;
          } else {
            console.error('Failed to fetch userinfo:', userInfoResponse.status);
          }
        } catch (error) {
          console.error('Error fetching userinfo:', error);
        }
      }
      
    } else {
      // Handle opaque token
      console.log('Processing as opaque token...');
      
      const validation = await validateOpaqueToken(token);
      
      if (!validation.valid) {
        console.error('Opaque token validation failed:', validation.error);
        return res.status(401).json({
          error: {
            code: 'INVALID_OPAQUE_TOKEN',
            message: validation.error || 'Failed to validate opaque token',
            tokenType: 'opaque',
            hint: 'iOS app should include audience parameter during login to receive JWT tokens'
          },
        });
      }
      
      const userInfo = validation.userInfo;
      console.log('UserInfo from opaque token:', JSON.stringify(userInfo, null, 2));
      req.auth = {
        sub: userInfo.sub,
        ...userInfo
      };
      auth0Id = userInfo.sub;
      email = userInfo.email;
    }

    // Get user from database
    console.log('Looking up user in database:', { auth0Id, email });
    const user = await prisma.user.findUnique({
      where: { auth0Id },
    });

    if (user) {
      console.log('User found in database:', { userId: user.id, username: user.username });
      req.user = user;
    } else {
      console.log('User not found in database, will need to create profile');
      // Store email in req.auth for controllers to use
      if (email && req.auth && !req.auth.email) {
        req.auth.email = email;
      }
    }

    next();
  } catch (error: any) {
    console.error('Auth error details:', {
      name: error.name,
      message: error.message,
      tokenType: isJWT ? 'JWT' : 'Opaque',
      stack: error.stack
    });
    
    let errorMessage = 'Invalid token';
    let errorCode = 'INVALID_TOKEN';
    
    if (error.name === 'TokenExpiredError') {
      errorMessage = 'Token has expired';
      errorCode = 'TOKEN_EXPIRED';
    } else if (error.name === 'JsonWebTokenError') {
      errorMessage = error.message;
      errorCode = 'JWT_ERROR';
    }
    
    return res.status(401).json({
      error: {
        code: errorCode,
        message: errorMessage,
        tokenType: isJWT ? 'JWT' : 'Opaque',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
    });
  }
};

export const requireCompleteProfile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(403).json({
      error: {
        code: 'PROFILE_INCOMPLETE',
        message: 'Please complete your profile',
      },
    });
  }

  // Check if profile is actually complete
  const profileComplete = req.user.firstName !== '' && 
                        !req.user.username.startsWith('user_') &&
                        req.user.dateOfBirth.getTime() !== new Date(0).getTime();

  if (!profileComplete) {
    return res.status(403).json({
      error: {
        code: 'PROFILE_INCOMPLETE',
        message: 'Please complete your profile',
        details: {
          hasFirstName: req.user.firstName !== '',
          hasUsername: !req.user.username.startsWith('user_'),
          hasDateOfBirth: req.user.dateOfBirth.getTime() !== new Date(0).getTime(),
        },
      },
    });
  }

  next();
};