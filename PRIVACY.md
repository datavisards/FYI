# Privacy Policy

The privacy policy for the FYI browser extension is published at:

**https://fyi.datavisards-hkust.workers.dev/privacy-policy**

That page is the canonical text and the URL given to the Chrome Web Store. It is served by this
repo, from `src/app/privacy-policy/page.tsx`, so edit it there.

This file used to hold a second copy of the policy. Keeping two in parallel is what let them drift:
the copy here ended up stating that no authentication credentials were collected, while the store
disclosure correctly declared that the user's API key is transmitted. A policy that contradicts its
own listing is the kind of mismatch that fails a review, so there is now one text and this pointer.
