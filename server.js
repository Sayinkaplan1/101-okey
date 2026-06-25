/**
 * server.js
 * 101 Okey çok oyunculu web oyunu sunucusu.
 * Express (statik dosya sunumu) + Socket.io (gerçek zamanlı iletişim).
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const GameRoom = require('./game/GameRoom');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Geliştirme için tüm originlere izin ver
    methods: ['GET', 'POST'],
  },
});

// Statik dosya sunumu (public klasörü)
app.use(express.static('public'));

// Basit sağlık kontrolü endpoint'i
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    rooms: rooms.size,
    uptime: process.uptime(),
  });
});

// ─────────────── Oda Yönetimi ───────────────

/** @type {Map<string, GameRoom>} */
const rooms = new Map();

/** @type {Map<string, string>} socketId → roomCode eşlemesi */
const socketRoomMap = new Map();

/**
 * 6 karakterlik rastgele alfanumerik oda kodu üretir.
 * Çakışmayı kontrol eder.
 * @returns {string}
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Karışıklık yaratan karakterler çıkarıldı (I,O,0,1)
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(code));
  return code;
}

/**
 * Yerel ağ IP adresini bulur (LAN erişimi için).
 * @returns {string}
 */
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // IPv4, dahili değil, loopback değil
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

/**
 * Bir odadaki tüm oyunculara güncel oyun durumunu gönderir.
 * Her oyuncu sadece kendi taşlarını görür.
 *
 * @param {string} roomCode
 */
function broadcastGameState(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  for (const player of room.players) {
    if (!player.connected) continue;
    const state = room.getPlayerState(player.id);
    io.to(player.id).emit('gameState', state);
  }
}

/**
 * Odadaki herkese bir olay gönderir.
 * @param {string} roomCode
 * @param {string} event
 * @param {object} data
 */
function broadcastToRoom(roomCode, event, data) {
  io.to(roomCode).emit(event, data);
}

// ─────────────── Socket.io Olayları ───────────────

