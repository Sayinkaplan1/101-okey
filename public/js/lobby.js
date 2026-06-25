/* ═══════════════════════════════════════════════════
   lobby.js — Lobi UI denetleyicisi
   ═══════════════════════════════════════════════════ */

class Lobby {
  constructor(app) {
    this.app = app;
    this.isHost = false;
    this.roomCode = null;

    // DOM referansları
    this.lobbyForm    = document.getElementById('lobby-form');
    this.waitingRoom  = document.getElementById('waiting-room');
    this.joinSection  = document.getElementById('join-section');

    this.playerNameInput = document.getElementById('player-name');
    this.roomCodeInput   = document.getElementById('room-code-input');

    this.btnCreate   = document.getElementById('btn-create-room');
    this.btnShowJoin = document.getElementById('btn-show-join');
    this.btnJoin     = document.getElementById('btn-join-room');
    this.btnStart    = document.getElementById('btn-start-game');
    this.btnCopyCode = document.getElementById('btn-copy-code');

    this.roomCodeText    = document.getElementById('room-code-text');
    this.playerList      = document.getElementById('player-list');
    this.playerCountBadge = document.getElementById('player-count-badge');
    this.waitingHint     = document.getElementById('waiting-hint');

    this._bindEvents();
  }

  _bindEvents() {
    // Oda oluştur
    this.btnCreate.addEventListener('click', () => this._handleCreateRoom());

    // Katılma bölümünü göster/gizle
    this.btnShowJoin.addEventListener('click', () => this.showJoinOptions());

    // Odaya katıl
    this.btnJoin.addEventListener('click', () => this._handleJoinRoom());

    // Oyunu başlat (ev sahibi)
    this.btnStart.addEventListener('click', () => this._handleStartGame());

    // Oda kodunu kopyala
    this.btnCopyCode.addEventListener('click', () => this._copyRoomCode());

    // Enter tuşu ile hızlı işlem
    this.playerNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.btnCreate.click();
    });
    this.roomCodeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.btnJoin.click();
    });
  }

  /* ── Oda Oluştur ── */
  _handleCreateRoom() {
    const name = this._getPlayerName();
    if (!name) return;

    this.isHost = true;
    this.app.socket.emit('createRoom', { playerName: name });
  }

  /* ── Katılma seçeneklerini göster ── */
  showJoinOptions() {
    this.joinSection.classList.toggle('hidden');
    if (!this.joinSection.classList.contains('hidden')) {
      this.roomCodeInput.focus();
    }
  }

  /* ── Odaya Katıl ── */
  _handleJoinRoom() {
    const name = this._getPlayerName();
    if (!name) return;

    const code = this.roomCodeInput.value.trim().toUpperCase();
    if (!code) {
      this.app.showToast('Lütfen oda kodunu girin.', 'warning');
      this.roomCodeInput.focus();
      return;
    }

    this.isHost = false;
    this.app.socket.emit('joinRoom', { roomCode: code, playerName: name });
  }

  /* ── Oyunu Başlat ── */
  _handleStartGame() {
    this.app.socket.emit('startGame', {});
  }

  /* ── Bekleme odasını göster ── */
  showWaitingRoom(roomCode, players, isHost) {
    this.roomCode = roomCode;
    this.isHost = isHost;

    // Form'u gizle, bekleme odasını göster
    this.lobbyForm.classList.add('hidden');
    this.waitingRoom.classList.remove('hidden');

    // Oda kodu
    this.roomCodeText.textContent = roomCode;

    // Oyuncu listesi
    this.updatePlayerList(players);

    // Ev sahibi ise başlat butonunu göster
    if (isHost) {
      this.btnStart.classList.remove('hidden');
      this.waitingHint.textContent = 'Tüm oyuncular katıldığında oyunu başlatabilirsiniz.';
    } else {
      this.btnStart.classList.add('hidden');
      this.waitingHint.textContent = 'Ev sahibi oyunu başlatmayı bekliyor…';
    }
  }

  /* ── Oyuncu listesini güncelle ── */
  updatePlayerList(players) {
    this.playerList.innerHTML = '';
    this.playerCountBadge.textContent = `${players.length}/4`;

    players.forEach((player, idx) => {
      const li = document.createElement('li');

      const dot = document.createElement('span');
      dot.className = 'player-dot';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = player.name;

      li.appendChild(dot);
      li.appendChild(nameSpan);

      // İlk oyuncu = ev sahibi
      if (idx === 0) {
        const hostBadge = document.createElement('span');
        hostBadge.className = 'host-badge';
        hostBadge.textContent = '👑 Ev Sahibi';
        li.appendChild(hostBadge);
      }

      this.playerList.appendChild(li);
    });

    // 4 oyuncu varsa ve ev sahibi isek butonu aktif yap
    if (this.isHost) {
      this.btnStart.disabled = players.length < 2; // En az 2 oyuncu gerekli
    }
  }

  /* ── Oda kodunu panoya kopyala ── */
  _copyRoomCode() {
    if (!this.roomCode) return;

    navigator.clipboard.writeText(this.roomCode).then(() => {
      this.app.showToast('Oda kodu kopyalandı! 📋', 'success');
      this.btnCopyCode.textContent = '✓';
      setTimeout(() => {
        this.btnCopyCode.textContent = '📋';
      }, 2000);
    }).catch(() => {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = this.roomCode;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      this.app.showToast('Oda kodu kopyalandı!', 'success');
    });
  }

  /* ── Oyuncu adını doğrula ── */
  _getPlayerName() {
    const name = this.playerNameInput.value.trim();
    if (!name) {
      this.app.showToast('Lütfen oyuncu adınızı girin.', 'warning');
      this.playerNameInput.focus();
      return null;
    }
    if (name.length < 2) {
      this.app.showToast('İsim en az 2 karakter olmalıdır.', 'warning');
      this.playerNameInput.focus();
      return null;
    }
    return name;
  }
}
