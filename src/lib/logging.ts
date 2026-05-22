type LogLevel = 'info' | 'warn' | 'error';

type LogMetadata = Record<string, string | number | boolean | null | undefined>;

type ServerLogEvent = {
  event: string;
  route: string;
  status: number;
  durationMs: number;
  level?: LogLevel;
  metadata?: LogMetadata;
};

const levelPriority: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
};

function configuredLogLevel(): LogLevel | 'silent' {
  const level = process.env.LOG_LEVEL;
  if (level === 'silent' || level === 'error' || level === 'warn' || level === 'info') {
    return level;
  }
  return 'info';
}

function shouldLog(level: LogLevel): boolean {
  const configured = configuredLogLevel();
  if (configured === 'silent') return false;
  return levelPriority[level] <= levelPriority[configured];
}

function cleanMetadata(metadata: LogMetadata | undefined): LogMetadata | undefined {
  if (!metadata) return undefined;
  const entries = Object.entries(metadata).filter(([, value]) => value !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function logServerEvent({
  event,
  route,
  status,
  durationMs,
  level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
  metadata,
}: ServerLogEvent): void {
  if (!shouldLog(level)) return;

  const logLine = {
    timestamp: new Date().toISOString(),
    level,
    event,
    route,
    status,
    durationMs,
    metadata: cleanMetadata(metadata),
  };

  console.log(JSON.stringify(logLine));
}
