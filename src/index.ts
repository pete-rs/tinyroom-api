import http from 'http';
import https from 'https';
import fs from 'fs';
import { Server } from 'socket.io';
import app from './app';
import { config } from './config';
import { authenticateSocket } from './sockets/socketAuth';
import { setupRoomHandlers } from './sockets/roomHandlers';
import { socketService } from './services/socketService';

// Create HTTP or HTTPS server based on environment config
let server;
if (process.env.HTTPS_ENABLED === 'true' && process.env.HTTPS_KEY_PATH && process.env.HTTPS_CERT_PATH) {
  try {
    const privateKey = fs.readFileSync(process.env.HTTPS_KEY_PATH, 'utf8');
    const certificate = fs.readFileSync(process.env.HTTPS_CERT_PATH, 'utf8');
    server = https.createServer({ key: privateKey, cert: certificate }, app);
    console.log('🔒 HTTPS enabled');
  } catch (error) {
    console.error('Failed to load HTTPS certificates:', error);
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
}

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins in development
    credentials: true,
    methods: ['GET', 'POST']
  },
});

// Initialize socket service
socketService.setIO(io);

// Socket.io authentication middleware
io.use(authenticateSocket);

// Socket.io connection handler
io.on('connection', (socket) => {
  const userId = (socket as any).userId;
  console.log(`🔌 Socket connected: ${socket.id}`);
  console.log(`✅ Socket ${socket.id} authenticated as user ${userId}`);
  
  // Track user socket connection
  socketService.addUserSocket(userId, socket.id);
  
  // Set up room handlers
  setupRoomHandlers(io, socket as any);
  
  // Handle disconnect
  socket.on('disconnect', async () => {
    console.log(`🔌 Socket disconnected: ${socket.id} (user: ${userId})`);
    
    // Remove user socket tracking
    socketService.removeUserSocket(socket.id);
    
    // Leave all rooms and notify others
    const rooms = Array.from(socket.rooms);
    rooms.forEach(roomId => {
      if (roomId !== socket.id) {  // Skip default room
        console.log(`🚪 [Room ${roomId}] User ${userId} disconnected`);
        socket.to(roomId).emit('user:left', {
          userId: userId,
        });
      }
    });
  });
});

// Start server
const PORT = config.port;
const HOST = '0.0.0.0'; // Listen on all network interfaces

server.listen(PORT as number, HOST, () => {
  const protocol = process.env.HTTPS_ENABLED === 'true' ? 'https' : 'http';
  console.log(`Server running on ${HOST}:${PORT}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Access URLs:`);
  console.log(`  Local:    ${protocol}://localhost:${PORT}`);
  
  // Get local network IP
  const os = require('os');
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const iface of Object.values(interfaces)) {
    for (const addr of iface as any) {
      if (addr.family === 'IPv4' && !addr.internal) {
        addresses.push(addr.address);
      }
    }
  }
  
  if (addresses.length > 0) {
    console.log(`  Network:  ${protocol}://${addresses[0]}:${PORT}`);
  } else {
    console.log(`  Network:  ${protocol}://<your-ip>:${PORT}`);
  }
});