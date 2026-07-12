# TODO

- [ ] Create React warning triage plan for setState-in-render + missing key warnings.
- [ ] Identify exact bad component(s) from stack trace (HotReload, MenuSection, WhyChooseUs, About).
- [ ] Fix root cause(s):
  - [ ] Ensure no state updates happen during render (especially triggered by Framer Motion / AnimatePresence usage).
  - [ ] Ensure lists always map with stable unique `key` values (and guard against empty/undefined ids in seeded data).
- [ ] Add defensive `key` fallbacks (e.g., `key={item.id ?? `${item.name}-${i}`}`) where ids can be empty.
- [ ] Run `npm run lint` and `npm run build` (or `next build`) to confirm warnings are gone.

