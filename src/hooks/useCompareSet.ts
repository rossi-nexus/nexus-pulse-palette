import { useCallback, useState } from "react";
import type { ActorCardData } from "@/hooks/useSearch";
import { toast } from "sonner";

const MAX_COMPARE = 3;

export function useCompareSet() {
  const [items, setItems] = useState<ActorCardData[]>([]);

  const toggle = useCallback((actor: ActorCardData) => {
    setItems((prev) => {
      const exists = prev.find((a) => a.id === actor.id);
      if (exists) return prev.filter((a) => a.id !== actor.id);
      if (prev.length >= MAX_COMPARE) {
        toast.error(`Compare allows up to ${MAX_COMPARE} actors. Deselect one first.`);
        return prev;
      }
      return [...prev, actor];
    });
  }, []);

  const clear = useCallback(() => setItems([]), []);
  const has = useCallback((id: string) => items.some((a) => a.id === id), [items]);

  return { items, toggle, clear, has, max: MAX_COMPARE };
}
