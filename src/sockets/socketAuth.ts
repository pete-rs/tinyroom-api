import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import { config } from '../config';
import { prisma } from '../config/prisma';
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
      console.log('🔐 [Socket.io] Using cached opaque token validation');
      return { valid: true, userInfo: cached.userInfo };
    }
    
    console.log('🔐 [Socket.io] Attempting to validate opaque token via /userinfo endpoint...');
    
    const response = await fetch(`https://${config.auth0.domain}/userinfo`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.ok) {
      const userInfo = await response.json();
      console.log('✅ [Socket.io] Opaque token validated successfully:', { sub: userInfo.sub });
      
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
      console.error('❌ [Socket.io] Opaque token validation failed:', response.status, error);
      return { valid: false, error: `Auth0 returned ${response.status}: ${error}` };
    }
  } catch (error: any) {
    console.error('❌ [Socket.io] Error validating opaque token:', error);
    return { valid: false, error: error.message };
  }
}

export const authenticateSocket = async (socket: Socket, next: (err?: Error) => void) => {
  try {
    console.log('🔌 [Socket.io] Auth attempt from socket:', socket.id);
    
    let token = socket.handshake.auth.token;
    
    // Socket.IO-Client-Swift v16 sends auth in query params
    if (!token && socket.handshake.query.token) {
      token = socket.handshake.query.token as string;
      console.log('📦 [Socket.io] Token found in query params');
    }
    
    // Check if auth is URL-encoded in query (Socket.IO-Client-Swift behavior)
    if (!token && socket.handshake.query.auth) {
      try {
        // The auth param contains URL-encoded JSON like: ["token": "..."]
        const authString = socket.handshake.query.auth as string;
        console.log('📦 [Socket.io] Auth string from query:', authString);
        
        // Socket.IO-Client-Swift sends it as Swift dictionary format, not JSON
        // Extract token from format: ["token": "eyJhbG..."]
        const tokenMatch = authString.match(/\["token":\s*"([^"]+)"\]/);
        if (tokenMatch && tokenMatch[1]) {
          token = tokenMatch[1];
          console.log('📦 [Socket.io] Extracted token from Swift format');
        }
      } catch (e) {
        console.log('❌ [Socket.io] Failed to parse auth from query:', e);
      }
    }

    if (!token) {
      console.log('❌ [Socket.io] No token found in auth or query params');
      console.log('📦 [Socket.io] Debug - auth object:', JSON.stringify(socket.handshake.auth));
      console.log('📦 [Socket.io] Debug - query object:', JSON.stringify(socket.handshake.query));
      return next(new Error('No token provided'));
    }

    // Check if it's a JWT (has 3 parts) or opaque token
    const jwtParts = token.split('.');
    const isJWT = jwtParts.length === 3;
    
    console.log('🔐 [Socket.io] Token type detection:', {
      partsCount: jwtParts.length,
      isJWT,
      tokenType: isJWT ? 'JWT' : 'Opaque',
      tokenLength: token.length
    });

    let auth0Id: string;
    let email: string | undefined;

    if (isJWT) {
      // Handle JWT token
      console.log('🔐 [Socket.io] Processing as JWT token...');
      
      try {
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
                reject(err);
              } else {
                resolve(decoded as jwt.JwtPayload);
              }
            }
          );
        });

        auth0Id = decoded.sub!;
        email = decoded.email;
        console.log('✅ [Socket.io] JWT verified successfully:', { sub: auth0Id });
        
      } catch (jwtError: any) {
        console.error('❌ [Socket.io] JWT verification failed:', jwtError.message);
        return next(new Error(`JWT verification failed: ${jwtError.message}`));
      }
      
    } else {
      // Handle opaque token
      console.log('🔐 [Socket.io] Processing as opaque token...');
      
      const validation = await validateOpaqueToken(token);
      
      if (!validation.valid) {
        console.error('❌ [Socket.io] Opaque token validation failed:', validation.error);
        return next(new Error('Invalid opaque token'));
      }
      
      const userInfo = validation.userInfo;
      auth0Id = userInfo.sub;
      email = userInfo.email;
    }

    // Get user from database
    console.log('🔍 [Socket.io] Looking up user in database:', { auth0Id });
    const user = await prisma.user.findUnique({
      where: { auth0Id },
    });

    if (!user) {
      console.log('❌ [Socket.io] User not found in database');
      return next(new Error('User not found'));
    }

    // Check if profile is complete
    const profileComplete = user.firstName !== '' && 
                          !user.username.startsWith('user_') &&
                          user.dateOfBirth.getTime() !== new Date(0).getTime();

    if (!profileComplete) {
      console.log('❌ [Socket.io] User profile incomplete');
      return next(new Error('Profile not complete'));
    }

    // Attach user to socket
    (socket as any).userId = user.id;
    (socket as any).user = user;

    console.log('✅ [Socket.io] Socket authenticated successfully:', { 
      socketId: socket.id, 
      userId: user.id, 
      username: user.username 
    });

    next();
  } catch (error) {
    console.error('❌ [Socket.io] Socket auth error:', error);
    next(new Error('Authentication failed'));
  }
};