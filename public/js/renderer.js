/* ═══════════════════════════════════════════════════
   renderer.js — Oyun alanı render motoru
   ═══════════════════════════════════════════════════ */

class Renderer {
  constructor(app) {
    this.app = app;

    // DOM referansları
    this.tileRack     = document.getElementById('tile-rack');
    this.pileCountEl  = document.getElementById('pile-count');
    this.indicatorEl  = document.getElementById('indicator-tile');
    this.okeyInfoEl   = document.getElementById('okey-info-tile');
    this.discardTopEl = document.getElementById('discard-top');
    this.turnTextEl   = document.getElementById('turn-text');
    this.myOpenSetsEl = document.getElementById('my-open-sets');

    // Rakip panelleri — index sırasına göre eşleme
    this.opponentSlots = [
      document.getElementById('opponent-left'),
      document.getElementById('opponent-top'),
      document.getElementById('opponent-right')
    ];
  }

  /* ═══════════  ANA RENDER  ═══════════ */
  renderGameBoard() {
    this.renderOtherPlayers();
    this.renderCenter();
    this.renderHand();
    this.renderControls();
    this.updateTurnIndicator();
    this.renderMyOpenSets();
  }

  /* ═══════════  OYUNCUNUN ELİ  ═══════════ */
  renderHand() {
    if (!this.tileRack) return;
    this.tileRack.innerHTML = '';

    if (!this.app.hand || this.app.hand.length === 0) {
      this.tileRack.innerHTML = `
        <div style="color: var(--text-muted); padding: 20px; font-size: 0.9rem; width:100%; text-align:center;">
          Elinizde taş yok
        </div>`;
      return;
    }

    this.app.hand.forEach((tile, idx) => {
      const el = this.createTileElement(tile);
      el.style.animationDelay = `${idx * 0.04}s`;

      // Seçili durumu (tile.id is number)
      if (this.app.tileUI.selectedTiles.has(tile.id)) {
        el.classList.add('selected');
      }

      // Tıklama — seçim aç/kapa (tile.id is number)
      el.addEventListener('click', () => {
        this.app.tileUI.toggleTileSelection(tile.id);
      });

      this.tileRack.appendChild(el);
    });
  }

  /* ═══════════  DİĞER OYUNCULAR  ═══════════ */
  renderOtherPlayers() {
    // Kendi index'imiz hariç diğer oyuncuları slot'lara yerleştir
    const myIdx = this.app.playerIndex;
    const count = this.app.players.length;
    let slotIdx = 0;

    // Önce tüm slotları temizle
    this.opponentSlots.forEach(slot => {
      slot.querySelector('.op-name').textContent = '—';
      slot.querySelector('.op-tile-count').textContent = '0';
      slot.querySelector('.op-tiles').innerHTML = '';
      slot.querySelector('.op-open-sets').innerHTML = '';
      slot.classList.remove('is-turn');
    });

    for (let i = 0; i < count; i++) {
      if (i === myIdx) continue;
      if (slotIdx >= 3) break;

      const player = this.app.players[i];
      const slot = this.opponentSlots[slotIdx];

      if (!slot || !player) {
        slotIdx++;
        continue;
      }

      // İsim ve taş sayısı
      slot.querySelector('.op-name').textContent = player.name || `Oyuncu ${i + 1}`;

      // Taş sayısını hesapla (eğer hand bilgisi yoksa tahmini)
      const tileCount = player.tileCount || 14;
      slot.querySelector('.op-tile-count').textContent = tileCount;

      // Sıra bu oyuncuda mı
      if (this.app.currentTurn === i) {
        slot.classList.add('is-turn');
      } else {
        slot.classList.remove('is-turn');
      }

      // Yüzü kapalı taşlar (maksimum 15 göster, kompakt)
      const tilesContainer = slot.querySelector('.op-tiles');
      tilesContainer.innerHTML = '';
      const showCount = Math.min(tileCount, 18);
      for (let t = 0; t < showCount; t++) {
        const miniBack = document.createElement('div');
        miniBack.className = 'mini-tile-back';
        tilesContainer.appendChild(miniBack);
      }

      // Açık perler
      const openSetsContainer = slot.querySelector('.op-open-sets');
      openSetsContainer.innerHTML = '';
      const sets = this.app.openSets[i];
      if (sets && sets.length > 0) {
        sets.forEach(set => {
          const groupEl = document.createElement('div');
          groupEl.className = 'open-set-group';
          set.forEach(tile => {
            groupEl.appendChild(this.createMiniTile(tile));
          });
          openSetsContainer.appendChild(groupEl);
        });
      }

      slotIdx++;
    }
  }

