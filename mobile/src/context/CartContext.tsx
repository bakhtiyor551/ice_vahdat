import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type CartLine = {
  productId: number;
  name: string;
  price: number;
  quantity: number;
};

type CartCtx = {
  lines: CartLine[];
  add: (p: { id: number; name: string; price: number }) => void;
  inc: (productId: number) => void;
  dec: (productId: number) => void;
  remove: (productId: number) => void;
  clear: () => void;
  total: number;
};

const Ctx = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  const add = useCallback((p: { id: number; name: string; price: number }) => {
    setLines((prev) => {
      const i = prev.findIndex((x) => x.productId === p.id);
      if (i < 0) return [...prev, { productId: p.id, name: p.name, price: p.price, quantity: 1 }];
      const next = [...prev];
      next[i] = { ...next[i], quantity: next[i].quantity + 1 };
      return next;
    });
  }, []);

  const inc = useCallback((productId: number) => {
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, quantity: l.quantity + 1 } : l))
    );
  }, []);

  const dec = useCallback((productId: number) => {
    setLines((prev) =>
      prev
        .map((l) => (l.productId === productId ? { ...l, quantity: l.quantity - 1 } : l))
        .filter((l) => l.quantity > 0)
    );
  }, []);

  const remove = useCallback((productId: number) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const total = useMemo(() => lines.reduce((s, l) => s + l.price * l.quantity, 0), [lines]);

  const value = useMemo(
    () => ({ lines, add, inc, dec, remove, clear, total }),
    [lines, add, inc, dec, remove, clear, total]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCart");
  return v;
}
