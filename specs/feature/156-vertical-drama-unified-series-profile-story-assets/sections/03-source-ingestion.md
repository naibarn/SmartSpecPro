# Section 03 — Source Ingestion

Support `known_place`, `coordinates`, `product_snapshot`, `software_review`,
`documentary_note`, user uploads, and generated references through one source
hub.

Map input accepts place URL, place ID, address, or coordinates. It stores
metadata only and never copies third-party map imagery. A generated place image
must be labelled an AI interpretation unless a user-approved reference proves
the appearance.

Product selection snapshots the description and available media. The creator
selects which images/videos are included; the system does not silently attach
every marketplace image. Changes to the source snapshot mark dependent slots
stale and require re-review. Catalog refreshes never silently replace or remove
creator-selected media; the UI shows changed fields and offers re-sync/review.

Documentary subject notes and source locators are stored with claim scope and
capture time. They are editorial evidence metadata, not automatically verified
facts; unsupported claims remain blocked or clearly labelled.

Images and videos use managed tenant-scoped media assets. Provider/result URLs
are provenance, not ownership or availability proof; a generated reference may
enter text/story planning but remains production-blocked until it is linked to
a managed media object and passes rights/disclosure review.

Upload validation uses content sniffing and allowlisted image/video types with
bounded size, duration, resolution, frame count, and payload size. It performs
malware/quarantine checks, rejects arbitrary remote fetches/SSRF, and emits
rights, person/face, private-location, venue-restriction, and sponsorship flags
for creator review. Coordinates may be rounded or omitted from prompts when
privacy policy requires it.
