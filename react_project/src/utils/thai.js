const countryNames = {
  Japan: 'ญี่ปุ่น',
  Korea: 'เกาหลีใต้',
  'South Korea': 'เกาหลีใต้',
};

export const thaiCountryName = (name) => countryNames[name] || name;

export const thaiGameName = (gameType) => {
  if (gameType === 'scratch') {
    return 'สลากขูด';
  }
  if (gameType === 'loto6' || /^(LOTO|LOTTO) 6$/i.test(gameType)) {
    return 'ล็อตโต้ 6';
  }
  return gameType;
};

export const thaiGuideText = (text) => {
  if (typeof text !== 'string') {
    return text;
  }
  return text
    .replace(/\bSouth Korea\b/gi, 'เกาหลีใต้')
    .replace(/\bJapan\b/gi, 'ญี่ปุ่น')
    .replace(/\bKorea\b/gi, 'เกาหลีใต้')
    .replace(/Scratch Lottery/gi, 'สลากขูด')
    .replace(/Lottery shops/gi, 'ร้านจำหน่ายสลาก')
    .replace(/\b(?:LOTO|LOTTO|Lotto) 6\b/gi, 'ล็อตโต้ 6')
    .replace(/Bonus Number/gi, 'เลขโบนัส')
    .replace(/\b(\d+)(?:st|nd|rd|th) Prize\b/gi, 'รางวัลที่ $1');
};

export const thaiErrorMessage = (error, fallback) => {
  const message = error instanceof Error ? error.message : '';
  return /[\u0E00-\u0E7F]/.test(message) ? message : fallback;
};
