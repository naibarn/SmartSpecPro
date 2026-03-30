# 060 - Media Studio Content Composer and Publish Router

User request summary:
- Add a new spec after `specs/feature` because the current media-to-publish flow is not complete enough.
- Redesign the Media Studio experience with a new content article panel.
- The panel should let users:
  - enter a topic
  - choose the skill used to generate the article
  - toggle web search and thinking
  - generate the article
  - attach 1 to 6 images or videos from the library
  - choose where to publish: Docs, Blog, or Social post
  - for social posts, choose platform first, then choose the page/channel/account
- General users should only see Social post, not Docs or Blog.
- The solution should reduce the back-and-forth linking problem between Media Studio and publishing destinations.

Assumptions:
- The implementation should reuse existing Media Studio, Library, Docs, Blog, Social Publishing, and Upload-Post infrastructure where possible.
- Temporary generation URLs must not be used as publish references. Assets should be committed to the library first.
- The new spec should define a cleaner V2 workflow instead of extending the old handoff pattern.
