import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { RacingGame } from './game';
import { RacingBicycle } from './RacingBicycle';

interface WebPlayer {
  id: string;
  name: string;
  color: string;
  bicycle: RacingBicycle;
  isConnected: boolean;
  lastSeen: number;
  disconnectedAt?: number;
  reconnectCount: number;
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
      const roomList = Array.from(this.rooms.values())
        .filter(room => room.state !== 'empty')
        .map(room => ({
          id: room.id,
          playerCount: Array.from(room.players.values()).filter(p => p.isConnected).length,
          maxPlayers: room.maxPlayers,
          isStarted: room.isStarted,
          state: room.state,
          createdAt: room.createdAt
        }));
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
        lastActivity: now
      };
      this.rooms.set(roomId, room);
      res.json({ roomId });
    });
  }

  private setupSocketIO(): void {
    this.io.on('connection', (socket) => {
      console.log('Player connected:', socket.id);

      socket.on('join-room', ({ roomId, playerName, playerColor }) => {
        const room = this.rooms.get(roomId);
        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        if (room.players.size >= room.maxPlayers) {
          socket.emit('error', { message: 'Room is full' });
          return;
        }

        if (room.isStarted) {
          socket.emit('error', { message: 'Game already started' });
          return;
        }

        const bicycle = new RacingBicycle(playerName, playerColor, room.game['config']);
        const now = Date.now();
        const player: WebPlayer = {
          id: socket.id,
          name: playerName,
          color: playerColor,
          bicycle,
          isConnected: true,
          lastSeen: now,
          reconnectCount: 0
        };

        room.lastActivity = now;
        this.updateRoomState(room);

        room.players.set(socket.id, player);
        room.game.addPlayer(playerName, playerColor, false);
        socket.join(roomId);

        socket.emit('joined-room', {
          playerId: socket.id,
          roomId,
          players: Array.from(room.players.values()).map(p => ({
            id: p.id,
            name: p.name,
            color: p.color,
            isConnected: p.isConnected
          }))
        });

        socket.to(roomId).emit('player-joined', {
          id: socket.id,
          name: playerName,
          color: playerColor
        });
      });

      socket.on('player-action', ({ roomId, action }) => {
        const room = this.rooms.get(roomId);
        if (!room || !room.isStarted) return;

        const player = room.players.get(socket.id);
        if (!player) return;

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

        if (room.players.size < 1) {
          socket.emit('error', { message: 'Need at least 1 player to start' });
          return;
        }

        room.isStarted = true;
        room.state = 'active';
        room.lastActivity = Date.now();
        this.io.to(roomId).emit('game-started');
        this.startGameLoop(roomId);
      });

      socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        this.handlePlayerDisconnect(socket.id);
      });

      socket.on('reconnect-attempt', ({ roomId, playerName }) => {
        const room = this.rooms.get(roomId);
        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        // Find player by name (in case of new socket ID)
        const existingPlayer = Array.from(room.players.values())
          .find(p => p.name === playerName && !p.isConnected);

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
        player.bicycle.move();
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

    // Sort players by position for ranking
    const sortedPlayers = Array.from(room.players.values())
      .sort((a, b) => b.bicycle.position - a.bicycle.position);

    const players = Array.from(room.players.values()).map((player) => {
      const rank = sortedPlayers.findIndex(p => p.id === player.id) + 1;
      const distanceFromLeader = sortedPlayers[0] ? sortedPlayers[0].bicycle.position - player.bicycle.position : 0;

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
        isHuman: true, // All players in rooms are human
        rank: rank,
        lastAction: 'coast', // Default action
        energyTrend: 'stable' as const,
        speedTrend: 'stable' as const,
        positionChange: 0,
        distanceFromLeader: distanceFromLeader
      };
    });

    const raceProgress = players.length > 0 ? Math.max(...players.map(p => p.position)) / raceDistance : 0;

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
        distance: Math.floor(player.bicycle.position),
        speed: Math.floor(player.bicycle.speed)
      })),
      statistics: {
        totalTurns: room.game['turnCount'] || 0,
        averageSpeed: players.length > 0 ? players.reduce((sum, p) => sum + p.speed, 0) / players.length : 0,
        weatherChanges: 0,
        powerUpsSpawned: 0,
        totalDistance: raceDistance
      }
    };
  }

  private checkWinner(room: GameRoom): WebPlayer | null {
    for (const player of room.players.values()) {
      if (player.bicycle.position >= room.game['raceDistance']) {
        return player;
      }
    }
    return null;
  }

  private getFinalResults(room: GameRoom): any[] {
    return Array.from(room.players.values())
      .sort((a, b) => b.bicycle.position - a.bicycle.position)
      .map((player, index) => ({
        position: index + 1,
        name: player.name,
        finalPosition: player.bicycle.position,
        stats: player.bicycle.getRaceStats()
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

  private handlePlayerDisconnect(socketId: string): void {
    for (const [roomId, room] of this.rooms) {
      const player = room.players.get(socketId);
      if (player) {
        const now = Date.now();
        player.isConnected = false;
        player.disconnectedAt = now;
        player.lastSeen = now;
        room.lastActivity = now;

        this.io.to(roomId).emit('player-disconnected', {
          playerId: socketId,
          playerName: player.name
        });

        console.log(`Player ${player.name} disconnected from room ${roomId}`);

        // Check if room should be cleaned up
        this.checkAndCleanupRoom(roomId);
        break;
      }
    }
  }

  private updateRoomState(room: GameRoom): void {
    const connectedPlayers = Array.from(room.players.values()).filter(p => p.isConnected);

    if (connectedPlayers.length === 0) {
      if (room.state !== 'finished') {
        room.state = 'empty';
        console.log(`Room ${room.id} is now empty`);
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