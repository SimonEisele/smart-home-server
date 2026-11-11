/**
 * Keeps a page's filter choices for the browser session, so going to a detail
 * and back does not reset them. Storage can be unavailable (private mode), so
 * every access is guarded and the defaults always work.
 */
export function loadFilters<T extends object>(key: string, defaults: T): T {
  try {
    const raw = sessionStorage.getItem(`filters:${key}`);
    if (!raw) return { ...defaults };
    const saved = JSON.parse(raw) as Partial<T>;
    const result = { ...defaults };
    for (const name of Object.keys(defaults) as (keyof T)[]) {
      if (saved[name] !== undefined && typeof saved[name] === typeof defaults[name]) result[name] = saved[name] as T[keyof T];
    }
    return result;
  } catch {
    return { ...defaults };
  }
}

export function saveFilters<T extends object>(key: string, value: T): void {
  try {
    sessionStorage.setItem(`filters:${key}`, JSON.stringify(value));
  } catch {
    /* storage unavailable: filters simply reset next time */
  }
}

/** True when any field differs from its default (drives the "Zurücksetzen" link). */
export function filtersChanged<T extends object>(value: T, defaults: T): boolean {
  return (Object.keys(defaults) as (keyof T)[]).some(name => value[name] !== defaults[name]);
}
