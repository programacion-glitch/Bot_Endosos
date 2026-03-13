import winston from 'winston';
import path from 'path';
import fs from 'fs';

const logsPath = path.resolve('./logs');
if (!fs.existsSync(logsPath)) fs.mkdirSync(logsPath, { recursive: true });

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

export const logger = winston.createLogger({
  level: 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    logFormat
  ),
  transports: [
    // Console output with color
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'HH:mm:ss' }),
        errors({ stack: true }),
        logFormat
      ),
    }),
    // Daily combined log
    new winston.transports.File({
      filename: path.join(logsPath, 'bot.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      tailable: true,
    }),
    // Error-only log
    new winston.transports.File({
      filename: path.join(logsPath, 'errors.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
      tailable: true,
    }),
  ],
});

export function logEmailProcessing(subject: string, commandCount: number): void {
  logger.info(`=== Processing email: "${subject}" | Commands: ${commandCount} ===`);
}

export function logCommandStart(commandType: string, index: number, total: number): void {
  logger.info(`[${index}/${total}] Executing command: ${commandType}`);
}

export function logCommandResult(commandType: string, success: boolean, message: string): void {
  if (success) {
    logger.info(`[OK] ${commandType}: ${message}`);
  } else {
    logger.error(`[FAIL] ${commandType}: ${message}`);
  }
}
