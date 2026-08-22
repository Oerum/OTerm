export function shellQuote(value: string): string {
  if (/^[a-zA-Z0-9_.-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}
