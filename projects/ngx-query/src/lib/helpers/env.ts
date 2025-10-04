export function isBrowser(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.addEventListener === 'function'
  );
}
