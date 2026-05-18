// packages/shared/src/utils/localId.ts
//
// Modèle localId — Remplace signInAnonymously() de Supabase.
//
// Violet.io n'ayant aucun concept d'utilisateur côté Channel
// (cf. MIGRATION-SUPABASE-TO-CONVEX.md §3.1), nous n'avons pas besoin
// d'une session anonyme côté serveur. Un simple UUID local suffit pour
// associer les données pré-inscription (wishlist, tracking, cart metadata).
//
// Cycle de vie :
//   1. Visiteur → getOrCreateLocalId() → UUID dans localStorage/SecureStore
//   2. Données (wishlist, events) associées au localId dans Convex
//   3. Inscription → migrateAnonymousData(localId, userId) dans Convex
//   4. clearLocalId() après migration réussie
//
// Avantages vs anonymous auth Supabase :
//   - Pas de session serveur → pas de connexion WebSocket inutile
//   - Pas de quota anonymous users
//   - Même UX : les données persistent entre les visites

const LOCAL_ID_KEY = "maison_emile_local_id";

/**
 * Retourne un ID local persistant.
 * - Web : localStorage
 * - Mobile : SecureStore (à adapter côté mobile, voir getLocalIdMobile)
 */
export function getOrCreateLocalId(): string {
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    let id = localStorage.getItem(LOCAL_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(LOCAL_ID_KEY, id);
    }
    return id;
  }
  // Mobile : ne pas appeler cette fonction directement.
  // Utiliser getLocalIdMobile() qui encapsule SecureStore.
  throw new Error("localId: not available in this environment. Use getLocalIdMobile() on mobile.");
}

/** Supprime le localId après migration vers userId Convex Auth. */
export function clearLocalId(): void {
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    localStorage.removeItem(LOCAL_ID_KEY);
  }
}

/** Retourne le localId existant sans en créer un nouveau. */
export function getLocalId(): string | null {
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    return localStorage.getItem(LOCAL_ID_KEY);
  }
  return null;
}
