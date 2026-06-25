import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import express from 'express'
import { DeviceManager } from '../src/server/lib/device-manager.js'
import { createDevicesRouter } from '../src/server/routes/devices.js'
import { createInspectRouter } from '../src/server/routes/inspect.js'

// ---- minimal HTTP helpers ----

function request(method, url, body) {
  return new Promise((resolve, reject) => {
    const payload = body != null ? JSON.stringify(body) : null
    const parsed = new URL(url)
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }) }
        catch { resolve({ status: res.statusCode, body: data }) }
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

const get  = url        => request('GET',  url, null)
const post = (url, b)   => request('POST', url, b)

// ---- test server setup ----

function buildApp(dm) {
  const app = express()
  app.use(express.json())
  app.get('/health', (_req, res) => res.json({ ok: true }))
  app.use('/api/devices', createDevicesRouter(dm))
  app.use('/api', createInspectRouter(dm))
  return app
}

describe('GET /health', () => {
  let server, base

  before(async () => {
    const dm = new DeviceManager({
      ios: { devices: async () => [] },
      android: { devices: async () => [] },
    })
    await new Promise(resolve => {
      server = buildApp(dm).listen(0, resolve)
    })
    base = `http://localhost:${server.address().port}`
  })

  after(() => new Promise(resolve => server.close(resolve)))

  test('returns 200 { ok: true }', async () => {
    const { status, body } = await get(`${base}/health`)
    assert.equal(status, 200)
    assert.equal(body.ok, true)
  })
})

describe('GET /api/devices', () => {
  let server, base

  before(async () => {
    const dm = new DeviceManager({
      ios: { devices: async () => [{ id: 'sim-1', name: 'iPhone 15' }] },
      android: { devices: async () => [{ id: 'emu-1', name: 'Pixel 7' }] },
    })
    await new Promise(resolve => {
      server = buildApp(dm).listen(0, resolve)
    })
    base = `http://localhost:${server.address().port}`
  })

  after(() => new Promise(resolve => server.close(resolve)))

  test('returns combined device list with null activeId', async () => {
    const { status, body } = await get(`${base}/api/devices`)
    assert.equal(status, 200)
    assert.ok(Array.isArray(body.devices))
    assert.equal(body.devices.length, 2)
    assert.ok(body.devices.some(d => d.id === 'sim-1'))
    assert.ok(body.devices.some(d => d.id === 'emu-1'))
    assert.equal(body.activeId, null)
  })
})

describe('POST /api/devices/:id/select', () => {
  let server, base

  before(async () => {
    const dm = new DeviceManager({
      ios: {
        devices: async () => [{ id: 'sim-1', name: 'iPhone 15' }],
        launch: async () => ({ screen: {}, close: async () => {} }),
      },
      android: { devices: async () => [] },
    })
    await new Promise(resolve => {
      server = buildApp(dm).listen(0, resolve)
    })
    base = `http://localhost:${server.address().port}`
  })

  after(() => new Promise(resolve => server.close(resolve)))

  test('returns 400 when platform is missing', async () => {
    const { status } = await post(`${base}/api/devices/sim-1/select`, {})
    assert.equal(status, 400)
  })

  test('returns 400 when platform is invalid', async () => {
    const { status } = await post(`${base}/api/devices/sim-1/select`, { platform: 'windows' })
    assert.equal(status, 400)
  })

  test('returns 404 when device id is unknown', async () => {
    const { status } = await post(`${base}/api/devices/unknown/select`, { platform: 'ios' })
    assert.equal(status, 404)
  })

  test('returns 200 when device exists and connect succeeds', async () => {
    const { status, body } = await post(`${base}/api/devices/sim-1/select`, { platform: 'ios' })
    assert.equal(status, 200)
    assert.equal(body.ok, true)
  })
})

describe('GET /api/inspect — no device selected', () => {
  let server, base

  before(async () => {
    const dm = new DeviceManager({
      ios: { devices: async () => [] },
      android: { devices: async () => [] },
    })
    await new Promise(resolve => {
      server = buildApp(dm).listen(0, resolve)
    })
    base = `http://localhost:${server.address().port}`
  })

  after(() => new Promise(resolve => server.close(resolve)))

  test('returns 409 when no device is connected', async () => {
    const { status } = await get(`${base}/api/inspect`)
    assert.equal(status, 409)
  })
})
