/**
 * GameRoom.js
 * 101 Okey oyun odası yönetimi.
 * Oyun durumu, sıra kontrolü, taş çekme/atma, el açma ve puan hesaplama.
 */

const TileSet = require('./TileSet');
const Validator = require('./Validator');

class GameRoom {
  /**
   * @param {string} roomCode - Oda kodu
   * @param {string} hostId  - Oda sahibinin socket ID'si
   * @param {string} hostName - Oda sahibinin adı
   */
  constructor(roomCode, hostId, hostName) {
    this.roomCode = roomCode;

    /** @type {Array<{id: string, name: string, hand: Array, openSets: Array<Array>, score: number, hasOpened: boolean, connected: boolean}>} */
    this.players = [
      {
        id: hostId,
        name: hostName,
        hand: [],
        openSets: [],
        score: 0,
        hasOpened: false,
        connected: true,
      },
    ];

    this.pile = [];            // Çekilecek taş yığını
    this.discardPiles = [[], [], [], []]; // 4 oyuncunun sağına atılan taşlar
    this.indicator = null;     // Gösterge taşı
    this.okeyInfo = null;      // Okey bilgisi { color, number }
    this.currentTurn = 0;      // Sıradaki oyuncu index'i
    this.phase = 'waiting';    // 'waiting' | 'playing' | 'roundEnd'
    this.hasDrawnThisTurn = false; // Bu turda taş çekildi mi
    this.roundNumber = 1;      // Kaçıncı round
    this.roundNumber = 1;      // Kaçıncı round
  }

  // ─────────────── Oyuncu Yönetimi ───────────────

  /**
   * Odaya yeni oyuncu ekler.
   * @param {string} id - Socket ID
   * @param {string} name - Oyuncu adı
   * @returns {{ success: boolean, reason?: string }}
   */
  addPlayer(id, name) {
    if (this.players.length >= 4) {
      return { success: false, reason: 'Oda dolu (maks. 4 oyuncu).' };
    }

    if (this.phase !== 'waiting') {
      return { success: false, reason: 'Oyun zaten başlamış.' };
    }

    // Aynı ID ile tekrar katılmayı engelle
    if (this.players.find((p) => p.id === id)) {
      return { success: false, reason: 'Zaten bu odadasınız.' };
    }

    this.players.push({
      id,
      name,
      hand: [],
      openSets: [],
      score: 0,
      hasOpened: false,
      connected: true,
    });

    return { success: true };
  }

  /**
   * Oyuncunun bağlantı kopması durumunu yönetir.
   * Oyun sırasında oyuncuyu silmez, sadece bağlantı durumunu günceller.
   *
   * @param {string} id - Socket ID
   * @returns {{ removed: boolean, wasHost: boolean, playerName: string, isEmpty: boolean }}
   */
  removePlayer(id) {
    const index = this.players.findIndex((p) => p.id === id);
    if (index === -1) {
      return { removed: false, wasHost: false, playerName: '', isEmpty: false };
    }

    const player = this.players[index];
    const wasHost = index === 0;

    if (this.phase === 'waiting') {
      // Bekleme ekranında ise oyuncuyu tamamen sil
      this.players.splice(index, 1);
      return {
        removed: true,
        wasHost,
        playerName: player.name,
        isEmpty: this.players.length === 0,
      };
    }

    // Oyun sırasında bağlantı koptu → bağlantı durumunu güncelle
    player.connected = false;

    // Sırası bu oyuncudaysa bir sonraki oyuncuya geç
    if (this.currentTurn === index) {
      this._advanceTurn();
    }

    return {
      removed: false,
      wasHost,
      playerName: player.name,
      isEmpty: false,
    };
  }

  /**
   * Bağlantısı kopan oyuncunun yeniden bağlanmasını sağlar.
   * @param {string} oldId - Eski socket ID
   * @param {string} newId - Yeni socket ID
   * @returns {boolean}
   */
  reconnectPlayer(oldId, newId) {
    const player = this.players.find((p) => p.id === oldId);
    if (!player) return false;
    player.id = newId;
    player.connected = true;
    return true;
  }

  // ─────────────── Oyun Başlatma ───────────────

