import { Server } from 'socket.io';

class SocketService {
  private io: Server | null = null;

  setIO(io: Server) {
    this.io = io;
  }

  getIO(): Server | null {
    return this.io;
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
    
    console.log(`📤 [Room ${roomId}] Emitted ${event} event`);
  }
}

export const socketService = new SocketService();