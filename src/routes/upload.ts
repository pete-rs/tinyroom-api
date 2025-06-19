import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { uploadAvatar, uploadImage, uploadAudio, uploadVideo } from '../controllers/uploadController';

const router = Router();

// Configure multer for image uploads
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    // Accept only images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Configure multer for audio uploads
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max as per CLAUDE.md
  },
  fileFilter: (req, file, cb) => {
    // Accept audio files
    const allowedMimeTypes = [
      'audio/mpeg', // MP3
      'audio/mp4', // M4A
      'audio/wav', // WAV
      'audio/webm', // WebM
      'audio/ogg', // OGG
      'audio/aac', // AAC
      'audio/x-m4a', // M4A alternative
      'audio/mp3', // MP3 alternative
    ];
    
    if (allowedMimeTypes.includes(file.mimetype) || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  },
});

// Avatar upload endpoint
router.post('/avatar', authMiddleware as any, imageUpload.single('avatar'), asyncHandler(uploadAvatar));

// General image upload endpoint (for room elements)
router.post('/image', authMiddleware as any, imageUpload.single('image'), asyncHandler(uploadImage));

// Configure multer for video uploads
const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
  fileFilter: (req, file, cb) => {
    // Accept video files
    const allowedMimeTypes = [
      'video/mp4',
      'video/quicktime', // MOV
      'video/x-msvideo', // AVI
      'video/webm',
      'video/x-m4v', // M4V
    ];
    
    if (allowedMimeTypes.includes(file.mimetype) || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'));
    }
  },
});

// Audio upload endpoint (for voice notes)
router.post('/audio', authMiddleware as any, audioUpload.single('audio'), asyncHandler(uploadAudio));

// Video upload endpoint
router.post('/video', authMiddleware as any, videoUpload.single('video'), asyncHandler(uploadVideo));

export default router;