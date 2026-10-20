const { WebSocketServer } = require('ws');

const wss = new WebSocketServer({ port: 8080 });

// Map to track room clients: roomId -> Set of socket connections
const rooms = new Map();

console.log('NexusPM WebSocket server started on port 8080');

wss.on('connection', (ws) => {
  let currentRoom = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // Handle join room action
      if (data.type === 'join') {
        const roomId = data.roomId;
        currentRoom = roomId;
        
        if (!rooms.has(roomId)) {
          rooms.set(roomId, new Set());
        }
        rooms.get(roomId).add(ws);
        console.log(`Socket joined room: ${roomId}`);
        return;
      }
      
      // Broadcast document edits or ticket updates to others in the room
      if (currentRoom && rooms.has(currentRoom)) {
        rooms.get(currentRoom).forEach((client) => {
          if (client !== ws && client.readyState === ws.OPEN) {
            client.send(JSON.stringify(data));
          }
        });
      }
    } catch (err) {
      console.error('Error handling message:', err);
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      rooms.get(currentRoom).delete(ws);
      if (rooms.get(currentRoom).size === 0) {
        rooms.delete(currentRoom);
      }
      console.log(`Socket left room: ${currentRoom}`);
    }
  });

  ws.on('error', (err) => {
    console.error('Socket error:', err);
  });
});
