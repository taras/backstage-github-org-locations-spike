import { Config } from '@backstage/config';
import { ScmIntegrations } from '@backstage/integration';
import { LocationSpec } from '@backstage/catalog-model';
import {
  CatalogProcessor,
  CatalogProcessorEmit,
  GithubOrgReaderProcessor,
  results,
} from '@backstage/plugin-catalog-backend';
import { Logger } from 'winston';
import { createGitHubClient, getGitHubConfig, getOrganizationRepositories } from '../clients/github';

export class GitHubOrganizationProcessor implements CatalogProcessor {
  private readonly integrations: ScmIntegrations;
  private readonly logger: Logger;
  private readonly githubOrgReaderProcessor: GithubOrgReaderProcessor;

  static fromConfig(
    config: Config,
    options: { logger: Logger },
  ): GitHubOrganizationProcessor {
    return new GitHubOrganizationProcessor({
      ...options,
      integrations: ScmIntegrations.fromConfig(config),
      githubOrgReaderProcessor: GithubOrgReaderProcessor.fromConfig(
        config,
        options,
      ),
    });
  }

  constructor(options: {
    integrations: ScmIntegrations;
    logger: Logger;
    githubOrgReaderProcessor: GithubOrgReaderProcessor;
  }) {
    this.integrations = options.integrations;
    this.logger = options.logger;
    this.githubOrgReaderProcessor = options.githubOrgReaderProcessor;
  }

  async readLocation(
    location: LocationSpec,
    _optional: boolean,
    emit: CatalogProcessorEmit,
  ): Promise<boolean> {
    const { org, isOrgUrl } = getOrgFromUrl(location.target);

    if (!isOrgUrl) {
      return false;
    }

    this.logger.info(
      'GitHubOrganizationProcessor: creating locations for repositories',
    );

    const orgUrl = location.target;

    const gitHubConfig = getGitHubConfig(this.integrations, orgUrl);

    // TODO: confirm that this will use GitHub App when available
    const client = await createGitHubClient(orgUrl, gitHubConfig);

    // Read out all of the raw data
    const startTimestamp = Date.now();
  
    this.logger.info(`Reading GitHub repositories from ${location.target}`);

    const { repositories } = await getOrganizationRepositories(client, org);

    const matching = repositories.filter(
      r => !r.isArchived,
    );

    const duration = ((Date.now() - startTimestamp) / 1000).toFixed(1);

    this.logger.debug(
      `Read ${repositories.length} GitHub repositories (${matching.length} matching the pattern) in ${duration} seconds`,
    );

    for (const repository of matching) {
      emit(
        results.location(
          {
            type: 'url',
            target: repository.url,
          },
          false,
        ),
      );
    }

    return true;
  }
}

function getOrgFromUrl(urlString: string) {
  const url = new URL(urlString);
  const path = url.pathname.substr(1).split('/');

  return {
    org: decodeURIComponent(path[0]),
    isOrgUrl: path.length === 1
  }
}