  /**
   * Oyunu başlatır: taş seti oluşturur, karıştırır, dağıtır.
   * @returns {{ success: boolean, reason?: string }}
   */
  startGame() {
    if (this.phase !== 'waiting') {
      return { success: false, reason: 'Oyun zaten başlamış.' };
    }

    if (this.players.length < 2) {
      return { success: false, reason: 'En az 2 oyuncu gerekli.' };
    }

    const tileSet = new TileSet();
    const { hands, pile, indicator, okeyInfo } = tileSet.dealTiles(this.players.length);

    // Taşları oyunculara dağıt
    for (let i = 0; i < this.players.length; i++) {
      this.players[i].hand = hands[i];
      this.players[i].openSets = [];
      this.players[i].hasOpened = false;
    }

    this.pile = pile;
    this.discardPiles = [[], [], [], []];
    this.indicator = indicator;
    this.okeyInfo = okeyInfo;
    this.currentTurn = 0;
    this.phase = 'playing';

    // İlk oyuncu 22 taş aldı, çekmeden atacak → hasDrawnThisTurn = true
    this.hasDrawnThisTurn = true;

    return { success: true };
  }

  // ─────────────── Taş Çekme ───────────────

  /**
   * Oyuncu taş çeker (yığından veya çöp yığınından).
   *
   * @param {string} playerId - Socket ID
   * @param {'pile' | 'discard'} source - Taş kaynağı
   * @returns {{ success: boolean, tile?: object, reason?: string }}
   */
  drawTile(playerId, source) {
    const playerIndex = this.getPlayerIndex(playerId);
    if (playerIndex === -1) {
      return { success: false, reason: 'Oyuncu bulunamadı.' };
    }

    if (!this.isPlayerTurn(playerId)) {
      return { success: false, reason: 'Sıra sizde değil.' };
    }

    if (this.hasDrawnThisTurn) {
      return { success: false, reason: 'Bu turda zaten taş çektiniz.' };
    }

    if (this.phase !== 'playing') {
      return { success: false, reason: 'Oyun aktif değil.' };
    }

    let tile;

    if (source === 'discard') {
      // Çöp yığınından çek (sadece solumuzdaki çöp, yani kendi indeksimizdeki)
      const myLeftPile = this.discardPiles[playerIndex];
      if (myLeftPile.length === 0) {
        return { success: false, reason: 'Çöp yığını boş.' };
      }
      tile = myLeftPile.pop();
    } else if (source === 'pile') {
      // Yığından çek
      if (this.pile.length === 0) {
        // Yığın bittiyse çöp yığınını karıştırıp yığına çevir
        const reshuffled = this._reshufflePile();
        if (!reshuffled) {
          return { success: false, reason: 'Çekilecek taş kalmadı.' };
        }
      }
      tile = this.pile.pop();
    } else {
      return { success: false, reason: 'Geçersiz kaynak. "pile" veya "discard" olmalı.' };
    }

    // Taşı oyuncunun eline ekle
    this.players[playerIndex].hand.push(tile);
    this.hasDrawnThisTurn = true;

    return { success: true, tile };
  }

  /**
   * Yığın bittiğinde çöp yığınını karıştırıp yığına çevirir.
   * En üstteki çöp taşı korunur.
   * @returns {boolean} İşlem başarılı mı
   * @private
   */
  _reshufflePile() {
    let totalDiscarded = 0;
    this.discardPiles.forEach(p => totalDiscarded += p.length);
    
    // Karıştırılacak yeterli taş var mı (her yığının en üstündeki bırakılacak)
    // 4 yığının üstlerindeki hariç toplam taş
    let availableToShuffle = 0;
    this.discardPiles.forEach(p => availableToShuffle += Math.max(0, p.length - 1));

    if (availableToShuffle <= 0) {
      return false; // Karıştıracak yeterli taş yok
    }

    // En üstteki taşları koru, diğerlerini topla
    const newPile = [];
    for (let i = 0; i < 4; i++) {
      if (this.discardPiles[i].length > 1) {
        const topTile = this.discardPiles[i].pop(); // Üsttekini al
        newPile.push(...this.discardPiles[i]); // Kalanları yeni yığına ekle
        this.discardPiles[i] = [topTile]; // Üsttekini geri koy
      }
    }

    this.pile = newPile;

    // Fisher-Yates karıştırma
    for (let i = this.pile.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.pile[i], this.pile[j]] = [this.pile[j], this.pile[i]];
    }

