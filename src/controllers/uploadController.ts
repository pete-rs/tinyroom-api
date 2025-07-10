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

  // Check if we need to preserve transparency (for cutouts)
  const preserveAlpha = req.body.preserveAlpha === 'true' || req.body.preserveAlpha === true;

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
    console.log('🖼️ [IMAGE UPLOAD] Starting upload:', {
      fileSize: req.file.size,
      mimetype: req.file.mimetype,
      userId: req.user.id,
      preserveAlpha,
      format: preserveAlpha ? 'PNG' : 'AUTO',
    });

    // Upload to Cloudinary with eager transformations for thumbnails
    const uploadPromise = new Promise<{ imageUrl: string; smallThumbnailUrl: string }>((resolve, reject) => {
      const uploadConfig: any = {
        folder: 'room-elements',
        resource_type: 'image',
        public_id: `image_${req.user!.id}_${Date.now()}`,
        eager: [
          { 
            width: 180, 
            height: 180, 
            crop: 'limit', 
            quality: 'auto'
          },
        ],
        eager_async: false, // Generate synchronously for immediate availability
      };

      // Only specify format for PNG (cutouts), let Cloudinary auto-detect for others
      if (preserveAlpha) {
        uploadConfig.format = 'png';
      }

      const uploadStream = cloudinary.uploader.upload_stream(
        uploadConfig,
        (error, result) => {
          if (error) {
            reject(error);
          } else if (result) {
            // Extract the eager transformation URL
            const smallThumbnailUrl = result.eager?.[0]?.secure_url || result.secure_url;
            resolve({
              imageUrl: result.secure_url,
              smallThumbnailUrl,
            });
          } else {
            reject(new Error('Upload failed'));
          }
        }
      );

      uploadStream.end(req.file!.buffer);
    });

    const { imageUrl, smallThumbnailUrl } = await uploadPromise;

    const response = {
      data: {
        imageUrl,
        smallThumbnailUrl,
      },
    };

    console.log('🖼️ [IMAGE UPLOAD] Response:', JSON.stringify(response, null, 2));

    res.json(response);
  } catch (error) {
    console.error('Image upload error:', error);
    console.error('Image upload error details:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      fileSize: req.file?.size,
      fileMimetype: req.file?.mimetype,
    });
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
  } catch (error: any) {
    console.error('Avatar upload error:', error);
    throw new AppError(500, 'UPLOAD_FAILED', `Failed to upload avatar: ${error.message}`);
  }
};


export const uploadAudio = async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw new AppError(400, 'NO_FILE', 'No file uploaded');
  }

  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
  }

  const startTime = Date.now();

  try {
    // Get audio duration from the request if provided
    const duration = req.body.duration ? parseFloat(req.body.duration) : undefined;

    console.log('🎵 [AUDIO UPLOAD] Starting upload:', {
      fileSize: req.file.size,
      fileSizeMB: (req.file.size / (1024 * 1024)).toFixed(2) + 'MB',
      mimetype: req.file.mimetype,
      userId: req.user.id,
      duration: duration,
    });

    // Upload audio file to Cloudinary
    const uploadPromise = new Promise<string>((resolve, reject) => {
      const publicId = `audio_${req.user!.id}_${Date.now()}`;
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'room-audio',
          resource_type: 'video', // Cloudinary uses 'video' type for audio files
          public_id: publicId,
        },
        (error, result) => {
          const uploadDuration = Date.now() - startTime;
          
          if (error) {
            console.error('🎵 [AUDIO UPLOAD] Cloudinary error:', {
              error: error.message,
              httpCode: error.http_code,
              uploadDuration: uploadDuration + 'ms',
            });
            reject(error);
          } else if (result) {
            console.log('🎵 [AUDIO UPLOAD] Cloudinary success:', {
              uploadDuration: uploadDuration + 'ms',
              publicId: result.public_id,
              format: result.format,
              bytes: result.bytes,
              bytesMB: (result.bytes / (1024 * 1024)).toFixed(2) + 'MB',
              cloudinaryAudioDuration: result.duration,
              url: result.secure_url,
            });
            resolve(result.secure_url);
          } else {
            console.error('🎵 [AUDIO UPLOAD] Upload failed with no result');
            reject(new Error('Upload failed'));
          }
        }
      );

      uploadStream.end(req.file!.buffer);
    });

    const audioUrl = await uploadPromise;

    const response = {
      data: {
        audioUrl,
        duration,
      },
    };

    console.log('🎵 [AUDIO UPLOAD] Response sent:', JSON.stringify(response, null, 2));

    res.json(response);
  } catch (error: any) {
    const totalDuration = Date.now() - startTime;
    console.error('🎵 [AUDIO UPLOAD] Failed:', {
      error: error.message,
      httpCode: error.http_code,
      totalDuration: totalDuration + 'ms',
      fileSize: req.file.size,
      fileSizeMB: (req.file.size / (1024 * 1024)).toFixed(2) + 'MB',
      stack: error.stack,
    });
    throw new AppError(500, 'UPLOAD_FAILED', 'Failed to upload audio');
  }
};

