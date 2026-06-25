/* ═══════════════════════════════════════════════════
   app.js — Ana uygulama denetleyicisi
   ═══════════════════════════════════════════════════ */

class App {
  constructor() {
    // Socket.io bağlantısı
    this.socket = io();

    // Oyun durumu
    this.playerIndex = -1;
    this.currentTurn = -1;
    this.hand = [];
    this.players = [];
    this.okeyInfo = null;
    this.indicator = null;
    this.hasDrawn = false;
    this.hasOpened = false;
    this.pileCount = 0;
    this.discardPiles = null;
    this.openSets = {}; // playerIndex → [[tile,...], ...]

    // Alt modüller
    this.tileUI   = new TileUI(this);
    this.lobby    = new Lobby(this);
    this.renderer = new Renderer(this);

    // Socket olaylarını dinle
    this.setupSocketListeners();

    // Etkileşim olaylarını bağla
    this.tileUI.bindEvents();

    // Yeni el butonu
    document.getElementById('btn-new-round')?.addEventListener('click', () => {
      this.socket.emit('newRound');
      this.renderer.hideRoundEndModal();
    });

    // Bağlantı durumu
    this.socket.on('connect', () => {
      console.log('[Okey] Sunucuya bağlandı:', this.socket.id);
    });
    this.socket.on('disconnect', () => {
      this.showToast('Sunucu bağlantısı kesildi!', 'error');
    });
    this.socket.on('reconnect', () => {
      this.showToast('Sunucuya yeniden bağlanıldı.', 'success');
    });
  }

