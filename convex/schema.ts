// convex/schema.ts
//
// Schema complet Maison Émile — 23 tables.
// Remplace les 47 migrations SQL Supabase par un seul fichier déclaratif.
//
// Conventions :
//   - _id et _creationTime sont automatiques (pas dans le schema)
//   - v.optional() pour les colonnes NULLABLE
//   - v.union(v.literal(...)) pour les enums (remplace les ENUM Postgres)
//   - v.id("table") pour les FK (remplace les REFERENCES)
//   - v.any() pour les JSONB (payloads, violetData)
//   - Noms d'index incluent les champs : "by_userId_createdAt"
//
// Doc officielle : docs/convex.md — Schema, Data Types, Indexes
// Guide migration : MIGRATION-SUPABASE-TO-CONVEX.md §6

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  // ─── Convex Auth (tables système) ──────────────────────────────
  ...authTables,
  // ═══════════════════════════════════════════════════════════════
  // UTILISATEURS
  // ═══════════════════════════════════════════════════════════════

  userProfiles: defineTable({
    userId: v.string(), // Convex Auth subject ID ou localId (§7 du guide)
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    preferences: v.record(v.string(), v.any()), // JSONB — thème, langue, etc.
    biometricEnabled: v.boolean(),
    isAdmin: v.optional(v.boolean()),
  })
    .index("by_userId", ["userId"])
    .index("by_displayName", ["displayName"]),

  // ═══════════════════════════════════════════════════════════════
  // WEBHOOKS — Idempotence des événements Violet
  // ═══════════════════════════════════════════════════════════════

  webhookEvents: defineTable({
    eventId: v.string(), // Violet X-Violet-Event-Id (UNIQUE)
    eventType: v.string(), // ORDER_UPDATED, BAG_SHIPPED, etc.
    entityId: v.string(), // Violet entity ID (order_id, bag_id, etc.)
    status: v.union(
      v.literal("received"),
      v.literal("processing"),
      v.literal("processed"),
      v.literal("failed"),
    ),
    payload: v.optional(v.any()), // Payload Violet complet (⚠️ max 1MB/document)
    errorMessage: v.optional(v.string()),
    processedAt: v.optional(v.number()), // Timestamp en ms
  })
    .index("by_eventId", ["eventId"]) // Idempotence : first() check
    .index("by_eventType", ["eventType"]) // _creationTime ajouté automatiquement
    .index("by_status", ["status"]),

  // ═══════════════════════════════════════════════════════════════
  // PANIERS
  // ═══════════════════════════════════════════════════════════════

  carts: defineTable({
    violetCartId: v.string(), // Integer Violet stocké en string
    userId: v.optional(v.string()), // Convex auth subject ou localId
    sessionId: v.optional(v.string()), // ID de session anonyme
    status: v.union(
      v.literal("active"),
      v.literal("completed"),
      v.literal("abandoned"),
      v.literal("merged"),
    ),
  })
    .index("by_violetCartId", ["violetCartId"])
    .index("by_userId", ["userId"])
    .index("by_sessionId", ["sessionId"]),

  cartItems: defineTable({
    cartId: v.id("carts"),
    skuId: v.string(),
    quantity: v.number(),
    unitPrice: v.number(), // Cents (integer)
    productName: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
  })
    .index("by_cartId", ["cartId"])
    .index("by_cart_sku", ["cartId", "skuId"]), // Upsert check

  // ═══════════════════════════════════════════════════════════════
  // COMMANDES VIOLET (miroir de l'API Violet)
  // Toutes immuables après création sauf statuts.
  // IDs = IDs Violet (integers/strings), pas de UUID Supabase.
  // ═══════════════════════════════════════════════════════════════

  orders: defineTable({
    violetOrderId: v.string(), // UNIQUE — integer Violet en string
    userId: v.optional(v.string()), // Convex userId (optionnel — commandes guest)
    sessionId: v.optional(v.string()), // Pour associer guest → user à l'inscription
    email: v.string(),
    status: v.string(), // PROCESSING, COMPLETED, CANCELED, REFUNDED, etc.
    subtotal: v.number(), // Cents
    shippingTotal: v.number(),
    taxTotal: v.number(),
    total: v.number(),
    currency: v.string(), // USD, EUR, etc.
    orderLookupTokenHash: v.optional(v.string()), // Hash du token pour guest lookup
    emailSent: v.boolean(),
  })
    .index("by_violetOrderId", ["violetOrderId"]) // Webhook lookup
    .index("by_userId", ["userId"]) // "My Orders" + _creationTime auto
    .index("by_sessionId", ["sessionId"]) // Guest → user merge
    .index("by_email", ["email"]) // Admin lookup
    .index("by_lookupToken", ["orderLookupTokenHash"]) // Guest order lookup
    .index("by_status", ["status"]), // Admin filtering + webhook processors

  orderBags: defineTable({
    orderId: v.id("orders"),
    violetBagId: v.string(), // UNIQUE — integer Violet en string
    merchantName: v.string(),
    merchantId: v.optional(v.id("merchants")), // FK vers merchants (optionnel)
    status: v.string(), // IN_PROGRESS, SHIPPED, DELIVERED, CANCELED, REFUNDED
    financialStatus: v.string(), // UNPAID, PAID, REFUNDED, PARTIALLY_REFUNDED
    fulfillmentStatus: v.optional(v.string()), // PROCESSING, FULFILLED, DELIVERED, etc.
    subtotal: v.number(),
    shippingTotal: v.number(),
    taxTotal: v.number(),
    total: v.number(),
    shippingMethod: v.optional(v.string()),
    trackingNumber: v.optional(v.string()),
    trackingUrl: v.optional(v.string()),
    carrier: v.optional(v.string()),
    commissionRatePct: v.optional(v.number()), // Pourcentage commission (ex: 12.5)
  })
    .index("by_orderId", ["orderId"]) // Join orders → bags
    .index("by_violetBagId", ["violetBagId"]), // Webhook lookup

  orderItems: defineTable({
    orderBagId: v.id("orderBags"),
    skuId: v.string(),
    name: v.string(),
    quantity: v.number(), // > 0
    price: v.number(), // Unit price en cents
    linePrice: v.number(), // price * quantity en cents
    thumbnail: v.optional(v.string()),
  }).index("by_orderBagId", ["orderBagId"]), // Join bags → items

  orderRefunds: defineTable({
    orderBagId: v.id("orderBags"),
    violetRefundId: v.string(), // UNIQUE
    amount: v.number(), // Cents
    reason: v.optional(v.string()),
    currency: v.string(),
    status: v.string(), // PENDING, PROCESSED, FAILED
  })
    .index("by_orderBagId", ["orderBagId"])
    .index("by_violetRefundId", ["violetRefundId"]),

  orderDistributions: defineTable({
    distributionId: v.optional(v.string()), // Violet distribution ID (upsert key)
    violetOrderId: v.string(),
    violetBagId: v.optional(v.string()), // Violet bag ID for bag-level distributions
    type: v.string(), // PAYMENT, REFUND, ADJUSTMENT
    channelAmount: v.optional(v.number()), // Channel share in cents
    stripeFee: v.optional(v.number()), // Stripe fee in cents
    merchantAmount: v.optional(v.number()), // Merchant share in cents
    subtotal: v.optional(v.number()), // Subtotal in cents
    amount: v.number(), // Primary amount (channel_amount) in cents
    currency: v.optional(v.string()),
    status: v.optional(v.string()), // PENDING, QUEUED, SENT, FAILED
    violetData: v.optional(v.any()), // Payload Violet complet
  })
    .index("by_violetOrderId", ["violetOrderId"])
    .index("by_distributionId", ["distributionId"]),

  orderTransfers: defineTable({
    violetTransferId: v.optional(v.string()), // UNIQUE
    violetOrderId: v.string(),
    violetBagId: v.optional(v.number()), // Optionnel — transfer au niveau order
    type: v.string(), // commission, shipping, etc.
    status: v.string(), // pending, paid, failed, canceled
    amount: v.optional(v.number()), // Cents
    currency: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    violetData: v.optional(v.any()),
  })
    .index("by_violetTransferId", ["violetTransferId"])
    .index("by_violetOrderId", ["violetOrderId"]),

  // ═══════════════════════════════════════════════════════════════
  // MARCHANDS VIOLET (miroir)
  // ═══════════════════════════════════════════════════════════════

  merchants: defineTable({
    violetMerchantId: v.number(), // UNIQUE — integer Violet
    name: v.string(),
    domain: v.optional(v.string()),
    countryCode: v.optional(v.string()), // ISO 3166-1 alpha-2
    status: v.optional(v.string()), // active, inactive, etc.
    violetData: v.optional(v.any()), // Données complètes du marchand
  }).index("by_violetMerchantId", ["violetMerchantId"]),

  merchantPayoutAccounts: defineTable({
    violetPayoutAccountId: v.number(), // UNIQUE
    merchantId: v.id("merchants"), // FK vers merchants
    type: v.optional(v.string()), // stripe, etc.
    status: v.string(), // active, inactive, deleted
    requirements: v.optional(v.any()), // Stripe Connect requirements
    violetData: v.optional(v.any()),
  })
    .index("by_violetPayoutAccountId", ["violetPayoutAccountId"])
    .index("by_merchantId", ["merchantId"]),

  // ═══════════════════════════════════════════════════════════════
  // WISHLISTS
  // ═══════════════════════════════════════════════════════════════

  wishlists: defineTable({
    userId: v.string(), // Convex userId ou localId
  }).index("by_userId", ["userId"]),

  wishlistItems: defineTable({
    wishlistId: v.id("wishlists"),
    productId: v.string(), // Violet product ID
  })
    .index("by_wishlistId", ["wishlistId"])
    .index("by_productId", ["productId"]),

  // ═══════════════════════════════════════════════════════════════
  // TRACKING — Événements de navigation
  // ═══════════════════════════════════════════════════════════════

  userEvents: defineTable({
    userId: v.string(), // Convex userId ou localId
    eventType: v.string(), // product_view, search, category_view, add_to_cart
    payload: v.optional(v.any()), // Détails de l'événement (query, productId, etc.)
  })
    .index("by_user_type", ["userId", "eventType"])
    .index("by_user_created", ["userId"]), // _creationTime ajouté automatiquement

  // ═══════════════════════════════════════════════════════════════
  // CONTENU ÉDITORIAL
  // ═══════════════════════════════════════════════════════════════

  contentPages: defineTable({
    slug: v.string(), // UNIQUE
    title: v.string(),
    type: v.string(), // guide, comparison, review, legal, about
    bodyMarkdown: v.string(),
    author: v.string(),
    status: v.string(), // draft, published, archived
    publishedAt: v.optional(v.number()),
    seoTitle: v.optional(v.string()),
    seoDescription: v.optional(v.string()),
    featuredImageUrl: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    relatedSlugs: v.optional(v.array(v.string())),
    sortOrder: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_type", ["type"])
    .index("by_status_published", ["status", "publishedAt"]),

  faqItems: defineTable({
    category: v.string(),
    question: v.string(),
    answerMarkdown: v.string(),
    sortOrder: v.number(),
    isPublished: v.boolean(),
  }).index("by_category_sort", ["category", "sortOrder"]),

  // ═══════════════════════════════════════════════════════════════
  // SUPPORT
  // ═══════════════════════════════════════════════════════════════

  supportInquiries: defineTable({
    name: v.string(),
    email: v.string(),
    subject: v.string(),
    message: v.string(),
    orderId: v.optional(v.string()), // Violet order ID (optionnel)
    status: v.string(), // new, in-progress, resolved
    internalNotes: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_email", ["email"]),

  // ═══════════════════════════════════════════════════════════════
  // NOTIFICATIONS
  // ═══════════════════════════════════════════════════════════════

  userPushTokens: defineTable({
    userId: v.string(), // Convex userId
    expoPushToken: v.string(), // UNIQUE
    deviceId: v.string(),
    platform: v.string(), // ios, android
  })
    .index("by_userId", ["userId"])
    .index("by_expoPushToken", ["expoPushToken"]),

  notificationPreferences: defineTable({
    userId: v.string(), // Convex userId
    notificationType: v.string(), // order_status, shipping, promotion, etc.
    enabled: v.boolean(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_type", ["userId", "notificationType"]),

  notificationLogs: defineTable({
    orderId: v.optional(v.id("orders")),
    notificationType: v.string(), // order_confirmation, shipping_update, etc.
    recipientEmail: v.string(),
    status: v.string(), // pending, sent, failed
    resendEmailId: v.optional(v.string()), // ID Resend pour tracking
    errorMessage: v.optional(v.string()),
    attempt: v.number(),
  })
    .index("by_orderId", ["orderId"])
    .index("by_status", ["status"]),

  // ═══════════════════════════════════════════════════════════════
  // ERREURS & MONITORING
  // ═══════════════════════════════════════════════════════════════

  errorLogs: defineTable({
    source: v.string(), // web, mobile, convex
    errorType: v.string(), // Type d'erreur (network, validation, etc.)
    message: v.string(),
    stackTrace: v.optional(v.string()),
    context: v.optional(v.any()), // Contexte additionnel JSONB
    userId: v.optional(v.string()),
    sessionId: v.optional(v.string()),
  })
    .index("by_source_created", ["source"]) // _creationTime ajouté automatiquement
    .index("by_errorType", ["errorType"]),

  alertRules: defineTable({
    ruleName: v.string(), // UNIQUE
    description: v.optional(v.string()),
    thresholdValue: v.number(),
    timeWindowMinutes: v.number(),
    enabled: v.boolean(),
    lastTriggeredAt: v.optional(v.number()),
  }).index("by_ruleName", ["ruleName"]),
});
