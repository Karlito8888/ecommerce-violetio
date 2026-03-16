/**
 * RetryPrompt — Shown when a Server Function call times out or network fails.
 *
 * ## Key behaviors
 * - Preserves ALL form state (no data loss)
 * - NOT automatic retry — user explicitly chooses
 * - After 3 retries: suggests "try again later"
 *
 * @see Story 4.7 AC#1 — network timeouts trigger retry prompt with preserved form state
 */

interface RetryPromptProps {
  /** Human-readable description of what failed */
  operationName: string;
  /** Number of retry attempts so far */
  retryCount: number;
  /** Whether the retry is currently in progress */
  isRetrying: boolean;
  /** Called when user clicks Retry */
  onRetry: () => void;
  /** Called when user clicks Cancel (go back to previous step) */
  onCancel: () => void;
}

const MAX_RETRIES = 3;

export function RetryPrompt({
  operationName,
  retryCount,
  isRetrying,
  onRetry,
  onCancel,
}: RetryPromptProps) {
  const exhausted = retryCount >= MAX_RETRIES;

  return (
    <div className="retry-prompt" role="alert" aria-live="assertive">
      <div className="retry-prompt__icon" aria-hidden="true">
        ⏱
      </div>
      <div className="retry-prompt__body">
        <p className="retry-prompt__message">
          {exhausted
            ? `We're having trouble ${operationName.toLowerCase()}. Please try again later — your information is saved.`
            : `The request is taking longer than expected. Your information is saved.`}
        </p>
        <div className="retry-prompt__actions">
          {!exhausted && (
            <button
              type="button"
              className="retry-prompt__action retry-prompt__action--retry"
              onClick={onRetry}
              disabled={isRetrying}
            >
              {isRetrying ? "Retrying…" : "Retry"}
            </button>
          )}
          <button
            type="button"
            className="retry-prompt__action retry-prompt__action--cancel"
            onClick={onCancel}
            disabled={isRetrying}
          >
            {exhausted ? "Go Back" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
