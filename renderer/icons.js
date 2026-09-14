// Shared 8x8 pixel-art bitmaps used by both the reminder popups and the
// dashboard. 0 = empty, 1 = accent fill, 2 = dark (ink).
window.WellnessIcons = {
  ICONS: {
    water: [
      '00011000',
      '00011000',
      '00111100',
      '01111110',
      '11111111',
      '11111111',
      '01111110',
      '00111100',
    ],
    eyes: [
      '00000000',
      '00111100',
      '01111110',
      '11122111',
      '11122111',
      '01111110',
      '00111100',
      '00000000',
    ],
    walk: [
      '00011000',
      '00011000',
      '00111100',
      '01111110',
      '00111100',
      '01100110',
      '11000011',
      '10000001',
    ],
  },

  render(container, type) {
    const grid = this.ICONS[type] || this.ICONS.water;
    container.innerHTML = '';
    grid.forEach((row) => {
      row.split('').forEach((cell) => {
        const i = document.createElement('i');
        if (cell === '1') i.className = 'fill';
        else if (cell === '2') i.className = 'dark';
        container.appendChild(i);
      });
    });
  },
};
