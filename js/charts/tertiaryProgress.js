window.renderTertiaryProgress = function renderTertiaryProgress() {
  const container = document.getElementById('chart-tertiary-progress');
  if (!container) return;

  // Data
  const CURRENT = 9;
  const TARGET = 15;
  const achieved = Math.max(0, Math.min(1, CURRENT / TARGET));
  const gap = Math.max(0, TARGET - CURRENT);

  const COLOR_DONE = window.COLORS?.inSchool || '#D4A84B';
  const COLOR_TRACK = 'rgba(255,255,255,0.10)';
  const COLOR_TEXT = 'rgba(255,255,255,0.92)';
  const COLOR_SUB = 'rgba(255,255,255,0.65)';

  container.innerHTML = '';

  const VB_W = 520;
  const VB_H = 240;

  const svg = d3.select(container)
    .append('svg')
    .attr('class', 'tertiary-svg')
    .attr('viewBox', `0 0 ${VB_W} ${VB_H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  const cx = VB_W / 2;
  const cy = 112;

  const radius = 70;
  const innerR = 48;

  const g = svg.append('g')
    .attr('transform', `translate(${cx}, ${cy})`);

  const arc = d3.arc()
    .innerRadius(innerR)
    .outerRadius(radius)
    .cornerRadius(12);

  // Track
  g.append('path')
    .datum({ startAngle: 0, endAngle: Math.PI * 2 })
    .attr('d', arc)
    .attr('fill', COLOR_TRACK);

  // Progress arc
  const fg = g.append('path')
    .datum({ startAngle: 0, endAngle: 0 })
    .attr('d', arc)
    .attr('fill', COLOR_DONE);

  // Center number
  g.append('text')
    .attr('text-anchor', 'middle')
    .attr('y', 6)
    .attr('fill', COLOR_TEXT)
    .style('font-family', 'var(--font-serif, serif)')
    .style('font-weight', 800)
    .style('font-size', '36px')
    .text(`${CURRENT}%`);

  // Captions
  svg.append('text')
    .attr('x', cx)
    .attr('y', 200)
    .attr('text-anchor', 'middle')
    .attr('fill', COLOR_SUB)
    .style('font-family', 'var(--font-sans, system-ui)')
    .style('font-size', '13px')
    .text(`Target: ${TARGET}% by 2030`);

  svg.append('text')
    .attr('x', cx)
    .attr('y', 220)
    .attr('text-anchor', 'middle')
    .attr('fill', COLOR_SUB)
    .style('font-family', 'var(--font-sans, system-ui)')
    .style('font-size', '13px')
    .text(`Gap: ${gap} percentage points`);

  function animate() {
    fg.interrupt();
    fg.transition()
      .duration(900)
      .ease(d3.easeCubicOut)
      .attrTween('d', function () {
        const interp = d3.interpolate(0, achieved * Math.PI * 2);
        return function (t) {
          return arc({ startAngle: 0, endAngle: interp(t) });
        };
      });
  }

  // Animate once when visible
  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          animate();
          obs.disconnect();
        }
      });
    }, { threshold: 0.35 });
    obs.observe(container);
  } else {
    animate();
  }
};