  /* ═══════════  MASA MERKEZİ  ═══════════ */
  renderCenter() {
    // Deste sayısı
    this.pileCountEl.textContent = this.app.pileCount || 0;

    // Gösterge taşı
    this.indicatorEl.innerHTML = '';
    if (this.app.indicator) {
      const indTile = this.createTileElement(this.app.indicator);
      indTile.style.cursor = 'default';
      indTile.classList.add('indicator');
      this.indicatorEl.appendChild(indTile);
    }

    // Okey bilgisi
    this.okeyInfoEl.innerHTML = '';
    if (this.app.okeyInfo) {
      const okeyDisplay = this.createTileElement({
        id: '__okey_display__',
        color: this.app.okeyInfo.color,
        number: this.app.okeyInfo.number,
        isFalseJoker: false
      });
      okeyDisplay.classList.add('is-okey');
      okeyDisplay.style.cursor = 'default';
      this.okeyInfoEl.appendChild(okeyDisplay);
    }

    // Atılan taş (en üstteki)
    this.discardTopEl.innerHTML = '';
    if (this.app.discardTop) {
      const discardEl = this.createTileElement(this.app.discardTop);
      discardEl.style.cursor = 'pointer';
      this.discardTopEl.appendChild(discardEl);
      this.discardTopEl.style.border = 'none';
    } else {
      const emptySpan = document.createElement('span');
      emptySpan.className = 'discard-empty';
      emptySpan.textContent = 'Boş';
      this.discardTopEl.appendChild(emptySpan);
      this.discardTopEl.style.border = '2px dashed rgba(255, 255, 255, 0.15)';
    }
  }

  /* ═══════════  KONTROLLER  ═══════════ */
  renderControls() {
    const isMyTurn = this.app.currentTurn === this.app.playerIndex;
    const hasDrawn = this.app.hasDrawn;
    const selectedCount = this.app.tileUI.selectedTiles.size;
    const hasOpened = this.app.hasOpened;

    // Taş Çek butonları — sıram ve henüz çekmemişsem aktif
    const drawPileBtn = document.getElementById('btn-draw-pile');
    const drawDiscardBtn = document.getElementById('btn-draw-discard');
    drawPileBtn.disabled = !(isMyTurn && !hasDrawn);
    drawDiscardBtn.disabled = !(isMyTurn && !hasDrawn && this.app.discardTop);

    // Taş At — sıram, çekmiş olmalıyım, 1 taş seçili olmalı
    const discardBtn = document.getElementById('btn-discard');
    discardBtn.disabled = !(isMyTurn && hasDrawn && selectedCount === 1);

    // El Aç — sıram ve çekmiş olmalıyım
    const openHandBtn = document.getElementById('btn-open-hand');
    openHandBtn.disabled = !(isMyTurn && hasDrawn);

    // İşle — sıram, açık per olmalı, taş seçili olmalı ve el açmış olmam lazım
    const layTileBtn = document.getElementById('btn-lay-tile');
    const hasAnyOpenSets = Object.values(this.app.openSets).some(sets => sets && sets.length > 0);
    layTileBtn.disabled = !(isMyTurn && hasDrawn && selectedCount > 0 && hasAnyOpenSets && hasOpened);

    // Sırayı Bitir — sıram ve çekmiş olmalıyım
    const finishBtn = document.getElementById('btn-finish-turn');
    finishBtn.disabled = !(isMyTurn && hasDrawn);
  }

