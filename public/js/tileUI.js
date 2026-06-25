/* ═══════════════════════════════════════════════════
   tileUI.js — Taş etkileşim yöneticisi
   ═══════════════════════════════════════════════════ */

class TileUI {
  constructor(app) {
    this.app = app;
    this.selectedTiles = new Set(); // Seçili taş ID'leri
    this.stagedSets = [];           // Per hazırlık alanındaki gruplar [[tileId,...], ...]
    this.stagingVisible = false;
  }

  /* ── Taş seçimi aç/kapa ── */
  toggleTileSelection(tileId) {
    if (this.selectedTiles.has(tileId)) {
      this.selectedTiles.delete(tileId);
    } else {
      this.selectedTiles.add(tileId);
    }
    this._updateTileSelectionUI();
  }

  clearSelection() {
    this.selectedTiles.clear();
    this._updateTileSelectionUI();
  }

  getSelectedTiles() {
    return [...this.selectedTiles];
  }

  /* Seçim durumunu DOM'a yansıt */
  _updateTileSelectionUI() {
    const rack = document.getElementById('tile-rack');
    if (!rack) return;
    rack.querySelectorAll('.tile').forEach(el => {
      const id = parseInt(el.dataset.tileId, 10);
      if (this.selectedTiles.has(id)) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    });
    // Ayrıca kontrol butonlarını güncelle
    this.app.renderer.renderControls();
  }

  /* ── Taş çekme ── */
  drawTile(source) {
    if (this.app.currentTurn !== this.app.playerIndex) {
      this.app.showToast('Sıra sizde değil!', 'warning');
      return;
    }
    if (this.app.hasDrawn) {
      this.app.showToast('Bu turda zaten taş çektiniz.', 'warning');
      return;
    }
    this.app.socket.emit('drawTile', { source });
  }

  /* ── Taş atma ── */
  discardTile() {
    const selected = this.getSelectedTiles();
    if (selected.length !== 1) {
      this.app.showToast('Lütfen atmak için tam olarak 1 taş seçin.', 'warning');
      return;
    }
    // tile ID'yi string olarak gönder
    this.app.socket.emit('discardTile', { tileId: selected[0] });
    this.clearSelection();
  }

  /* ── Per hazırlık sistemi ── */
  showStagingArea() {
    this.stagingVisible = true;
    const area = document.getElementById('staging-area');
    area.classList.remove('hidden');
    this._renderStagedSets();
  }

  hideStagingArea() {
    this.stagingVisible = false;
    const area = document.getElementById('staging-area');
    area.classList.add('hidden');
    this.stagedSets = [];
    this._renderStagedSets();
  }

  /* Seçili taşları yeni bir per olarak ekle */
  addStagedSet() {
    const selected = this.getSelectedTiles();
    if (selected.length < 3) {
      this.app.showToast('Bir per en az 3 taştan oluşmalıdır.', 'warning');
      return;
    }
    this.stagedSets.push([...selected]);
    this.clearSelection();
    this._renderStagedSets();
    this.app.showToast(`Per eklendi! (${selected.length} taş)`, 'success');
  }

  /* Belirli bir peri kaldır */
  removeStagedSet(index) {
    this.stagedSets.splice(index, 1);
    this._renderStagedSets();
  }

  /* Tüm hazırlık perlerini temizle */
  clearStaging() {
    this.stagedSets = [];
    this._renderStagedSets();
  }

