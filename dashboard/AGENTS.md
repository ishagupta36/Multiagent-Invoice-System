<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Project rules

- Plain Vite + React SPA with file-based @tanstack/react-router; no TanStack Start, SSR, server functions or server routes — firm policy.
- Page metadata lives in index.html, not route head() — there is no SSR head rendering.
- All invoice state lives in src/lib/store.tsx (React context, persisted to sessionStorage) — review actions must work in-browser with no backend.
- Seed cohort and masters live in src/lib/data.ts; control results are computed by evaluate() so totals and flags stay derived, never hardcoded.
- Any backend needing secrets must go through Supabase Edge Functions — firm policy.
- Record every dependency in THIRD-PARTY-LICENSES.md — firm OSS standard.
