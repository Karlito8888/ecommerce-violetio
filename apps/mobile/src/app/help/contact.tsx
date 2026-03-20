import { useState } from "react";
import {
  ScrollView,
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createSupabaseClient, insertSupportInquiry, SUPPORT_SUBJECTS } from "@ecommerce/shared";
import type { SupportSubject } from "@ecommerce/shared";
import { ThemedText } from "@/components/themed-text";
import { Colors, Spacing, MaxContentWidth } from "@/constants/theme";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Client-side rate limiting (anon RLS only allows INSERT, not SELECT for count queries)
const recentSubmissions: number[] = [];
const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function checkClientRateLimit(): boolean {
  const now = Date.now();
  while (recentSubmissions.length > 0 && recentSubmissions[0] < now - RATE_WINDOW_MS) {
    recentSubmissions.shift();
  }
  return recentSubmissions.length >= RATE_LIMIT;
}

interface FormErrors {
  name?: string;
  email?: string;
  message?: string;
}

export default function ContactScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState<SupportSubject>("General Question");
  const [orderId, setOrderId] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (!name.trim()) errs.name = "Name is required";
    if (!email || !EMAIL_REGEX.test(email)) errs.email = "A valid email address is required";
    if (message.length < 20) errs.message = "Message must be at least 20 characters";
    if (message.length > 2000) errs.message = "Message must be no more than 2000 characters";
    return errs;
  }

  async function handleSubmit() {
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    if (checkClientRateLimit()) {
      Alert.alert("Rate limit", "You've submitted too many requests. Please try again later.");
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      const client = createSupabaseClient();
      const result = await insertSupportInquiry(client, {
        name: name.trim(),
        email: email.trim(),
        subject,
        message,
        orderId: orderId.trim() || undefined,
      });

      if (!result) {
        Alert.alert("Error", "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }

      // Fire-and-forget: send emails via Edge Function
      try {
        await client.functions.invoke("send-support-email", {
          body: {
            inquiry_id: result.id,
            name: name.trim(),
            email: email.trim(),
            subject,
            message,
            order_id: orderId.trim() || null,
          },
        });
      } catch {
        // Email failure should not block the submission
      }

      recentSubmissions.push(Date.now());
      setSubmitted(true);
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <SafeAreaView style={styles.center} edges={["bottom"]}>
        <View style={styles.successContainer}>
          <ThemedText style={styles.successTitle}>Thank you!</ThemedText>
          <ThemedText style={styles.successText}>
            We&apos;ve received your inquiry and will respond within 24-48 hours. A confirmation
            email has been sent to {email}.
          </ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.field}>
          <ThemedText style={styles.label}>Name</ThemedText>
          <TextInput
            style={[styles.input, errors.name ? styles.inputError : null]}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            accessibilityLabel="Name"
          />
          {errors.name && <ThemedText style={styles.errorText}>{errors.name}</ThemedText>}
        </View>

        <View style={styles.field}>
          <ThemedText style={styles.label}>Email</ThemedText>
          <TextInput
            style={[styles.input, errors.email ? styles.inputError : null]}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Email"
          />
          {errors.email && <ThemedText style={styles.errorText}>{errors.email}</ThemedText>}
        </View>

        <View style={styles.field}>
          <ThemedText style={styles.label}>Subject</ThemedText>
          <View style={styles.subjectContainer}>
            {SUPPORT_SUBJECTS.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.subjectOption, subject === s && styles.subjectOptionActive]}
                onPress={() => setSubject(s)}
                accessibilityRole="radio"
                accessibilityState={{ checked: subject === s }}
              >
                <ThemedText style={[styles.subjectText, subject === s && styles.subjectTextActive]}>
                  {s}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <ThemedText style={styles.label}>
            Order ID <ThemedText style={styles.optional}>(optional)</ThemedText>
          </ThemedText>
          <TextInput
            style={styles.input}
            value={orderId}
            onChangeText={setOrderId}
            placeholder="e.g., VIO-12345"
            placeholderTextColor={Colors.light.textSecondary}
            accessibilityLabel="Order ID"
          />
        </View>

        <View style={styles.field}>
          <ThemedText style={styles.label}>Message</ThemedText>
          <TextInput
            style={[styles.textArea, errors.message ? styles.inputError : null]}
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            maxLength={2000}
            accessibilityLabel="Message"
          />
          <View style={styles.fieldFooter}>
            {errors.message && <ThemedText style={styles.errorText}>{errors.message}</ThemedText>}
            <ThemedText style={[styles.charCount, message.length > 1800 && styles.charCountWarn]}>
              {message.length}/2000
            </ThemedText>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel={submitting ? "Sending message" : "Send message"}
        >
          <ThemedText style={styles.submitText}>
            {submitting ? "Sending…" : "Send Message"}
          </ThemedText>
        </TouchableOpacity>

        <View style={styles.infoSection}>
          <ThemedText style={styles.infoText}>
            Return and exchange policies are managed by individual merchants. For return requests,
            include your order ID and select &quot;Order Issue&quot; as the subject.
          </ThemedText>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.four,
  },
  scrollContent: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    width: "100%",
  },
  field: {
    marginBottom: Spacing.four,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: Spacing.one,
  },
  optional: {
    fontWeight: "400",
    color: Colors.light.textSecondary,
  },
  input: {
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: Colors.light.backgroundSelected,
    borderRadius: 8,
    fontSize: 16,
    color: Colors.light.text,
    backgroundColor: Colors.light.backgroundElement,
  },
  inputError: {
    borderColor: "#b54a4a",
  },
  textArea: {
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: Colors.light.backgroundSelected,
    borderRadius: 8,
    fontSize: 16,
    color: Colors.light.text,
    backgroundColor: Colors.light.backgroundElement,
    minHeight: 120,
  },
  fieldFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.one,
  },
  charCount: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginLeft: "auto",
  },
  charCountWarn: {
    color: "#b54a4a",
  },
  errorText: {
    fontSize: 13,
    color: "#b54a4a",
    marginTop: Spacing.one,
  },
  subjectContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  subjectOption: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderWidth: 1,
    borderColor: Colors.light.backgroundSelected,
    borderRadius: 20,
    backgroundColor: Colors.light.backgroundElement,
  },
  subjectOptionActive: {
    borderColor: Colors.light.tint,
    backgroundColor: Colors.light.tint + "15",
  },
  subjectText: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  subjectTextActive: {
    color: Colors.light.tint,
    fontWeight: "500",
  },
  submitButton: {
    backgroundColor: Colors.light.tint,
    paddingVertical: Spacing.three,
    borderRadius: 8,
    alignItems: "center",
    marginTop: Spacing.two,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  successContainer: {
    alignItems: "center",
    padding: Spacing.four,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: Spacing.three,
  },
  successText: {
    fontSize: 16,
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 24,
  },
  infoSection: {
    marginTop: Spacing.six,
    padding: Spacing.four,
    backgroundColor: Colors.light.backgroundElement,
    borderRadius: 8,
  },
  infoText: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    lineHeight: 20,
  },
});