export const uploadBackgroundImage = async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw new AppError(400, 'NO_FILE', 'No file uploaded');
  }

  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
  }

  try {
    console.log('🎨 [BACKGROUND UPLOAD] Starting upload:', {
      fileSize: req.file.size,
      mimetype: req.file.mimetype,
      userId: req.user.id,
    });

    // Upload to Cloudinary with eager transformations for thumbnail
    const uploadPromise = new Promise<{ backgroundImageUrl: string; backgroundImageThumbUrl: string }>((resolve, reject) => {
      const uploadConfig: any = {
        folder: 'room-backgrounds',
        resource_type: 'image',
        public_id: `background_${req.user!.id}_${Date.now()}`,
        // Apply quality optimization to reduce file size
        transformation: [
          { 
            quality: 'auto:good',
            fetch_format: 'auto',
          }
        ],
        // Create a 400px wide thumbnail for quick loading
        eager: [
          { 
            width: 400, 
            quality: 'auto:low',
            fetch_format: 'auto'
          },
        ],
        eager_async: false, // Generate synchronously for immediate availability
      };

      const uploadStream = cloudinary.uploader.upload_stream(
        uploadConfig,
        (error, result) => {
          if (error) {
            reject(error);
          } else if (result) {
            // Extract the eager transformation URL for thumbnail
            const backgroundImageThumbUrl = result.eager?.[0]?.secure_url || result.secure_url;
            resolve({
              backgroundImageUrl: result.secure_url,
              backgroundImageThumbUrl,
            });
          } else {
            reject(new Error('Upload failed'));
          }
        }
      );

      uploadStream.end(req.file!.buffer);
    });

    const { backgroundImageUrl, backgroundImageThumbUrl } = await uploadPromise;

    const response = {
      data: {
        backgroundImageUrl,
        backgroundImageThumbUrl,
      },
    };

    console.log('🎨 [BACKGROUND UPLOAD] Response:', JSON.stringify(response, null, 2));

    res.json(response);
  } catch (error) {
    console.error('Background image upload error:', error);
    throw new AppError(500, 'UPLOAD_FAILED', 'Failed to upload background image');
  }
};

