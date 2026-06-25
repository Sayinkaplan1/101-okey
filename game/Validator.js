/**
 * Validator.js
 * 101 Okey oyununda geçerli seri/grup kontrolü ve puan hesaplama.
 *
 * Terimler:
 * - Seri (Run):  Aynı renk, ardışık sayılar, en az 3 taş
 * - Grup (Group): Aynı sayı, farklı renkler, en az 3, en fazla 4 taş
 * - Okey: Joker gibi her taşın yerine geçebilir
 * - Sahte Joker: Okey olmayan ama joker olarak kullanılabilen özel taş
 */

class Validator {
  /**
   * Bir taşın okey olup olmadığını kontrol eder.
   * Okey = göstergenin aynı renk, bir sonraki sayısı olan taş.
   *
   * @param {object} tile
   * @param {{ color: string, number: number }} okeyInfo
   * @returns {boolean}
   */
  static isOkey(tile, okeyInfo) {
    if (tile.isFalseJoker) return false;
    return tile.color === okeyInfo.color && tile.number === okeyInfo.number;
  }

  /**
   * Taşı joker (wildcard) olarak mı kullanılıyor kontrol eder.
   * Sahte jokerler ve okey taşları wildcard olarak kullanılabilir.
   *
   * @param {object} tile
   * @param {{ color: string, number: number }} okeyInfo
   * @returns {boolean}
   */
  static isWildcard(tile, okeyInfo) {
    return tile.isFalseJoker || this.isOkey(tile, okeyInfo);
  }

  /**
   * Seri kontrolü: Aynı renk, ardışık sayılar, en az 3 taş.
   * Wildcard taşlar eksik pozisyonları doldurabilir.
   *
   * Algoritma:
   * 1. Normal taşları ve wildcard'ları ayır
   * 2. Normal taşların hepsinin aynı renkte olduğunu kontrol et
   * 3. Ardışık sıralama oluşturulabiliyor mu kontrol et
   *
   * @param {Array} tiles
   * @param {{ color: string, number: number }} okeyInfo
   * @returns {boolean}
   */
  static isRun(tiles, okeyInfo) {
    if (!tiles || tiles.length < 3) return false;

    const wildcards = [];
    const normals = [];

    for (const tile of tiles) {
      if (this.isWildcard(tile, okeyInfo)) {
        wildcards.push(tile);
      } else {
        normals.push(tile);
      }
    }

    // Sadece wildcard'lardan oluşan setler geçersiz (hangi seriyi temsil ettiği belirsiz)
    if (normals.length === 0) return false;

    // Tüm normal taşlar aynı renkte olmalı
    const color = normals[0].color;
    if (!normals.every((t) => t.color === color)) return false;

    // Normal taşlarda tekrar eden sayı olmamalı
    const numbers = normals.map((t) => t.number).sort((a, b) => a - b);
    for (let i = 1; i < numbers.length; i++) {
      if (numbers[i] === numbers[i - 1]) return false;
    }

    // Ardışık sıra oluşturulabilir mi kontrol et
    // En küçük ile en büyük arasındaki boşlukları wildcard'larla doldurmayı dene
    const minNum = numbers[0];
    const maxNum = numbers[numbers.length - 1];

    // Toplam taş sayısı sıra uzunluğuyla eşleşmeli
    // Sıra uzunluğu = maxNum - minNum + 1 olmalı (en az)
    // Ama wildcard'lar uçlara da eklenebilir

    // En iyi yaklaşım: tüm olası başlangıç pozisyonlarını dene
    const totalTiles = tiles.length;

    // Olası başlangıç: minNum'dan wildcardCount kadar geri gidebilir
    // Olası bitiş:   maxNum'dan wildcardCount kadar ileri gidebilir
    // Sayılar 1-13 arası olmalı

    let wildcardsAvailable = wildcards.length;

    for (let start = Math.max(1, minNum - wildcardsAvailable); start <= minNum; start++) {
      const end = start + totalTiles - 1;

      // 13'ü aşamaz
      if (end > 13) continue;

      // Bu aralıkta tüm sayılar karşılanıyor mu kontrol et
      let wildcardsNeeded = 0;
      let valid = true;

      for (let n = start; n <= end; n++) {
        if (!numbers.includes(n)) {
          wildcardsNeeded++;
        }
      }

      // Tüm normal taşlar bu aralıkta olmalı
      if (!numbers.every((n) => n >= start && n <= end)) continue;

      if (wildcardsNeeded === wildcardsAvailable) {
        return true;
      }
    }

    return false;
  }

