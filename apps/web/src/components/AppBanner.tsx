import { useAppBanner } from "../hooks/useAppBanner";

export default function AppBanner() {
  const { visible, dismiss } = useAppBanner();

  if (!visible) return null;

  return (
    <div className="app-banner" role="region" aria-label="App download promotion">
      <div className="page-wrap app-banner__inner">
        <p className="app-banner__text">Get the app for a better experience</p>
        <button
          type="button"
          className="app-banner__dismiss"
          onClick={dismiss}
          aria-label="Dismiss app download banner"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18" />
            <path d="M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
