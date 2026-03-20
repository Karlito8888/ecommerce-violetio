import { createFileRoute, Link } from "@tanstack/react-router";
import { buildPageMeta } from "@ecommerce/shared";
import ContactForm from "../../components/help/ContactForm";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

/**
 * /help/contact route — Contact & Support Form page.
 *
 * No SSR data fetching needed — the form is entirely client-side.
 * Server function handles submission with rate limiting and honeypot.
 */
export const Route = createFileRoute("/help/contact")({
  component: ContactPage,
  head: () => ({
    meta: buildPageMeta({
      title: "Contact Us — Support | Maison Émile",
      description:
        "Have a question or need help? Submit a support inquiry and we'll get back to you within 24-48 hours.",
      url: "/help/contact",
      siteUrl: SITE_URL,
    }),
    links: [{ rel: "canonical", href: `${SITE_URL}/help/contact` }],
  }),
});

function ContactPage() {
  return (
    <div className="page-wrap contact-page">
      <header className="contact-page__header">
        <h1 className="display-title contact-page__title">Contact Us</h1>
        <p className="contact-page__subtitle">Have a question? We&apos;re here to help.</p>
      </header>

      <div className="contact-page__content">
        <div className="contact-page__form-section">
          <ContactForm />
        </div>
        <aside className="contact-page__info-section">
          <div className="contact-page__info-card">
            <h3 className="contact-page__info-title">Quick answers</h3>
            <p className="contact-page__info-text">
              Check our{" "}
              <Link to="/help" className="contact-page__info-link">
                FAQ & Help Center
              </Link>{" "}
              for instant answers to common questions.
            </p>
          </div>
          <div className="contact-page__info-card">
            <h3 className="contact-page__info-title">Returns & exchanges</h3>
            <p className="contact-page__info-text">
              Return and exchange policies are managed by individual merchants. For return requests,
              please include your order ID in the form and select &ldquo;Order Issue&rdquo; as the
              subject.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
