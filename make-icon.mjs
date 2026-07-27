import fs from "node:fs/promises";
import sharp from "sharp";

const outputDir = "/Users/wangyaya/Desktop/旅途密令/assets";
const svg = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="96" fill="#25313c"/>
  <circle cx="408" cy="104" r="36" fill="#e2b84b"/>
  <path d="M92 374C140 304 166 324 214 270C258 222 283 143 376 130" fill="none" stroke="#f4eee4" stroke-width="22" stroke-linecap="round"/>
  <circle cx="92" cy="374" r="18" fill="#bc5148" stroke="#f4eee4" stroke-width="9"/>
  <circle cx="376" cy="130" r="18" fill="#39785b" stroke="#f4eee4" stroke-width="9"/>
  <rect x="142" y="132" width="228" height="250" rx="20" fill="#f7f8f6" stroke="#bc5148" stroke-width="12" transform="rotate(-4 256 257)"/>
  <text x="256" y="303" text-anchor="middle" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="152" font-weight="700" fill="#bc5148">令</text>
</svg>`;

await fs.mkdir(outputDir, { recursive: true });
for (const size of [96, 192, 512]) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`${outputDir}/app-icon-${size}.png`);
}
