# TODO

GithubDiscoveryProcessor
  /backstage/techdocs-*/blob/master/catalog-info.yaml
  type: github-discovery
  emit: Location

GithubOrgReaderProcessor
  type: github-org
  emit: Group, User

GithubMultiOrgReaderProcessor
  type: github-multi-org
  emit: Group, User (for all organizations in orgs param)

Ingest all repositories from all organizations
  1. find all organizations and emit location for each org

https://backstage.io/docs/features/software-catalog/external-integrations#creating-a-catalog-data-reader-processor

Unused import in https://github.com/backstage/backstage/blob/14bbcfdc4e33d76efc9704d5f6483acb9594d8ca/plugins/catalog-backend/src/ingestion/processors/github/github.ts#L78