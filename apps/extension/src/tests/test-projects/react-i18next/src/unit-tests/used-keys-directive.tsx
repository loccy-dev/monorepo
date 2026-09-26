declare function t(key: string): string;

export function Cta({ action }: { action: string }) {
  // loccy-used-keys: cta.*
  return <button>{t(`cta.${action}`)}</button>;
}
