#!/usr/bin/env node
/**
 * setup-python.js — downloads a self-contained, relocatable CPython 3.11 from
 * python-build-standalone into resources/python/runtime/ for the CURRENT
 * platform + arch.
 *
 * Why bundle Python instead of using the system one?
 *   The diarization stack (pyannote.audio + torch) is extremely sensitive to
 *   the Python version. We pin torch<2.6 (to keep the pre-2.6 torch.load
 *   default that pyannote checkpoints rely on), and torch<2.6 only ships
 *   wheels for Python 3.9–3.12. A user (or CI runner) whose system `python3`
 *   is 3.13/3.14 — or missing python3-venv — would fail. Shipping our own
 *   3.11 makes the venv deterministic and identical on macOS, Windows, Linux.
 *
 * The release tags are date-based and rotate, so instead of hardcoding one we
 * query the GitHub API for the latest release and pick the matching 3.11 asset.
 *
 * Run: pnpm run setup:python   (idempotent — skips if already present)
 */

const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')
const { execSync } = require('node:child_process')

const PY_MINOR = '3.11'
const REPO = 'astral-sh/python-build-standalone'
const ROOT = path.join(__dirname, '..')
const RUNTIME_DIR = path.join(ROOT, 'resources', 'python', 'runtime')

// python-build-standalone "install_only" target triples per platform+arch.
// (Windows used to publish a "-shared" install_only variant; recent releases
// dropped the suffix and ship a plain "...-pc-windows-msvc-install_only".)
const TRIPLES = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64':   'x86_64-apple-darwin',
  'linux-x64':    'x86_64-unknown-linux-gnu',
  'linux-arm64':  'aarch64-unknown-linux-gnu',
  'win32-x64':    'x86_64-pc-windows-msvc',
  'win32-arm64':  'aarch64-pc-windows-msvc',
}

function runtimePythonPath() {
  return process.platform === 'win32'
    ? path.join(RUNTIME_DIR, 'python.exe')
    : path.join(RUNTIME_DIR, 'bin', 'python3')
}

function ghHeaders() {
  const h = { 'user-agent': 'skkribe-setup', accept: 'application/vnd.github+json' }
  // CI provides GITHUB_TOKEN — use it to dodge the 60 req/h anonymous limit.
  if (process.env.GITHUB_TOKEN) h.authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  return h
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: ghHeaders() }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return resolve(getJson(new URL(res.headers.location, url).toString()))
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode} em ${url}`))
      }
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => { try { resolve(JSON.parse(body)) } catch (e) { reject(e) } })
    }).on('error', reject)
  })
}

function download(url, dest) {
  const tmp = dest + '.part'
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    const out = fs.createWriteStream(tmp)
    function follow(currentUrl, hops = 0) {
      if (hops > 5) return reject(new Error(`muitos redirects em ${currentUrl}`))
      https.get(currentUrl, { headers: { 'user-agent': 'skkribe-setup' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          return follow(new URL(res.headers.location, currentUrl).toString(), hops + 1)
        }
        if (res.statusCode !== 200) {
          res.resume()
          return reject(new Error(`HTTP ${res.statusCode} em ${currentUrl}`))
        }
        const total = parseInt(res.headers['content-length'] || '0', 10)
        let received = 0, lastPrint = 0
        res.on('data', (c) => {
          received += c.length
          if (Date.now() - lastPrint > 300) {
            lastPrint = Date.now()
            const pct = total ? ((received / total) * 100).toFixed(0) : '?'
            process.stdout.write(`\r  baixando Python: ${pct}%  ${(received / 1e6).toFixed(1)} MB`)
          }
        })
        res.pipe(out)
        out.on('finish', () => out.close((err) => {
          process.stdout.write('\n')
          if (err) return reject(err)
          try { fs.renameSync(tmp, dest) } catch (e) { return reject(e) }
          resolve()
        }))
        out.on('error', reject)
      }).on('error', reject)
    }
    follow(url)
  })
}

async function main() {
  console.log(`\n🐍 setup-python.js — CPython ${PY_MINOR} portátil (${process.platform}-${process.arch})`)

  if (fs.existsSync(runtimePythonPath())) {
    console.log('✓ Python portátil já presente em', RUNTIME_DIR, '— pulando')
    return
  }

  const key = `${process.platform}-${process.arch}`
  const triple = TRIPLES[key]
  if (!triple) throw new Error(`Plataforma sem build do python-build-standalone: ${key}`)

  // install_only.tar.gz is the relocatable bundle with pip + venv; prefer it,
  // but accept the older non-"_stripped" naming just in case.
  const wantRe = new RegExp(`^cpython-${PY_MINOR.replace('.', '\\.')}\\.\\d+\\+\\d+-${triple}-install_only\\.tar\\.gz$`)

  console.log('🔎 buscando a release mais recente do python-build-standalone…')
  const release = await getJson(`https://api.github.com/repos/${REPO}/releases/latest`)
  const asset = (release.assets || []).find((a) => wantRe.test(a.name))
  if (!asset) {
    throw new Error(`Nenhum asset ${PY_MINOR} install_only para ${triple} na release ${release.tag_name}`)
  }

  console.log(`📥 ${asset.name}`)
  const tarball = path.join(ROOT, 'resources', 'python', '_py.tar.gz')
  await download(asset.browser_download_url, tarball)

  // The "install_only" tarball has a top-level python/ dir; strip it so we get
  // runtime/bin/python3 (unix) or runtime/python.exe (windows) directly.
  fs.mkdirSync(RUNTIME_DIR, { recursive: true })
  console.log('📦 extraindo…')
  execSync(`tar -xzf "${tarball}" -C "${RUNTIME_DIR}" --strip-components=1`, { stdio: 'inherit' })
  try { fs.unlinkSync(tarball) } catch (_) {}

  if (!fs.existsSync(runtimePythonPath())) {
    throw new Error(`extração falhou — ${runtimePythonPath()} não existe`)
  }
  console.log('✅ Python portátil pronto em', runtimePythonPath())
}

main().catch((err) => { console.error('\n❌', err.message); process.exit(1) })
