window.renderWaffleChart = function () {
  const container = document.getElementById('chart-waffle');
  const summary = document.getElementById('waffle-summary');

  if (!container) {
    console.error('Waffle chart container not found (#chart-waffle)');
    return;
  }

  // Clear
  container.innerHTML = '';
  if (summary) summary.innerHTML = '';

  // Data (UNHCR 2025)
  const IN_SCHOOL_PCT = 54;
  const OUT_SCHOOL_PCT = 46;
  const TOTAL = 100;

  // Build grid
  const grid = document.createElement('div');
  grid.className = 'waffle-grid';
  container.appendChild(grid);

  const cellEls = [];
  for (let i = 0; i < TOTAL; i++) {
    const div = document.createElement('div');
    div.className = 'waffle-cell';
    grid.appendChild(div);
    cellEls.push(div);
  }

  let isAnimating = false;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stepMs = reduceMotion ? 0 : 22;

  function resetGrid() {
    cellEls.forEach(el => {
      el.classList.remove('is-in', 'is-out');
    });
  }

  function renderSummary() {
    if (!summary) return;

    summary.innerHTML = `
      <div class="waffle-stat">
        <span class="waffle-stat-num is-in">${IN_SCHOOL_PCT}</span>
        <span class="waffle-stat-label">in school</span>
      </div>
      <div class="waffle-stat">
        <span class="waffle-stat-num is-out">${OUT_SCHOOL_PCT}</span>
        <span class="waffle-stat-label">out of school</span>
      </div>
    `;
  }

  function animateFill() {
    if (isAnimating) return;
    isAnimating = true;

    resetGrid();
    if (summary) summary.innerHTML = '';

    for (let i = 0; i < TOTAL; i++) {
      setTimeout(() => {
        const el = cellEls[i];
        el.classList.add(i < IN_SCHOOL_PCT ? 'is-in' : 'is-out');

        if (i === TOTAL - 1) {
          setTimeout(() => {
            renderSummary();
            isAnimating = false;
          }, 160);
        }
      }, i * stepMs);
    }
  }

  // Run 
  requestAnimationFrame(animateFill);


  const replayBtn = document.getElementById('waffleReplay');
  if (replayBtn) replayBtn.onclick = () => animateFill();

  console.log('✓ Waffle chart rendered');
};
