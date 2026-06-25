/**
 * TileSet.js
 * 101 Okey oyunu için taş seti yönetimi.
 * 106 taş: 4 renk × 13 sayı × 2 kopya + 2 sahte joker
 */

class TileSet {
  constructor() {
    /** @type {Array<{id: number, color: string|null, number: number, isFalseJoker: boolean}>} */
    this.tiles = [];
    this.createTiles();
  }

  /**
   * 106 taşı oluşturur.
   * - 4 renk (sarı, mavi, kırmızı, siyah) × 13 sayı × 2 kopya = 104 taş
   * - 2 sahte joker
   */
  createTiles() {
    const colors = ['yellow', 'blue', 'red', 'black'];
    let id = 0;

    // Her renk ve sayıdan 2 kopya oluştur
    for (let copy = 0; copy < 2; copy++) {
      for (const color of colors) {
        for (let number = 1; number <= 13; number++) {
          this.tiles.push({
            id: id++,
            color,
            number,
            isFalseJoker: false,
          });
        }
      }
    }

    // 2 sahte joker ekle
    for (let i = 0; i < 2; i++) {
      this.tiles.push({
        id: id++,
        color: null,
        number: 0,
        isFalseJoker: true,
      });
    }
  }

  /**
   * Fisher-Yates algoritmasıyla taşları karıştırır.
   * Kriptografik değil ama oyun için yeterince rastgele.
   */
  shuffle() {
    for (let i = this.tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tiles[i], this.tiles[j]] = [this.tiles[j], this.tiles[i]];
    }
  }

  /**
   * Gösterge taşını ve okey bilgisini belirler.
   * Gösterge (indicator): Yığından rastgele seçilen bir taş.
   * Okey: Gösterge ile aynı renk, bir sonraki sayı (13 → 1 döngüsü).
   *
   * NOT: Sahte joker gösterge olamaz; sahte joker çıkarsa tekrar seçilir.
   *
   * @param {Array} pile - Taşların çekileceği yığın
   * @returns {{ indicator: object, okeyInfo: { color: string, number: number } }}
   */
  determineIndicatorAndOkey(pile) {
    // Sahte joker olmayan bir taş seç
    let indicatorIndex = -1;
    let attempts = 0;
    const maxAttempts = pile.length;

    do {
      indicatorIndex = Math.floor(Math.random() * pile.length);
      attempts++;
    } while (pile[indicatorIndex].isFalseJoker && attempts < maxAttempts);

    // Göstergeyi yığından çıkar
    const indicator = pile.splice(indicatorIndex, 1)[0];

    // Okey: aynı renk, sayı + 1 (13 ise 1'e döner)
    const okeyNumber = indicator.number === 13 ? 1 : indicator.number + 1;
    const okeyInfo = {
      color: indicator.color,
      number: okeyNumber,
    };

    return { indicator, okeyInfo };
  }

  /**
   * Taşları oyunculara dağıtır.
   * - İlk oyuncu (index 0) 22 taş alır (oyuna başlar, çekmeden atar)
   * - Diğer oyuncular 21'er taş alır
   * - Kalan taşlar yığın (pile) olur
   *
   * @param {number} numPlayers - Oyuncu sayısı (2-4)
   * @returns {{ hands: Array<Array>, pile: Array, indicator: object, okeyInfo: object }}
   */
  dealTiles(numPlayers = 4) {
    if (numPlayers < 2 || numPlayers > 4) {
      throw new Error(`Geçersiz oyuncu sayısı: ${numPlayers}. 2-4 arası olmalı.`);
    }

    // Taşları karıştır
    this.shuffle();

    // Dağıtılacak taş havuzu (tiles'ın kopyası)
    const pile = [...this.tiles];

    // Gösterge ve okey belirle (pile'dan bir taş çıkarılır)
    const { indicator, okeyInfo } = this.determineIndicatorAndOkey(pile);

    // Elleri oluştur
    const hands = [];
    for (let i = 0; i < numPlayers; i++) {
      const handSize = i === 0 ? 22 : 21; // İlk oyuncu 22 taş alır
      const hand = pile.splice(0, handSize);
      hands.push(hand);
    }

    return {
      hands,
      pile,
      indicator,
      okeyInfo,
    };
  }
}

module.exports = TileSet;
