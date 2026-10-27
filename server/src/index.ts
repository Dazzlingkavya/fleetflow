import { createApp } from "./app.js";

const PORT = Number(process.env.PORT) || 4000;
const app = createApp();
app.listen(PORT, () => {
  console.log(`FleetFlow server running at http://localhost:${PORT}`);
  console.log("Data is generated on first request (seed 20261022). Try http://localhost:%d/api/summary", PORT);
});
