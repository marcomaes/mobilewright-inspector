import { ios as defaultIos, android as defaultAndroid } from 'mobilewright'
import { logger } from './logger.js'

export class DeviceError extends Error {
  /**
   * @param {string} message
   * @param {'blocked' | 'in_progress' | 'not_found' | 'connect_failed'} code
   */
  constructor(message, code) {
    super(message)
    this.name = 'DeviceError'
    this.code = code
  }
}

export class DeviceManager {
  #ios
  #android

  /** @type {import('@mobilewright/core').Device | null} */
  #activeDevice = null

  /** @type {{ id: string, platform: 'ios' | 'android' } | null} */
  #activeDeviceInfo = null

  // Coordination flags: prevent select() from closing a device mid-inspect,
  // and prevent a new inspect from starting while a device switch is in progress.
  #inspectInFlight = false
  #selecting = false

  /** @param {{ ios?: object, android?: object }} [launchers] */
  constructor({ ios = defaultIos, android = defaultAndroid } = {}) {
    this.#ios = ios
    this.#android = android
  }

  /**
   * List all connected/booted devices across both platforms.
   * Each platform is queried independently so a failure on one does not hide the other.
   * @returns {Promise<Array<import('@mobilewright/protocol').DeviceInfo & { platform: string }>>}
   */
  async listDevices() {
    const [iosResult, androidResult] = await Promise.allSettled([
      this.#ios.devices(),
      this.#android.devices(),
    ])
    if (iosResult.status === 'rejected') logger.warn(`iOS device list failed: ${iosResult.reason?.message}`)
    if (androidResult.status === 'rejected') logger.warn(`Android device list failed: ${androidResult.reason?.message}`)
    return [
      ...(iosResult.status === 'fulfilled' ? iosResult.value.map(d => ({ ...d, platform: 'ios' })) : []),
      ...(androidResult.status === 'fulfilled' ? androidResult.value.map(d => ({ ...d, platform: 'android' })) : []),
    ]
  }

  /**
   * Connect to a device, closing any previous connection first.
   * Throws DeviceError if an inspect is in flight or a select is already in progress.
   * @param {string} deviceId
   * @param {'ios' | 'android'} platform
   * @returns {Promise<import('@mobilewright/core').Device>}
   */
  async select(deviceId, platform) {
    if (this.#inspectInFlight) throw new DeviceError('Device switch blocked: inspect in progress', 'blocked')
    if (this.#selecting) throw new DeviceError('Device switch already in progress', 'in_progress')

    this.#selecting = true
    try {
      if (this.#activeDevice) {
        logger.info(`Closing previous device ${this.#activeDeviceInfo?.id}`)
        try { await this.#activeDevice.close() } catch {}
        this.#activeDevice = null
        this.#activeDeviceInfo = null
      }
      logger.info(`Connecting to ${platform} device ${deviceId}`)
      const launcher = platform === 'ios' ? this.#ios : this.#android
      this.#activeDevice = await launcher.launch({ deviceId, autoStart: true, autoAppLaunch: false })
      this.#activeDeviceInfo = { id: deviceId, platform }
      logger.info(`Connected to ${deviceId}`)
      return this.#activeDevice
    } catch (err) {
      if (err instanceof DeviceError) throw err
      logger.error(`Failed to connect to ${deviceId}: ${err.message}`)
      throw new DeviceError(err.message, 'connect_failed')
    } finally {
      this.#selecting = false
    }
  }

  /**
   * Mark the start of an inspect operation.
   * Returns false if an inspect is already in flight or a device switch is in progress.
   */
  beginInspect() {
    if (this.#inspectInFlight || this.#selecting) return false
    this.#inspectInFlight = true
    return true
  }

  endInspect() {
    this.#inspectInFlight = false
  }

  /** Close the active device connection. Safe to call with no active device. */
  async close() {
    if (this.#activeDevice) {
      logger.info(`Closing device ${this.#activeDeviceInfo?.id}`)
      try { await this.#activeDevice.close() } catch {}
      this.#activeDevice = null
      this.#activeDeviceInfo = null
    }
  }

  /** @returns {import('@mobilewright/core').Device | null} */
  get device() { return this.#activeDevice }

  /** @returns {{ id: string, platform: 'ios' | 'android' } | null} */
  get deviceInfo() { return this.#activeDeviceInfo }
}
