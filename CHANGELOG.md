# Changelog

## [1.1.4] - 2026-08-04
### Fixed
- Fixed exact header key matching for "LifeTime Deliveries" (was looking for "lifetime" instead of "lifetime deliveries").

## [1.1.3] - 2026-08-04
### Fixed
- Added cache buster query parameters (`?v=1.1.3`) to index.html to force browser cache invalidation for JavaScript and CSS updates.

## [1.1.2] - 2026-08-04
### Changed
- Merged "No Reviews" and "% No Reviews" into a single combined card.
- Added dedicated boxes for "Total Tips" and "No-Tip Orders".

## [1.1.1] - 2026-08-04
### Fixed
- Made CSV row detection for Ratings and Feedback sections resilient across all cell offsets.

## [1.1.0] - 2026-08-04
### Added
- Replicated full Google Sheet Dashboard layout.
- Added all 13 columns to the Monthly Summary table (Hours, Active Hours, Miles, Base Pay, Tips, Cash Tips, Taxes, Total, Hourly Rate, # No Tipping, % No Tipping).
- Added Grand Total row in tfoot.
- Added Dasher Ratings & Star Breakdown section cards (LifeTime, Customer Rating, Overall Rating, 5★–1★, No Reviews, % No Reviews).
- Added Customer Feedback & Compliments section badges (Communication, Order handling, Followed instructions, Friendliness, Above & Beyond).

## [1.0.0] - 2026-08-04
### Added
- Initial release of the Dasher Tracker dashboard.
- Real-time data fetching from Google Sheets CSV export.
- Premium UI with dark mode, glassmorphism, and responsive design.
- Summary metric cards for total earnings, deliveries, dash sessions, and average per delivery.
- Earnings Over Time chart using Chart.js.
- Detailed dash session table.
