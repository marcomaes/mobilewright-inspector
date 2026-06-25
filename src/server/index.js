import express from 'express'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { DeviceManager } from './lib/device-manager.js'
import { createDevicesRouter } from './routes/devices.js'
import { createInspectRouter } from './routes/inspect.js'
import { logger } from './lib/logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, '..', '..', 'public')
const PORT = process.env.PORT ? Number(process.env.PORT) : 4621

const app = express()
app.use(express.json())
app.use(express.static(publicDir))

app.get('/health', (_req, res) => res.json({ ok: true }))

const deviceManager = new DeviceManager()
app.use('/api/devices', createDevicesRouter(deviceManager))
app.use('/api', createInspectRouter(deviceManager))

const server = app.listen(PORT, () => {
  logger.info(`md-inspector running at http://localhost:${PORT}`)
})

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} is already in use. Set the PORT env var to use a different port.`)
  } else {
    logger.error(`Server error: ${err.message}`)
  }
  process.exit(1)
})

async function shutdown(signal) {
  logger.info(`${signal} received, shutting down`)
  // Close device with a 3s timeout — driver can hang on unresponsive devices.
  await Promise.race([
    deviceManager.close(),
    new Promise(resolve => setTimeout(resolve, 3000)),
  ])
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  process.exit(0)
}

process.on('SIGINT',  () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
