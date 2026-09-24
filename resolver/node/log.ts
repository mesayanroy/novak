export interface Log {
  info(msg: string): void;
  warn(msg: string): void;
}

export function makeLog(id: string): Log {
  const stamp = () => new Date().toISOString().slice(11, 19);
  return {
    info: (m) => console.log(`${stamp()} [${id}] ${m}`),
    warn: (m) => console.warn(`${stamp()} [${id}] WARN ${m}`),
  };
}
