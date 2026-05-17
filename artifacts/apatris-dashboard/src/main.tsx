import { createRoot } from "react-dom/client";
import App from "./App";
import "./i18n";
import "./index.css";
import { migrateLegacyTokens } from "./lib/auth-token-migration";

// Phase 1 Item 2.1 (Day 28) — must run BEFORE AuthProvider mounts so
// existing legacy-key sessions migrate to the canonical eej_token
// key in time for AuthProvider's first getToken() call. Legacy key
// names live only in lib/auth-token-migration.ts (single source of
// truth — see acceptance criterion in that file's header).
// Idempotent: no-op on repeat loads after migration completes.
migrateLegacyTokens();

createRoot(document.getElementById("root")!).render(<App />);
// build_trigger: Sat Mar 21 12:15:44 PM UTC 2026
