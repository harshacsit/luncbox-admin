const SITE = "https://lunchbox26.netlify.app"; // replace with your real Netlify URL
const BACKFILL_SECRET = process.env.BACKFILL_SECRET;

if (!BACKFILL_SECRET) {
  console.error("Error: BACKFILL_SECRET environment variable is not set.");
  console.error("Please run the script as: $env:BACKFILL_SECRET=\"your_secret\"; node run-backfill.js");
  process.exit(1);
}

function getLast45Dates() {
  const dates = [];
  for (let i = 1; i <= 45; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

async function run() {
  const dates = getLast45Dates();
  for (const date of dates) {
    try {
      const res = await fetch(`${SITE}/.netlify/functions/backfill-history?date=${date}`, {
        headers: {
          'Authorization': `Bearer ${BACKFILL_SECRET}`
        }
      });
      const data = await res.json();
      console.log(date, "→", data.processed !== undefined ? `${data.processed} records` : data.error);
    } catch (e) {
      console.log(date, "→ FAILED:", e.message);
    }
    await new Promise(r => setTimeout(r, 500)); // half-second pause between dates
  }
  console.log("Done — all 45 dates processed.");
}

run();