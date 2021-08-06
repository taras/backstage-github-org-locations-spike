import {
  CatalogBuilder,
  createRouter,
  AnnotateLocationEntityProcessor
} from '@backstage/plugin-catalog-backend';
import { ScmIntegrations } from '@backstage/integration';
import { Router } from 'express';
import { PluginEnvironment } from '../types';
import { GitHubInstanceProcessor } from '../processors/github-instance';
import { GitHubOrganizationProcessor } from '../processors/github-organization';

export default async function createPlugin(env: PluginEnvironment): Promise<Router> {
  const builder = await CatalogBuilder.create(env);
  const integrations = ScmIntegrations.fromConfig(env.config);
  
  builder.replaceProcessors([
    GitHubInstanceProcessor.fromConfig(env.config, {
      logger: env.logger,
    }),
    GitHubOrganizationProcessor.fromConfig(env.config, {
      logger: env.logger
    }),
    new AnnotateLocationEntityProcessor({ integrations })
  ]);

  const {
    entitiesCatalog,
    locationsCatalog,
    locationService,
    processingEngine,
    locationAnalyzer,
  } = await builder.build();

  await processingEngine.start();

  return await createRouter({
    entitiesCatalog,
    locationsCatalog,
    locationService,
    locationAnalyzer,
    logger: env.logger,
    config: env.config,
  });
}
