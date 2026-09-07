# TODO - Production hardening (Reviews + Gallery + remove placeholders)

- [ ] Reviews (customer): replace placeholder/unfinished UI copy with professional empty state.
- [ ] Reviews (customer): implement full feature set: verified-only submit, star rating, text, optional image upload, like/helpful, rating breakdown, filters, pagination, responsive UI.
- [ ] Reviews (API): update `app/api/reviews/route.ts` to support required query params (filter/sort/pagination/breakdown/helpful).
- [ ] Reviews (Admin): update `app/admin/reviews/page.tsx` to match new review fields and helpful moderation.
- [ ] Gallery (customer): replace emoji/gradient placeholder gallery with real MongoDB media rendering.
- [ ] Gallery (data model): extend `types/index.ts` and any content models/endpoints to support categories/featured/order/mediaUrls.
- [ ] Gallery (customer): implement category filter, featured section, reorder (as per available admin context), delete/edit reflection, masonry, lightbox, lazy loading, mobile swipe.
- [ ] Gallery (Admin): ensure upload/reorder/delete/edit writes to MongoDB and updates customer immediately.
- [ ] Remove dummy/demo data: stop runtime auto-seed (remove `/api/seed` call in `context/AdminContext.tsx`) and ensure `/api/seed` is admin/dev-only or removed.
- [ ] Remove all placeholder strings: no remaining “Not loaded yet”, “Empty”, “Coming Soon”, dummy placeholder messages anywhere.
- [ ] Verify production readiness: run `npm run lint` and `npm run build`.
- [ ] Runtime verification: check no broken links/images, no React warnings, no API/DB errors.

