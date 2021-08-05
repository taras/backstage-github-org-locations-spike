import {
  CatalogBuilder,
  createRouter
} from '@backstage/plugin-catalog-backend';
import { Router } from 'express';
import { PluginEnvironment } from '../types';
import { GithubOrganizationsProcessor } from '../processors/github-organizations';

export default async function createPlugin(env: PluginEnvironment): Promise<Router> {
  const builder = await CatalogBuilder.create(env);
  
  builder.addProcessor(
    GithubOrganizationsProcessor.fromConfig(env.config, {
      logger: env.logger,
    })
  );

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
