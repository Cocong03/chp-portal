// Copies server-logic-src/bc-helpers.js into every Server Logic endpoint between the bc-helpers markers.
// Usage: node scripts/stamp-server-logic-helpers.mjs [--check]   (--check: exit 1 if any copy is out of date)
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const START = '// #region bc-helpers (generated from server-logic-src/bc-helpers.js — do not edit)'
export const END = '// #endregion bc-helpers'
const REGION = /^([ \t]*)\/\/ #region bc-helpers[^\n]*\n[\s\S]*?^[ \t]*\/\/ #endregion bc-helpers/gm

const lf = (text) => text.replace(/\r\n/g, '\n')

export function stampText(text, source) {
  const body = lf(source).trimEnd().split('\n')
  return lf(text).replace(REGION, (_match, indent) => {
    const indented = body.map((line) => (line ? indent + line : line)).join('\n')
    return `${indent}${START}\n${indented}\n${indent}${END}`
  })
}

export function isStamped(text, source) {
  return stampText(text, source) === lf(text)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const source = readFileSync(join(root, 'server-logic-src', 'bc-helpers.js'), 'utf8')
  const dir = join(root, '.powerpages-site', 'server-logic')
  const check = process.argv.includes('--check')
  let stale = 0
  for (const name of readdirSync(dir)) {
    const file = join(dir, name, `${name}.js`)
    if (!existsSync(file)) continue
    const text = readFileSync(file, 'utf8')
    if (!text.includes(START)) continue
    if (isStamped(text, source)) continue
    if (check) {
      console.error(`out of date: ${file}`)
      stale++
    } else {
      writeFileSync(file, stampText(text, source))
      console.log(`stamped: ${file}`)
    }
  }
  if (stale) process.exit(1)
}
