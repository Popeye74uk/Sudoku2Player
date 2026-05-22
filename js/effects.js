/**
 * Visual Effects for Sudoku Duel
 * Confetti, score popups, particles, and celebration animations.
 */
(function () {
  'use strict';

  /* ────────────────────────────────────────────
   * Confetti Effect
   * ──────────────────────────────────────────── */

  const CONFETTI_COLORS = [
    'hsl(258, 90%, 66%)',  // purple
    'hsl(190, 90%, 50%)',  // cyan
    'hsl(340, 90%, 60%)',  // magenta
    'hsl(45, 100%, 60%)',  // gold
    'hsl(145, 70%, 50%)',  // green
    'hsl(15, 90%, 60%)',   // orange
  ];

  /**
   * Creates a confetti celebration effect.
   * @param {HTMLElement} container - The container element to add confetti to
   * @param {number} [duration=4000] - Duration in ms
   */
  function launchConfetti(container, duration = 4000) {
    const canvas = document.createElement('canvas');
    canvas.classList.add('confetti-canvas');
    canvas.width = container.offsetWidth;
    canvas.height = container.offsetHeight;
    canvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1000;
    `;
    container.style.position = 'relative';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const particles = [];
    const particleCount = 150;

    // Create particles
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        w: Math.random() * 10 + 5,
        h: Math.random() * 6 + 3,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        velocityX: (Math.random() - 0.5) * 4,
        velocityY: Math.random() * 3 + 2,
        oscillateAmplitude: Math.random() * 3,
        oscillateSpeed: Math.random() * 0.05 + 0.01,
        opacity: 1
      });
    }

    const startTime = performance.now();

    function animate(currentTime) {
      const elapsed = currentTime - startTime;
      if (elapsed > duration) {
        canvas.remove();
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Fade out in the last second
      const fadeStart = duration - 1000;
      const globalOpacity = elapsed > fadeStart
        ? 1 - (elapsed - fadeStart) / 1000
        : 1;

      particles.forEach(p => {
        p.y += p.velocityY;
        p.x += p.velocityX + Math.sin(elapsed * p.oscillateSpeed) * p.oscillateAmplitude;
        p.rotation += p.rotationSpeed;

        ctx.save();
        ctx.globalAlpha = globalOpacity * p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation * Math.PI / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();

        // Recycle particles that fall off screen
        if (p.y > canvas.height + 20) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
        }
      });

      requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
  }

  /**
   * Creates a sorrow rain effect for the loser.
   * @param {HTMLElement} container - The container element
   * @param {number} [duration=4000] - Duration in ms
   */
  function launchSorrowRain(container, duration = 4000) {
    const canvas = document.createElement('canvas');
    canvas.classList.add('sorrow-canvas');
    canvas.width = container.offsetWidth;
    canvas.height = container.offsetHeight;
    canvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1000;
    `;
    container.style.position = 'relative';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const particles = [];
    const particleCount = 80;

    const RAIN_COLORS = [
      'hsla(210, 30%, 50%, 0.6)',  // soft blue-grey
      'hsla(200, 20%, 40%, 0.4)',  // darker grey
      'hsla(220, 40%, 60%, 0.5)',  // cyan-grey
      'hsla(228, 15%, 40%, 0.5)'   // muted text color
    ];

    // Create particles
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        length: Math.random() * 15 + 10,
        width: Math.random() * 1.5 + 0.5,
        color: RAIN_COLORS[Math.floor(Math.random() * RAIN_COLORS.length)],
        velocityY: Math.random() * 6 + 6,
        velocityX: (Math.random() - 0.2) * 1.5,
        opacity: Math.random() * 0.7 + 0.3
      });
    }

    const startTime = performance.now();

    function animate(currentTime) {
      const elapsed = currentTime - startTime;
      if (elapsed > duration) {
        canvas.remove();
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Fade out in the last second
      const fadeStart = duration - 1000;
      const globalOpacity = elapsed > fadeStart
        ? 1 - (elapsed - fadeStart) / 1000
        : 1;

      particles.forEach(p => {
        p.y += p.velocityY;
        p.x += p.velocityX;

        ctx.save();
        ctx.globalAlpha = globalOpacity * p.opacity;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.width;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.velocityX, p.y + p.length);
        ctx.stroke();
        ctx.restore();

        // Recycle particles
        if (p.y > canvas.height + 20) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
        }
      });

      requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
  }

  /* ────────────────────────────────────────────
   * Score Popup Effect
   * ──────────────────────────────────────────── */

  /**
   * Shows a floating score popup near a cell.
   * @param {HTMLElement} cellElement - The cell DOM element
   * @param {number} points - Points to show (+10, -5, etc.)
   * @param {string[]} [bonuses] - Bonus descriptions
   */
  function showScorePopup(cellElement, points, bonuses = []) {
    const popup = document.createElement('div');
    popup.classList.add('score-popup');

    if (points > 0) {
      popup.classList.add('positive');
      popup.textContent = `+${points}`;
    } else {
      popup.classList.add('negative');
      popup.textContent = `${points}`;
    }

    // Position near the cell
    const rect = cellElement.getBoundingClientRect();
    popup.style.left = `${rect.left + rect.width / 2}px`;
    popup.style.top = `${rect.top}px`;

    document.body.appendChild(popup);

    // Remove after animation
    popup.addEventListener('animationend', () => popup.remove());

    // Show bonuses too
    if (bonuses.length > 0) {
      bonuses.forEach((bonus, i) => {
        setTimeout(() => {
          const bonusPopup = document.createElement('div');
          bonusPopup.classList.add('score-popup', 'bonus');
          bonusPopup.textContent = bonus;
          bonusPopup.style.left = `${rect.left + rect.width / 2}px`;
          bonusPopup.style.top = `${rect.top - 30 - (i * 25)}px`;
          document.body.appendChild(bonusPopup);
          bonusPopup.addEventListener('animationend', () => bonusPopup.remove());
        }, 200 * (i + 1));
      });
    }
  }

  /* ────────────────────────────────────────────
   * Score Counter Animation
   * ──────────────────────────────────────────── */

  /**
   * Animates a score counter from old value to new value.
   * @param {HTMLElement} element - The element showing the score
   * @param {number} from - Starting value
   * @param {number} to - Ending value
   * @param {number} [duration=500] - Animation duration in ms
   */
  function animateScore(element, from, to, duration = 500) {
    const start = performance.now();
    const diff = to - from;

    function update(currentTime) {
      const elapsed = currentTime - start;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out quad
      const eased = 1 - (1 - progress) * (1 - progress);
      const current = Math.round(from + diff * eased);

      element.textContent = current;

      // Add flash class
      if (progress < 0.5) {
        element.classList.add('score-changing');
      } else {
        element.classList.remove('score-changing');
      }

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }

    requestAnimationFrame(update);
  }

  /* ────────────────────────────────────────────
   * Cell Flash Effects
   * ──────────────────────────────────────────── */

  /**
   * Plays a correct placement animation on a cell.
   * @param {HTMLElement} cellElement
   */
  function flashCorrect(cellElement) {
    cellElement.classList.add('correct');
    setTimeout(() => cellElement.classList.remove('correct'), 800);
  }

  /**
   * Plays an incorrect placement animation on a cell.
   * @param {HTMLElement} cellElement
   */
  function flashIncorrect(cellElement) {
    cellElement.classList.add('incorrect');
    setTimeout(() => cellElement.classList.remove('incorrect'), 600);
  }

  /* ────────────────────────────────────────────
   * Row/Col/Box Completion Flash
   * ──────────────────────────────────────────── */

  /**
   * Flashes all cells in a completed row, column, or box.
   * @param {string} type - 'row', 'col', or 'box'
   * @param {number} index - The row/col index or box index
   */
  function flashCompletion(type, index) {
    let cells = [];

    if (type === 'row') {
      for (let c = 0; c < 9; c++) {
        cells.push(document.querySelector(`[data-row="${index}"][data-col="${c}"]`));
      }
    } else if (type === 'col') {
      for (let r = 0; r < 9; r++) {
        cells.push(document.querySelector(`[data-row="${r}"][data-col="${index}"]`));
      }
    } else if (type === 'box') {
      const startRow = Math.floor(index / 3) * 3;
      const startCol = (index % 3) * 3;
      for (let r = startRow; r < startRow + 3; r++) {
        for (let c = startCol; c < startCol + 3; c++) {
          cells.push(document.querySelector(`[data-row="${r}"][data-col="${c}"]`));
        }
      }
    }

    cells.forEach((cell, i) => {
      if (!cell) return;
      setTimeout(() => {
        cell.classList.add('completion-flash');
        setTimeout(() => cell.classList.remove('completion-flash'), 600);
      }, i * 50); // Stagger the flash
    });
  }

  /* ────────────────────────────────────────────
   * Toast Notifications
   * ──────────────────────────────────────────── */

  let toastContainer = null;

  /**
   * Shows a toast notification.
   * @param {string} message
   * @param {'info'|'success'|'error'|'bonus'} type
   * @param {number} [duration=3000]
   */
  function showToast(message, type = 'info', duration = 3000) {
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      toastContainer.classList.add('toast-container');
      document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.classList.add('toast', type);
    toast.textContent = message;

    toastContainer.appendChild(toast);

    // Trigger enter animation
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    // Make the toast instantly dismissible on click/tap
    toast.addEventListener('click', () => {
      if (!toast.classList.contains('hiding')) {
        toast.classList.add('hiding');
        setTimeout(() => {
          toast.remove();
        }, 300);
      }
    });

    setTimeout(() => {
      if (toast.parentNode) {
        toast.classList.add('hiding');
        setTimeout(() => {
          toast.remove();
        }, 300);
      }
    }, duration);
  }

  /* ────────────────────────────────────────────
   * Particle Burst
   * ──────────────────────────────────────────── */

  /**
   * Creates a small particle burst at a position (for milestones).
   * @param {number} x - Center X
   * @param {number} y - Center Y
   * @param {string} color - CSS color
   */
  function particleBurst(x, y, color = 'hsl(258, 90%, 66%)') {
    const count = 12;
    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div');
      particle.classList.add('particle');
      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;
      particle.style.backgroundColor = color;

      const angle = (360 / count) * i;
      const distance = 30 + Math.random() * 40;
      particle.style.setProperty('--tx', `${Math.cos(angle * Math.PI / 180) * distance}px`);
      particle.style.setProperty('--ty', `${Math.sin(angle * Math.PI / 180) * distance}px`);

      document.body.appendChild(particle);
      particle.addEventListener('animationend', () => particle.remove());
    }
  }

  /* ────────────────────────────────────────────
   * Public API
   * ──────────────────────────────────────────── */

  window.Effects = {
    launchConfetti,
    launchSorrowRain,
    showScorePopup,
    animateScore,
    flashCorrect,
    flashIncorrect,
    flashCompletion,
    showToast,
    particleBurst
  };

})();
