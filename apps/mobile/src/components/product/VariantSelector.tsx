import React, { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ProductVariant, SKU, VariantValue } from "@ecommerce/shared";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/**
 * Mobile variant selector — React Native counterpart to web's VariantSelector.tsx.
 *
 * Uses the same semantic theme tokens as web CSS vars:
 *   Web CSS var          → Mobile theme key
 *   --color-charcoal     → theme.text
 *   --color-ink          → theme.textInverse
 *   --color-stone        → theme.borderStone
 *   --color-gold         → theme.accent
 *   --color-silver       → theme.textMuted
 *   --selection-bg       → theme.selectionBg
 *
 * Colors adapt automatically in dark mode, mirroring the web's [data-theme="dark"] overrides.
 *
 * @see apps/web/src/components/product/VariantSelector.css — web styles
 * @see apps/mobile/src/constants/theme.ts — token mapping
 */

interface VariantSelectorProps {
  variants: ProductVariant[];
  skus: SKU[];
  selectedValues: Record<string, string>;
  onSelect: (variantName: string, value: string) => void;
}

export default function VariantSelector({
  variants,
  skus,
  selectedValues,
  onSelect,
}: VariantSelectorProps) {
  return (
    <View style={styles.container} accessibilityLabel="Product options">
      {variants.map((variant) => (
        <VariantGroup
          key={variant.name}
          variant={variant}
          skus={skus}
          selectedValues={selectedValues}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}

// ─── Variant Group (single dimension: Size, Color, etc.) ────────────────────

interface VariantGroupProps {
  variant: ProductVariant;
  skus: SKU[];
  selectedValues: Record<string, string>;
  onSelect: (variantName: string, value: string) => void;
}

function VariantGroup({ variant, skus, selectedValues, onSelect }: VariantGroupProps) {
  const theme = useTheme();
  const label = variant.name.charAt(0).toUpperCase() + variant.name.slice(1);

  return (
    <View style={styles.group}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <View
        style={styles.options}
        accessibilityRole="radiogroup"
        accessibilityLabel={`Select ${label}`}
      >
        {variant.values.map((value) => (
          <VariantOption
            key={value}
            variantName={variant.name}
            value={value}
            skus={skus}
            selectedValues={selectedValues}
            onSelect={onSelect}
          />
        ))}
      </View>
    </View>
  );
}

// ─── Single Variant Option (pill button) ────────────────────────────────────

interface VariantOptionProps {
  variantName: string;
  value: string;
  skus: SKU[];
  selectedValues: Record<string, string>;
  onSelect: (variantName: string, value: string) => void;
}

function VariantOption({ variantName, value, skus, selectedValues, onSelect }: VariantOptionProps) {
  const theme = useTheme();
  const isActive = selectedValues[variantName] === value;
  const available = isValueAvailable(variantName, value, selectedValues, skus);

  const handlePress = useCallback(() => {
    if (available) {
      onSelect(variantName, value);
    }
  }, [available, variantName, value, onSelect]);

  // Web: border-color: var(--color-stone) → active: var(--color-gold)
  const borderColor = isActive ? theme.accent : theme.borderStone;
  // Web: background: var(--selection-bg) when active
  const backgroundColor = isActive ? theme.selectionBg : "transparent";

  return (
    <Pressable
      onPress={handlePress}
      disabled={!available}
      accessibilityRole="radio"
      accessibilityState={{ checked: isActive, disabled: !available }}
      accessibilityLabel={`${variantName}: ${value}${!available ? " (unavailable)" : ""}`}
      style={[styles.option, { borderColor, backgroundColor }, !available && styles.optionDisabled]}
    >
      <Text
        style={[
          styles.optionText,
          // Web: active → border-color: gold, font-weight: 500
          // Web: option text uses --color-ink (theme.textInverse)
          isActive && { color: theme.accent, fontWeight: "500" },
          !isActive && { color: theme.textInverse },
          // Web: disabled → color: var(--color-silver)
          !available && { color: theme.textMuted },
        ]}
      >
        {value}
      </Text>
    </Pressable>
  );
}

// ─── SKU Availability Check ─────────────────────────────────────────────────

function isValueAvailable(
  variantName: string,
  value: string,
  selectedValues: Record<string, string>,
  skus: SKU[],
): boolean {
  const hypothetical: Record<string, string> = { ...selectedValues, [variantName]: value };

  return skus.some(
    (sku) =>
      sku.inStock &&
      sku.qtyAvailable > 0 &&
      Object.entries(hypothetical).every(([vName, vValue]) =>
        sku.variantValues.some(
          (sv: VariantValue) =>
            sv.variant.toLowerCase() === vName.toLowerCase() && sv.value === vValue,
        ),
      ),
  );
}

// ─── Styles (layout only — colors come from theme) ──────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: Spacing.four,
  },
  group: {
    gap: Spacing.two,
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.04,
  },
  options: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  option: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
  },
  optionDisabled: {
    opacity: 0.4,
  },
  optionText: {
    fontSize: 14,
    fontWeight: "400",
  },
});
