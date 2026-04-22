import { Stack } from "expo-router";

export default function MerchantsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Merchants" }} />
      <Stack.Screen name="[merchantId]" options={{ title: "" }} />
    </Stack>
  );
}