    return true;
  }

  // ─────────────── Taş Atma ───────────────

  /**
   * Oyuncu elinden bir taş atar.
   *
   * @param {string} playerId - Socket ID
   * @param {number} tileId - Atılacak taşın ID'si
   * @returns {{ success: boolean, tile?: object, reason?: string, roundEnd?: boolean }}
   */
  discardTile(playerId, tileId) {
    const playerIndex = this.getPlayerIndex(playerId);
    if (playerIndex === -1) {
      return { success: false, reason: 'Oyuncu bulunamadı.' };
    }

    if (!this.isPlayerTurn(playerId)) {
      return { success: false, reason: 'Sıra sizde değil.' };
    }

    if (!this.hasDrawnThisTurn) {
      return { success: false, reason: 'Önce taş çekmelisiniz.' };
    }

    if (this.phase !== 'playing') {
      return { success: false, reason: 'Oyun aktif değil.' };
    }

    const player = this.players[playerIndex];
    const tileIndex = player.hand.findIndex((t) => t.id === tileId);

    if (tileIndex === -1) {
      return { success: false, reason: 'Bu taş elinizde yok.' };
    }

    // Taşı elden çıkar ve sağdaki oyuncunun soluna (atma destesine) ekle
    const tile = player.hand.splice(tileIndex, 1)[0];
    const targetPileIndex = (playerIndex + 1) % 4;
    this.discardPiles[targetPileIndex].push(tile);

    // El bitti mi kontrol et (tüm taşlar setlere yatırıldı ve son taş atıldı)
    const roundEnd = this.checkRoundEnd(playerIndex);

    if (!roundEnd) {
      // Sırayı bir sonraki oyuncuya geç
      this._advanceTurn();
    }

    return { success: true, tile, roundEnd };
  }

  // ─────────────── El Açma ───────────────

  /**
   * Oyuncu elini açar (sets dizisi olarak).
   * sets: taş ID dizilerinin dizisi, örn. [[1,2,3], [4,5,6,7]]
   *
   * @param {string} playerId
   * @param {Array<Array<number>>} sets - Taş ID dizileri
   * @returns {{ success: boolean, reason?: string, totalPoints?: number, remainingTiles?: Array }}
   */
  openHand(playerId, sets) {
    const playerIndex = this.getPlayerIndex(playerId);
    if (playerIndex === -1) {
      return { success: false, reason: 'Oyuncu bulunamadı.' };
    }

    if (!this.isPlayerTurn(playerId)) {
      return { success: false, reason: 'Sıra sizde değil.' };
    }

    if (this.phase !== 'playing') {
      return { success: false, reason: 'Oyun aktif değil.' };
    }

    const player = this.players[playerIndex];

    if (player.hasOpened) {
      return { success: false, reason: 'Elini zaten açtınız.' };
    }

    // Taş ID'lerini gerçek taş objelerine çevir
    const tileSets = [];
    const handCopy = [...player.hand]; // Doğrulama için kopya

    for (let i = 0; i < sets.length; i++) {
      const tileIds = sets[i];
      const setTiles = [];

      for (const tileId of tileIds) {
        const tileIdx = handCopy.findIndex((t) => t.id === tileId);
        if (tileIdx === -1) {
          return {
            success: false,
            reason: `Taş ID ${tileId} elinizde bulunamadı veya başka bir sette kullanılmış.`,
          };
        }
        setTiles.push(handCopy[tileIdx]);
        handCopy.splice(tileIdx, 1); // Aynı taşı tekrar kullanmayı engelle
      }

      tileSets.push(setTiles);
    }

    // Validator ile kontrol et
    const validation = Validator.canOpenHand(tileSets, this.okeyInfo);
    if (!validation.valid) {
      return { success: false, reason: validation.reason, totalPoints: validation.totalPoints };
    }

    // Geçerli → el açıldı olarak işaretle
    player.hasOpened = true;
    player.openSets = tileSets;

    // Kullanılan taşları elden çıkar
    const usedIds = new Set(sets.flat());
    player.hand = player.hand.filter((t) => !usedIds.has(t.id));

    return {
      success: true,
      totalPoints: validation.totalPoints,
      remainingTiles: player.hand,
    };
  }

  // ─────────────── Taş Yatırma (Lay) ───────────────

  /**
   * El açtıktan sonra elindeki taşları başka (veya kendi) açık setlerine yatırır.
   *
   * @param {string} playerId
   * @param {Array<number>} tileIds - Yatırılacak taş ID'leri
   * @param {number} targetPlayerIndex - Hedef oyuncu index'i
   * @param {number} targetSetIndex - Hedef setin index'i
   * @returns {{ success: boolean, reason?: string }}
   */
  layTile(playerId, tileIds, targetPlayerIndex, targetSetIndex) {
    const playerIndex = this.getPlayerIndex(playerId);
    if (playerIndex === -1) {
      return { success: false, reason: 'Oyuncu bulunamadı.' };
    }

    if (!this.isPlayerTurn(playerId)) {
      return { success: false, reason: 'Sıra sizde değil.' };
    }

    const player = this.players[playerIndex];

    if (!player.hasOpened) {
      return { success: false, reason: 'Önce elinizi açmalısınız.' };
    }

    // Hedef oyuncu ve set kontrolü
    if (targetPlayerIndex < 0 || targetPlayerIndex >= this.players.length) {
      return { success: false, reason: 'Geçersiz hedef oyuncu.' };
    }

    const targetPlayer = this.players[targetPlayerIndex];

    if (!targetPlayer.hasOpened) {
      return { success: false, reason: 'Hedef oyuncu elini açmamış.' };
    }

    if (targetSetIndex < 0 || targetSetIndex >= targetPlayer.openSets.length) {
      return { success: false, reason: 'Geçersiz hedef set.' };
    }

    // Yatırılacak taşları elden bul
    const tilesToLay = [];
    const handCopy = [...player.hand];

    for (const tileId of tileIds) {
      const idx = handCopy.findIndex((t) => t.id === tileId);
      if (idx === -1) {
        return { success: false, reason: `Taş ID ${tileId} elinizde yok.` };
      }
      tilesToLay.push(handCopy[idx]);
      handCopy.splice(idx, 1);
    }

    // Yeni set oluştur (mevcut + yeni taşlar)
    const newSet = [...targetPlayer.openSets[targetSetIndex], ...tilesToLay];

    // Yeni setin geçerliliğini kontrol et
    if (!Validator.isValidSet(newSet, this.okeyInfo)) {
      return { success: false, reason: 'Taşlar eklendikten sonra set geçersiz oluyor.' };
    }

    // Geçerli → taşları yatır
    targetPlayer.openSets[targetSetIndex] = newSet;

    // Taşları oyuncunun elinden çıkar
    const usedIds = new Set(tileIds);
    player.hand = player.hand.filter((t) => !usedIds.has(t.id));

    return { success: true };
  }

  // ─────────────── Tur Sonu / Round Sonu ───────────────

  /**
   * Round sonu kontrolü: Oyuncunun elinde taş kalmadıysa round biter.
   * @param {number} playerIndex - Kontrol edilecek oyuncu
   * @returns {boolean}
   */
  checkRoundEnd(playerIndex) {
    const player = this.players[playerIndex];

    if (player.hand.length === 0 && player.hasOpened) {
      // Round bitti! Bu oyuncu kazandı
      this.phase = 'roundEnd';
      this._calculateRoundScores(playerIndex);
      return true;
    }

    return false;
  }

  /**
   * Round sonu puan hesaplama.
   * Kazanan 0 puan alır, diğerleri ellerindeki taşların cezasını alır.
   *
   * @param {number} winnerIndex
   * @private
   */
  _calculateRoundScores(winnerIndex) {
    for (let i = 0; i < this.players.length; i++) {
      if (i === winnerIndex) {
        // Kazanan 0 ceza puanı alır (skor değişmez)
        continue;
      }

      const penalty = Validator.calculatePenalty(this.players[i].hand, this.okeyInfo);
      this.players[i].score += penalty;
    }
  }

  /**
   * Sırayı bir sonraki bağlı oyuncuya geçirir.
   * Bağlantısı kopmuş oyuncuları atlar.
   * @private
   */
  _advanceTurn() {
    const playerCount = this.players.length;
    let nextTurn = (this.currentTurn + 1) % playerCount;

    // Bağlı bir oyuncu bulana kadar atla (sonsuz döngüyü engelle)
    let attempts = 0;
    while (!this.players[nextTurn].connected && attempts < playerCount) {
      nextTurn = (nextTurn + 1) % playerCount;
      attempts++;
    }

    this.currentTurn = nextTurn;
    this.hasDrawnThisTurn = false;
  }

  /**
   * Oyuncunun "tur bitir" işlemi.
   * El açma/taş yatırma yaptıktan sonra sırayı devreder.
   *
   * @param {string} playerId
   * @returns {{ success: boolean, reason?: string, roundEnd?: boolean }}
   */
  finishTurn(playerId) {
    const playerIndex = this.getPlayerIndex(playerId);
    if (playerIndex === -1) {
      return { success: false, reason: 'Oyuncu bulunamadı.' };
    }

    if (!this.isPlayerTurn(playerId)) {
      return { success: false, reason: 'Sıra sizde değil.' };
    }

    // El bitti mi kontrol et
    const roundEnd = this.checkRoundEnd(playerIndex);

    if (!roundEnd) {
      this._advanceTurn();
    }

    return { success: true, roundEnd };
  }

  // ─────────────── Yeni Round ───────────────

  /**
   * Yeni round başlatır (skorları koruyarak).
   * @returns {{ success: boolean, reason?: string }}
   */
  startNewRound() {
    if (this.phase !== 'roundEnd') {
      return { success: false, reason: 'Round henüz bitmedi.' };
    }

    this.roundNumber++;

    // Oyuncu bilgilerini sıfırla (skorları koru)
    for (const player of this.players) {
      player.hand = [];
      player.openSets = [];
      player.hasOpened = false;
    }

    this.phase = 'waiting';

    // Oyunu yeniden başlat
    return this.startGame();
  }

  // ─────────────── Durum Sorgulama ───────────────

  /**
   * Belirli bir oyuncu için görünür oyun durumunu döndürür.
   * Diğer oyuncuların taşlarını göstermez (sadece taş sayısı).
   *
   * @param {string} playerId
   * @returns {object}
   */
  getPlayerState(playerId) {
    const playerIndex = this.getPlayerIndex(playerId);

    // Oyuncu listesi (herkes için görünür bilgiler)
    const playersInfo = this.players.map((p, i) => ({
      name: p.name,
      tileCount: p.hand.length,
      hasOpened: p.hasOpened,
      openSets: p.openSets,
      score: p.score,
      connected: p.connected,
      isCurrentTurn: i === this.currentTurn,
    }));

    return {
      roomCode: this.roomCode,
      phase: this.phase,
      roundNumber: this.roundNumber,
      currentTurn: this.currentTurn,
      myIndex: playerIndex,
      myHand: playerIndex !== -1 ? this.players[playerIndex].hand : [],
      myHasOpened: playerIndex !== -1 ? this.players[playerIndex].hasOpened : false,
      players: playersInfo,
      indicator: this.indicator,
      okeyInfo: this.okeyInfo,
      pileCount: this.pile.length,
      discardPiles: this.discardPiles.map(pile => ({
        topTile: pile.length > 0 ? pile[pile.length - 1] : null,
        count: pile.length
      })),
      hasDrawnThisTurn: this.hasDrawnThisTurn,
    };
  }

  /**
   * Oyuncu index'ini socket ID'ye göre bulur.
   * @param {string} playerId
   * @returns {number} -1 bulunamazsa
   */
  getPlayerIndex(playerId) {
    return this.players.findIndex((p) => p.id === playerId);
  }

  /**
   * Sıradaki oyuncuyu döndürür.
   * @returns {object}
   */
  getCurrentPlayer() {
    return this.players[this.currentTurn];
  }

  /**
   * Sıranın bu oyuncuda olup olmadığını kontrol eder.
   * @param {string} playerId
   * @returns {boolean}
   */
  isPlayerTurn(playerId) {
    return this.currentTurn === this.getPlayerIndex(playerId);
  }
}

module.exports = GameRoom;
