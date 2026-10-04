import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { START, END, isStamped, stampText } from '../../scripts/stamp-server-logic-helpers.mjs'

const source = readFileSync(resolve('server-logic-src/bc-helpers.js'), 'utf8')
const dir = resolve('.powerpages-site/server-logic')
const endpointFiles = readdirSync(dir)
  .map((name) => join(dir, name, `${name}.js`))
  .filter((file) => existsSync(file) && readFileSync(file, 'utf8').includes(START))

test('stampText fills the region with the source, indented like the marker, and is stable', () => {
  const file = `async function get() {\n    ${START}\n    old\n    ${END}\n    return 1;\n}\n`
  const once = stampText(file, 'function a() {\n    return 1;\n}\n')
  expect(once).toBe(`async function get() {\n    ${START}\n    function a() {\n        return 1;\n    }\n    ${END}\n    return 1;\n}\n`)
  expect(stampText(once, 'function a() {\n    return 1;\n}\n')).toBe(once)
  expect(isStamped(once, 'function a() {\n    return 1;\n}\n')).toBe(true)
  expect(isStamped(file, 'function a() {\n    return 1;\n}\n')).toBe(false)
})

test('every endpoint that uses the BC helpers carries an identical copy', () => {
  expect(endpointFiles.length).toBeGreaterThan(0)
  for (const file of endpointFiles) {
    expect(isStamped(readFileSync(file, 'utf8'), source), `${file} is out of date: run node scripts/stamp-server-logic-helpers.mjs`).toBe(true)
  }
})

test('the helper source avoids every pattern the Power Pages validator rejects', () => {
  for (const pattern of [/\brequire\(/, /\bimport\b/, /\beval\(/, /setTimeout/, /\bdelete\b/, /prototype/, /Reflect\./, /console\.log/, /with\(/, /Function\s*\(/i]) {
    expect(source).not.toMatch(pattern)
  }
})
