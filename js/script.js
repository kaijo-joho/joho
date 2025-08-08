function loadGoogleFonts() {
  const fonts = [
    'https://fonts.googleapis.com/css2?family=Noto+Sans+Mono&display=swap',
    'https://fonts.googleapis.com/css2?family=Noto+Sans+JP&display=swap'
  ];

  fonts.forEach(url => {
    const link = document.createElement('link');
    link.href = url;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  });
}

// ページ読み込み後にフォントを読み込む
document.addEventListener('DOMContentLoaded', () => {
  loadGoogleFonts();
});






