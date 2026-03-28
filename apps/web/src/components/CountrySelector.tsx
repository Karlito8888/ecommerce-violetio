import { useState, useCallback, useEffect, useRef } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { CountryOption } from "@ecommerce/shared";
import { queryKeys } from "@ecommerce/shared";
import { getAvailableCountriesFn } from "../server/getProducts";

import "./CountrySelector.css";

const POPULAR_COUNTRY_CODES = new Set(["FR", "US", "GB", "DE", "CA"]);

interface CountrySelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (code: string) => void;
  currentCountryCode: string | null;
}

export default function CountrySelector({
  isOpen,
  onClose,
  onSelect,
  currentCountryCode,
}: CountrySelectorProps) {
  const [search, setSearch] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { data: countries } = useSuspenseQuery({
    queryKey: queryKeys.location.countries(),
    queryFn: () => getAvailableCountriesFn(),
  });

  // Filter by search
  const filtered = (countries ?? []).filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase()),
  );

  // Split into popular and rest
  const popular = filtered.filter((c) => POPULAR_COUNTRY_CODES.has(c.code));
  const rest = filtered.filter((c) => !POPULAR_COUNTRY_CODES.has(c.code));

  // Focus search on open
  useEffect(() => {
    if (isOpen) {
      searchInputRef.current?.focus();
      setSearch("");
    }
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen, onClose]);

  // Close on Escape + focus trap (Tab cycling within dialog)
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      // Focus trap: cycle Tab within the dialog
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'input, button, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleSelect = useCallback(
    (code: string) => {
      onSelect(code);
      onClose();
    },
    [onSelect, onClose],
  );

  if (!isOpen) return null;

  function renderOption(country: CountryOption) {
    const isActive = country.code === currentCountryCode;
    return (
      <button
        key={country.code}
        type="button"
        className={`country-selector__option${isActive ? " country-selector__option--active" : ""}`}
        onClick={() => handleSelect(country.code)}
      >
        <span className="country-selector__flag">{country.flag}</span>
        <span className="country-selector__name">{country.name}</span>
        <span className="country-selector__count">{country.productCount}</span>
      </button>
    );
  }

  return (
    <div className="country-selector" ref={panelRef} role="dialog" aria-label="Select your country">
      <input
        ref={searchInputRef}
        type="text"
        className="country-selector__search"
        placeholder="Search countries..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search countries"
      />

      <div className="country-selector__list">
        {popular.length > 0 && (
          <>
            {popular.map(renderOption)}
            {rest.length > 0 && <hr className="country-selector__separator" />}
          </>
        )}
        {rest.map(renderOption)}
        {filtered.length === 0 && <p className="country-selector__empty">No countries found</p>}
      </div>
    </div>
  );
}
