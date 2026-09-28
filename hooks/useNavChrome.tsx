import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// Lets a screen take over the bottom of the window from the tab bar (the
// library's edit mode swaps the nav for an action bar, like the web EditBar
// does by sitting over it).
type Chrome = { navHidden: boolean; setNavHidden: (hidden: boolean) => void };

const NavChromeContext = createContext<Chrome | undefined>(undefined);

export function NavChromeProvider({ children }: { children: ReactNode }) {
  const [navHidden, setNavHidden] = useState(false);
  const value = useMemo(() => ({ navHidden, setNavHidden }), [navHidden]);
  return <NavChromeContext.Provider value={value}>{children}</NavChromeContext.Provider>;
}

export function useNavChrome() {
  const ctx = useContext(NavChromeContext);
  if (!ctx) throw new Error("useNavChrome() must be used within <NavChromeProvider>");
  return ctx;
}

// Hides the bottom nav while `hidden` is true, restoring it on cleanup.
export function useHideNav(hidden: boolean) {
  const { setNavHidden } = useNavChrome();
  useEffect(() => {
    setNavHidden(hidden);
    return () => setNavHidden(false);
  }, [hidden, setNavHidden]);
}
