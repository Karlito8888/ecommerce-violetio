import { createContext, useCallback, useContext, useState } from "react";

const STORAGE_KEY = "app-banner-dismissed";

function isDismissed(): boolean {
  if (typeof window === "undefined") return true;
  return sessionStorage.getItem(STORAGE_KEY) === "true";
}

interface AppBannerContextValue {
  visible: boolean;
  show: () => void;
  dismiss: () => void;
}

export const AppBannerContext = createContext<AppBannerContextValue>({
  visible: false,
  show: () => {},
  dismiss: () => {},
});

export function useAppBannerProvider() {
  const [visible, setVisible] = useState(false);

  const show = useCallback(() => {
    if (!isDismissed()) {
      setVisible(true);
    }
  }, []);

  const dismiss = useCallback(() => {
    sessionStorage.setItem(STORAGE_KEY, "true");
    setVisible(false);
  }, []);

  return { visible, show, dismiss };
}

export function useAppBanner() {
  return useContext(AppBannerContext);
}
