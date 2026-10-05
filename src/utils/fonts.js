const loadedFontLinks = new Set();

// 这里先把这一步处理好，后面的逻辑就顺了。
export function baozhengGoogleZitiYizai(googleFont) {
  if (
    !googleFont ||
    loadedFontLinks.has(googleFont) ||
    typeof document === 'undefined'
  ) return;

  loadedFontLinks.add(googleFont);

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${googleFont}&display=swap`;

  document.head.appendChild(link);
}