io.on('connection', (socket) => {
  console.log(`🟢 Oyuncu bağlandı: ${socket.id}`);

  // ───── Oda Oluşturma ─────
  socket.on('createRoom', ({ playerName }) => {
    if (!playerName || playerName.trim().length === 0) {
      socket.emit('error', { message: 'Oyuncu adı boş olamaz.' });
      return;
    }

    const roomCode = generateRoomCode();
    const room = new GameRoom(roomCode, socket.id, playerName.trim());
    rooms.set(roomCode, room);
    socketRoomMap.set(socket.id, roomCode);

    // Socket.io odasına katıl
    socket.join(roomCode);

    console.log(`🏠 Oda oluşturuldu: ${roomCode} | Kurucu: ${playerName}`);

    socket.emit('roomCreated', {
      roomCode,
      players: room.players.map((p) => ({ name: p.name, id: p.id })),
    });
  });

  // ───── Odaya Katılma ─────
  socket.on('joinRoom', ({ roomCode, playerName }) => {
    if (!playerName || playerName.trim().length === 0) {
      socket.emit('error', { message: 'Oyuncu adı boş olamaz.' });
      return;
    }

    if (!roomCode || roomCode.trim().length === 0) {
      socket.emit('error', { message: 'Oda kodu boş olamaz.' });
      return;
    }

    const code = roomCode.trim().toUpperCase();
    const room = rooms.get(code);

    if (!room) {
      socket.emit('error', { message: 'Oda bulunamadı.' });
      return;
    }

    const result = room.addPlayer(socket.id, playerName.trim());
    if (!result.success) {
      socket.emit('error', { message: result.reason });
      return;
    }

    socketRoomMap.set(socket.id, code);
    socket.join(code);

    console.log(`👤 ${playerName} odaya katıldı: ${code}`);

    // Odadaki herkese yeni oyuncu listesini gönder (playerJoined event)
    broadcastToRoom(code, 'playerJoined', {
      players: room.players.map((p) => ({
        name: p.name,
        id: p.id,
        connected: p.connected,
      })),
    });
  });

  // ───── Oyunu Başlatma ─────
  socket.on('startGame', () => {
    const roomCode = socketRoomMap.get(socket.id);
    if (!roomCode) {
      socket.emit('error', { message: 'Bir odada değilsiniz.' });
      return;
    }

    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('error', { message: 'Oda bulunamadı.' });
      return;
    }

    // Sadece oda sahibi (ilk oyuncu) oyunu başlatabilir
    if (room.players[0].id !== socket.id) {
      socket.emit('error', { message: 'Sadece oda sahibi oyunu başlatabilir.' });
      return;
    }

    const result = room.startGame();
    if (!result.success) {
      socket.emit('error', { message: result.reason });
      return;
    }

    console.log(`🎮 Oyun başladı: ${roomCode} | ${room.players.length} oyuncu`);

    // Her oyuncuya kendi elini ve oyun durumunu gönder
    for (let i = 0; i < room.players.length; i++) {
      const p = room.players[i];
      if (!p.connected) continue;
      io.to(p.id).emit('gameStarted', {
        hand: p.hand,
        indicator: room.indicator,
        okeyInfo: room.okeyInfo,
        currentTurn: room.currentTurn,
        playerIndex: i,
        players: room.players.map(pl => ({ id: pl.id, name: pl.name })),
        pileCount: room.pile.length,
        discardPiles: room.discardPiles,
        roundNumber: room.roundNumber,
      });
    }
  });

  // ───── Taş Çekme ─────
  socket.on('drawTile', ({ source }) => {
    const roomCode = socketRoomMap.get(socket.id);
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    const result = room.drawTile(socket.id, source);
    if (!result.success) {
      socket.emit('error', { message: result.reason });
      return;
    }

    // Çeken oyuncuya çektiği taşı bildir
    socket.emit('tileDrawn', { tile: result.tile, source, pileCount: room.pile.length, discardPiles: room.discardPiles });

    // Sıra bilgisini herkese gönder
    broadcastToRoom(roomCode, 'turnUpdate', {
      currentTurn: room.currentTurn,
      hasDrawn: room.hasDrawnThisTurn,
    });
  });

  // ───── Taş Atma ─────
  socket.on('discardTile', ({ tileId }) => {
    const roomCode = socketRoomMap.get(socket.id);
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    const playerIndex = room.getPlayerIndex(socket.id);
    const playerName = room.players[playerIndex]?.name || 'Bilinmeyen';

    const result = room.discardTile(socket.id, tileId);
    if (!result.success) {
      socket.emit('error', { message: result.reason });
      return;
    }

    // Herkese atılan taşı bildir
    broadcastToRoom(roomCode, 'tileDiscarded', {
      playerIndex,
      tile: result.tile,
      nextTurn: room.currentTurn,
      pileCount: room.pile.length,
      discardPiles: room.discardPiles,
    });

    // Round bittiyse sonuçları bildir
    if (result.roundEnd) {
      const Validator = require('./game/Validator');
      const scores = room.players.map((p) => ({
        name: p.name,
        score: p.score,
        remainingTiles: p.hand.length,
        penalty: p.hand.length > 0
          ? Validator.calculatePenalty(p.hand, room.okeyInfo)
          : 0,
        roundPenalty: p.hand.length > 0
          ? Validator.calculatePenalty(p.hand, room.okeyInfo)
          : 0,
        totalScore: p.score,
      }));

      broadcastToRoom(roomCode, 'roundEnd', {
        winnerName: playerName,
        roundWinner: playerName,
        winnerIndex: playerIndex,
        scores,
        roundNumber: room.roundNumber,
      });

      console.log(`🏆 Round ${room.roundNumber} bitti: ${roomCode} | Kazanan: ${playerName}`);
    }
  });

  // ───── El Açma ─────
  socket.on('openHand', ({ sets }) => {
    const roomCode = socketRoomMap.get(socket.id);
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    const playerIndex = room.getPlayerIndex(socket.id);
    const playerName = room.players[playerIndex]?.name || 'Bilinmeyen';

    const result = room.openHand(socket.id, sets);
    if (!result.success) {
      socket.emit('error', {
        message: result.reason,
        totalPoints: result.totalPoints,
      });
      return;
    }

    console.log(
      `✋ ${playerName} elini açtı: ${roomCode} | Toplam puan: ${result.totalPoints}`
    );

    // Herkese el açıldığını bildir
    // Her oyuncuya kendi el durumunu gönder
    for (const p of room.players) {
      if (!p.connected) continue;
      const pIdx = room.getPlayerIndex(p.id);
      io.to(p.id).emit('handOpened', {
        playerName,
        playerIndex,
        totalPoints: result.totalPoints,
        sets: room.players[playerIndex].openSets,
        hand: pIdx === playerIndex ? result.remainingTiles : undefined,
        remainingTileCount: result.remainingTiles.length,
      });
    }
  });

  // ───── Taş Yatırma ─────
  socket.on('layTile', ({ tileIds, targetPlayerIndex, targetSetIndex }) => {
    const roomCode = socketRoomMap.get(socket.id);
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    const playerIndex = room.getPlayerIndex(socket.id);

    const result = room.layTile(socket.id, tileIds, targetPlayerIndex, targetSetIndex);
    if (!result.success) {
      socket.emit('error', { message: result.reason });
      return;
    }

    // Herkese taş yatırıldığını bildir
    for (const p of room.players) {
      if (!p.connected) continue;
      const pIdx = room.getPlayerIndex(p.id);
      io.to(p.id).emit('tileLaid', {
        playerIndex,
        tileIds,
        targetPlayerIndex,
        targetSetIndex,
        updatedSet: room.players[targetPlayerIndex].openSets[targetSetIndex],
        hand: pIdx === playerIndex ? room.players[playerIndex].hand : undefined,
      });
    }
  });

  // ───── Tur Bitirme ─────
  socket.on('finishTurn', () => {
    const roomCode = socketRoomMap.get(socket.id);
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    const playerIndex = room.getPlayerIndex(socket.id);
    const playerName = room.players[playerIndex]?.name || 'Bilinmeyen';

    const result = room.finishTurn(socket.id);
    if (!result.success) {
      socket.emit('error', { message: result.reason });
      return;
    }

    if (result.roundEnd) {
      const Validator = require('./game/Validator');
      const scores = room.players.map((p) => ({
        name: p.name,
        score: p.score,
        remainingTiles: p.hand.length,
        penalty: p.hand.length > 0
          ? Validator.calculatePenalty(p.hand, room.okeyInfo)
          : 0,
        roundPenalty: p.hand.length > 0
          ? Validator.calculatePenalty(p.hand, room.okeyInfo)
          : 0,
        totalScore: p.score,
      }));

      broadcastToRoom(roomCode, 'roundEnd', {
        winnerName: playerName,
        roundWinner: playerName,
        winnerIndex: playerIndex,
        scores,
        roundNumber: room.roundNumber,
      });

      console.log(`🏆 Round ${room.roundNumber} bitti: ${roomCode} | Kazanan: ${playerName}`);
    }

    // Sıra bilgisini güncelle
    broadcastToRoom(roomCode, 'turnUpdate', {
      currentTurn: room.currentTurn,
      hasDrawn: room.hasDrawnThisTurn,
    });
  });

  // ───── Yeni Round ─────
  socket.on('newRound', () => {
    const roomCode = socketRoomMap.get(socket.id);
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    // Sadece oda sahibi yeni round başlatabilir
    if (room.players[0].id !== socket.id) {
      socket.emit('error', { message: 'Sadece oda sahibi yeni round başlatabilir.' });
      return;
    }

    const result = room.startNewRound();
    if (!result.success) {
      socket.emit('error', { message: result.reason });
      return;
    }

    console.log(`🔄 Yeni round başladı: ${roomCode} | Round ${room.roundNumber}`);

    // Her oyuncuya kendi elini gönder
    for (let i = 0; i < room.players.length; i++) {
      const p = room.players[i];
      if (!p.connected) continue;
      io.to(p.id).emit('gameStarted', {
        hand: p.hand,
        indicator: room.indicator,
        okeyInfo: room.okeyInfo,
        currentTurn: room.currentTurn,
        playerIndex: i,
        players: room.players.map(pl => ({ id: pl.id, name: pl.name })),
        pileCount: room.pile.length,
        discardPiles: room.discardPiles,
        roundNumber: room.roundNumber,
      });
    }
  });

  // ───── Bağlantı Kopması ─────
  socket.on('disconnect', () => {
    const roomCode = socketRoomMap.get(socket.id);
    console.log(`🔴 Oyuncu ayrıldı: ${socket.id}`);

    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) {
      socketRoomMap.delete(socket.id);
      return;
    }

    const result = room.removePlayer(socket.id);

    if (result.removed || !result.isEmpty) {
      console.log(`👋 ${result.playerName} odadan ayrıldı: ${roomCode}`);

      // Odadaki diğer oyunculara bildir
      broadcastToRoom(roomCode, 'playerLeft', {
        leftPlayerName: result.playerName,
        players: room.players.map((p) => ({
          name: p.name,
          id: p.id,
          connected: p.connected,
        })),
      });
    }

    // Oda boşsa sil
    if (result.isEmpty || room.players.length === 0) {
      rooms.delete(roomCode);
      console.log(`🗑️ Oda silindi (boş): ${roomCode}`);
    }

    socketRoomMap.delete(socket.id);
  });
});

// ─────────────── Sunucuyu Başlat ───────────────

const PORT = process.env.PORT || 3000;
const localIP = getLocalIP();

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║          🎲 101 Okey Sunucusu Çalışıyor          ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Yerel:  http://localhost:${PORT}                   ║`);
  console.log(`║  Ağ:     http://${localIP}:${PORT}              ║`);
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║  Arkadaşlarınız ağ adresini kullanarak           ║');
  console.log('║  aynı Wi-Fi üzerinden bağlanabilir.              ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
});
