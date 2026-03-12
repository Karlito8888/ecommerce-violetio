/**
 * ImageGallery component tests.
 *
 * Tests cover:
 * - Renders hero image with correct src
 * - Renders thumbnails sorted by displayOrder
 * - Clicking thumbnail updates hero image
 * - Empty images array renders placeholder
 * - Accessibility: role="region", aria-label="Product images"
 */
import { afterEach, describe, it, expect } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { ProductImage } from "@ecommerce/shared";
import ImageGallery from "../ImageGallery";

const mockImages: ProductImage[] = [
  { id: "img-1", url: "https://cdn.example.com/img1.jpg", displayOrder: 2, primary: false },
  { id: "img-2", url: "https://cdn.example.com/img2.jpg", displayOrder: 0, primary: true },
  { id: "img-3", url: "https://cdn.example.com/img3.jpg", displayOrder: 1, primary: false },
];

function renderToContainer(element: React.ReactElement): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(element);
  });
  return container;
}

describe("ImageGallery", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("renders hero image with primary image src", () => {
    const container = renderToContainer(
      <ImageGallery images={mockImages} productName="Test Product" />,
    );

    const heroImg = container.querySelector(".image-gallery__hero img") as HTMLImageElement;
    expect(heroImg).not.toBeNull();
    // Primary image (img-2, displayOrder=0) should be selected as initial,
    // but after sorting by displayOrder, primary is at index 0
    // img-2 (order 0) is at sorted[0], and it's primary → starts as active
    expect(heroImg.src).toContain("img2.jpg");
  });

  it("renders thumbnails sorted by displayOrder", () => {
    const container = renderToContainer(
      <ImageGallery images={mockImages} productName="Test Product" />,
    );

    const thumbs = container.querySelectorAll(".image-gallery__thumb img");
    expect(thumbs.length).toBe(3);
    // Sorted: img-2 (order 0), img-3 (order 1), img-1 (order 2)
    expect((thumbs[0] as HTMLImageElement).src).toContain("img2.jpg");
    expect((thumbs[1] as HTMLImageElement).src).toContain("img3.jpg");
    expect((thumbs[2] as HTMLImageElement).src).toContain("img1.jpg");
  });

  it("clicking thumbnail updates hero image", () => {
    const container = renderToContainer(
      <ImageGallery images={mockImages} productName="Test Product" />,
    );

    // Click the third thumbnail (img-1, displayOrder=2)
    const thumbButtons = container.querySelectorAll(".image-gallery__thumb");
    act(() => {
      (thumbButtons[2] as HTMLButtonElement).click();
    });

    const heroImg = container.querySelector(".image-gallery__hero img") as HTMLImageElement;
    expect(heroImg.src).toContain("img1.jpg");
  });

  it("renders placeholder when images array is empty", () => {
    const container = renderToContainer(<ImageGallery images={[]} productName="Test Product" />);

    const placeholder = container.querySelector(".image-gallery__placeholder");
    expect(placeholder).not.toBeNull();

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();

    // No thumbnails
    const thumbs = container.querySelectorAll(".image-gallery__thumb");
    expect(thumbs.length).toBe(0);
  });

  it("has role='region' and aria-label='Product images'", () => {
    const container = renderToContainer(
      <ImageGallery images={mockImages} productName="Test Product" />,
    );

    const gallery = container.querySelector(".image-gallery");
    expect(gallery!.getAttribute("role")).toBe("region");
    expect(gallery!.getAttribute("aria-label")).toBe("Product images");
  });

  it("thumbnails have aria-label 'View image N of M'", () => {
    const container = renderToContainer(
      <ImageGallery images={mockImages} productName="Test Product" />,
    );

    const thumbButtons = container.querySelectorAll(".image-gallery__thumb");
    expect(thumbButtons[0].getAttribute("aria-label")).toBe("View image 1 of 3");
    expect(thumbButtons[2].getAttribute("aria-label")).toBe("View image 3 of 3");
  });

  it("marks active thumbnail with --active modifier", () => {
    const container = renderToContainer(
      <ImageGallery images={mockImages} productName="Test Product" />,
    );

    const thumbButtons = container.querySelectorAll(".image-gallery__thumb");
    // Primary image (index 0 after sort) should be active
    expect(thumbButtons[0].classList.contains("image-gallery__thumb--active")).toBe(true);
    expect(thumbButtons[1].classList.contains("image-gallery__thumb--active")).toBe(false);
  });
});
