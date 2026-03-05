import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: App });

function App() {
  return (
    <main className="page-wrap" style={{ padding: "3.5rem 1rem 2rem" }}>
      <section className="island-shell hero rise-in">
        <div className="hero__glow hero__glow--top" />
        <div className="hero__glow hero__glow--bottom" />
        <p className="island-kicker hero__kicker">TanStack Start Base Template</p>
        <h1 className="display-title hero__title">Start simple, ship quickly.</h1>
        <p className="hero__desc">
          This base starter intentionally keeps things light: two routes, clean structure, and the
          essentials you need to build from scratch.
        </p>
        <div className="hero__actions">
          <a href="/about" className="hero__btn hero__btn--primary">
            About This Starter
          </a>
          <a
            href="https://tanstack.com/router"
            target="_blank"
            rel="noopener noreferrer"
            className="hero__btn hero__btn--secondary"
          >
            Router Guide
          </a>
        </div>
      </section>

      <section className="features">
        {[
          ["Type-Safe Routing", "Routes and links stay in sync across every page."],
          ["Server Functions", "Call server code from your UI without creating API boilerplate."],
          ["Streaming by Default", "Ship progressively rendered responses for faster experiences."],
          ["Vanilla CSS", "Design with custom properties and BEM — no framework needed."],
        ].map(([title, desc], index) => (
          <article
            key={title}
            className="island-shell features__card rise-in"
            style={{ animationDelay: `${index * 90 + 80}ms` }}
          >
            <h2 className="features__title">{title}</h2>
            <p className="features__desc">{desc}</p>
          </article>
        ))}
      </section>

      <section className="island-shell quick-start">
        <p className="island-kicker quick-start__kicker">Quick Start</p>
        <ul className="quick-start__list">
          <li>
            Edit <code>src/routes/index.tsx</code> to customize the home page.
          </li>
          <li>
            Update <code>src/components/Header.tsx</code> and <code>src/components/Footer.tsx</code>{" "}
            for brand links.
          </li>
          <li>
            Add routes in <code>src/routes</code> and tweak visual tokens in{" "}
            <code>src/styles.css</code>.
          </li>
        </ul>
      </section>
    </main>
  );
}
