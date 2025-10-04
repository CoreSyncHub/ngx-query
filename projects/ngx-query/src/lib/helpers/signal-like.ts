export type SignalLike<T> = () => T;
export const isSignalLike = <T>(v: unknown): v is SignalLike<T> =>
  typeof v === 'function';
