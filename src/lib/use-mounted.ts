import { useSyncExternalStore } from "react";

// Returns false during SSR / first render, true once on the client — without a
// setState-in-effect (which the react-hooks lint rule forbids). Used to render
// same-origin <img> tiles client-only so their onError handler is attached
// before the request fires (the rider/driver pages are force-dynamic / SSR'd,
// so a server-rendered img can error before hydration and leave a broken icon).
const emptySubscribe = () => () => {};

export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}
