import {
  GithubCredentialsProvider,
  GitHubIntegrationConfig,
  ScmIntegrations,
} from '@backstage/integration';
import { graphql } from '@octokit/graphql';

type GraphQL = typeof graphql;

export async function createGitHubClient(
    orgUrl: string,
    gitHubConfig: GitHubIntegrationConfig
  ): Promise<GraphQL> {
    const credentialsProvider = GithubCredentialsProvider.create(gitHubConfig);
    const {
      headers,
    } = await credentialsProvider.getCredentials({
      url: orgUrl,
    });

    return graphql.defaults({
      baseUrl: gitHubConfig.apiBaseUrl,
      headers,
    });
  }

export function getGitHubConfig(integrations: ScmIntegrations, orgUrl: string) {
  const gitHubConfig = integrations.github.byUrl(orgUrl)?.config;

    if (!gitHubConfig) {
      throw new Error(
        `There is no GitHub Org provider that matches ${orgUrl}. Please add a configuration for an integration.`,
      );
    }

  return gitHubConfig;
}

export async function getOrganizationRepositories(
  client: typeof graphql,
  org: string,
): Promise<{ repositories: Repository[] }> {
  const query = `
    query repositories($org: String!, $cursor: String) {
      repositoryOwner(login: $org) {
        login
        repositories(first: 100, after: $cursor) {
          nodes {
            name
            url
            isArchived
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }`;

  const repositories = await queryWithPaging(
    client,
    query,
    r => r.repositoryOwner?.repositories,
    x => x,
    { org },
  );

  return { repositories };
}

export type Repository = {
  name: string;
  url: string;
  isArchived: boolean;
};

export type QueryResponse = {
  organization?: Organization;
  repositoryOwner?: Organization | User;
};

export type Connection<T> = {
  pageInfo: PageInfo;
  nodes: T[];
};

export type PageInfo = {
  hasNextPage: boolean;
  endCursor?: string;
};

export type Organization = {
  membersWithRole?: Connection<User>;
  team?: Team;
  teams?: Connection<Team>;
  repositories?: Connection<Repository>;
};

export type Team = {
  slug: string;
  combinedSlug: string;
  name?: string;
  description?: string;
  avatarUrl?: string;
  parentTeam?: Team;
  members: Connection<User>;
};

export type User = {
  login: string;
  bio?: string;
  avatarUrl?: string;
  email?: string;
  name?: string;
  repositories?: Connection<Repository>;
};

export async function queryWithPaging<
  GraphqlType,
  OutputType,
  Variables extends {},
  Response = QueryResponse
>(
  client: typeof graphql,
  query: string,
  connection: (response: Response) => Connection<GraphqlType> | undefined,
  mapper: (item: GraphqlType) => Promise<OutputType> | OutputType,
  variables: Variables,
): Promise<OutputType[]> {
  const result: OutputType[] = [];

  let cursor: string | undefined = undefined;
  for (let j = 0; j < 1000 /* just for sanity */; ++j) {
    const response: Response = await client(query, {
      ...variables,
      cursor,
    });

    const conn = connection(response);
    if (!conn) {
      throw new Error(`Found no match for ${JSON.stringify(variables)}`);
    }

    for (const node of conn.nodes) {
      result.push(await mapper(node));
    }

    if (!conn.pageInfo.hasNextPage) {
      break;
    } else {
      cursor = conn.pageInfo.endCursor;
    }
  }

  return result;
}