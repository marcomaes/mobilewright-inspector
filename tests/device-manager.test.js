import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { DeviceManager, DeviceError } from '../src/server/lib/device-manager.js'

function fakeDevice(overrides = {}) {
  return { screen: {}, close: async () => {}, ...overrides }
}

function makeLauncher({ devices = [], device = null } = {}) {
  return {
    devices: async () => devices,
    launch: async () => device ?? fakeDevice(),
  }
}

describe('DeviceManager.listDevices', () => {
  test('returns combined ios and android devices', async () => {
    const dm = new DeviceManager({
      ios: makeLauncher({ devices: [{ id: 'sim-1', name: 'iPhone 15' }] }),
      android: makeLauncher({ devices: [{ id: 'emu-1', name: 'Pixel 7' }] }),
    })
    const devices = await dm.listDevices()
    assert.equal(devices.length, 2)
    assert.ok(devices.some(d => d.id === 'sim-1'))
    assert.ok(devices.some(d => d.id === 'emu-1'))
  })

  test('tags ios devices with platform=ios', async () => {
    const dm = new DeviceManager({
      ios: makeLauncher({ devices: [{ id: 'sim-1', name: 'iPhone 15' }] }),
      android: makeLauncher({ devices: [] }),
    })
    const devices = await dm.listDevices()
    assert.equal(devices[0].platform, 'ios')
  })

  test('tags android devices with platform=android', async () => {
    const dm = new DeviceManager({
      ios: makeLauncher({ devices: [] }),
      android: makeLauncher({ devices: [{ id: 'emu-1', name: 'Pixel 7' }] }),
    })
    const devices = await dm.listDevices()
    assert.equal(devices[0].platform, 'android')
  })

  test('tolerates ios failure, still returns android devices', async () => {
    const dm = new DeviceManager({
      ios: { devices: async () => { throw new Error('ios dead') } },
      android: makeLauncher({ devices: [{ id: 'emu-1', name: 'Pixel 7' }] }),
    })
    const devices = await dm.listDevices()
    assert.equal(devices.length, 1)
    assert.equal(devices[0].id, 'emu-1')
  })

  test('tolerates android failure, still returns ios devices', async () => {
    const dm = new DeviceManager({
      ios: makeLauncher({ devices: [{ id: 'sim-1', name: 'iPhone 15' }] }),
      android: { devices: async () => { throw new Error('android dead') } },
    })
    const devices = await dm.listDevices()
    assert.equal(devices.length, 1)
    assert.equal(devices[0].id, 'sim-1')
  })

  test('returns empty array when both platforms fail', async () => {
    const dm = new DeviceManager({
      ios: { devices: async () => { throw new Error('dead') } },
      android: { devices: async () => { throw new Error('dead') } },
    })
    const devices = await dm.listDevices()
    assert.deepEqual(devices, [])
  })
})

describe('DeviceManager.select', () => {
  let dm
  let launched

  beforeEach(() => {
    launched = fakeDevice()
    dm = new DeviceManager({
      ios: { devices: async () => [], launch: async () => launched },
      android: { devices: async () => [] },
    })
  })

  test('sets device and deviceInfo after connect', async () => {
    await dm.select('sim-1', 'ios')
    assert.equal(dm.device, launched)
    assert.deepEqual(dm.deviceInfo, { id: 'sim-1', platform: 'ios' })
  })

  test('throws DeviceError(blocked) when inspect in flight', async () => {
    dm.beginInspect()
    await assert.rejects(
      () => dm.select('sim-1', 'ios'),
      err => err instanceof DeviceError && err.code === 'blocked'
    )
  })

  test('throws DeviceError(in_progress) when select already running', async () => {
    let resolveLaunch
    const dm2 = new DeviceManager({
      ios: { devices: async () => [], launch: () => new Promise(r => { resolveLaunch = r }) },
      android: { devices: async () => [] },
    })
    const first = dm2.select('sim-1', 'ios')
    await assert.rejects(
      () => dm2.select('sim-2', 'ios'),
      err => err instanceof DeviceError && err.code === 'in_progress'
    )
    resolveLaunch(fakeDevice())
    await first
  })

  test('wraps launcher errors in DeviceError(connect_failed)', async () => {
    const dm2 = new DeviceManager({
      ios: { devices: async () => [], launch: async () => { throw new Error('timeout') } },
      android: { devices: async () => [] },
    })
    await assert.rejects(
      () => dm2.select('sim-1', 'ios'),
      err => err instanceof DeviceError && err.code === 'connect_failed'
    )
  })

  test('closes previous device before connecting new one', async () => {
    let closed = false
    const first = fakeDevice({ close: async () => { closed = true } })
    const dm2 = new DeviceManager({
      ios: { devices: async () => [], launch: async () => first },
      android: { devices: async () => [] },
    })
    await dm2.select('sim-1', 'ios')

    const second = fakeDevice()
    dm2['_DeviceManager__ios'] = { devices: async () => [], launch: async () => second }
    // Directly swap the launcher to return second device
    const dm3 = new DeviceManager({
      ios: {
        devices: async () => [],
        launch: async (opts) => opts.deviceId === 'sim-2' ? second : first,
      },
      android: { devices: async () => [] },
    })
    await dm3.select('sim-1', 'ios')
    await dm3.select('sim-2', 'ios')
    assert.equal(dm3.device, second)
  })
})

describe('DeviceManager.beginInspect / endInspect', () => {
  let dm

  beforeEach(() => {
    dm = new DeviceManager({
      ios: makeLauncher(),
      android: makeLauncher(),
    })
  })

  test('beginInspect returns true when idle', () => {
    assert.equal(dm.beginInspect(), true)
  })

  test('beginInspect returns false when already in flight', () => {
    dm.beginInspect()
    assert.equal(dm.beginInspect(), false)
  })

  test('beginInspect returns true after endInspect', () => {
    dm.beginInspect()
    dm.endInspect()
    assert.equal(dm.beginInspect(), true)
  })
})

describe('DeviceError', () => {
  test('is instanceof Error', () => {
    assert.ok(new DeviceError('msg', 'blocked') instanceof Error)
  })

  test('has name=DeviceError', () => {
    assert.equal(new DeviceError('msg', 'blocked').name, 'DeviceError')
  })

  test('has code property', () => {
    assert.equal(new DeviceError('msg', 'blocked').code, 'blocked')
    assert.equal(new DeviceError('msg', 'in_progress').code, 'in_progress')
  })
})
