// Draws the shareable noise-report card (1200x675 PNG) on a canvas.
(() => {
  'use strict';

  const W = 1200;
  const H = 675;
  const C = { ink: '#ffffff', muted: '#a3c9c2', accent: '#5eead4', track: 'rgba(255,255,255,0.10)', panel: 'rgba(255,255,255,0.06)' };
  const FONT = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  const REPO = 'github.com/ljubogdan/unfluff';

  function pill(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fill();
  }

  // report: summarize() output. rangeLabel: "today" | "the last 7 days" ...
  function drawCard(report, rangeLabel, logo) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // background: deep teal with a soft glow behind the gauge
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#062a26');
    bg.addColorStop(1, '#03110f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(300, 350, 0, 300, 350, 420);
    glow.addColorStop(0, 'rgba(45, 212, 191, 0.20)');
    glow.addColorStop(1, 'rgba(45, 212, 191, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // brand
    ctx.textBaseline = 'alphabetic';
    if (logo) ctx.drawImage(logo, 64, 52, 52, 52);
    ctx.fillStyle = C.ink;
    ctx.font = `700 32px ${FONT}`;
    ctx.fillText('Unfluff', 130, 90);
    ctx.textAlign = 'right';
    ctx.fillStyle = C.muted;
    ctx.font = `500 24px ${FONT}`;
    ctx.fillText(`My LinkedIn feed, ${rangeLabel}`, W - 64, 88);

    // gauge
    const cx = 300;
    const cy = 360;
    const r = 170;
    ctx.lineWidth = 34;
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.track;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    if (report.pct > 0) {
      ctx.strokeStyle = C.accent;
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.min(report.pct, 100)) / 100);
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = C.ink;
    ctx.font = `800 ${report.pct >= 100 ? 104 : 128}px ${FONT}`;
    ctx.fillText(`${report.pct}%`, cx, cy + 30);
    ctx.fillStyle = C.muted;
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText('noise', cx, cy + 80);

    // breakdown
    const x = 600;
    const width = 536;
    ctx.textAlign = 'left';
    ctx.fillStyle = C.ink;
    ctx.font = `800 46px ${FONT}`;
    ctx.fillText(`${report.noise.toLocaleString()} of ${report.seen.toLocaleString()} posts`, x, 208);
    ctx.fillStyle = C.muted;
    ctx.font = `500 28px ${FONT}`;
    ctx.fillText("were things I never asked to see", x, 250);

    const parts = report.parts.slice(0, 4);
    const max = Math.max(...parts.map((p) => p.pct), 1);
    parts.forEach((p, i) => {
      const y = 322 + i * 68;
      ctx.fillStyle = C.ink;
      ctx.font = `600 26px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(p.label, x, y);
      ctx.textAlign = 'right';
      ctx.fillText(`${p.pct}%`, x + width, y);
      pill(ctx, x, y + 14, width, 12, C.track);
      pill(ctx, x, y + 14, Math.max(12, (p.pct / max) * width), 12, C.accent);
    });

    // footer
    ctx.textAlign = 'left';
    ctx.fillStyle = C.muted;
    ctx.font = `500 22px ${FONT}`;
    ctx.fillText('Measured with Unfluff, the open-source feed cleaner', 64, 628);
    ctx.textAlign = 'right';
    ctx.fillStyle = C.accent;
    ctx.font = `600 22px ${FONT}`;
    ctx.fillText(REPO, W - 64, 628);
    return canvas;
  }

  const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

  globalThis.UNFLUFF_CARD = { drawCard, toBlob };
})();
