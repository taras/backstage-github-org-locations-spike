import { Config } from '@backstage/config';
import { ScmIntegrations } from '@backstage/integration';
import { LocationSpec } from '@backstage/catalog-model';
import {
  CatalogProcessor,
  CatalogProcessorEmit,
  results,
} from '@backstage/plugin-catalog-backend';
import { Logger } from 'winston';
import {
  buildOrgHierarchy,
  createGitHubClient,
  getGitHubConfig,
  getGitHubCredentials,
  getOrganizationRepositories,
  getOrganizationTeams,
  getOrganizationUsers,
  GitHubCredentials,
  GraphQL,
} from '../clients/github';

export class GitHubOrganizationProcessor implements CatalogProcessor {
  private readonly integrations: ScmIntegrations;
  private readonly logger: Logger;

  static fromConfig(
    config: Config,
    options: { logger: Logger },
  ): GitHubOrganizationProcessor {
    return new GitHubOrganizationProcessor({
      ...options,
      integrations: ScmIntegrations.fromConfig(config),
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
    const { org, isOrgUrl } = getOrgFromUrl(location.target);

    if (!isOrgUrl) {
      return false;
    }

    this.logger.info(
      'GitHubOrganizationProcessor: creating locations for repositories',
    );

    const orgUrl = location.target;

    const gitHubConfig = getGitHubConfig(this.integrations, orgUrl);

    const credentials = await getGitHubCredentials(orgUrl, gitHubConfig);

    const client: GraphQL = await createGitHubClient(gitHubConfig, credentials);

    const { groups } = await retrieveGroups({
      org,
      client,
      logger: this.logger,
      tokenType: credentials.type
    });

    for (const group of groups) {
      emit(results.entity(location, group));
    }

    const repositories = await retrieveRepositories({
      org,
      client,
      logger: this.logger,
    });

    for (const repository of repositories) {
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

async function retrieveRepositories({
  org,
  client,
  logger,
}: {
  org: string;
  client: GraphQL;
  logger: Logger;
}) {
  // Read out all of the raw data
  const startTimestamp = Date.now();

  logger.info(`Reading GitHub repositories from org: ${org}`);

  const { repositories } = await getOrganizationRepositories(client, org);

  const matching = repositories.filter(r => !r.isArchived);

  const duration = ((Date.now() - startTimestamp) / 1000).toFixed(1);

  logger.debug(
    `Read ${repositories.length} GitHub repositories (${matching.length} matching the pattern) in ${duration} seconds`,
  );

  return repositories;
}

async function retrieveGroups({
  org,
  client,
  logger,
  tokenType
}: {
  org: string;
  client: GraphQL;
  logger: Logger;
  tokenType: GitHubCredentials['type']
}) {
  const startTimestamp = Date.now();
  
  logger.info(
    `Reading GitHub users and teams for org: ${org}`,
  );

  const { users } = await getOrganizationUsers(
    client,
    org,
    tokenType
  );
  
  const { groups, groupMemberUsers } = await getOrganizationTeams(
    client,
    org,
    "default",
  );

  const duration = ((Date.now() - startTimestamp) / 1000).toFixed(1);
  
  logger.debug(
    `Read ${users.length} GitHub users and ${groups.length} GitHub teams from ${org} in ${duration} seconds`,
  );

  const allUsersMap = new Map();

  users.forEach(u => {
    if (!allUsersMap.has(u.metadata.name)) {
      allUsersMap.set(u.metadata.name, u);
    }
  });

  for (const [groupName, userNames] of groupMemberUsers.entries()) {
    for (const userName of userNames) {
      const user = allUsersMap.get(userName);
      if (user && !user.spec.memberOf.includes(groupName)) {
        user.spec.memberOf.push(groupName);
      }
    }
  }
  
  buildOrgHierarchy(groups);

  return { groups, users };
}

function getOrgFromUrl(urlString: string) {
  const url = new URL(urlString);
  const path = url.pathname.substr(1).split('/');

  return {
    org: decodeURIComponent(path[0]),
    isOrgUrl: path.length === 1,
  };
}
