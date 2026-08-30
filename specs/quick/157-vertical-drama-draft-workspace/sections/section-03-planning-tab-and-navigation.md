# Section 03 — Planning Tab and Navigation

Add a `planning` tab to the series detail page and sync selected tabs to the URL.
The Planning surface summarizes only the compact active plan/QC state and provides
links to the canonical Bible, Characters, Locations, Series Memory, Assets, and
Overview surfaces. Successful shell creation opens Planning.

Add an explicit History action that first calls the metadata-only history query;
only a selected version calls the full-content query. Normal tab/detail loading
must not call either history procedure.
