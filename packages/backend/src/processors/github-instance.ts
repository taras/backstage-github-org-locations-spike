import { Config } from '@backstage/config';
import {
  ScmIntegrations,
} from '@backstage/integration';
import { LocationSpec } from '@backstage/catalog-model';
import { CatalogProcessor, CatalogProcessorEmit, results } from '@backstage/plugin-catalog-backend';
import { Logger } from 'winston';
import { createGitHubClient, getGitHubConfig } from '../clients/github';
import { graphql } from '@octokit/graphql';

/**
 * GitHubInstanceProcessor
 *  Starting with an instance of a GitHub site, it creates a location for each organization.   
 * 
 * TODO: Effection here will be nice
 */
export class GitHubInstanceProcessor implements CatalogProcessor {
  private readonly integrations: ScmIntegrations;
  private readonly logger: Logger;

  static fromConfig(config: Config, options: { logger: Logger }) {
    const integrations = ScmIntegrations.fromConfig(config);

    return new GitHubInstanceProcessor({
      ...options,
      integrations,
    });
  }

  constructor(options: { integrations: ScmIntegrations; logger: Logger }) {
    this.integrations = options.integrations;
    this.logger = options.logger;
  }

  async readLocation(
    location: LocationSpec,
    _optional: boolean,
    emit: CatalogProcessorEmit,
  ): Promise<boolean> {
    if (location.type !== 'x-github-instance') {
      return false;
    }

    const orgUrl = location.target;

    const gitHubConfig = getGitHubConfig(this.integrations, orgUrl)

    // TODO: confirm that this will use GitHub App when available
    const client = await createGitHubClient(orgUrl, gitHubConfig);

    const organizations = await queryOrganizations(client);

    this.logger.info(`GitHubInstanceProcessor: Found ${organizations.length} organizations`)

    organizations.forEach((org) => {
      emit(results.location({
        target: org.url,
        type: 'url'
      }, true))
    })

    return true;
  }
}

type Organization = {
  url: string
}

type OrganizationQueryResponse = {
  viewer: {
    organizations: {
      nodes: Organization[]
    }
  }
}

async function queryOrganizations(
  client: typeof graphql
  ): Promise<Organization[]> {
    const query = `
      query { 
        viewer { 
          organizations(first: 100) {
            nodes {
              ... on Organization {
                url
              }
            }
          }
        }
      }
    `;

    // TODO: add proper pagination here
    const response = await client<OrganizationQueryResponse>(query, {
      cursor: undefined
    });

    return response?.viewer?.organizations?.nodes || []
}