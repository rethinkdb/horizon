import { ref, onMounted } from "vue";

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

export function useHorizon<T>(collectionName: string) {
  const collection = ref<HorizonCollection<T> | null>(null);

  onMounted(() => {
    const checkHorizon = setInterval(() => {
      if (window.Horizon) {
        const hz = window.Horizon();
        collection.value = hz(collectionName) as HorizonCollection<T>;
        clearInterval(checkHorizon);
      }
    }, 100);
  });

  return { collection };
}
