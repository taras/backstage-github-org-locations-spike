import { Config } from '@backstage/config';
import {
  GithubCredentialsProvider,
  GithubCredentialType,
  ScmIntegrations,
} from '@backstage/integration';
import { LocationSpec } from '@backstage/catalog-model';
import { CatalogProcessor, CatalogProcessorEmit, results } from '@backstage/plugin-catalog-backend';
import { Logger } from 'winston';
import { graphql } from '@octokit/graphql';

type GraphQL = typeof graphql;

export class GithubOrganizationsProcessor implements CatalogProcessor {
  private readonly integrations: ScmIntegrations;
  private readonly logger: Logger;

  static fromConfig(config: Config, options: { logger: Logger }) {
    const integrations = ScmIntegrations.fromConfig(config);

    return new GithubOrganizationsProcessor({
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
    if (location.type !== 'github-instance') {
      return false;
    }

    const { client } = await this.createClient(location.target);

    const organizations = await queryOrganizations(client);

    this.logger.info(`GithubOrganizationsProcessor: Found ${organizations.length} organizations`)

    organizations.forEach((org) => {
      emit(results.location({
        target: org.url,
        type: 'url'
      }, true))
    })

    return true;
  }

  private async createClient(
    orgUrl: string,
  ): Promise<{ client: GraphQL; tokenType: GithubCredentialType }> {
    const gitHubConfig = this.integrations.github.byUrl(orgUrl)?.config;

    if (!gitHubConfig) {
      throw new Error(
        `There is no GitHub Org provider that matches ${orgUrl}. Please add a configuration for an integration.`,
      );
    }

    const credentialsProvider = GithubCredentialsProvider.create(gitHubConfig);
    const {
      headers,
      type: tokenType,
    } = await credentialsProvider.getCredentials({
      url: orgUrl,
    });

    const client = graphql.defaults({
      baseUrl: gitHubConfig.apiBaseUrl,
      headers,
    });

    return { client, tokenType };
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