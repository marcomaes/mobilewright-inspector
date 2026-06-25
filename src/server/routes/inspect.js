import { Router } from 'express'
import { deriveElementList } from '../lib/locator-derivation.js'
import { logger } from '../lib/logger.js'

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1500
const ATTEMPT_TIMEOUT_MS = 10_000

/**
 * @param {import('../lib/device-manager.js').DeviceManager} deviceManager
 */
export function createInspectRouter(deviceManager) {
  const router = Router()

  // GET /api/inspect
  // Returns screenshot + element list from the same moment (no drift).
  router.get('/inspect', async (_req, res) => {
    const device = deviceManager.device
    if (!device) {
      res.status(409).json({ error: 'No device selected' })
      return
    }
    if (!deviceManager.beginInspect()) {
      res.status(503).json({ error: 'Inspect already in progress' })
      return
    }

    try {
      const { screenshotBuffer, tree } = await attemptWithRetry(device)

      // Read screenshot pixel dimensions from PNG IHDR chunk (bytes 16-23).
      const pxWidth = screenshotBuffer.readUInt32BE(16)
      const pxHeight = screenshotBuffer.readUInt32BE(20)

      // iOS bounds are in logical points; screenshot is at device pixel density (2x/3x).
      // Android bounds are in physical pixels; screenshot is also in physical pixels.
      // Scale only for iOS: pick the integer that yields a logical width in 300-520pt.
      const platform = deviceManager.deviceInfo?.platform ?? 'ios'
      const scale = platform === 'ios'
        ? ([3, 2, 1].find(s => { const lw = pxWidth / s; return lw >= 300 && lw <= 520 }) ?? 1)
        : 1

      const elements = deriveElementList(tree).map(({ node, locator }, index) => ({
        index,
        type: node.type,
        label: node.label ?? null,
        text: node.text ?? null,
        bounds: node.bounds,
        isVisible: node.isVisible,
        locator,
      }))

      res.json({
        screenshot: `data:image/png;base64,${screenshotBuffer.toString('base64')}`,
        screen: { width: pxWidth / scale, height: pxHeight / scale },
        elements,
      })
    } catch (err) {
      logger.error(`Inspect failed: ${err.message}`)
      res.status(500).json({ error: err.message })
    } finally {
      deviceManager.endInspect()
    }
  })

  return router
}

async function attemptWithRetry(device) {
  let lastErr
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await withTimeout(
        Promise.all([device.screen.screenshot(), device.screen.viewTree()]).then(
          ([screenshotBuffer, tree]) => ({ screenshotBuffer, tree })
        ),
        ATTEMPT_TIMEOUT_MS,
        `Device operation timed out after ${ATTEMPT_TIMEOUT_MS}ms`
      )
    } catch (err) {
      lastErr = err
      logger.warn(`Inspect attempt ${i + 1}/${MAX_RETRIES} failed: ${err.message}`)
      if (i < MAX_RETRIES - 1) await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
    }
  }
  throw lastErr
}

// Note: withTimeout rejects after ms but cannot cancel the underlying device operation.
// The device call continues in the background until the driver itself times out or errors.
// This is acceptable here because the device is shared state managed by DeviceManager,
// not a resource that leaks. A follow-up inspect attempt will reuse the same connection.
function withTimeout(promise, ms, message) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms) }),
  ]).finally(() => clearTimeout(timer))
}
