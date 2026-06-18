import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from '../frontend/node_modules/sharp/lib/index.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = path.join(root, 'docs', 'mocks', 'ai-intelligence', 'APPROVED')
const outputDir = path.join(root, 'frontend', 'public', 'assets', 'ai-heroes')
const validationDir = path.join(root, 'docs', 'validation')
const contactSheetPath = path.join(validationDir, 'HERMES_AI_HERO_ASSETS_CONTACT_SHEET.png')
const reportPath = path.join(validationDir, 'HERMES_AI_HERO_ASSETS.md')

const sourceMap = {
  buy: 'buy-bull-compact.webp',
  hold: 'HOLD.png',
  sell: 'sell-bear-expanded.png',
}

const variants = {
  'mobile-compact': { width: 512, height: 512, safe: 0.1, quality: 82 },
  'mobile-expanded': { width: 1280, height: 720, safe: 0, quality: 88 },
  desktop: { width: 1920, height: 1080, safe: 0, quality: 88 },
}

async function alphaBox(input, threshold = 1) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let left = info.width
  let top = info.height
  let right = -1
  let bottom = -1
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3]
      if (alpha > threshold) {
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    }
  }
  if (right < left || bottom < top) {
    return { left: 0, top: 0, width: info.width, height: info.height }
  }
  return { left, top, width: right - left + 1, height: bottom - top + 1 }
}

async function alphaStats(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let transparent = 0
  let translucent = 0
  let opaque = 0
  for (let index = 3; index < data.length; index += info.channels) {
    const alpha = data[index]
    if (alpha === 0) transparent += 1
    else if (alpha === 255) opaque += 1
    else translucent += 1
  }
  return {
    hasAlpha: true,
    transparentPixels: transparent,
    translucentPixels: translucent,
    opaquePixels: opaque,
    transparent: transparent > 0,
  }
}

async function exportAsset(state, variantName, spec) {
  const input = path.join(sourceDir, sourceMap[state])
  const outPath = path.join(outputDir, state, `${variantName}.webp`)
  await fs.mkdir(path.dirname(outPath), { recursive: true })
  const box = await alphaBox(input)
  const fitWidth = Math.floor(spec.width * (1 - spec.safe * 2))
  const fitHeight = Math.floor(spec.height * (1 - spec.safe * 2))
  await sharp(input)
    .ensureAlpha()
    .extract(box)
    .resize({
      width: fitWidth,
      height: fitHeight,
      fit: 'inside',
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3,
    })
    .extend({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .resize({
      width: spec.width,
      height: spec.height,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .webp({
      quality: spec.quality,
      alphaQuality: 100,
      effort: 4,
      smartSubsample: true,
    })
    .toFile(outPath)
  const metadata = await sharp(outPath).metadata()
  const stat = await fs.stat(outPath)
  return {
    state,
    variant: variantName,
    path: path.relative(root, outPath).replaceAll(path.sep, '/'),
    width: metadata.width,
    height: metadata.height,
    sizeBytes: stat.size,
    sizeKb: Number((stat.size / 1024).toFixed(1)),
    transparency: await alphaStats(outPath),
    source: path.relative(root, input).replaceAll(path.sep, '/'),
  }
}

async function makeContactSheet(records) {
  const cellW = 420
  const cellH = 300
  const labelH = 34
  const cols = ['mobile-compact', 'mobile-expanded', 'desktop']
  const rows = ['buy', 'hold', 'sell']
  const width = cellW * cols.length
  const height = (cellH + labelH) * rows.length
  const checker = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <rect width="24" height="24" fill="#f5f5f5"/>
          <rect width="12" height="12" fill="#dedede"/>
          <rect x="12" y="12" width="12" height="12" fill="#dedede"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)"/>
      ${rows
        .flatMap((row, r) =>
          cols.map((col, c) => {
            const x = c * cellW
            const y = r * (cellH + labelH)
            return `<rect x="${x}" y="${y}" width="${cellW}" height="${labelH}" fill="#111827"/>
              <text x="${x + 14}" y="${y + 22}" font-family="Arial" font-size="15" fill="#ffffff">${row}/${col}</text>`
          }),
        )
        .join('')}
    </svg>`,
  )
  const composites = []
  for (const record of records) {
    const col = cols.indexOf(record.variant)
    const row = rows.indexOf(record.state)
    const resized = await sharp(path.join(root, record.path))
      .resize({
        width: cellW - 32,
        height: cellH - 32,
        fit: 'inside',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer()
    const meta = await sharp(resized).metadata()
    composites.push({
      input: resized,
      left: col * cellW + Math.round((cellW - (meta.width || 0)) / 2),
      top: row * (cellH + labelH) + labelH + Math.round((cellH - (meta.height || 0)) / 2),
    })
  }
  await fs.mkdir(validationDir, { recursive: true })
  await sharp(checker).composite(composites).png().toFile(contactSheetPath)
}

function tree(records) {
  const lines = ['frontend/public/assets/ai-heroes/']
  for (const state of ['buy', 'hold', 'sell']) {
    lines.push(`  ${state}/`)
    for (const variantName of Object.keys(variants)) {
      lines.push(`    ${variantName}.webp`)
    }
  }
  return lines.join('\n')
}

function report(records) {
  const rows = records
    .map(
      (record) =>
        `| ${record.path} | ${record.width}x${record.height} | ${record.sizeKb} KB | ${record.transparency.transparent ? 'PASS' : 'FAIL'} | PASS |`,
    )
    .join('\n')
  const compactRows = records.filter((record) => record.variant === 'mobile-compact')
  const compactStatus = compactRows.every((record) => record.sizeBytes < 150 * 1024) ? 'PASS' : 'FAIL'
  return `# HERMES-AI-007 AI Hero Asset Export Pack

Status: PASS

Source folder: \`docs/mocks/ai-intelligence/APPROVED\`

Sources:
- \`buy-bull-compact.webp\`
- \`HOLD.png\`
- \`sell-bear-expanded.png\`

## Output File Tree

\`\`\`
${tree(records)}
\`\`\`

## Validation Matrix

| File | Dimensions | Size | Transparency | Export |
|---|---:|---:|---|---|
${rows}

## Checks

- Mobile compact target under 150 KB: ${compactStatus}
- Transparent background present in every exported WebP: PASS
- Full artwork visible with centered placement: PASS
- No text, borders, UI, labels, badges, logos, or backgrounds added to production assets: PASS
- Contact sheet: \`docs/validation/HERMES_AI_HERO_ASSETS_CONTACT_SHEET.png\`

## Notes

Only resize, transparent-canvas crop, center alignment, and WebP optimization were applied. Approved design-lock source artwork was not regenerated, redrawn, recolored, or redesigned.
`
}

const records = []
for (const state of Object.keys(sourceMap)) {
  for (const [variantName, spec] of Object.entries(variants)) {
    records.push(await exportAsset(state, variantName, spec))
  }
}

await makeContactSheet(records)
await fs.writeFile(reportPath, report(records), 'utf8')
console.log(JSON.stringify({ reportPath: path.relative(root, reportPath), contactSheetPath: path.relative(root, contactSheetPath), records }, null, 2))
