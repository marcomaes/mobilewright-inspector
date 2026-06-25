function log(level, msg) {
  process.stdout.write(`[${new Date().toISOString()}] ${level} ${msg}\n`)
}

export const logger = {
  info:  msg => log('INFO ', msg),
  warn:  msg => log('WARN ', msg),
  error: msg => log('ERROR', msg),
}
