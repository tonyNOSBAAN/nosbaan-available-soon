# NOSBAAN available-soon feed

Every 3 hours a GitHub Action reads the Hostaway calendar and writes `available-soon.json`: apartments with a free window of 30+ nights starting in the next 45 days, soonest first (up to 24). The nosbaan.com homepage reads it to show "Available soon" homes.

Public fields only: listing id, public title, building, area, bedrooms, guests, size, first photo, free-from date, free nights, minimum nights. No prices, owners, tags, guests or bookings.

Feed URL: `https://raw.githubusercontent.com/tonyNOSBAAN/nosbaan-available-soon/main/available-soon.json`

Secrets (Settings › Secrets and variables › Actions): `HOSTAWAY_API_KEY` (required), `HOSTAWAY_ACCOUNT_ID` (optional, default 95976).

Run it by hand: Actions › Update available-soon feed › Run workflow.
