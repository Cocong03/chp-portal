// npm run deploy — build the SPA and upload the code site, only when pac points at the Dev environment (CLAUDE.md:
// confirm the target before any deploy; upload-code-site only, never `pac pages upload`).
import { execSync } from 'node:child_process'

const DEV_ORG = 'https://org380257ac.crm5.dynamics.com/'
const run = (command) => execSync(command, { stdio: 'inherit' })

const who = execSync('pac org who', { encoding: 'utf8' })
if (!who.includes(DEV_ORG)) {
  console.error(`Not deploying: pac is not connected to Dev (${DEV_ORG}). Run "pac org who", then "pac auth select" to switch.`)
  process.exit(1)
}
console.log(`Target confirmed: ${DEV_ORG}`)
run('npm run build')
run('pac pages upload-code-site --rootPath .')
