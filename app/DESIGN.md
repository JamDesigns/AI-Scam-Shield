# Luminous Navy interface

The UI follows variant A of the ten screen proposals selected on 21 November 2026.
The implementation is responsive Flutter, not raster screenshots embedded as controls.

`lib/design/shield_design.dart` owns the navy palette, mint actions, cyan outlines,
vector shield, semantic risk overview and statistics donut. Analysis, image authenticity,
video evidence, account management, About and privacy reading share this theme.
Screening scores remain scores out of 100; unavailable results remain inconclusive.
The donut uses the server's actual risk counts, including the inconclusive bucket.

The Premium introduction opens the existing RevenueCat flow. Store-owned purchase
and account screens retain their SDK/platform presentation and real product prices.
The interface does not invent subscription dates, prices or forensic evidence.
All new interface copy is included in the 25 existing language catalogs.

`test/luminous_design_test.dart` exercises actual result and subscription widgets at
320 logical pixels with text enlarged to 180%, in every supported locale. It also
checks that the Premium introduction returns an explicit store action. Opt-in PNG
previews use synthetic analysis fixtures and SDK fonts; they are not device evidence.
Set `SHIELD_PREVIEW_DIR` and `SHIELD_PREVIEW_FONTS` to generate these ignored previews.

Physical Android validation is required before repository publication. The local
debug build retains the existing API endpoint and development signing certificate.
No API, database, quota or production configuration changes are part of this design.

## Locale visual audit

The opt-in `test/visual_locale_audit_test.dart` covers ten actual application views,
including the home navigation, offline home state, populated statistics, About and
localized Markdown privacy reading. With `SHIELD_LOCALE_AUDIT_DIR` and SDK fonts
configured, it captures every language and checks 393 px at normal text scale and
320 px at 180% text scale. Each page is scrolled and checked for overflowing or
clipped `RenderParagraph` content. Media analysis fixtures contain synthetic text;
this audit does not exercise live providers, purchases or every language on a phone.

The audit found and corrected clipped input labels/examples, ellipsized media-type
labels in history and long privacy toolbar titles. Input labels now sit outside
the field, the example wraps inside the empty field as a placeholder and disappears when typing, media labels retain their full text, and the
privacy toolbar measures its translated title at the current system text scale.
