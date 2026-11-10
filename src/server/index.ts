import { loadConfig } from './config';
import { createHarness } from './bootstrap';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const { logger, host, port } = await createHarness(cfg);

  const model = cfg.llm.provider === 'mock' ? 'mock-agent' : cfg.llm.model;
  logger.info('harness ready');
  logger.info(`dashboard  ->  http://${host}:${port}`);
  logger.info(`provider   ->  ${cfg.llm.provider} (model: ${model})`);
  logger.info(`workspace  ->  ${cfg.workspace}`);
  logger.info('open the dashboard URL in a browser to view the agent\'s underlying control.');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[fatal]', err);
  process.exit(1);
});
