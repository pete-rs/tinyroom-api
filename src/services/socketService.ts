import { Server, Socket } from 'socket.io';

class SocketService {
  private io: Server | null = null;
  private userSocketMap: Map<string, string> = new Map(); // userId -> socketId
  private socketUserMap: Map<string, string> = new Map(); // socketId -> userId

  setIO(io: Server) {
    this.io = io;
  }

  getIO(): Server | null {
    return this.io;
  }

  // Track user socket connections
  addUserSocket(userId: string, socketId: string) {
    // Remove any existing socket for this user
    const existingSocketId = this.userSocketMap.get(userId);
    if (existingSocketId) {
      this.socketUserMap.delete(existingSocketId);
    }
    
    this.userSocketMap.set(userId, socketId);
    this.socketUserMap.set(socketId, userId);
    console.log(`🔌 [SOCKET] User ${userId} connected with socket ${socketId}`);
  }

  // Remove user socket on disconnect
  removeUserSocket(socketId: string) {
    const userId = this.socketUserMap.get(socketId);
    if (userId) {
      this.userSocketMap.delete(userId);
      this.socketUserMap.delete(socketId);
      console.log(`🔌 [SOCKET] User ${userId} disconnected (socket ${socketId})`);
    }
  }

  // Get socket ID for a user
  getUserSocketId(userId: string): string | undefined {
    return this.userSocketMap.get(userId);
  }

  // Emit room update to all participants in a room
  emitRoomUpdate(roomId: string, updatedRoom: any) {
    if (!this.io) {
      console.log('❌ Socket.io not initialized');
      return;
    }

    // Emit to all clients in the room
    this.io.to(roomId).emit('room:updated', {
      room: updatedRoom,
    });
    
    console.log(`📤 [Room ${roomId}] Emitted room:updated event`);
  }

  // Generic method to emit any event to a room
  emitToRoom(roomId: string, event: string, data: any) {
    if (!this.io) {
      console.log('❌ Socket.io not initialized');
      return;
    }

    // Emit to all clients in the room
    this.io.to(roomId).emit(event, data);
    
    // Enhanced logging for comment events
    if (event.includes('comment')) {
      console.log(`\n💬📤 [SOCKET] Emitting ${event} to room ${roomId}`);
      console.log(`💬📤 [SOCKET] Event data:`, JSON.stringify(data, null, 2));
    } else {
      console.log(`📤 [Room ${roomId}] Emitted ${event} event`);
    }
  }

  // Emit event to a specific user
  emitToUser(userId: string, event: string, data: any) {
    if (!this.io) {
      console.log('❌ Socket.io not initialized');
      return;
    }

    const socketId = this.getUserSocketId(userId);
    if (!socketId) {
      console.log(`❌ [SOCKET] User ${userId} not connected, cannot emit ${event}`);
      return;
    }

    // Emit to specific socket
    this.io.to(socketId).emit(event, data);
    
    console.log(`📤 [User ${userId}] Emitted ${event} event`);
    if (event.includes('notification')) {
      console.log(`🔔 [SOCKET] Notification data:`, JSON.stringify(data, null, 2));
    }
  }
}

export const socketService = new SocketService();