  /* ═══════════  AÇIK PERLERİM  ═══════════ */
  renderMyOpenSets() {
    if (!this.myOpenSetsEl) return;
    this.myOpenSetsEl.innerHTML = '';

    const mySets = this.app.openSets[this.app.playerIndex];
    if (!mySets || mySets.length === 0) return;

    mySets.forEach((set, idx) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'open-set-group';
      groupEl.title = `Per ${idx + 1}`;
      set.forEach(tile => {
        groupEl.appendChild(this.createMiniTile(tile));
      });
      this.myOpenSetsEl.appendChild(groupEl);
    });
  }

  /* ═══════════  TAŞ ELEMANI OLUŞTUR  ═══════════ */
  createTileElement(tile, faceDown = false) {
    const el = document.createElement('div');
    el.className = 'tile';
    el.dataset.tileId = tile.id;

    if (faceDown) {
      el.classList.add('face-down');
      return el;
    }

    // Renk sınıfı
    el.classList.add(`c-${tile.color}`);

    // Okey (joker) kontrolü
    if (this.app.okeyInfo &&
        tile.color === this.app.okeyInfo.color &&
        tile.number === this.app.okeyInfo.number) {
      el.classList.add('is-okey');
    }

    // Sahte joker yıldız işareti
    if (tile.isFalseJoker) {
      const star = document.createElement('span');
      star.className = 'false-joker-star';
      star.textContent = '★';
      el.appendChild(star);
    }

    // Numara
    const numEl = document.createElement('span');
    numEl.className = 'tile-number';
    numEl.textContent = tile.isFalseJoker ? '★' : tile.number;
    el.appendChild(numEl);

    // Alt nokta (renk belirteci)
    const dot = document.createElement('span');
    dot.className = 'tile-dot';
    el.appendChild(dot);

    return el;
  }

  /* ═══════════  MİNİ TAŞ (Açık perler, hazırlık alanı) ═══════════ */
  createMiniTile(tile) {
    const el = document.createElement('div');
    el.className = 'mini-tile';
    el.classList.add(`c-${tile.color}`);

    if (this.app.okeyInfo &&
        tile.color === this.app.okeyInfo.color &&
        tile.number === this.app.okeyInfo.number) {
      el.classList.add('is-okey');
    }

    el.textContent = tile.isFalseJoker ? '★' : tile.number;
    return el;
  }

  /* ═══════════  ANİMASYONLAR  ═══════════ */
  animateTileDraw(tile) {
    // El yeniden render edildiğinde son taş animasyonlu görünür
    this.renderHand();

    // Son eklenen taşa animasyon ekle
    const lastTile = this.tileRack.lastElementChild;
    if (lastTile && lastTile.classList.contains('tile')) {
      lastTile.classList.add('tile-draw-anim');
      lastTile.addEventListener('animationend', () => {
        lastTile.classList.remove('tile-draw-anim');
      }, { once: true });
    }
  }

  animateTileDiscard(tileId) {
    // Atılan taşı bul ve animasyon uygula
    const el = this.tileRack.querySelector(`[data-tile-id="${tileId}"]`);
    if (el) {
      el.classList.add('tile-discard-anim');
      el.addEventListener('animationend', () => {
        this.renderHand();
      }, { once: true });
    } else {
      this.renderHand();
    }
  }

  /* ═══════════  SIRA GÖSTERGESİ  ═══════════ */
  updateTurnIndicator() {
    const current = this.app.currentTurn;
    const isMyTurn = current === this.app.playerIndex;

    if (current < 0 || !this.app.players[current]) {
      this.turnTextEl.textContent = '—';
      return;
    }

    if (isMyTurn) {
      this.turnTextEl.textContent = '🎯 Sıra Sizde!';
      this.turnTextEl.style.color = 'var(--accent-gold)';
    } else {
      const name = this.app.players[current].name || `Oyuncu ${current + 1}`;
      this.turnTextEl.textContent = `⏳ ${name}`;
      this.turnTextEl.style.color = 'var(--text-primary)';
    }
  }

  /* ═══════════  EL SONU MODALI  ═══════════ */
  showRoundEndModal(scores, winner) {
    const modal = document.getElementById('round-end-modal');
    const winnerEl = document.getElementById('modal-winner');
    const tbody = document.getElementById('score-tbody');

    winnerEl.textContent = `🎉 Kazanan: ${winner}`;

    tbody.innerHTML = '';
    scores.forEach(s => {
      const tr = document.createElement('tr');
      if (s.name === winner) {
        tr.classList.add('winner');
      }

      const tdName = document.createElement('td');
      tdName.textContent = s.name;

      const tdRound = document.createElement('td');
      tdRound.textContent = s.roundPenalty !== undefined ? s.roundPenalty : '—';

      const tdTotal = document.createElement('td');
      tdTotal.textContent = s.totalScore !== undefined ? s.totalScore : '—';

      tr.appendChild(tdName);
      tr.appendChild(tdRound);
      tr.appendChild(tdTotal);
      tbody.appendChild(tr);
    });

    modal.classList.remove('hidden');
  }

  hideRoundEndModal() {
    document.getElementById('round-end-modal').classList.add('hidden');
  }

  /* ═══════════  AÇIK PERLERİ RENDER ET (herhangi bir oyuncu) ═══════════ */
  renderOpenSets(playerIndex, sets) {
    this.app.openSets[playerIndex] = sets;

    // Kendi perlerimizi güncelle
    if (playerIndex === this.app.playerIndex) {
      this.renderMyOpenSets();
    }

    // Rakip panellerini güncelle
    this.renderOtherPlayers();
  }
}
