import type { LogContext, Logger } from "@/ports";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

/** Claves que nunca deben llegar a los logs aunque alguien las pase en el contexto. */
const REDACT = /token|secret|password|authorization|api[_-]?key|refresh/i;

function redact(context: LogContext): LogContext {
  return Object.fromEntries(Object.entries(context).map(([k, v]) => [k, REDACT.test(k) ? "[redactado]" : v]));
}

/** Logger JSON de una línea por evento, con contexto de negocio heredable (salón, cliente, cita…). */
export function createJsonLogger(minLevel: Level = "info", base: LogContext = {}, sink: (line: string) => void = console.log): Logger {
  const emit = (level: Level, message: string, context: LogContext = {}) => {
    if (LEVELS[level] < LEVELS[minLevel]) return;
    sink(JSON.stringify({ ts: new Date().toISOString(), level, msg: message, ...redact(base), ...redact(context) }));
  };
  return {
    debug: (m, c) => emit("debug", m, c),
    info: (m, c) => emit("info", m, c),
    warn: (m, c) => emit("warn", m, c),
    error: (m, c) => emit("error", m, c),
    child: (context) => createJsonLogger(minLevel, { ...base, ...context }, sink),
  };
}

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
};
