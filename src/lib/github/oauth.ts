type GithubAuthorizationOptions = {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
};

export function buildGithubAuthorizationUrl(options: GithubAuthorizationOptions): string {
  return `https://github.com/login/oauth/authorize?${new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    scope: options.scope,
    state: options.state,
    prompt: "select_account",
  }).toString()}`;
}