export const uploadVideo = async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw new AppError(400, 'NO_FILE', 'No file uploaded');
  }

  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
  }

  const startTime = Date.now();
  
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

    console.log('📹 Starting video upload to Cloudinary:', {
      fileSize: req.file.size,
      fileSizeMB: (req.file.size / (1024 * 1024)).toFixed(2) + 'MB',
      duration: duration,
      mimeType: req.file.mimetype,
    });

    // Upload video file to Cloudinary with transformations
    const uploadPromise = new Promise<{ videoUrl: string; thumbnailUrl: string; smallThumbnailUrl: string }>((resolve, reject) => {
      const timestamp = Date.now();
      const publicId = `video_${req.user!.id}_${timestamp}`;

      console.log('📹 Cloudinary upload config:', {
        publicId,
        folder: 'room-videos',
        resourceType: 'video',
        transformations: 'duration: 10s, quality: auto:good',
      });

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
          eager: [
            // Generate small thumbnail at 2 seconds
            { width: 180, height: 180, crop: 'limit', start_offset: '2', format: 'jpg' },
          ],
          eager_async: true, // Changed to async to avoid timeout
          chunk_size: 6000000, // 6MB chunks for large files
        },
        (error, result) => {
          const uploadDuration = Date.now() - timestamp;
          
          if (error) {
            console.error('📹 Cloudinary upload error:', {
              error,
              uploadDuration: uploadDuration + 'ms',
              errorCode: error.http_code,
              errorMessage: error.message,
            });
            reject(error);
          } else if (result) {
            console.log('📹 Cloudinary upload successful:', {
              uploadDuration: uploadDuration + 'ms',
              publicId: result.public_id,
              format: result.format,
              duration: result.duration,
              bytes: result.bytes,
              bytesMB: (result.bytes / (1024 * 1024)).toFixed(2) + 'MB',
            });

            // Generate thumbnail URL using Cloudinary transformations
            // Use c_limit to preserve aspect ratio within 400x400 bounds
            const thumbnailUrl = result.secure_url.replace(
              '/video/upload/',
              '/video/upload/w_400,h_400,c_limit,so_2,f_jpg/'
            );

            // Get small thumbnail from eager transformation
            const smallThumbnailUrl = result.eager?.[0]?.secure_url || thumbnailUrl.replace(
              '/video/upload/w_400,h_400,c_limit,so_2,f_jpg/',
              '/video/upload/w_180,h_180,c_limit,so_2,f_jpg/'
            );

            console.log('📹 Video URLs generated:', {
              videoUrl: result.secure_url,
              thumbnailUrl,
              smallThumbnailUrl,
              cloudinaryDuration: result.duration,
            });

            resolve({
              videoUrl: result.secure_url,
              thumbnailUrl,
              smallThumbnailUrl,
            });
          } else {
            reject(new Error('Upload failed'));
          }
        }
      );

      uploadStream.end(req.file!.buffer);
    });

    const { videoUrl, thumbnailUrl, smallThumbnailUrl } = await uploadPromise;

    const response = {
      data: {
        videoUrl,
        thumbnailUrl,
        smallThumbnailUrl,
        duration: duration && duration <= 10 ? duration : 10, // Cap at 10 seconds
      },
    };

    console.log('🎥 [VIDEO UPLOAD] Response:', JSON.stringify(response, null, 2));

    res.json(response);
  } catch (error: any) {
    const totalDuration = Date.now() - startTime;
    console.error('📹 Video upload failed:', {
      error: error.message,
      httpCode: error.http_code,
      totalDuration: totalDuration + 'ms',
      totalDurationSeconds: (totalDuration / 1000).toFixed(1) + 's',
      fileSize: req.file.size,
      fileSizeMB: (req.file.size / (1024 * 1024)).toFixed(2) + 'MB',
    });
    throw new AppError(500, 'UPLOAD_FAILED', `Failed to upload video: ${error.message}`);
  }
};

