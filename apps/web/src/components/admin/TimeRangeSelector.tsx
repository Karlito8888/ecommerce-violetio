/**
 * @module TimeRangeSelector
 *
 * Time range picker for the admin dashboard. Supports preset ranges
 * (Today, 7 Days, 30 Days) and a custom date range with date pickers.
 *
 * Accessibility features:
 * - `role="group"` + `aria-label` on button group for screen reader context
 * - `aria-pressed` on range buttons to indicate active selection
 * - Custom date inputs wrapped in `<label>` elements for implicit association
 */

import { useState } from "react";
import type { TimeRange, TimeRangeParams } from "@ecommerce/shared";

const RANGES: { value: TimeRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "custom", label: "Custom" },
];

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (params: TimeRangeParams) => void;
}

/** Renders a toggle button group for time range selection with optional custom date pickers. */
export default function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  function handleSelect(range: TimeRange) {
    if (range === "custom") {
      // Only trigger data fetch if both dates are already set
      if (customStart && customEnd) {
        onChange({ range, customStart, customEnd });
      }
      // Otherwise just switch to custom mode — UI shows date pickers, no fetch
      return;
    }
    onChange({ range });
  }

  function handleCustomApply() {
    if (customStart && customEnd) {
      onChange({ range: "custom", customStart, customEnd });
    }
  }

  return (
    <div className="time-range">
      <div className="time-range__buttons" role="group" aria-label="Time range">
        {RANGES.map((r) => (
          <button
            key={r.value}
            type="button"
            className={`time-range__button${value === r.value ? " time-range__button--active" : ""}`}
            onClick={() => handleSelect(r.value)}
            aria-pressed={value === r.value}
          >
            {r.label}
          </button>
        ))}
      </div>

      {value === "custom" && (
        <div className="time-range__custom">
          <label className="time-range__label">
            From
            <input
              type="date"
              className="time-range__date-input"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
          </label>
          <label className="time-range__label">
            To
            <input
              type="date"
              className="time-range__date-input"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="time-range__apply"
            onClick={handleCustomApply}
            disabled={!customStart || !customEnd}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
