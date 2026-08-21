"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Un número recordado en el navegador, leído sin romper la hidratación.
 *
 * El problema que resuelve: `localStorage` no existe en el servidor, así que el
 * valor guardado no se puede leer durante el primer render. Leerlo en un efecto
 * y hacer `setState` funciona, pero encadena un render extra y React lo marca
 * como olor —con razón—. `useSyncExternalStore` es exactamente para esto:
 * renderiza el default en el servidor y en la hidratación, y compara contra el
 * valor real del cliente en cuanto puede, sin efecto de por medio.
 *
 * Además escucha el evento `storage`, así que si la persona tiene el sistema
 * abierto en dos pestañas, el cambio se ve en las dos.
 */

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // El evento `storage` sólo dispara para cambios hechos en OTRA pestaña; los
  // propios se notifican a mano al escribir.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function read(key: string, allowed: readonly number[], fallback: number): number {
  try {
    const saved = Number(window.localStorage.getItem(key));
    return allowed.includes(saved) ? saved : fallback;
  } catch {
    // Navegador con el almacenamiento bloqueado: se usa el default y listo.
    return fallback;
  }
}

export function useStoredNumber(
  key: string,
  allowed: readonly number[],
  fallback: number
): [number, (value: number) => void] {
  const value = useSyncExternalStore(
    subscribe,
    // Devuelve un número: al ser primitivo, dos lecturas iguales son iguales
    // para React y no provocan un render en loop.
    useCallback(() => read(key, allowed, fallback), [key, allowed, fallback]),
    useCallback(() => fallback, [fallback])
  );

  const set = useCallback(
    (next: number) => {
      try {
        window.localStorage.setItem(key, String(next));
      } catch {
        /* sin almacenamiento: el cambio vale para esta sesión nada más */
      }
      for (const listener of listeners) listener();
    },
    [key]
  );

  return [value, set];
}
