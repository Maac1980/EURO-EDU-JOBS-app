import * as Sentry from '@sentry/node'
import { logger } from './logger.js'

export function initSentry() {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) {
    logger.warn('SENTRY_DSN not set — error monitoring disabled')
    return
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
    ],
  })

  logger.info('Sentry error monitoring initialized')
}

export function sentryErrorHandler() {
  return Sentry.expressErrorHandler()
}

export { Sentry }
