import { useEffect, useState } from "react";

interface HorizonCollection<T> {
  store: (doc: T) => { subscribe: () => void };
  order: (
    field: string,
    direction: "ascending" | "descending"
  ) => HorizonCollection<T>;
  limit: (n: number) => HorizonCollection<T>;
  watch: () => {
    subscribe: (callback: (data: T[]) => void) => { unsubscribe: () => void };
  };
}

declare global {
  interface Window {
    Horizon: (
      options?: unknown
    ) => (collection: string) => HorizonCollection<unknown>;
  }
}

export function useHorizon<T>(
  collectionName: string
): HorizonCollection<T> | null {
  const [horizon, setHorizon] = useState<
    ((collection: string) => HorizonCollection<T>) | null
  >(null);

  useEffect(() => {
    // Wait for Horizon SDK to load
    const checkHorizon = setInterval(() => {
      if (window.Horizon) {
        const hz = window.Horizon();
        setHorizon(() => hz as (collection: string) => HorizonCollection<T>);
        clearInterval(checkHorizon);
      }
    }, 100);

    return () => clearInterval(checkHorizon);
  }, []);

  return horizon ? horizon(collectionName) : null;
}
