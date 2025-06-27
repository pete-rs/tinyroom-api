import { Response } from 'express';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';
import { AuthRequest } from '../types';
import { AppError } from '../middleware/errorHandler';
import { config } from '../config';
import { prisma } from '../config/prisma';

// Configure Cloudinary
cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

export const uploadImage = async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw new AppError(400, 'NO_FILE', 'No file uploaded');
  }

  // For magic link flow, create user if they don't exist yet
  if (!req.user && req.auth?.sub) {
    const email = req.auth.email || `${req.auth.sub}@placeholder.com`;
    console.log('Creating user for upload (magic link flow):', { auth0Id: req.auth.sub, email });
    
    req.user = await prisma.user.create({
      data: {
        auth0Id: req.auth.sub,
        email,
        username: `user_${Date.now()}`,
        firstName: '',
        dateOfBirth: new Date(0), // Unix epoch as placeholder
      },
    });
  }

  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
  }

  try {
    // Upload to Cloudinary directly without resizing for general images
    const uploadPromise = new Promise<string>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'room-elements',
          resource_type: 'image',
          public_id: `image_${req.user!.id}_${Date.now()}`,
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else if (result) {
            resolve(result.secure_url);
          } else {
            reject(new Error('Upload failed'));
          }
        }
      );

      uploadStream.end(req.file!.buffer);
    });

    const imageUrl = await uploadPromise;

    res.json({
      data: {
        imageUrl,
      },
    });
  } catch (error) {
    console.error('Image upload error:', error);
    throw new AppError(500, 'UPLOAD_FAILED', 'Failed to upload image');
  }
};

export const uploadAvatar = async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw new AppError(400, 'NO_FILE', 'No file uploaded');
  }

  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
  }

  try {
    // Resize image to 200x200 square using sharp
    const resizedBuffer = await sharp(req.file.buffer)
      .resize(200, 200, {
        fit: 'cover',
        position: 'center',
      })
      .jpeg({ quality: 90 })
      .toBuffer();

    // Upload to Cloudinary
    const uploadPromise = new Promise<string>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'avatars',
          resource_type: 'image',
          format: 'jpg',
          public_id: `avatar_${req.user!.id}_${Date.now()}`,
          transformation: [
            { width: 200, height: 200, crop: 'fill', gravity: 'face' },
          ],
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else if (result) {
            resolve(result.secure_url);
          } else {
            reject(new Error('Upload failed'));
          }
        }
      );

      uploadStream.end(resizedBuffer);
    });

    const avatarUrl = await uploadPromise;

    res.json({
      data: {
        avatarUrl,
      },
    });
  } catch (error) {
    console.error('Avatar upload error:', error);
    throw new AppError(500, 'UPLOAD_FAILED', 'Failed to upload avatar');
  }
};


export const uploadAudio = async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw new AppError(400, 'NO_FILE', 'No file uploaded');
  }

  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
  }

  try {
    // Get audio duration from the request if provided
    const duration = req.body.duration ? parseFloat(req.body.duration) : undefined;

    // Upload audio file to Cloudinary
    const uploadPromise = new Promise<string>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'room-audio',
          resource_type: 'video', // Cloudinary uses 'video' type for audio files
          public_id: `audio_${req.user!.id}_${Date.now()}`,
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else if (result) {
            resolve(result.secure_url);
          } else {
            reject(new Error('Upload failed'));
          }
        }
      );

      uploadStream.end(req.file!.buffer);
    });

    const audioUrl = await uploadPromise;

    res.json({
      data: {
        audioUrl,
        duration,
      },
    });
  } catch (error) {
    console.error('Audio upload error:', error);
    throw new AppError(500, 'UPLOAD_FAILED', 'Failed to upload audio');
  }
};

export const uploadVideo = async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw new AppError(400, 'NO_FILE', 'No file uploaded');
  }

  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
  }

  try {
    // Validate file size (50MB max)
    const maxSizeBytes = 50 * 1024 * 1024; // 50MB
    if (req.file.size > maxSizeBytes) {
      throw new AppError(400, 'FILE_TOO_LARGE', 'Video file must be less than 50MB');
    }

    // Validate file type
    const allowedMimeTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-m4v'];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      throw new AppError(400, 'INVALID_FILE_TYPE', 'Invalid video format. Supported formats: MP4, MOV, AVI, WebM, M4V');
    }

    console.log('📹 Uploading video:', {
      size: req.file.size,
      mimetype: req.file.mimetype,
      userId: req.user.id,
    });

    // Get video duration from the request if provided
    const duration = req.body.duration ? parseFloat(req.body.duration) : undefined;

    // Upload video file to Cloudinary with transformations
    const uploadPromise = new Promise<{ videoUrl: string; thumbnailUrl: string }>((resolve, reject) => {
      const timestamp = Date.now();
      const publicId = `video_${req.user!.id}_${timestamp}`;

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'room-videos',
          resource_type: 'video',
          public_id: publicId,
          upload_preset: 'room-videos', // Use the preset we created
          transformation: [
            { duration: '10.0' }, // Limit to 10 seconds
            { quality: 'auto:good' }, // Optimize quality
            { fetch_format: 'auto' }, // Auto format selection
          ],
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            reject(error);
          } else if (result) {
            // Generate thumbnail URL using Cloudinary transformations
            // Use c_limit to preserve aspect ratio within 400x400 bounds
            const thumbnailUrl = result.secure_url.replace(
              '/video/upload/',
              '/video/upload/w_400,h_400,c_limit,so_2,f_jpg/'
            );

            console.log('📹 Video uploaded:', {
              videoUrl: result.secure_url,
              thumbnailUrl,
              cloudinaryDuration: result.duration,
            });

            resolve({
              videoUrl: result.secure_url,
              thumbnailUrl,
            });
          } else {
            reject(new Error('Upload failed'));
          }
        }
      );

      uploadStream.end(req.file!.buffer);
    });

    const { videoUrl, thumbnailUrl } = await uploadPromise;

    res.json({
      data: {
        videoUrl,
        thumbnailUrl,
        duration: duration && duration <= 10 ? duration : 10, // Cap at 10 seconds
      },
    });
  } catch (error) {
    console.error('Video upload error:', error);
    throw new AppError(500, 'UPLOAD_FAILED', 'Failed to upload video');
  }
};