  /**
   * Grup kontrolü: Aynı sayı, farklı renkler, en az 3, en fazla 4 taş.
   * Wildcard taşlar eksik renkleri doldurabilir.
   *
   * @param {Array} tiles
   * @param {{ color: string, number: number }} okeyInfo
   * @returns {boolean}
   */
  static isGroup(tiles, okeyInfo) {
    if (!tiles || tiles.length < 3 || tiles.length > 4) return false;

    const wildcards = [];
    const normals = [];

    for (const tile of tiles) {
      if (this.isWildcard(tile, okeyInfo)) {
        wildcards.push(tile);
      } else {
        normals.push(tile);
      }
    }

    // Sadece wildcard'lardan oluşan set geçersiz
    if (normals.length === 0) return false;

    // Tüm normal taşlar aynı sayıda olmalı
    const number = normals[0].number;
    if (!normals.every((t) => t.number === number)) return false;

    // Normal taşlarda tekrar eden renk olmamalı (en fazla 4 farklı renk)
    const colors = normals.map((t) => t.color);
    const uniqueColors = new Set(colors);
    if (uniqueColors.size !== colors.length) return false;

    // Wildcard'lar dahil toplam taş sayısı 3 veya 4 olmalı
    // ve toplam farklı renk (normal + wildcard ile temsil edilen) <= 4
    if (normals.length + wildcards.length > 4) return false;

    return true;
  }

  /**
   * Bir taş grubunun geçerli seri veya grup oluşturup oluşturmadığını kontrol eder.
   *
   * @param {Array} tiles
   * @param {{ color: string, number: number }} okeyInfo
   * @returns {boolean}
   */
  static isValidSet(tiles, okeyInfo) {
    return this.isRun(tiles, okeyInfo) || this.isGroup(tiles, okeyInfo);
  }

  /**
   * Bir taş setinin puan değerini hesaplar.
   * Her taş kendi sayı değeri kadar puan eder.
   * Okey taşı = okey'in temsil ettiği sayı değeri (okeyInfo.number)
   * Sahte joker = 0 puan
   *
   * @param {Array} tiles
   * @param {{ color: string, number: number }} okeyInfo
   * @returns {number}
   */
  static calculatePoints(tiles, okeyInfo) {
    let total = 0;
    for (const tile of tiles) {
      if (tile.isFalseJoker) {
        // Sahte joker bir sette kullanıldığında, okey'in değerini alır
        total += okeyInfo.number;
      } else if (this.isOkey(tile, okeyInfo)) {
        // Okey taşı kendi sayı değeriyle puan hesaplanır
        total += tile.number;
      } else {
        total += tile.number;
      }
    }
    return total;
  }

  /**
   * Elde kalan taşların ceza puanını hesaplar.
   * Her taş kendi sayı değeri kadar ceza puanı verir.
   * Okey elde kalırsa = okey sayı değeri
   * Sahte joker elde kalırsa = 0 puan
   *
   * @param {Array} hand - Elde kalan taşlar
   * @param {{ color: string, number: number }} okeyInfo
   * @returns {number}
   */
  static calculatePenalty(hand, okeyInfo) {
    let total = 0;
    for (const tile of hand) {
      if (tile.isFalseJoker) {
        // Sahte joker elde kalırsa ceza puanı yok
        total += 0;
      } else if (this.isOkey(tile, okeyInfo)) {
        // Okey elde kalırsa okey sayı değeri kadar ceza
        total += okeyInfo.number;
      } else {
        total += tile.number;
      }
    }
    return total;
  }

  /**
   * Oyuncunun elini açıp açamayacağını kontrol eder.
   * Kurallar:
   * 1. Her grup/seri geçerli olmalı
   * 2. Tüm setlerin toplam puan değeri >= 101 olmalı
   * 3. Taş ID'lerinde tekrar olmamalı
   *
   * @param {Array<Array>} sets - Taş grupları dizisi (her biri taş dizisi)
   * @param {{ color: string, number: number }} okeyInfo
   * @returns {{ valid: boolean, totalPoints: number, reason: string }}
   */
  static canOpenHand(sets, okeyInfo) {
    if (!sets || sets.length === 0) {
      return { valid: false, totalPoints: 0, reason: 'En az bir set gerekli.' };
    }

    // Her setin geçerliliğini kontrol et
    let totalPoints = 0;
    const usedTileIds = new Set();

    for (let i = 0; i < sets.length; i++) {
      const set = sets[i];

      if (!set || set.length < 3) {
        return {
          valid: false,
          totalPoints: 0,
          reason: `Set ${i + 1} en az 3 taş içermeli.`,
        };
      }

      // Tekrar eden taş kontrolü
      for (const tile of set) {
        if (usedTileIds.has(tile.id)) {
          return {
            valid: false,
            totalPoints: 0,
            reason: `Taş ID ${tile.id} birden fazla sette kullanılmış.`,
          };
        }
        usedTileIds.add(tile.id);
      }

      // Set geçerliliği kontrolü
      if (!this.isValidSet(set, okeyInfo)) {
        return {
          valid: false,
          totalPoints: 0,
          reason: `Set ${i + 1} geçerli bir seri veya grup değil.`,
        };
      }

      totalPoints += this.calculatePoints(set, okeyInfo);
    }

    // Toplam puan kontrolü
    if (totalPoints < 101) {
      return {
        valid: false,
        totalPoints,
        reason: `Toplam puan ${totalPoints}, en az 101 olmalı.`,
      };
    }

    return { valid: true, totalPoints, reason: 'El açma geçerli.' };
  }
}

module.exports = Validator;