  /* ═══════════  SOCKET OLAY DİNLEYİCİLERİ  ═══════════ */
  setupSocketListeners() {

    /* ── Lobi Olayları ── */

    // Oda oluşturuldu
    this.socket.on('roomCreated', (data) => {
      this.lobby.showWaitingRoom(data.roomCode, [{ name: document.getElementById('player-name').value.trim() }], true);
      this.showToast('Oda oluşturuldu! Kodu paylaşarak arkadaşlarınızı davet edin.', 'success');
    });

    // Oyuncu katıldı (odadaki herkes bu olayı alır)
    this.socket.on('playerJoined', (data) => {
      this.lobby.updatePlayerList(data.players);

      // Bekleme odasında değilsek göster (yeni katılan oyuncu için)
      const waitingRoom = document.getElementById('waiting-room');
      const lobbyForm = document.getElementById('lobby-form');
      if (!lobbyForm.classList.contains('hidden')) {
        // Bu oyuncu henüz lobideyse — bekleme odasını aç
        const roomCodeText = document.getElementById('room-code-text')?.textContent;
        if (roomCodeText && roomCodeText !== '----') {
          // Zaten oda oluşturulmuş, sadece listeyi güncelle
        } else {
          // Yeni katılan oyuncu — oda kodunu bul ve bekleme odasını aç
          const code = document.getElementById('room-code-input')?.value?.trim()?.toUpperCase() || '—';
          this.lobby.showWaitingRoom(code, data.players, false);
        }
      }

      const newest = data.players[data.players.length - 1];
      if (newest) {
        this.showToast(`${newest.name} odaya katıldı!`, 'info');
      }
    });

    // Oyuncu ayrıldı
    this.socket.on('playerLeft', (data) => {
      this.lobby.updatePlayerList(data.players);
      this.players = data.players;
      this.showToast(`${data.leftPlayerName} oyundan ayrıldı.`, 'warning');

      // Oyun ekranındaysak rakip panellerini güncelle
      if (document.getElementById('game').classList.contains('active')) {
        this.renderer.renderOtherPlayers();
      }
    });

    /* ── Oyun Olayları ── */

    // Oyun başladı
    this.socket.on('gameStarted', (data) => {
      this.hand        = data.hand || [];
      this.indicator   = data.indicator?.tile || data.indicator || null;
      this.okeyInfo    = data.okeyInfo || null;
      this.currentTurn = data.currentTurn;
      this.playerIndex = data.playerIndex;
      this.players     = data.players || [];
      this.pileCount   = data.pileCount || 0;
      this.hasDrawn    = false;
      this.hasOpened   = false;
      this.discardPiles = data.discardPiles || [[], [], [], []];
      this.openSets    = {};

      // Oyuncu taş sayılarını ayarla
      this.players.forEach((p, idx) => {
        if (idx !== this.playerIndex) {
          p.tileCount = 14;
        }
      });

      // Ekranı değiştir
      this.showScreen('game');

      // Tam oyun tahtasını render et
      this.renderer.renderGameBoard();

      // Bildirim
      this.showToast('Oyun başladı! İyi eğlenceler! 🎮', 'success');

      if (this.currentTurn === this.playerIndex) {
        this.showToast('🎯 Sıra sizde! Taş çekin.', 'info');
      }
    });

    // Taş çekildi
    this.socket.on('tileDrawn', (data) => {
      if (data.tile) {
        this.hand.push(data.tile);
      }
      this.pileCount = data.pileCount;
      if (data.discardPiles) this.discardPiles = data.discardPiles;
      this.hasDrawn = true;

      this.renderer.animateTileDraw(data.tile);
      this.renderer.renderCenter();
      this.renderer.renderControls();

      this.showToast('Taş çekildi!', 'info');
    });

    // Taş atıldı
    this.socket.on('tileDiscarded', (data) => {
      const isMe = data.playerIndex === this.playerIndex;

      if (data.discardPiles) {
        this.discardPiles = data.discardPiles;
      }

      // Sıra güncelle
      if (data.nextTurn !== undefined) {
        this.currentTurn = data.nextTurn;
        this.hasDrawn = false;
      }

      // Deste sayısı
      if (data.pileCount !== undefined) {
        this.pileCount = data.pileCount;
      }

      // Kendi elimiz güncellendiyse
      if (data.hand) {
        this.hand = data.hand;
      } else if (isMe) {
        // El'den kaldır (sunucu el dönmediyse)
        const tileId = data.tile?.id;
        if (tileId) {
          this.hand = this.hand.filter(t => t.id !== tileId);
        }
      }

      // Rakip taş sayısını güncelle
      if (!isMe) {
        const discarderIdx = data.playerIndex;
        if (discarderIdx >= 0 && this.players[discarderIdx]) {
          this.players[discarderIdx].tileCount = Math.max(
            0,
            (this.players[discarderIdx].tileCount || 14) - 1
          );
        }
      }

      this.renderer.renderGameBoard();

      // Sıra bildirimi
      if (this.currentTurn === this.playerIndex) {
        this.showToast('🎯 Sıra sizde! Taş çekin.', 'info');
      }
    });

    // El açıldı
    this.socket.on('handOpened', (data) => {
      const pIdx = data.playerIndex;

      // Açık perleri kaydet
      if (!this.openSets[pIdx]) {
        this.openSets[pIdx] = [];
      }
      if (data.sets) {
        this.openSets[pIdx] = data.sets;
      }

      // Kendi elimiz güncellendiyse
      if (data.hand !== undefined) {
        this.hand = data.hand;
      }

      // Bu oyuncu el açtı mı?
      if (pIdx === this.playerIndex) {
        this.hasOpened = true;
        this.showToast('El açtınız! Artık pere taş ekleyebilirsiniz.', 'success');
      } else {
        const name = this.players[pIdx]?.name || `Oyuncu ${pIdx + 1}`;
        this.showToast(`${name} el açtı!`, 'info');
      }

      this.renderer.renderGameBoard();
    });

    // Taş işlendi (pere eklendi)
    this.socket.on('tileLaid', (data) => {
      const targetPIdx = data.targetPlayerIndex;
      const setIdx = data.targetSetIndex;

      // Güncel per'i güncelle
      if (this.openSets[targetPIdx] && data.updatedSet) {
        this.openSets[targetPIdx][setIdx] = data.updatedSet;
      }

      // El güncelleme
      if (data.hand !== undefined) {
        this.hand = data.hand;
      }

      this.renderer.renderGameBoard();

      if (data.playerIndex === this.playerIndex) {
        this.showToast('Taş pere eklendi!', 'success');
      }
    });

    // Sıra güncellendi
    this.socket.on('turnUpdate', (data) => {
      this.currentTurn = data.currentTurn;
      this.hasDrawn = data.hasDrawn || false;

      this.renderer.renderControls();
      this.renderer.updateTurnIndicator();
      this.renderer.renderOtherPlayers();

      if (this.currentTurn === this.playerIndex) {
        this.showToast('🎯 Sıra sizde!', 'info');
      }
    });

    // El sonu
    this.socket.on('roundEnd', (data) => {
      this.showToast(`🏆 El sona erdi! Kazanan: ${data.roundWinner}`, 'success');
      this.renderer.showRoundEndModal(data.scores, data.roundWinner);

      // Durumu sıfırla
      this.hasDrawn = false;
      this.hasOpened = false;
      this.discardTop = null;
      this.openSets = {};
      this.tileUI.clearSelection();
      this.tileUI.hideStagingArea();
    });

    // Hata
    this.socket.on('error', (data) => {
      const msg = data?.message || 'Bilinmeyen bir hata oluştu.';
      this.showToast(`❌ ${msg}`, 'error');
      console.error('[Okey] Sunucu hatası:', msg);
    });
  }

  /* ═══════════  EKRAN GEÇİŞİ  ═══════════ */
  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active');
    });
    const target = document.getElementById(screenId);
    if (target) {
      target.classList.add('active');
    }
  }

  /* ═══════════  TOAST BİLDİRİMLERİ  ═══════════ */
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    // İkon
    const icons = {
      info: 'ℹ️',
      success: '✅',
      error: '❌',
      warning: '⚠️'
    };
    toast.textContent = `${icons[type] || ''} ${message}`;

    container.appendChild(toast);

    // 4 saniye sonra kaldır
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 4000);

    // Maksimum 5 toast görünsün
    while (container.children.length > 5) {
      container.removeChild(container.firstChild);
    }
  }
}

/* ═══════════  BAŞLATMA  ═══════════ */
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
