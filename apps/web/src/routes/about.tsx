import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  component: About,
});

function About() {
  return (
    <main className="page-wrap about">
      <section className="island-shell about__section">
        <p className="island-kicker about__kicker">About</p>
        <h1 className="display-title about__title">A small starter with room to grow.</h1>
        <p className="about__text">
          TanStack Start gives you type-safe routing, server functions, and modern SSR defaults. Use
          this as a clean foundation, then layer in your own routes, styling, and add-ons.
        </p>
      </section>
    </main>
  );
}
