# UI Browser Verification

Browser review is valuable **after a development build is available**. It is not a universal prerequisite for merging ordinary UI/UX code into the protected development branch unless an actual repository-required check mandates it.

Test the authorized development URL, authenticated tenant and primary user flow when they exist. Check relevant mobile/tablet/desktop layouts and interaction states; collect screenshots and console errors only where they help diagnose or demonstrate behavior. Use existing browser tooling or a remote authorized browser; do not assume a browser on another machine shares Debian `localhost`.

If browser execution is not available, mark the result `NOT_RUN` and continue independent implementation and integration. Do not claim UAT passed. Record the route, build/runtime SHA, observed behavior, unfinished UI gaps and retest action in the existing HandOff.
