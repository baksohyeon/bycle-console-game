import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { randomUUID } from 'crypto';
import { RacingGame } from './game';
import { RacingBicycle } from './RacingBicycle';

interface WebPlayer {
  id: string;
  persistentId: string; // Unique ID that persists across reconnections
  name: string;
  color: string;
  bicycle: RacingBicycle | null; // null for spectators
  isConnected: boolean;
  lastSeen: number;
  disconnectedAt?: number;
  reconnectCount: number;
  isSpectator: boolean;
  joinedAt: number;
}

interface GameRoom {
  id: string;
  game: RacingGame;
  players: Map<string, WebPlayer>;
  isStarted: boolean;
  maxPlayers: number;
  state: 'waiting' | 'active' | 'finished' | 'empty';
  createdAt: number;
  lastActivity: number;
  endedAt?: number;
  ownerId: string | null;
  ownerName: string | null;
}

class WebGameServer {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private io: Server;
  private rooms: Map<string, GameRoom> = new Map();
  private ROOM_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  private RECONNECT_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    this.setupExpress();
    this.setupSocketIO();
    this.startRoomCleanupTimer();
  }

  private setupExpress(): void {
    this.app.use(express.static(path.join(__dirname, '../public')));
    this.app.use(express.json());

    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    });

    this.app.get('/api/rooms', (req, res) => {
      const allRooms = Array.from(this.rooms.values());
      const roomList = allRooms
        .filter(room => room.state !== 'empty' && room.state !== 'finished')
        .map(room => {
          const connectedPlayers = Array.from(room.players.values()).filter(p => p.isConnected);
          const activePlayers = connectedPlayers.filter(p => !p.isSpectator);
          const spectators = connectedPlayers.filter(p => p.isSpectator);
          
          return {
            id: room.id,
            playerCount: connectedPlayers.length,
            activePlayerCount: activePlayers.length,
            spectatorCount: spectators.length,
            maxPlayers: room.maxPlayers,
            isStarted: room.isStarted,
            state: room.state,
            createdAt: room.createdAt,
            ownerName: room.ownerName
          };
        });
      
      console.log(`📋 Rooms API called - Total: ${allRooms.length}, Visible: ${roomList.length}`);
      console.log(`📋 Room details:`, roomList.map(r => 
        `${r.id}(${r.state}, ${r.playerCount} players, owner: ${r.ownerName})`
      ).join(', '));
      
      res.json(roomList);
    });

    this.app.post('/api/rooms', (req, res) => {
      const roomId = this.generateRoomId();
      const game = new RacingGame();
      const now = Date.now();
      const room: GameRoom = {
        id: roomId,
        game,
        players: new Map(),
        isStarted: false,
        maxPlayers: 4,
        state: 'waiting',
        createdAt: now,
        lastActivity: now,
        ownerId: null, // Will be set when first player joins
        ownerName: null
      };
      this.rooms.set(roomId, room);
      console.log(`🏠 Created new room ${roomId} (total rooms: ${this.rooms.size})`);
      res.json({ roomId });
    });
  }

  private setupSocketIO(): void {
    this.io.on('connection', (socket) => {
      console.log('Player connected:', socket.id);

      socket.on('join-room', ({ roomId, playerName, playerColor, persistentPlayerId }) => {
        const room = this.rooms.get(roomId);
        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        // Check if player is trying to reconnect using persistent ID first, then fallback to name
        const existingPlayer = persistentPlayerId
          ? Array.from(room.players.values()).find(p => p.persistentId === persistentPlayerId && !p.isConnected)
          : Array.from(room.players.values()).find(p => p.name === playerName && !p.isConnected);

        if (existingPlayer) {
          // Handle reconnection
          this.handlePlayerReconnection(socket, room, existingPlayer, roomId);
          return;
        }

        // Check if room is full (only count connected players)
        const connectedPlayers = Array.from(room.players.values()).filter(p => p.isConnected);
        if (connectedPlayers.length >= room.maxPlayers) {
          socket.emit('error', { message: 'Room is full' });
          return;
        }

        // Allow joining active games as spectator if no more player slots
        const canJoinAsPlayer = !room.isStarted || connectedPlayers.length < room.maxPlayers;
        
        if (room.isStarted && !canJoinAsPlayer) {
          // Join as spectator
          this.handleSpectatorJoin(socket, room, playerName, playerColor, roomId);
          return;
        }

        const bicycle = new RacingBicycle(playerName, playerColor, room.game['config']);
        const now = Date.now();
        const player: WebPlayer = {
          id: socket.id,
          persistentId: randomUUID(),
          name: playerName,
          color: playerColor,
          bicycle,
          isConnected: true,
          lastSeen: now,
          reconnectCount: 0,
          isSpectator: false,
          joinedAt: now
        };

        // Set ownership to first player joining
        if (!room.ownerId) {
          room.ownerId = socket.id;
          room.ownerName = playerName;
          console.log(`👑 ${playerName} became owner of room ${roomId}`);
        }

        room.lastActivity = now;
        this.updateRoomState(room);

        room.players.set(socket.id, player);
        room.game.addPlayer(playerName, playerColor, false);
        socket.join(roomId);

        const joinResponse = {
          playerId: socket.id,
          persistentPlayerId: player.persistentId,
          roomId,
          isOwner: room.ownerId === socket.id,
          ownerName: room.ownerName,
          isSpectator: false,
          gameState: room.isStarted ? this.getGameState(room) : null,
          roomState: room.state,
          players: Array.from(room.players.values()).map(p => ({
            id: p.id,
            name: p.name,
            color: p.color,
            isConnected: p.isConnected,
            isOwner: p.id === room.ownerId,
            isSpectator: p.isSpectator,
            joinedAt: p.joinedAt
          }))
        };

        socket.emit('joined-room', joinResponse);

        // If game is active, also send current game state
        if (room.isStarted) {
          socket.emit('game-started');
          socket.emit('game-state-update', this.getGameState(room));
        }

        socket.to(roomId).emit('player-joined', {
          id: socket.id,
          name: playerName,
          color: playerColor,
          isOwner: room.ownerId === socket.id
        });
      });

      socket.on('player-action', ({ roomId, action }) => {
        const room = this.rooms.get(roomId);
        if (!room || !room.isStarted) return;

        const player = room.players.get(socket.id);
        if (!player || player.isSpectator || !player.bicycle) {
          socket.emit('error', { message: 'Spectators cannot perform actions' });
          return;
        }

        player.lastSeen = Date.now();
        room.lastActivity = Date.now();

        switch (action) {
          case 'accelerate':
            player.bicycle.accelerate();
            break;
          case 'coast':
            player.bicycle.coast();
            break;
          case 'brake':
            player.bicycle.brake();
            break;
          case 'energy-burst':
            player.bicycle.energyBurst();
            break;
        }

        this.broadcastGameState(roomId);
      });

      socket.on('start-game', ({ roomId }) => {
        const room = this.rooms.get(roomId);
        if (!room || room.isStarted) return;

        // Check if the player is the room owner
        if (room.ownerId !== socket.id) {
          socket.emit('error', { message: 'Only the room owner can start the game' });
          return;
        }

        if (room.players.size < 1) {
          socket.emit('error', { message: 'Need at least 1 player to start' });
          return;
        }

        room.isStarted = true;
        room.state = 'active';
        room.lastActivity = Date.now();
        console.log(`🏁 Game started in room ${roomId} by owner ${room.ownerName}`);
        this.io.to(roomId).emit('game-started');
        this.startGameLoop(roomId);
      });

      socket.on('leave-room', ({ roomId }) => {
        console.log(`Player ${socket.id} requested to leave room ${roomId}`);
        this.handlePlayerLeave(socket.id, roomId, true); // voluntary leave
      });

      socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        this.handlePlayerDisconnect(socket.id);
      });

      socket.on('reconnect-attempt', ({ roomId, playerName, persistentPlayerId }) => {
        const room = this.rooms.get(roomId);
        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        // Find player by persistent ID first, then fallback to name
        const existingPlayer = persistentPlayerId
          ? Array.from(room.players.values()).find(p => p.persistentId === persistentPlayerId && !p.isConnected)
          : Array.from(room.players.values()).find(p => p.name === playerName && !p.isConnected);

        if (existingPlayer) {
          // Update player with new socket ID and reconnect
          room.players.delete(existingPlayer.id);
          existingPlayer.id = socket.id;
          existingPlayer.isConnected = true;
          existingPlayer.lastSeen = Date.now();
          existingPlayer.reconnectCount++;
          existingPlayer.disconnectedAt = 0;

          room.players.set(socket.id, existingPlayer);
          room.lastActivity = Date.now();
          this.updateRoomState(room);

          socket.join(roomId);
          socket.emit('reconnected', {
            playerId: socket.id,
            roomId,
            gameState: this.getGameState(room)
          });

          socket.to(roomId).emit('player-reconnected', {
            id: socket.id,
            name: playerName
          });
        } else {
          socket.emit('error', { message: 'Player not found or already connected' });
        }
      });
    });
  }

  private startGameLoop(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const gameInterval = setInterval(() => {
      if (!room.isStarted) {
        clearInterval(gameInterval);
        return;
      }

      room.players.forEach(player => {
        if (player.bicycle && !player.isSpectator) {
          player.bicycle.move();
        }
      });

      const gameState = this.getGameState(room);
      console.log(`📊 Broadcasting game state to room ${roomId}:`, {
        players: gameState.players?.length || 0,
        raceDistance: gameState.raceDistance,
        turnCount: gameState.turnCount,
        raceProgress: gameState.raceProgress
      });
      this.io.to(roomId).emit('game-state-update', gameState);

      const winner = this.checkWinner(room);
      if (winner) {
        room.isStarted = false;
        room.state = 'finished';
        room.endedAt = Date.now();
        room.lastActivity = Date.now();
        this.io.to(roomId).emit('game-finished', {
          winner: winner.name,
          results: this.getFinalResults(room)
        });
        clearInterval(gameInterval);

        // Schedule room cleanup after game ends
        setTimeout(() => {
          this.checkAndCleanupRoom(roomId);
        }, 5 * 60 * 1000); // 5 minutes after game ends
      }
    }, 1000);
  }

  private getGameState(room: GameRoom): any {
    const raceDistance = room.game['raceDistance'] || 100;

    // Only include actual players (not spectators) in the game
    const activePlayers = Array.from(room.players.values()).filter(p => !p.isSpectator && p.bicycle);
    
    // Sort players by position for ranking
    const sortedPlayers = activePlayers
      .sort((a, b) => b.bicycle!.position - a.bicycle!.position);

    const players = Array.from(room.players.values()).map((player) => {
      if (player.isSpectator || !player.bicycle) {
        // Spectator data
        return {
          id: player.id,
          name: player.name,
          color: player.color,
          isSpectator: true,
          isConnected: player.isConnected,
          joinedAt: player.joinedAt
        };
      }

      // Active player data
      const rank = sortedPlayers.findIndex(p => p.id === player.id) + 1;
      const distanceFromLeader = sortedPlayers[0] ? sortedPlayers[0].bicycle!.position - player.bicycle.position : 0;

      return {
        id: player.id,
        name: player.name,
        color: player.color,
        position: player.bicycle.position || 0,
        speed: player.bicycle.speed || 0,
        energy: player.bicycle.energy || 100,
        maxSpeed: player.bicycle['maxSpeed'] || player.bicycle['_maxSpeed'] || 20,
        maxEnergy: player.bicycle.stats.maxEnergy || 100,
        level: player.bicycle.level || 1,
        activePowerUps: player.bicycle.activePowerUps || [],
        isHuman: true,
        isSpectator: false,
        isConnected: player.isConnected,
        rank: rank || 0,
        lastAction: 'coast',
        energyTrend: 'stable' as const,
        speedTrend: 'stable' as const,
        positionChange: 0,
        distanceFromLeader: distanceFromLeader,
        joinedAt: player.joinedAt
      };
    });

    const activePlayerPositions = players.filter(p => !p.isSpectator).map(p => p.position || 0);
    const raceProgress = activePlayerPositions.length > 0 ? Math.max(...activePlayerPositions) / raceDistance : 0;

    return {
      players,
      raceDistance: raceDistance,
      currentWeather: room.game['currentWeather'] || {
        type: 'sunny',
        icon: '☀️',
        description: 'Perfect racing conditions',
        speedModifier: 1.0,
        energyModifier: 1.0
      },
      powerUps: room.game['powerUps'] || [],
      turnCount: room.game['turnCount'] || 0,
      raceType: 'sprint',
      raceStartTime: Date.now(),
      raceElapsedTime: 0,
      isRaceActive: room.isStarted,
      raceProgress: Math.min(raceProgress, 1),
      gamePhase: raceProgress < 0.25 ? 'early' : raceProgress < 0.75 ? 'middle' : raceProgress < 0.9 ? 'final' : 'sprint',
      leaderboard: sortedPlayers.slice(0, 3).map((player, i) => ({
        position: i + 1,
        name: player.name,
        distance: Math.floor(player.bicycle?.position || 0),
        speed: Math.floor(player.bicycle?.speed || 0)
      })),
      statistics: {
        totalTurns: room.game['turnCount'] || 0,
        averageSpeed: players.length > 0 ? players.reduce((sum, p) => sum + (p.speed || 0), 0) / players.length : 0,
        weatherChanges: 0,
        powerUpsSpawned: 0,
        totalDistance: raceDistance
      }
    };
  }

  private checkWinner(room: GameRoom): WebPlayer | null {
    for (const player of room.players.values()) {
      if (player.bicycle && !player.isSpectator && player.bicycle.position >= room.game['raceDistance']) {
        return player;
      }
    }
    return null;
  }

  private getFinalResults(room: GameRoom): any[] {
    return Array.from(room.players.values())
      .filter(player => player.bicycle && !player.isSpectator)
      .sort((a, b) => (b.bicycle?.position || 0) - (a.bicycle?.position || 0))
      .map((player, index) => ({
        position: index + 1,
        name: player.name,
        finalPosition: player.bicycle?.position || 0,
        stats: player.bicycle?.getRaceStats() || { distance: 0, time: 0, avgSpeed: 0 }
      }));
  }

  private broadcastGameState(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const gameState = this.getGameState(room);
    console.log(`📡 Broadcasting updated game state to room ${roomId}`);
    this.io.to(roomId).emit('game-state-update', gameState);
  }

  private generateRoomId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  private handlePlayerReconnection(socket: any, room: GameRoom, existingPlayer: WebPlayer, roomId: string): void {
    // Update player with new socket ID and reconnect
    room.players.delete(existingPlayer.id);
    existingPlayer.id = socket.id;
    existingPlayer.isConnected = true;
    existingPlayer.lastSeen = Date.now();
    existingPlayer.reconnectCount++;
    delete existingPlayer.disconnectedAt;

    room.players.set(socket.id, existingPlayer);
    room.lastActivity = Date.now();
    this.updateRoomState(room);

    socket.join(roomId);
    
    const reconnectResponse = {
      playerId: socket.id,
      persistentPlayerId: existingPlayer.persistentId,
      roomId,
      isOwner: room.ownerId === socket.id,
      ownerName: room.ownerName,
      isSpectator: existingPlayer.isSpectator,
      gameState: room.isStarted ? this.getGameState(room) : null,
      roomState: room.state,
      reconnected: true,
      players: Array.from(room.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        isConnected: p.isConnected,
        isOwner: p.id === room.ownerId,
        isSpectator: p.isSpectator,
        joinedAt: p.joinedAt
      }))
    };

    socket.emit('joined-room', reconnectResponse);

    // If game is active, send current state
    if (room.isStarted) {
      socket.emit('game-started');
      socket.emit('game-state-update', this.getGameState(room));
    }

    socket.to(roomId).emit('player-reconnected', {
      id: socket.id,
      name: existingPlayer.name,
      color: existingPlayer.color,
      isSpectator: existingPlayer.isSpectator
    });

    console.log(`🔄 ${existingPlayer.name} reconnected to room ${roomId} (attempt #${existingPlayer.reconnectCount})`);
  }

  private handleSpectatorJoin(socket: any, room: GameRoom, playerName: string, playerColor: string, roomId: string): void {
    const now = Date.now();
    const spectator: WebPlayer = {
      id: socket.id,
      persistentId: randomUUID(),
      name: playerName,
      color: playerColor,
      bicycle: null, // Spectators don't have bicycles
      isConnected: true,
      lastSeen: now,
      reconnectCount: 0,
      isSpectator: true,
      joinedAt: now
    };

    room.players.set(socket.id, spectator);
    room.lastActivity = now;
    socket.join(roomId);

    const spectatorResponse = {
      playerId: socket.id,
      persistentPlayerId: spectator.persistentId,
      roomId,
      isOwner: false,
      ownerName: room.ownerName,
      isSpectator: true,
      gameState: room.isStarted ? this.getGameState(room) : null,
      roomState: room.state,
      players: Array.from(room.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        isConnected: p.isConnected,
        isOwner: p.id === room.ownerId,
        isSpectator: p.isSpectator,
        joinedAt: p.joinedAt
      }))
    };

    socket.emit('joined-room', spectatorResponse);

    // Send current game state to spectator
    if (room.isStarted) {
      socket.emit('game-started');
      socket.emit('game-state-update', this.getGameState(room));
    }

    socket.to(roomId).emit('player-joined', {
      id: socket.id,
      name: playerName,
      color: playerColor,
      isSpectator: true
    });

    console.log(`👀 ${playerName} joined room ${roomId} as spectator`);
  }

  private transferRoomOwnership(room: GameRoom, leavingOwnerId: string): void {
    // Find the next connected player to become owner
    const connectedPlayers = Array.from(room.players.values())
      .filter(p => p.isConnected && p.id !== leavingOwnerId);

    if (connectedPlayers.length > 0) {
      // Transfer to the oldest connected player (first to join after original owner)
      const newOwner = connectedPlayers.sort((a, b) => a.lastSeen - b.lastSeen)[0];
      if (newOwner) {
        room.ownerId = newOwner.id;
        room.ownerName = newOwner.name;
        console.log(`👑 Ownership transferred to ${newOwner.name} in room ${room.id}`);
        
        // Notify all players about ownership change
        this.io.to(room.id).emit('ownership-transferred', {
          newOwnerId: newOwner.id,
          newOwnerName: newOwner.name,
          reason: 'owner-left'
        });
      }
    } else {
      // No other players, clear ownership
      room.ownerId = null;
      room.ownerName = null;
      console.log(`👑 Room ${room.id} has no owner (empty)`);
    }
  }

  private handlePlayerLeave(socketId: string, roomId?: string, voluntary: boolean = false): void {
    const targetRooms = roomId ? [roomId] : Array.from(this.rooms.keys());
    
    for (const currentRoomId of targetRooms) {
      const room = this.rooms.get(currentRoomId);
      if (!room) continue;
      
      const player = room.players.get(socketId);
      if (player) {
        const now = Date.now();
        const wasOwner = room.ownerId === socketId;
        
        // For voluntary leave, remove player completely
        // For disconnect, mark as disconnected but keep for reconnection
        if (voluntary) {
          room.players.delete(socketId);
          // Remove from game logic too
          if (player.bicycle && !player.isSpectator) {
            // Remove from underlying game if needed
            console.log(`🚪 ${player.name} voluntarily left room ${currentRoomId}`);
          }
        } else {
          player.isConnected = false;
          player.disconnectedAt = now;
          player.lastSeen = now;
        }
        
        room.lastActivity = now;

        // Handle ownership transfer if owner left
        if (wasOwner) {
          this.transferRoomOwnership(room, socketId);
          
          // If game is active and owner left, notify players about potential consequences
          if (room.isStarted && room.state === 'active') {
            this.io.to(currentRoomId).emit('owner-left-during-game', {
              message: `Room owner ${player.name} ${voluntary ? 'left' : 'disconnected from'} the game. The game will continue with new owner: ${room.ownerName || 'None'}`,
              newOwner: room.ownerName,
              canContinue: room.players.size > 1
            });
            
            // If no other connected players, end the game
            const connectedPlayers = Array.from(room.players.values()).filter(p => p.isConnected);
            if (connectedPlayers.length === 0) {
              console.log(`🏁 Game ended in room ${currentRoomId} - no players remaining`);
              room.isStarted = false;
              room.state = 'finished';
              room.endedAt = now;
              this.io.to(currentRoomId).emit('game-ended', {
                reason: 'no-players',
                message: 'Game ended: all players left'
              });
            }
          }
        }

        // Emit different events for voluntary leave vs disconnect
        if (voluntary) {
          this.io.to(currentRoomId).emit('player-left', {
            playerId: socketId,
            playerName: player.name,
            wasOwner: wasOwner,
            newOwner: room.ownerName,
            voluntary: true
          });
          
          // Notify the leaving player
          this.io.to(socketId).emit('left-room', {
            roomId: currentRoomId,
            message: 'You have left the room'
          });
        } else {
          this.io.to(currentRoomId).emit('player-disconnected', {
            playerId: socketId,
            playerName: player.name,
            wasOwner: wasOwner,
            newOwner: room.ownerName,
            voluntary: false
          });
        }

        console.log(`Player ${player.name} ${voluntary ? 'left' : 'disconnected from'} room ${currentRoomId}${wasOwner ? ' (was owner)' : ''}`);

        // Update room state and check for cleanup
        this.updateRoomState(room);
        this.checkAndCleanupRoom(currentRoomId);
        break;
      }
    }
  }

  private handlePlayerDisconnect(socketId: string): void {
    this.handlePlayerLeave(socketId, undefined, false);
  }

  private updateRoomState(room: GameRoom): void {
    const connectedPlayers = Array.from(room.players.values()).filter(p => p.isConnected);

    if (connectedPlayers.length === 0) {
      if (room.state !== 'finished') {
        // Only mark as empty if the room has had players before
        if (room.players.size > 0) {
          room.state = 'empty';
          console.log(`Room ${room.id} is now empty`);
        }
        // New rooms with no players yet stay in 'waiting' state
      }
    } else if (room.state === 'empty') {
      room.state = room.isStarted ? 'active' : 'waiting';
      console.log(`Room ${room.id} state changed to ${room.state}`);
    }
  }

  private checkAndCleanupRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const now = Date.now();
    const connectedPlayers = Array.from(room.players.values()).filter(p => p.isConnected);

    // Remove room if:
    // 1. No connected players and room has been empty for more than reconnect timeout
    // 2. Room is finished and has been inactive for more than 5 minutes
    // 3. Room has been inactive for more than room timeout

    const shouldCleanup =
      (connectedPlayers.length === 0 &&
        now - room.lastActivity > this.RECONNECT_TIMEOUT) ||
      (room.state === 'finished' &&
        room.endedAt &&
        now - room.endedAt > 5 * 60 * 1000) ||
      (now - room.lastActivity > this.ROOM_TIMEOUT);

    if (shouldCleanup) {
      console.log(`Cleaning up room ${roomId} (state: ${room.state}, inactive for: ${now - room.lastActivity}ms)`);
      this.rooms.delete(roomId);
    }
  }

  private startRoomCleanupTimer(): void {
    // Run cleanup every 5 minutes
    setInterval(() => {
      const roomsToCheck = Array.from(this.rooms.keys());

      roomsToCheck.forEach(roomId => {
        this.checkAndCleanupRoom(roomId);
      });

      console.log(`Room cleanup check completed. Active rooms: ${this.rooms.size}`);
    }, 5 * 60 * 1000);
  }

  start(port: number = 3000): void {
    this.server.listen(port, () => {
      console.log(`🚴‍♂️ Racing Game Server running on http://localhost:${port}`);
    });
  }
}

const server = new WebGameServer();
server.start();

export { WebGameServer };