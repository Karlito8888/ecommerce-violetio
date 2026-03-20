import { useState } from "react";
import { SUPPORT_SUBJECTS } from "@ecommerce/shared";
import type { SupportSubject } from "@ecommerce/shared";
import { submitSupportFn } from "../../server/submitSupport";

type FormState = "idle" | "submitting" | "success" | "error";

interface FormErrors {
  name?: string;
  email?: string;
  message?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateForm(fields: { name: string; email: string; message: string }): FormErrors {
  const errors: FormErrors = {};
  if (!fields.name.trim()) errors.name = "Name is required";
  if (!fields.email || !EMAIL_REGEX.test(fields.email))
    errors.email = "A valid email address is required";
  if (fields.message.length < 20) errors.message = "Message must be at least 20 characters";
  if (fields.message.length > 2000) errors.message = "Message must be no more than 2000 characters";
  return errors;
}

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState<SupportSubject>("General Question");
  const [orderId, setOrderId] = useState("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [formState, setFormState] = useState<FormState>("idle");
  const [submitError, setSubmitError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validationErrors = validateForm({ name, email, message });
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setFormState("submitting");
    setSubmitError("");

    try {
      const result = await submitSupportFn({
        data: {
          inquiry: {
            name: name.trim(),
            email: email.trim(),
            subject,
            message,
            orderId: orderId.trim() || undefined,
          },
          honeypot: honeypot || undefined,
        },
      });

      if (result.success) {
        setFormState("success");
      } else {
        setSubmitError(result.error ?? "Something went wrong. Please try again.");
        setFormState("error");
      }
    } catch {
      setSubmitError("Something went wrong. Please try again.");
      setFormState("error");
    }
  }

  if (formState === "success") {
    return (
      <div className="contact-form__success" role="status">
        <svg
          className="contact-form__success-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M8 12l2.5 2.5L16 9" />
        </svg>
        <h2 className="contact-form__success-title">Thank you!</h2>
        <p className="contact-form__success-text">
          We&apos;ve received your inquiry and will respond within 24-48 hours. A confirmation email
          has been sent to <strong>{email}</strong>.
        </p>
      </div>
    );
  }

  return (
    <form className="contact-form" onSubmit={handleSubmit} noValidate>
      {/* Honeypot — hidden from real users, filled by bots */}
      <div className="contact-form__honeypot" aria-hidden="true">
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      <div className="contact-form__field">
        <label className="contact-form__label" htmlFor="contact-name">
          Name
        </label>
        <input
          id="contact-name"
          className={`contact-form__input${errors.name ? " contact-form__input--error" : ""}`}
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-describedby={errors.name ? "contact-name-error" : undefined}
        />
        {errors.name && (
          <p id="contact-name-error" className="contact-form__error" role="alert">
            {errors.name}
          </p>
        )}
      </div>

      <div className="contact-form__field">
        <label className="contact-form__label" htmlFor="contact-email">
          Email
        </label>
        <input
          id="contact-email"
          className={`contact-form__input${errors.email ? " contact-form__input--error" : ""}`}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={errors.email ? "contact-email-error" : undefined}
        />
        {errors.email && (
          <p id="contact-email-error" className="contact-form__error" role="alert">
            {errors.email}
          </p>
        )}
      </div>

      <div className="contact-form__field">
        <label className="contact-form__label" htmlFor="contact-subject">
          Subject
        </label>
        <select
          id="contact-subject"
          className="contact-form__select"
          value={subject}
          onChange={(e) => setSubject(e.target.value as SupportSubject)}
        >
          {SUPPORT_SUBJECTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="contact-form__field">
        <label className="contact-form__label" htmlFor="contact-order-id">
          Order ID <span className="contact-form__optional">(optional)</span>
        </label>
        <input
          id="contact-order-id"
          className="contact-form__input"
          type="text"
          placeholder="e.g., VIO-12345"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
        />
      </div>

      <div className="contact-form__field">
        <label className="contact-form__label" htmlFor="contact-message">
          Message
        </label>
        <textarea
          id="contact-message"
          className={`contact-form__textarea${errors.message ? " contact-form__textarea--error" : ""}`}
          required
          minLength={20}
          maxLength={2000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-describedby={
            errors.message ? "contact-message-error contact-message-count" : "contact-message-count"
          }
        />
        <div className="contact-form__field-footer">
          {errors.message && (
            <p id="contact-message-error" className="contact-form__error" role="alert">
              {errors.message}
            </p>
          )}
          <span
            id="contact-message-count"
            className={`contact-form__char-count${message.length > 1800 ? " contact-form__char-count--warn" : ""}`}
          >
            {message.length}/2000
          </span>
        </div>
      </div>

      {submitError && (
        <div className="contact-form__global-error" role="alert">
          {submitError}
        </div>
      )}

      <button type="submit" className="contact-form__submit" disabled={formState === "submitting"}>
        {formState === "submitting" ? "Sending…" : "Send Message"}
      </button>
    </form>
  );
}
