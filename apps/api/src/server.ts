import { app } from "./app.js";
import { env } from "./env.js";
import { publishDueJobs } from "./services/publishing.js";
import { renderQueuedVideos } from "./services/video-worker.js";
import { pollMagicHourJobs } from "./services/magic-hour-worker.js";
import { runStartupPreflight } from "./routes/system.js";
import { sendDueApprovalEmails } from "./services/approval-email.js";
import { runInstagramAutopilot } from "./services/instagram-autopilot.js";
import { enqueueDueCompetitorRefreshes, runCompetitorResearchJobs } from "./services/competitor-research-worker.js";

app.listen(env.API_PORT, () => {
  console.info(`${env.PRODUCT_NAME} API listening on http://localhost:${env.API_PORT}`);
});
void runStartupPreflight().catch((error: unknown) => {
  console.error("API startup preflight failed unexpectedly.", error);
});

const publishWorker = setInterval(() => {
  void publishDueJobs().catch((error: unknown) => {
    console.error("Publishing worker failed.", error);
  });
}, 5_000);
publishWorker.unref();
void publishDueJobs().catch((error: unknown) => {
  console.error("Publishing worker startup recovery failed.", error);
});

const videoWorker = setInterval(() => {
  void renderQueuedVideos().catch((error: unknown) => {
    console.error("Video render worker failed.", error);
  });
}, 2_000);
videoWorker.unref();
const magicHourWorker = setInterval(() => {
  void pollMagicHourJobs().catch((error: unknown) => {
    console.error("Magic Hour project poller failed.", error);
  });
}, 5_000);
magicHourWorker.unref();
void pollMagicHourJobs().catch((error: unknown) => {
  console.error("Magic Hour startup poll failed.", error);
});
void renderQueuedVideos().catch((error: unknown) => {
  console.error("Video render worker startup recovery failed.", error);
});

const approvalEmailWorker = setInterval(() => {
  void sendDueApprovalEmails().catch((error: unknown) => {
    console.error("Approval email worker failed.", error);
  });
}, 30_000);
approvalEmailWorker.unref();
void sendDueApprovalEmails().catch((error: unknown) => {
  console.error("Approval email startup recovery failed.", error);
});

const instagramAutopilotWorker = setInterval(() => {
  void runInstagramAutopilot().catch((error: unknown) => {
    console.error("Instagram Autopilot worker failed.", error);
  });
}, 30_000);
instagramAutopilotWorker.unref();
void runInstagramAutopilot().catch((error: unknown) => {
  console.error("Instagram Autopilot startup recovery failed.", error);
});

const competitorResearchWorker = setInterval(() => {
  void runCompetitorResearchJobs().catch((error: unknown) => {
    console.error("Competitor research worker failed.", error);
  });
}, 10_000);
competitorResearchWorker.unref();
void runCompetitorResearchJobs().catch((error: unknown) => {
  console.error("Competitor research startup recovery failed.", error);
});

const competitorRefreshScheduler = setInterval(() => {
  void enqueueDueCompetitorRefreshes().catch((error: unknown) => {
    console.error("Competitor refresh scheduler failed.", error);
  });
}, 60 * 60 * 1000);
competitorRefreshScheduler.unref();
void enqueueDueCompetitorRefreshes().catch((error: unknown) => {
  console.error("Competitor refresh startup scheduling failed.", error);
});