  /* Per hazırlık alanını render et */
  _renderStagedSets() {
    const container = document.getElementById('staged-sets');
    if (!container) return;
    container.innerHTML = '';

    if (this.stagedSets.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; color:var(--text-muted); padding:12px; font-size:0.85rem;">
          Taşları seçip "＋ Per Ekle" butonuna basarak per oluşturun
        </div>`;
      return;
    }

    this.stagedSets.forEach((set, idx) => {
      const setEl = document.createElement('div');
      setEl.className = 'staged-set';

      const label = document.createElement('span');
      label.className = 'staged-set-label';
      label.textContent = `Per ${idx + 1}`;

      const tilesContainer = document.createElement('div');
      tilesContainer.className = 'staged-set-tiles';

      set.forEach(tileId => {
        const tile = this.app.hand.find(t => t.id === tileId);
        if (tile) {
          const el = this.app.renderer.createMiniTile(tile);
          tilesContainer.appendChild(el);
        }
      });

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-remove-set';
      removeBtn.textContent = '✕';
      removeBtn.title = 'Bu peri kaldır';
      removeBtn.addEventListener('click', () => this.removeStagedSet(idx));

      setEl.appendChild(label);
      setEl.appendChild(tilesContainer);
      setEl.appendChild(removeBtn);
      container.appendChild(setEl);
    });
  }

  /* El aç — tüm hazırlanan perleri sunucuya gönder */
  submitOpenHand() {
    if (this.stagedSets.length === 0) {
      this.app.showToast('Önce en az bir per oluşturun!', 'warning');
      return;
    }
    this.app.socket.emit('openHand', { sets: this.stagedSets });
    this.hideStagingArea();
  }

  /* ── İşle — Açık pere taş ekleme ── */
  layTile() {
    const selected = this.getSelectedTiles();
    if (selected.length === 0) {
      this.app.showToast('Lütfen işlemek istediğiniz taşları seçin.', 'warning');
      return;
    }
    // Hedef per seçim modalını göster
    this._showLayTargetModal(selected);
  }

  _showLayTargetModal(tileIds) {
    const modal = document.getElementById('lay-tile-modal');
    const body = document.getElementById('lay-targets');
    body.innerHTML = '';

    let hasTargets = false;

    // Tüm oyuncuların açık perlerini listele
    for (const [pIdx, sets] of Object.entries(this.app.openSets)) {
      const playerIndex = parseInt(pIdx);
      const playerName = this.app.players[playerIndex]
        ? this.app.players[playerIndex].name
        : `Oyuncu ${playerIndex + 1}`;

      sets.forEach((set, setIdx) => {
        hasTargets = true;
        const item = document.createElement('div');
        item.className = 'lay-target-item';

        const nameEl = document.createElement('span');
        nameEl.className = 'lay-target-player';
        nameEl.textContent = playerName;

        const setPreview = document.createElement('div');
        setPreview.className = 'lay-target-set';
        set.forEach(tile => {
          setPreview.appendChild(this.app.renderer.createMiniTile(tile));
        });

        item.appendChild(nameEl);
        item.appendChild(setPreview);

        item.addEventListener('click', () => {
          this.app.socket.emit('layTile', {
            tileIds: tileIds,
            targetPlayerIndex: playerIndex,
            targetSetIndex: setIdx
          });
          this.clearSelection();
          modal.classList.add('hidden');
        });

        body.appendChild(item);
      });
    }

    if (!hasTargets) {
      body.innerHTML = `
        <div style="text-align:center; color:var(--text-muted); padding:24px;">
          Henüz açık per bulunmuyor.
        </div>`;
    }

    modal.classList.remove('hidden');
  }

  /* ── Sırayı Bitir ── */
  finishTurn() {
    this.app.socket.emit('finishTurn');
  }

  /* ── Sıralama (yalnızca istemci tarafı) ── */
  sortHand(by) {
    if (!this.app.hand || this.app.hand.length === 0) return;

    const colorOrder = { red: 0, yellow: 1, blue: 2, black: 3 };

    if (by === 'color') {
      this.app.hand.sort((a, b) => {
        const cA = colorOrder[a.color] ?? 4;
        const cB = colorOrder[b.color] ?? 4;
        if (cA !== cB) return cA - cB;
        return a.number - b.number;
      });
    } else if (by === 'number') {
      this.app.hand.sort((a, b) => {
        if (a.number !== b.number) return a.number - b.number;
        const cA = colorOrder[a.color] ?? 4;
        const cB = colorOrder[b.color] ?? 4;
        return cA - cB;
      });
    }

    this.app.renderer.renderHand();
    this.app.showToast(
      by === 'color' ? 'Taşlar renge göre sıralandı' : 'Taşlar sayıya göre sıralandı',
      'info'
    );
  }

  /* ── Olay bağlayıcıları ── */
  bindEvents() {
    // Taş çekme
    document.getElementById('btn-draw-pile')?.addEventListener('click', () => {
      this.drawTile('pile');
    });
    document.getElementById('btn-draw-discard')?.addEventListener('click', () => {
      this.drawTile('discard');
    });
    // Çekme destesine tıklama
    document.getElementById('draw-pile')?.addEventListener('click', () => {
      if (this.app.currentTurn === this.app.playerIndex && !this.app.hasDrawn) {
        this.drawTile('pile');
      }
    });
    // Atma destesine tıklama (Sadece solumuzdaki desteden çekebiliriz)
    document.getElementById('discard-pile-3')?.addEventListener('click', () => {
      if (this.app.currentTurn === this.app.playerIndex && !this.app.hasDrawn) {
        this.drawTile('discard');
      }
    });

    // Taş atma
    document.getElementById('btn-discard')?.addEventListener('click', () => {
      this.discardTile();
    });

    // El aç — Hazırlık alanını aç/kapa toggle
    document.getElementById('btn-open-hand')?.addEventListener('click', () => {
      if (this.stagingVisible) {
        this.hideStagingArea();
      } else {
        this.showStagingArea();
      }
    });

    // Per Ekle butonu
    document.getElementById('btn-add-set')?.addEventListener('click', () => {
      this.addStagedSet();
    });

    // Hazırlığı Temizle
    document.getElementById('btn-clear-staging')?.addEventListener('click', () => {
      this.clearStaging();
      this.app.showToast('Per hazırlığı temizlendi.', 'info');
    });

    // Perleri Onayla ve El Aç
    document.getElementById('btn-submit-open')?.addEventListener('click', () => {
      this.submitOpenHand();
    });

    // İşle
    document.getElementById('btn-lay-tile')?.addEventListener('click', () => {
      this.layTile();
    });

    // Sırayı Bitir
    document.getElementById('btn-finish-turn')?.addEventListener('click', () => {
      this.finishTurn();
    });

    // Sıralama butonları
    document.getElementById('btn-sort-color')?.addEventListener('click', () => {
      this.sortHand('color');
    });
    document.getElementById('btn-sort-number')?.addEventListener('click', () => {
      this.sortHand('number');
    });

    // İşle modalını kapatma
    document.getElementById('btn-close-lay-modal')?.addEventListener('click', () => {
      document.getElementById('lay-tile-modal').classList.add('hidden');
    });
  }
}
