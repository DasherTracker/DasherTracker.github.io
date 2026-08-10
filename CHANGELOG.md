# Changelog

## [2.0.1] - 2026-08-10
### Fixed
- Resolved undefined property crash in `processData` by declaring `totalBasePay`, `totalTips`, `totalCashTips`, `totalTaxes` and attaching `gasNum` and `hourlyRateNum` to monthly objects.
- Wrapped `processData` execution in a try/catch block to log errors and render a user-friendly error state instead of hanging indefinitely.

## [2.0.0] - 2026-08-10
### Added
- Net Profit Widget (`Total Pay - Gas`) & Gas Efficiency ROI metric (`$ Earned per $1 Gas Spent`).
- Multi-Chart Visualizer Switcher: Line (Earnings Trend), Bar (Pay vs Gas Comparison), and Donut (Income & Expense Split).
- Animated Number Count-Up effect for all summary card metrics.
- Achievement Badges in Monthly Table (🏆 Top Pay, ⚡ Peak Rate).
- Custom icons & neon glow cards for Customer Feedback compliments (💬 🛍️ 📝 😊 ⭐).

## [1.6.0] - 2026-08-10
### Added
- Redesigned Ratings & Reviews section with a dedicated Star Rating Breakdown line (5★ through 1★) featuring star graphics, rating counts, and visual gold progress bars.
- Elevated top hero metrics (Lifetime Deliveries, Customer Rating ★ 5.0, Overall Rating 99%, Unreviewed Orders).

## [1.5.0] - 2026-08-10
### Changed
- Cleaned up title text across rating and feedback cards (fixed typos, quotes, and case).
- Added star badge icon (`★`) for 5 Stars rating card and enhanced glow effects in CSS.

## [1.4.0] - 2026-08-10
### Fixed
- Bulletproofed section row parsing by checking multiple keywords (e.g., 'customer rating', '5 stars') and matching value rows using digit validation to handle multiline CSV headers like 'Above & Beyond'.

## [1.3.1] - 2026-08-10
### Fixed
- Fixed row matching for ratings/feedback sections by using substring inclusion (`.includes('lifetime')`) instead of strict string equality.

## [1.3.0] - 2026-08-10
### Added
- Added individual cards for every rating & review header from C17 to K17 (Customer Rating, Overall Rating, 5★ down to 1★, No Reviews, % No Reviews) matched directly to Row 18 values.

## [1.2.0] - 2026-08-10
### Added
- Added "Gas" expenditure data (column N / index 13 from Google Sheet Dashboard) to summary cards, monthly table, and total row.

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
