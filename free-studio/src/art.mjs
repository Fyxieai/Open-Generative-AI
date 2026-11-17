// Deterministic procedural artwork. No model, external API, or user-code execution.
export function drawArt(
  ctx,
  w,
  h,
  t = 0,
  { preset = "orbit", title = "", accent = "#a78bfa", seed = 7 } = {},
) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#07080d";
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(
    w * 0.62,
    h * 0.45,
    0,
    w * 0.62,
    h * 0.45,
    w * 0.65,
  );
  g.addColorStop(0, accent + "45");
  g.addColorStop(0.45, accent + "12");
  g.addColorStop(1, "#07080d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  let random = seed;
  const rand = () => {
    random = (Math.imul(1664525, random) + 1013904223) >>> 0;
    return random / 4294967296;
  };
  for (let i = 0; i < 100; i++) {
    ctx.fillStyle = `rgba(225,227,255,${rand() * 0.6})`;
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 1.2, 1 + rand() * 1.2);
  }
  ctx.save();
  ctx.translate(w * 0.58, h * 0.48);
  if (preset === "orbit") {
    ctx.rotate(-0.38 + (seed % 20) * 0.018);
    for (let i = 0; i < 70; i++) {
      let k = i / 70;
      ctx.beginPath();
      ctx.ellipse(
        0,
        Math.sin(k * Math.PI * 2 + t * 0.6) * h * 0.1,
        w * 0.27 + Math.sin(k * Math.PI) * w * 0.03,
        h * (0.055 + k * 0.13),
        0,
        0,
        Math.PI * 2,
      );
      ctx.strokeStyle = `hsla(${260 + k * 40},${60 + k * 30}%,${35 + k * 45}%,${0.15 + k * 0.6})`;
      ctx.lineWidth = w / 1500;
      ctx.stroke();
    }
    const rg = ctx.createRadialGradient(
      -w * 0.04,
      -h * 0.04,
      0,
      0,
      0,
      h * 0.155,
    );
    rg.addColorStop(0, "#ddd5ff");
    rg.addColorStop(0.2, accent);
    rg.addColorStop(0.8, "#402a77");
    rg.addColorStop(1, "#100b25");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(0, 0, h * 0.145, 0, Math.PI * 2);
    ctx.fill();
  } else if (preset === "signal") {
    for (let i = 0; i < 55; i++) {
      ctx.beginPath();
      for (let x = -w * 0.62; x < w * 0.5; x += 5) {
        const y =
          Math.sin((x / w) * 10 + i * 0.14 + t) *
            h *
            0.16 *
            Math.exp(-Math.pow((x / w) * 2, 2)) +
          i * h * 0.006 -
          h * 0.15;
        x === -w * 0.62 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `hsla(${255 + i * 0.8},80%,${35 + i * 0.7}%,.65)`;
      ctx.lineWidth = w / 1200;
      ctx.stroke();
    }
  } else if (preset === "mesh") {
    ctx.rotate(-0.3 + t * 0.05);
    for (let i = -16; i <= 16; i++) {
      ctx.beginPath();
      for (let j = -30; j <= 30; j++) {
        let x = j * w * 0.016,
          y = i * h * 0.02 + Math.sin(j * 0.2 + i * 0.16 + t) * h * 0.1;
        j === -30 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = accent + "75";
      ctx.lineWidth = w / 1700;
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 12; i++) {
      ctx.strokeStyle =
        accent +
        Math.round(120 - i * 8)
          .toString(16)
          .padStart(2, "0");
      ctx.lineWidth = w * 0.003;
      ctx.strokeRect(
        -w * 0.25 + i * w * 0.015,
        -h * 0.32 + i * h * 0.02,
        w * 0.5 - i * w * 0.03,
        h * 0.64 - i * h * 0.04,
      );
    }
  }
  ctx.restore();
  if (title) {
    const words = title.slice(0, 100).split(/\s+/);
    const lines = [];
    let l = "";
    ctx.font = `600 ${w * 0.065}px system-ui`;
    for (const word of words) {
      const n = l ? l + " " + word : word;
      if (ctx.measureText(n).width > w * 0.82 && l) {
        lines.push(l);
        l = word;
      } else l = n;
    }
    lines.push(l);
    ctx.fillStyle = "#f5f3ff";
    ctx.shadowColor = "#07080d";
    ctx.shadowBlur = w * 0.02;
    lines
      .slice(0, 4)
      .forEach((line, i) =>
        ctx.fillText(line, w * 0.07, h * 0.72 + i * w * 0.075),
      );
    ctx.shadowBlur = 0;
  }
}
