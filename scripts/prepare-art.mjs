import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
const sourceMap = JSON.parse(await readFile(process.argv[2], "utf8"));
const output = path.resolve("assets/art");
await mkdir(output, { recursive: true });
let bytes = 0;
for (const item of sourceMap) {
  if (!/^[a-z-]+$/.test(item.id)) throw new Error("Invalid asset id");
  const full = await sharp(item.source)
    .resize({
      width: item.id === "breath-ring" ? 640 : 1200,
      withoutEnlargement: true,
    })
    .webp({ quality: 84, effort: 6 })
    .toFile(path.join(output, `${item.id}.webp`));
  bytes += full.size;
  if (item.id !== "breath-ring") {
    const thumb = await sharp(item.source)
      .resize({ width: 360, withoutEnlargement: true })
      .webp({ quality: 80, effort: 6 })
      .toFile(path.join(output, `${item.id}-thumb.webp`));
    bytes += thumb.size;
  }
  console.log(`${item.id}: ${Math.round(full.size / 1024)} KB`);
}
for (const size of [192, 512])
  await sharp("assets/icon.svg")
    .resize(size, size)
    .png()
    .toFile(`assets/icon-${size}.png`);
console.log(
  `13 illustrations and 12 thumbnails: ${(bytes / 1024 / 1024).toFixed(2)} MB`,
);