export const uploadPhotoWithMask = async (req: AuthRequest, res: Response) => {
  if (!req.files || typeof req.files !== 'object') {
    throw new AppError(400, 'NO_FILES', 'No files uploaded');
  }

  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  
  // Validate required files - image and thumbnail are always required
  if (!files.image?.[0] || !files.thumbnail?.[0]) {
    throw new AppError(400, 'MISSING_FILES', 'Missing required files. Expected: image and thumbnail (alphaMask and thumbnailMask are optional)');
  }

  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
  }

  try {
    const hasMasks = files.alphaMask?.[0] && files.thumbnailMask?.[0];
    
    console.log('🎭 [PHOTO WITH MASK UPLOAD] Starting upload:', {
      userId: req.user.id,
      imageSize: files.image[0].size,
      thumbnailSize: files.thumbnail[0].size,
      hasMasks: !!hasMasks,
      maskSize: files.alphaMask?.[0]?.size || 0,
      thumbnailMaskSize: files.thumbnailMask?.[0]?.size || 0,
    });

    const timestamp = Date.now();
    const basePublicId = `photo_${req.user.id}_${timestamp}`;

    // Build upload promises array based on what files are provided
    const uploadPromises: Promise<string | null>[] = [
      // Original image (JPEG) - always required
      new Promise<string>((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            folder: 'room-photos',
            resource_type: 'image',
            public_id: `${basePublicId}_original`,
            format: 'jpg',
            quality: 'auto:good',
            timeout: 60000, // 60 second timeout
          },
          (error, result) => {
            if (error) reject(error);
            else if (result) resolve(result.secure_url);
            else reject(new Error('Upload failed'));
          }
        ).end(files.image[0].buffer);
      }),
      
      // Alpha mask (PNG grayscale) - optional
      hasMasks 
        ? new Promise<string>((resolve, reject) => {
            cloudinary.uploader.upload_stream(
              {
                folder: 'room-photos',
                resource_type: 'image',
                public_id: `${basePublicId}_mask`,
                format: 'png',
                quality: 'auto:low',
                timeout: 60000, // 60 second timeout
              },
              (error, result) => {
                if (error) reject(error);
                else if (result) resolve(result.secure_url);
                else reject(new Error('Upload failed'));
              }
            ).end(files.alphaMask![0].buffer);
          })
        : Promise.resolve(null),
      
      // Thumbnail (JPEG) - always required
      new Promise<string>((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            folder: 'room-photos',
            resource_type: 'image',
            public_id: `${basePublicId}_thumb`,
            format: 'jpg',
            quality: 'auto',
            timeout: 60000, // 60 second timeout
          },
          (error, result) => {
            if (error) reject(error);
            else if (result) resolve(result.secure_url);
            else reject(new Error('Upload failed'));
          }
        ).end(files.thumbnail[0].buffer);
      }),
      
      // Thumbnail mask (PNG grayscale) - optional
      hasMasks
        ? new Promise<string>((resolve, reject) => {
            cloudinary.uploader.upload_stream(
              {
                folder: 'room-photos',
                resource_type: 'image',
                public_id: `${basePublicId}_thumb_mask`,
                format: 'png',
                quality: 'auto:low',
                timeout: 60000, // 60 second timeout
              },
              (error, result) => {
                if (error) reject(error);
                else if (result) resolve(result.secure_url);
                else reject(new Error('Upload failed'));
              }
            ).end(files.thumbnailMask![0].buffer);
          })
        : Promise.resolve(null),
    ];

    let results;
    try {
      results = await Promise.all(uploadPromises);
    } catch (uploadError: any) {
      console.error('🚨 [PHOTO WITH MASK UPLOAD] Upload error details:', {
        error: uploadError,
        message: uploadError.message,
        http_code: uploadError.http_code,
        name: uploadError.name,
      });
      throw uploadError;
    }

    const [imageUrl, imageAlphaMaskUrl, smallThumbnailUrl, imageThumbnailAlphaMaskUrl] = results;

    const response = {
      data: {
        imageUrl: imageUrl!,
        imageAlphaMaskUrl,
        smallThumbnailUrl: smallThumbnailUrl!,
        imageThumbnailAlphaMaskUrl,
      },
    };

    console.log('🎭 [PHOTO WITH MASK UPLOAD] Success:', response);

    res.json(response);
  } catch (error) {
    console.error('Photo with mask upload error:', error);
    throw new AppError(500, 'UPLOAD_FAILED', 'Failed to upload photo with mask');
  }
};